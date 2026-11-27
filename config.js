// Configuração da loja editável pelo painel (produtos, fotos, logo, cores, textos, contatos e redes).
//  GET  ?v=123        -> configuração salva (ou {igual:true} se a versão v não mudou)
//  GET  ?img=ID       -> foto enviada pelo painel
//  POST {senha, a:"foto",     dados:"data:image/..."}  -> {url}
//  POST {senha, a:"salvar",   config:{...}}            -> {ok, v}
//  POST {senha, a:"restaurar"}                         -> volta para o catálogo original do site
const crypto = require("crypto");
const { abrir, abrirImg } = require("../lib/dados");

const J = (c, o) => ({ statusCode: c, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(o) });

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
const TAGS = ["destaque", "oferta", "vendido", "lancamento", "ultimas", "exclusivo"];
const FONTES = ["montserrat", "cormorant", "playfair", "alfa", "poppins", "lobster", "pacifico", "dancing", "greatvibes", "oswald", "bebas", "raleway", "quicksand", "abril", "caveat", "satisfy", "lato", "roboto"];
const AREAS = ["geral", "topo", "marca", "menu", "banner1", "banner2", "quadros", "titulos", "produto", "preco", "rodape"];
const lista = (v, max, n) => (Array.isArray(v) ? v : []).map(x => S(x, n)).filter(Boolean).slice(0, max);

function limparEstilos(estilos, areas) {
  const est = {};
  areas.forEach(a => {
    const e = (estilos || {})[a]; if (!e || typeof e !== "object") return;
    const o = {};
    if (FONTES.includes(e.fonte)) o.fonte = e.fonte;
    const t = Math.round(N(e.tam, 100, 60, 220)); if (t !== 100) o.tam = t;
    if ([400, 500, 600, 700, 800, 900].includes(+e.peso)) o.peso = +e.peso;
    if (e.italico) o.italico = true;
    if (["maiuscula", "minuscula", "capitalizar", "normal"].includes(e.caixa)) o.caixa = e.caixa;
    const cor = COR(e.cor); if (cor) o.cor = cor;
    if (Object.keys(o).length) est[a] = o;
  });
  return est;
}

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

  out.estilos = limparEstilos(c.estilos, AREAS);

  const ids = new Set();
  out.categorias = (Array.isArray(c.categorias) ? c.categorias : []).slice(0, 40).map(x => {
    const nome = S(x && x.nome, 40), id = slug(x && x.id) || slug(nome);
    if (!nome || !id || ids.has(id)) return null; ids.add(id); return x.ativo === false ? { id, nome, ativo: false } : { id, nome };
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
      o.tags = (Array.isArray(p.tags) ? p.tags : []).map(t => S(t, 20)).filter((t, k, a) => TAGS.includes(t) && a.indexOf(t) === k);
      const pa = N(p.precoAntigo, 0, 0, 100000); if (pa > o.preco) o.precoAntigo = +pa.toFixed(2);
      if (p.etiqueta) o.etiqueta = S(p.etiqueta, 24);
      if (p.ativo === false) o.ativo = false;
      return o;
    }).filter(Boolean);
  }
  if (Array.isArray(c.slides)) {
    out.slides = c.slides.slice(0, 8).map(s => ({
      id: slug(s && s.id), img: U(s && s.img), c: slug(s && s.c) || "todos",
      a: S(s && s.a, 30), as: SL(s && s.as, 60), b: S(s && s.b, 30), bs: SL(s && s.bs, 60), ...(s && s.ativo === false ? { ativo: false } : {})
    })).filter(s => s.id || s.img);
  }
  return out;
}

// ---------- site de bio ----------
const BAREAS = ["geral", "frase", "titulo", "sub", "peca", "botao", "botaosub", "rodape"];
function limparBio(c) {
  c = c && typeof c === "object" ? c : {};
  const o = {
    whats: S(c.whats, 20).replace(/\D/g, ""), mensagem: S(c.mensagem, 300), instagram: HTTPS(c.instagram), grupo: HTTPS(c.grupo),
    logo: U(c.logo), frase: lista(c.frase, 8, 40), fraseModo: c.fraseModo === "texto" ? "texto" : "colagem",
    tituloVaral: S(c.tituloVaral, 40), subVaral: S(c.subVaral, 60), mostrarVaral: c.mostrarVaral !== false,
    rodape: S(c.rodape, 140), titulo: S(c.titulo, 120), descricao: S(c.descricao, 200),
    efeitos: { fundo: !(c.efeitos && c.efeitos.fundo === false), rolar: !(c.efeitos && c.efeitos.rolar === false) }
  };
  const cores = {}; ["cream", "skin", "rose", "deep", "ink"].forEach(k => { const v = COR((c.cores || {})[k]); if (v) cores[k] = v; });
  o.cores = cores;
  const bid = new Set();
  o.botoes = (Array.isArray(c.botoes) ? c.botoes : []).slice(0, 14).map(b => {
    if (!b) return null;
    let id = slug(b.id) || "b" + bid.size; while (bid.has(id)) id += "-2"; bid.add(id);
    const x = { id, tipo: b.tipo === "whats" ? "whats" : "link", icone: S(b.icone, 8), titulo: S(b.titulo, 50), sub: S(b.sub, 80), link: HTTPS(b.link) };
    if (b.ativo === false) x.ativo = false; return x;
  }).filter(b => b && b.titulo);
  const pid = new Set();
  o.polaroids = (Array.isArray(c.polaroids) ? c.polaroids : []).slice(0, 40).map(p => {
    if (!p) return null;
    let id = slug(p.id) || "p" + pid.size; while (pid.has(id)) id += "-2"; pid.add(id);
    const x = { id, nome: S(p.nome, 40), emoji: S(p.emoji, 8) || "👗", fotos: (Array.isArray(p.fotos) ? p.fotos : []).map(U).filter(Boolean).slice(0, 3) };
    if (p.ativo === false) x.ativo = false; return x;
  }).filter(p => p && p.fotos.length);
  o.estilos = limparEstilos(c.estilos, BAREAS);
  return o;
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
          headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=31536000, immutable", "Access-Control-Allow-Origin": "*" } };
      }
      if (q.bio) {
        const bc = await (await abrir(event)).get("bio");
        if (!bc || Array.isArray(bc) || !bc.v) return J(200, { existe: false });
        if (String(q.v || "") === String(bc.v)) return J(200, { igual: true, v: bc.v });
        return J(200, { existe: true, ...bc });
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

    if (b.a === "salvar_bio") {
      const bc = limparBio(b.bio);
      bc.v = Date.now();
      if (JSON.stringify(bc).length > 400000) return J(400, { erro: "Configuração do bio grande demais." });
      await (await abrir(event)).set("bio", bc);
      return J(200, { ok: true, v: bc.v });
    }
    if (b.a === "restaurar_bio") {
      await (await abrir(event)).set("bio", {});
      return J(200, { ok: true });
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
