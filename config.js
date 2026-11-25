// Configuração da loja editável pelo painel (produtos, fotos, logo, cores, textos, contatos e redes).
//  GET  ?v=123        -> configuração salva (ou {igual:true} se a versão v não mudou)
//  GET  ?img=ID       -> foto enviada pelo painel
//  POST {senha, a:"foto",     dados:"data:image/..."}  -> {url}
//  POST {senha, a:"salvar",   config:{...}}            -> {ok, v}
//  POST {senha, a:"restaurar"}                         -> volta para o catálogo original do site
const crypto = require("crypto");
const { abrir, abrirImg } = require("../lib/dados");

const J = (c, o) => ({ statusCode: c, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(o) });

function senhaOk(s) {
  const a = Buffer.from(String(s || "").trim()), b = Buffer.from(String(process.env.ADMIN_SENHA || "").trim());
  return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- limpeza dos dados recebidos (nada de HTML, tamanhos limitados) ----------
const S = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const SL = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0009\u000b-\u001f<>]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, n); // mantém quebra de linha
const N = (v, def, min, max) => { const x = parseFloat(String(v).replace(",", ".")); return isFinite(x) ? Math.min(max, Math.max(min, x)) : def; };
const URLOK = /^(\/\.netlify\/functions\/config\?img=[a-z0-9]{6,40}|https:\/\/[^\s"'<>]{4,400}|imagens\/[\w.\-]{1,80})$/i;
const U = v => { v = String(v || "").trim(); return URLOK.test(v) ? v : ""; };
const HTTPS = v => { v = String(v || "").trim(); return /^https:\/\/[^\s"'<>]{4,300}$/.test(v) ? v : ""; };
const COR = v => /^#[0-9a-f]{6}$/i.test(String(v || "")) ? String(v).toLowerCase() : "";
const slug = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const lista = (v, max, n) => (Array.isArray(v) ? v : []).map(x => S(x, n)).filter(Boolean).slice(0, max);

function limparConfig(c) {
  c = c && typeof c === "object" ? c : {};
  const out = {};
  const l = c.loja || {};
  out.loja = {
    nome: S(l.nome, 60), nomeLogo: S(l.nomeLogo, 40), sub1: S(l.sub1, 40), sub2: S(l.sub2, 40),
    tituloSite: S(l.tituloSite, 120),
    whats: S(l.whats, 20).replace(/\D/g, ""),
    instagram: HTTPS(l.instagram),
    bio: HTTPS(l.bio),
    facebook: HTTPS(l.facebook),
    tiktok: HTTPS(l.tiktok),
    youtube: HTTPS(l.youtube),
    cidadeLoja: S(l.cidadeLoja, 60),
    cidadesMoto: lista(l.cidadesMoto, 30, 60),
    avisos: lista(l.avisos, 12, 160),
    logo: U(l.logo),
    rodape: S(l.rodape, 160), copyright: S(l.copyright, 200),
    beneficios: (Array.isArray(l.beneficios) ? l.beneficios : []).slice(0, 4).map(b => ({ i: S(b && b.i, 8), t: S(b && b.t, 40), d: S(b && b.d, 100) }))
  };
  const cores = {};
  ["pink", "soft", "rose", "deep", "ink", "bg"].forEach(k => { const v = COR((c.cores || {})[k]); if (v) cores[k] = v; });
  out.cores = cores;

  const ids = new Set();
  out.categorias = (Array.isArray(c.categorias) ? c.categorias : []).slice(0, 40).map(x => {
    const nome = S(x && x.nome, 40), id = slug(x && x.id) || slug(nome);
    if (!nome || !id || ids.has(id)) return null; ids.add(id); return { id, nome };
  }).filter(Boolean);

  if (Array.isArray(c.produtos)) {
    const pid = new Set();
    out.produtos = c.produtos.slice(0, 400).map(p => {
      if (!p) return null;
      const nome = S(p.nome, 120); let id = slug(p.id) || slug(nome);
      if (!nome || !id) return null;
      while (pid.has(id)) id += "-2"; pid.add(id);
      const o = {
        id, categoria: slug(p.categoria), nome, preco: +N(p.preco, 0, 0, 100000).toFixed(2),
        tamanhos: lista(p.tamanhos, 30, 20), desc: S(p.desc, 2500),
        fotos: (Array.isArray(p.fotos) ? p.fotos : []).map(U).filter(Boolean).slice(0, 10),
        peso: N(p.peso, 0.3, 0.01, 30), largura: N(p.largura, 20, 1, 200), altura: N(p.altura, 5, 1, 200), comprimento: N(p.comprimento, 25, 1, 200)
      };
      if (!o.tamanhos.length) o.tamanhos = ["Único"];
      if (p.rotulo) o.rotulo = S(p.rotulo, 20);
      if (p.hero) o.hero = true;
      if (p.ativo === false) o.ativo = false;
      return o;
    }).filter(Boolean);
  }
  if (Array.isArray(c.slides)) {
    out.slides = c.slides.slice(0, 8).map(s => ({
      id: slug(s && s.id), img: U(s && s.img), c: slug(s && s.c) || "todos",
      a: S(s && s.a, 30), as: SL(s && s.as, 60), b: S(s && s.b, 30), bs: SL(s && s.bs, 60)
    })).filter(s => s.id || s.img);
  }
  return out;
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};

    if (event.httpMethod === "GET") {
      if (q.img) {
        const id = String(q.img).replace(/[^a-z0-9]/gi, "");
        const d = await (await abrirImg(event)).get(id);
        const m = d && /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(d);
        if (!m) return { statusCode: 404, headers: { "Content-Type": "text/plain" }, body: "Imagem não encontrada" };
        return { statusCode: 200, isBase64Encoded: true, body: m[2],
          headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=31536000, immutable" } };
      }
      const c = await (await abrir(event)).get("config");
      if (!c || Array.isArray(c) || !c.v) return J(200, { existe: false });
      if (String(q.v || "") === String(c.v)) return J(200, { igual: true, v: c.v });
      return J(200, { existe: true, ...c });
    }

    let corpo = event.body || "{}";
    if (event.isBase64Encoded) corpo = Buffer.from(corpo, "base64").toString("utf8");
    const b = JSON.parse(corpo);
    if (!senhaOk(b.senha)) return J(401, { erro: "Senha incorreta." });

    if (b.a === "ping") return J(200, { ok: true });

    if (b.a === "foto") {
      const d = String(b.dados || "");
      if (d.length > 2500000 || !/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(d)) return J(400, { erro: "Imagem inválida ou grande demais." });
      const id = Date.now().toString(36) + crypto.randomBytes(5).toString("hex");
      await (await abrirImg(event)).set(id, d);
      return J(200, { url: "/.netlify/functions/config?img=" + id });
    }

    if (b.a === "salvar") {
      const cfg = limparConfig(b.config);
      cfg.v = Date.now();
      if (JSON.stringify(cfg).length > 900000) return J(400, { erro: "Configuração grande demais." });
      await (await abrir(event)).set("config", cfg);
      return J(200, { ok: true, v: cfg.v });
    }

    if (b.a === "restaurar") {
      await (await abrir(event)).set("config", {});
      return J(200, { ok: true });
    }
    return J(400, { erro: "Ação inválida." });
  } catch (e) {
    return J(500, { erro: "Erro no servidor." });
  }
};
