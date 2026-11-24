-- CAPTCHA DA AGENDA (Cloudflare Turnstile)
-- Rode SÓ DEPOIS de publicar a função "agendar" (painel/edge-function-agendar.ts) e de o site
-- estar com a TURNSTILE_SITEKEY preenchida em agenda.js. Antes disso, o site continuaria
-- tentando gravar direto e passaria a ser recusado.
-- Supabase > SQL Editor > New query > colar > Run.

-- grava um agendamento do site; só a função "agendar" (que já conferiu o captcha) consegue chamar
create or replace function public.criar_agendamento_site(
  p_data date, p_hora text, p_servico text, p_qtd int, p_nome text, p_telefone text, p_endereco text, p_obs text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_qtd, 0) not between 1 and 20 or char_length(coalesce(p_obs, '')) > 300
     or not privado.agendamento_site_valido(p_data, p_hora, p_servico, p_telefone) then
    raise exception 'recusado' using errcode = 'P0001';
  end if;
  insert into public.agendamentos (data, hora, servico, qtd, nome, telefone, endereco, obs, origem, status)
  values (p_data, p_hora, p_servico, p_qtd, p_nome, p_telefone, coalesce(p_endereco, ''), coalesce(p_obs, ''), 'site', 'pendente');
end $$;
revoke all on function public.criar_agendamento_site(date, text, text, int, text, text, text, text) from public, anon, authenticated;
grant execute on function public.criar_agendamento_site(date, text, text, int, text, text, text, text) to service_role;

-- a partir de agora o visitante NÃO grava mais direto na tabela: tudo passa pelo captcha
drop policy if exists "site cria agendamento" on public.agendamentos;
revoke insert on public.agendamentos from anon;
