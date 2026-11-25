-- Banco da agenda da JR Climatização (Supabase)
-- Rode tudo de uma vez em: Supabase > SQL Editor > New query > colar > Run.

create extension if not exists pgcrypto;

-- agendamentos (do site e os cadastrados no painel)
create table if not exists public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  data date not null,
  hora text not null check (hora ~ '^[0-2][0-9]:[0-5][0-9]$'),
  servico text not null,
  qtd int not null default 1 check (qtd between 1 and 50),
  nome text not null check (char_length(nome) between 1 and 120),
  telefone text not null default '' check (char_length(telefone) <= 40),
  endereco text not null default '' check (char_length(endereco) <= 240),
  obs text not null default '' check (char_length(obs) <= 1000),
  origem text not null default 'site' check (origem in ('site', 'manual', 'whatsapp')),
  status text not null default 'pendente' check (status in ('pendente', 'confirmado', 'concluido', 'cancelado'))
);
-- "arquivado" substitui o apagar: some da agenda, mas o registro fica guardado para sempre
alter table public.agendamentos add column if not exists arquivado boolean not null default false;

-- impede dois agendamentos ativos no mesmo dia e horário
drop index if exists public.agendamentos_horario_unico;
create unique index agendamentos_horario_unico on public.agendamentos (data, hora) where status <> 'cancelado' and not arquivado;

-- dias ou horários bloqueados (hora vazia = dia inteiro)
create table if not exists public.bloqueios (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  hora text,
  motivo text not null default ''
);

-- configuração do expediente (uma linha só)
create table if not exists public.config (
  id int primary key default 1 check (id = 1),
  dados jsonb not null default '{}'::jsonb
);
insert into public.config (id) values (1) on conflict do nothing;

alter table public.agendamentos enable row level security;
alter table public.bloqueios enable row level security;
alter table public.config enable row level security;

-- funções internas: ficam num schema que a API não expõe, então ninguém chama elas de fora
create schema if not exists privado;
revoke all on schema privado from public;
grant usage on schema privado to anon, authenticated;

-- só usuário de verdade da equipe (nunca um login anônimo, caso alguém ligue isso no futuro)
create or replace function privado.e_equipe() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;

