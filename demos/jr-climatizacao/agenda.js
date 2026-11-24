/*
  AGENDA DA JR CLIMATIZAÇÃO · usada pelo site (agendamento) e pelo painel (painel/)

  Para ligar no banco de verdade (Supabase):
    1. Crie um projeto grátis em supabase.com.
    2. No SQL Editor, rode o arquivo painel/supabase.sql.
    3. Em Authentication > Users, crie o usuário da JR (email e senha) e, em
       Authentication > Sign In / Providers, desligue "Allow new users to sign up".
    4. Cole abaixo a Project URL e a Publishable key (Project Settings > API Keys).
  Sem isso, tudo funciona em MODO DEMONSTRAÇÃO, salvo só no navegador de quem está usando.
*/
(function () {
  const SUPABASE_URL = "https://oyvmjbmzlagmquqkzylt.supabase.co";
  const SUPABASE_KEY = "sb_publishable_bDWp9FwLt8U9GasvRIpcDA_IqJuEXQa"; // chave pública (publishable) (pode ficar no site, o banco é protegido pelas regras do supabase.sql)

  const SERVICOS = ["Higienização", "Manutenção", "Instalação", "Visita técnica"];
  const STATUS = { pendente: "Pendente", confirmado: "Confirmado", concluido: "Concluído", cancelado: "Cancelado" };
  const CONFIG_PADRAO = {
    // horários de atendimento por dia da semana (0 = domingo ... 6 = sábado)
    horarios: { 0: [], 1: ["08:00", "10:00", "13:00", "15:00", "17:00"], 2: ["08:00", "10:00", "13:00", "15:00", "17:00"], 3: ["08:00", "10:00", "13:00", "15:00", "17:00"], 4: ["08:00", "10:00", "13:00", "15:00", "17:00"], 5: ["08:00", "10:00", "13:00", "15:00", "17:00"], 6: ["08:00", "10:00"] },
    diasAgenda: 14,       // quantos dias à frente o site mostra
    antecedenciaHoras: 2  // não deixa marcar em cima da hora
  };

  // ---------- datas (sempre no horário de Brasília) ----------
  const agora = () => new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const deIso = s => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };
  const somaDias = (s, n) => { const d = deIso(s); d.setDate(d.getDate() + n); return iso(d); };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

  // ---------- modo demonstração (localStorage) ----------
  const ls = {
    get(k, padrao) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? padrao : v; } catch (e) { return padrao; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  function semente() {
    if (ls.get("jr-ag-semente", false)) return;
    const hoje = iso(agora());
    const ex = [
      [-12, "10:00", "Higienização", 2, "Marcos Oliveira", "11 98765-1122", "Rua das Flores, 120 · Jardim Bom Pastor", "site", "concluido"],
      [-6, "13:00", "Instalação", 1, "Patrícia Souza", "11 99123-4455", "Av. Rui Barbosa, 880 · Centro", "manual", "concluido"],
      [-2, "08:00", "Manutenção", 1, "Loja Bella Moda", "11 97777-3030", "Rua Paraíso, 45 · Jardim Bom Pastor", "site", "cancelado"],
      [1, "10:00", "Higienização", 3, "Clínica Sorriso", "11 96666-2020", "Rua Bahia, 300 · Vila Dirce", "site", "confirmado"],
      [1, "15:00", "Instalação", 1, "Ricardo Lima", "11 95555-1010", "Rua Itália, 77 · Cohab", "manual", "confirmado"],
      [2, "08:00", "Visita técnica", 1, "Fernanda Alves", "11 94444-9090", "Rua Pará, 12 · Parque Santa Teresa", "site", "pendente"],
      [3, "13:00", "Manutenção", 2, "Padaria Pão Quente", "11 93333-8080", "Av. Inocêncio Seráfico, 1500", "site", "pendente"]
    ];
    const ags = ex.map(([d, hora, servico, qtd, nome, telefone, endereco, origem, status]) => {
      let data = somaDias(hoje, d);
      while (deIso(data).getDay() === 0) data = somaDias(data, 1);
      return { id: uid(), criado_em: new Date().toISOString(), data, hora, servico, qtd, nome, telefone, endereco, origem, status, obs: "" };
    });
    ls.set("jr-ag-agendamentos", ags);
    ls.set("jr-ag-bloqueios", []);
    ls.set("jr-ag-semente", true);
  }
  const demo = {
    async config() { return { ...CONFIG_PADRAO, ...ls.get("jr-ag-config", {}) }; },
    async salvarConfig(c) { ls.set("jr-ag-config", c); },
    async ocupados(de, ate) {
      semente();
      const a = ls.get("jr-ag-agendamentos", []).filter(x => x.status !== "cancelado" && x.data >= de && x.data <= ate).map(x => ({ data: x.data, hora: x.hora }));
      const b = ls.get("jr-ag-bloqueios", []).filter(x => x.data >= de && x.data <= ate).map(x => ({ data: x.data, hora: x.hora || null }));
      return [...a, ...b];
    },
    async criarPublico(d) {
      semente();
      const ags = ls.get("jr-ag-agendamentos", []);
      const ocup = await demo.ocupados(d.data, d.data);
      if (ocup.some(o => !o.hora || o.hora === d.hora)) throw new Error("ocupado");
      const novo = { ...d, id: uid(), criado_em: new Date().toISOString(), origem: "site", status: "pendente" };
      ags.push(novo); ls.set("jr-ag-agendamentos", ags); return novo;
    },
    async entrar(email, senha) { if (!email || senha !== "jr2026") throw new Error("Email ou senha incorretos"); ls.set("jr-ag-sessao", { email }); return { email }; },
    async sair() { ls.set("jr-ag-sessao", null); },
    async sessao() { return ls.get("jr-ag-sessao", null); },
    async trocarSenha() { throw new Error("No modo demonstração a senha é sempre jr2026"); },
    async esqueciSenha() { throw new Error("No modo demonstração a senha é sempre jr2026"); },
    async listar() { semente(); return ls.get("jr-ag-agendamentos", []); },
    async salvar(ag) {
      const ags = ls.get("jr-ag-agendamentos", []);
      const choque = ag.status !== "cancelado" && ags.some(x => x.id !== ag.id && x.status !== "cancelado" && x.data === ag.data && x.hora === ag.hora);
      if (choque) throw new Error("Já existe um agendamento nesse dia e horário");
      if (ag.id) { const i = ags.findIndex(x => x.id === ag.id); ags[i] = { ...ags[i], ...ag }; }
      else ags.push({ ...ag, id: uid(), criado_em: new Date().toISOString() });
      ls.set("jr-ag-agendamentos", ags);
    },
    async excluir(id) { ls.set("jr-ag-agendamentos", ls.get("jr-ag-agendamentos", []).filter(x => x.id !== id)); },
    async bloqueios() { return ls.get("jr-ag-bloqueios", []); },
    async bloquear(b) { const l = ls.get("jr-ag-bloqueios", []); l.push({ ...b, id: uid() }); ls.set("jr-ag-bloqueios", l); },
    async desbloquear(id) { ls.set("jr-ag-bloqueios", ls.get("jr-ag-bloqueios", []).filter(x => x.id !== id)); }
  };

  // ---------- Supabase ----------
  let sbCliente = null;
  function carregaSB() {
    if (sbCliente) return Promise.resolve(sbCliente);
    return new Promise((ok, erro) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
      s.onload = () => { sbCliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); ok(sbCliente); };
      s.onerror = () => erro(new Error("Não foi possível carregar o banco"));
      document.head.appendChild(s);
    });
  }
  const falha = r => { if (r.error) throw new Error(r.error.message); return r.data; };
  const sb = {
    async config() { const c = await carregaSB(); const r = await c.from("config").select("dados").eq("id", 1).maybeSingle(); return { ...CONFIG_PADRAO, ...((falha(r) || {}).dados || {}) }; },
    async salvarConfig(dados) { const c = await carregaSB(); falha(await c.from("config").upsert({ id: 1, dados })); },
    async ocupados(de, ate) { const c = await carregaSB(); return falha(await c.rpc("horarios_ocupados", { de, ate })) || []; },
    async criarPublico(d) {
      const c = await carregaSB();
      const r = await c.from("agendamentos").insert({ ...d, origem: "site", status: "pendente" });
      if (r.error) throw new Error(r.error.code === "23505" ? "ocupado" : r.error.message);
      return d;
    },
    async entrar(email, senha) { const c = await carregaSB(); const r = await c.auth.signInWithPassword({ email, password: senha }); if (r.error) { const m = r.error.message || ""; throw new Error(/confirm/i.test(m) ? "Esse email ainda não foi confirmado no Supabase" : /invalid login/i.test(m) ? "Email ou senha incorretos" : "Erro do banco: " + m); } return { email: r.data.user.email }; },
    async sair() { const c = await carregaSB(); await c.auth.signOut(); },
    async sessao() { const c = await carregaSB(); const r = await c.auth.getSession(); return r.data.session ? { email: r.data.session.user.email } : null; },
    async trocarSenha(nova) { const c = await carregaSB(); const r = await c.auth.updateUser({ password: nova }); if (r.error) throw new Error(/different from the old/i.test(r.error.message) ? "A nova senha precisa ser diferente da atual" : /weak|at least/i.test(r.error.message) ? "Senha fraca: use pelo menos 8 caracteres" : r.error.message); },
    async esqueciSenha(email) { const c = await carregaSB(); const r = await c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); if (r.error) throw new Error(/rate limit/i.test(r.error.message) ? "Muitos pedidos seguidos. Espere alguns minutos e tente de novo" : r.error.message); },
    async listar() { const c = await carregaSB(); return falha(await c.from("agendamentos").select("*").order("data", { ascending: false }).limit(2000)); },
    async salvar(ag) {
      const c = await carregaSB();
      const { id, criado_em, ...campos } = ag;
      const r = id ? await c.from("agendamentos").update(campos).eq("id", id) : await c.from("agendamentos").insert(campos);
      if (r.error) throw new Error(r.error.code === "23505" ? "Já existe um agendamento nesse dia e horário" : r.error.message);
    },
    async excluir(id) { const c = await carregaSB(); falha(await c.from("agendamentos").delete().eq("id", id)); },
    async bloqueios() { const c = await carregaSB(); return falha(await c.from("bloqueios").select("*").order("data")); },
    async bloquear(b) { const c = await carregaSB(); falha(await c.from("bloqueios").insert({ data: b.data, hora: b.hora || null, motivo: b.motivo || "" })); },
    async desbloquear(id) { const c = await carregaSB(); falha(await c.from("bloqueios").delete().eq("id", id)); }
  };

  const fonte = SUPABASE_URL && SUPABASE_KEY ? sb : demo;

  // horários livres de um período, já descontando ocupados, bloqueios e antecedência
  async function disponibilidade() {
    const cfg = await fonte.config();
    const hoje = iso(agora());
    const fim = somaDias(hoje, 45);
    const ocup = await fonte.ocupados(hoje, fim);
    const limite = agora(); limite.setHours(limite.getHours() + (cfg.antecedenciaHoras || 0));
    const dias = [];
    for (let i = 0; dias.length < cfg.diasAgenda && i < 45; i++) {
      const data = somaDias(hoje, i), d = deIso(data);
      const todos = (cfg.horarios[d.getDay()] || []).slice().sort();
      if (!todos.length) continue;
      if (ocup.some(o => o.data === data && !o.hora)) continue;
      const livres = todos.filter(h => {
        if (ocup.some(o => o.data === data && o.hora === h)) return false;
        const [hh, mm] = h.split(":").map(Number); const quando = deIso(data); quando.setHours(hh, mm);
        return quando > limite;
      });
      if (!livres.length) continue;
      dias.push({ data, todos, livres });
    }
    return dias;
  }

  window.JRAgenda = { modo: fonte === sb ? "supabase" : "demo", SERVICOS, STATUS, CONFIG_PADRAO, iso, deIso, somaDias, agora, disponibilidade, ...fonte };
})();
