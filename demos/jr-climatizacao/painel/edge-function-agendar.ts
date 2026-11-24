// Função "agendar" do Supabase (Edge Functions): confere o captcha da Cloudflare e só então grava o agendamento.
// Como publicar: Supabase > Edge Functions > Deploy a new function > Via Editor > nome: agendar > colar este arquivo > Deploy.
// Depois: em Settings da função, DESLIGUE "Enforce JWT verification" (o site usa a chave publishable, que não é JWT).
// E em Edge Functions > Secrets, crie TURNSTILE_SECRET com a Secret Key do Turnstile.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const PERMITIDOS = [/^https:\/\/sastudio\.vercel\.app$/, /^https:\/\/sa-studio-[a-z0-9-]+\.vercel\.app$/, /^https:\/\/sastudioofc\.github\.io$/, /^https:\/\/(www\.)?jrclimatizacao\.com\.br$/];

function cabecalhos(origem: string | null) {
  const ok = origem && PERMITIDOS.some(r => r.test(origem));
  return {
    "Access-Control-Allow-Origin": ok ? origem! : "https://sastudio.vercel.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}

Deno.serve(async (req) => {
  const h = cabecalhos(req.headers.get("origin"));
  const resposta = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: h });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return resposta(405, { erro: "metodo" });

  let d: Record<string, unknown>;
  try { d = await req.json(); } catch { return resposta(400, { erro: "json" }); }

  // 1. captcha
  const form = new FormData();
  form.append("secret", Deno.env.get("TURNSTILE_SECRET") ?? "");
  form.append("response", String(d.token ?? ""));
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) form.append("remoteip", ip);
  const cf = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form }).then(r => r.json()).catch(() => ({ success: false }));
  if (!cf.success) return resposta(403, { erro: "captcha" });

  // 2. grava (as regras de horário, bloqueio e limites ficam no banco)
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const texto = (v: unknown, max: number) => String(v ?? "").slice(0, max);
  const r = await sb.rpc("criar_agendamento_site", {
    p_data: texto(d.data, 10), p_hora: texto(d.hora, 5), p_servico: texto(d.servico, 40), p_qtd: Number(d.qtd) || 1,
    p_nome: texto(d.nome, 120), p_telefone: texto(d.telefone, 40), p_endereco: texto(d.endereco, 240), p_obs: texto(d.obs, 300),
  });
  if (r.error) {
    if (r.error.code === "23505") return resposta(409, { erro: "ocupado" });
    if (r.error.code === "P0001" || r.error.code === "23514" || r.error.code === "22007" || r.error.code === "22008") return resposta(422, { erro: "recusado" });
    console.error(r.error);
    return resposta(500, { erro: "banco" });
  }
  return resposta(200, { ok: true });
});