-- regras de um agendamento vindo do site: horário que existe no expediente, dentro da janela
-- da agenda, não bloqueado, com antecedência, e freios contra quem tenta lotar a agenda de mentira
create or replace function privado.agendamento_site_valido(p_data date, p_hora text, p_servico text, p_telefone text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  cfg jsonb := coalesce((select dados from public.config where id = 1), '{}'::jsonb);
  padrao jsonb := '{"0":[],"1":["08:00","10:00","13:00","15:00","17:00"],"2":["08:00","10:00","13:00","15:00","17:00"],"3":["08:00","10:00","13:00","15:00","17:00"],"4":["08:00","10:00","13:00","15:00","17:00"],"5":["08:00","10:00","13:00","15:00","17:00"],"6":["08:00","10:00"]}';
  agora_sp timestamp := now() at time zone 'America/Sao_Paulo';
  dias int := coalesce((cfg ->> 'diasAgenda')::int, 14);
  antecedencia int := coalesce((cfg ->> 'antecedenciaHoras')::int, 2);
  horas jsonb := coalesce(cfg -> 'horarios', padrao) -> extract(dow from p_data)::int::text;
  fone text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
begin
  if p_servico not in ('Higienização', 'Manutenção', 'Instalação', 'Visita técnica') then return false; end if;
  if length(fone) not between 10 and 13 then return false; end if;
  -- a janela da agenda (o site procura dias livres em até 45 dias)
  if p_data < agora_sp::date or p_data > agora_sp::date + greatest(dias, 45) then return false; end if;
  -- o horário precisa existir no expediente daquele dia da semana
  if horas is null or not (horas ? p_hora) then return false; end if;
  -- antecedência mínima (com 15 min de folga para quem demorou preenchendo)
  if (p_data + p_hora::time) < agora_sp + make_interval(hours => antecedencia) - interval '15 minutes' then return false; end if;
  -- dia ou horário bloqueado pela equipe
  if exists (select 1 from public.bloqueios b where b.data = p_data and (b.hora is null or b.hora = p_hora)) then return false; end if;
  -- no máximo 3 pedidos pendentes do mesmo WhatsApp
  if (select count(*) from public.agendamentos a where a.origem = 'site' and a.status = 'pendente' and not a.arquivado
      and regexp_replace(a.telefone, '\D', '', 'g') = fone) >= 3 then return false; end if;
  -- freio geral: no máximo 20 pedidos do site por hora
  if (select count(*) from public.agendamentos a where a.origem = 'site' and a.criado_em > now() - interval '1 hour') >= 20 then return false; end if;
  return true;
end $$;
revoke all on function privado.agendamento_site_valido(date, text, text, text) from public;
grant execute on function privado.agendamento_site_valido(date, text, text, text) to anon;

-- visitante do site: só pode CRIAR agendamento pendente e válido, sem ler dados de ninguém
drop policy if exists "site cria agendamento" on public.agendamentos;
create policy "site cria agendamento" on public.agendamentos for insert to anon
  with check (status = 'pendente' and origem = 'site' and qtd <= 20 and char_length(obs) <= 300
              and privado.agendamento_site_valido(data, hora, servico, telefone));

-- equipe da JR (usuário logado): acesso total
drop policy if exists "equipe agendamentos" on public.agendamentos;
create policy "equipe agendamentos" on public.agendamentos for all to authenticated using (privado.e_equipe()) with check (privado.e_equipe());
drop policy if exists "equipe bloqueios" on public.bloqueios;
create policy "equipe bloqueios" on public.bloqueios for all to authenticated using (privado.e_equipe()) with check (privado.e_equipe());
drop policy if exists "equipe config" on public.config;
create policy "equipe config" on public.config for all to authenticated using (privado.e_equipe()) with check (privado.e_equipe());

-- visitante não tem nada a fazer nas outras tabelas
revoke all on public.bloqueios from anon;
revoke update, delete, truncate, references, trigger on public.agendamentos from anon;
revoke insert, update, delete, truncate, references, trigger on public.config from anon;

-- todo mundo pode ler o expediente (o site precisa dele)
drop policy if exists "todos leem config" on public.config;
create policy "todos leem config" on public.config for select to anon using (true);

-- o site só enxerga QUAIS horários estão ocupados, nunca quem marcou
create or replace function public.horarios_ocupados(de date, ate date)
returns table (data date, hora text)
language sql security definer set search_path = public stable as $$
  select a.data, a.hora from public.agendamentos a where a.status <> 'cancelado' and not a.arquivado and a.data between de and ate and ate - de <= 120
  union all
  select b.data, b.hora from public.bloqueios b where b.data between de and ate and ate - de <= 120;
$$;
revoke all on function public.horarios_ocupados(date, date) from public;
grant execute on function public.horarios_ocupados(date, date) to anon, authenticated;

-- ============================================================
-- HISTÓRICO QUE NUNCA SE PERDE
-- ============================================================
-- ninguém apaga agendamento pelo site ou pelo painel (o painel só arquiva)
revoke delete, truncate on public.agendamentos from anon, authenticated;

-- toda criação, alteração ou exclusão (mesmo feita direto no banco) fica registrada aqui, com a versão anterior
create table if not exists public.agendamentos_historico (
  id bigserial primary key,
  quando timestamptz not null default now(),
  agendamento_id uuid,
  acao text not null,
  quem text,
  antes jsonb,
  depois jsonb
);
alter table public.agendamentos_historico enable row level security;
drop policy if exists "equipe le historico" on public.agendamentos_historico;
create policy "equipe le historico" on public.agendamentos_historico for select to authenticated using (privado.e_equipe());
revoke insert, update, delete, truncate on public.agendamentos_historico from anon, authenticated;
revoke select on public.agendamentos_historico from anon;

create or replace function privado.registra_historico() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.agendamentos_historico (agendamento_id, acao, quem, antes, depois)
  values (coalesce(new.id, old.id), lower(tg_op),
          coalesce(auth.jwt() ->> 'email', case when coalesce(new.origem, '') = 'site' and tg_op = 'INSERT' then 'site' else 'sistema' end),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
drop trigger if exists agendamentos_historico on public.agendamentos;
create trigger agendamentos_historico after insert or update or delete on public.agendamentos
  for each row execute function privado.registra_historico();

-- o histórico em si não pode ser alterado nem apagado (nem por engano no SQL Editor)
create or replace function privado.historico_imutavel() returns trigger language plpgsql as $$
begin raise exception 'O histórico de agendamentos não pode ser alterado nem apagado'; end $$;
drop trigger if exists historico_imutavel on public.agendamentos_historico;
create trigger historico_imutavel before update or delete on public.agendamentos_historico
  for each row execute function privado.historico_imutavel();
drop trigger if exists historico_sem_truncate on public.agendamentos_historico;
create trigger historico_sem_truncate before truncate on public.agendamentos_historico
  for each statement execute function privado.historico_imutavel();

-- guarda o que já existia antes do histórico ser ligado
insert into public.agendamentos_historico (agendamento_id, acao, quem, depois)
select a.id, 'existente', 'sistema', to_jsonb(a) from public.agendamentos a
where not exists (select 1 from public.agendamentos_historico h where h.agendamento_id = a.id);
