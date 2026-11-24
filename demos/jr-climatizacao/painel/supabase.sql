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
-- impede dois agendamentos ativos no mesmo dia e horário
create unique index if not exists agendamentos_horario_unico on public.agendamentos (data, hora) where status <> 'cancelado';

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

-- visitante do site: só pode CRIAR agendamento pendente, sem ler dados de ninguém
drop policy if exists "site cria agendamento" on public.agendamentos;
create policy "site cria agendamento" on public.agendamentos for insert to anon
  with check (status = 'pendente' and origem = 'site' and data >= current_date);

-- equipe da JR (usuário logado): acesso total
drop policy if exists "equipe agendamentos" on public.agendamentos;
create policy "equipe agendamentos" on public.agendamentos for all to authenticated using (true) with check (true);
drop policy if exists "equipe bloqueios" on public.bloqueios;
create policy "equipe bloqueios" on public.bloqueios for all to authenticated using (true) with check (true);
drop policy if exists "equipe config" on public.config;
create policy "equipe config" on public.config for all to authenticated using (true) with check (true);

-- todo mundo pode ler o expediente (o site precisa dele)
drop policy if exists "todos leem config" on public.config;
create policy "todos leem config" on public.config for select to anon using (true);

-- o site só enxerga QUAIS horários estão ocupados, nunca quem marcou
create or replace function public.horarios_ocupados(de date, ate date)
returns table (data date, hora text)
language sql security definer set search_path = public stable as $$
  select a.data, a.hora from public.agendamentos a where a.status <> 'cancelado' and a.data between de and ate
  union all
  select b.data, b.hora from public.bloqueios b where b.data between de and ate;
$$;
revoke all on function public.horarios_ocupados(date, date) from public;
grant execute on function public.horarios_ocupados(date, date) to anon, authenticated;
