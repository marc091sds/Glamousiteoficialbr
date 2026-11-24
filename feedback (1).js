// Avaliações e perguntas e respostas.
//  GET  ?a=lista&produto=ID   -> avaliações aprovadas + perguntas respondidas
//  GET  ?a=resumo             -> média e total por produto
//  POST {a:"avaliar"|"perguntar"|"adm_lista"|"adm_acao", ...}
const crypto = require("crypto");
const { abrir } = require("../lib/dados");
const { CAT } = require("../lib/comum");

const J = (c, o) => ({ statusCode: c, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(o) });
const limpa = (s, n) => String(s || "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const digitos = s => String(s || "").replace(/\D/g, "");

// Confere no Mercado Pago se existe pagamento APROVADO desse pedido, com o mesmo WhatsApp e contendo o produto.
async function compraVerificada(pedido, tel, produto) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token || !/^ELG-[A-Z0-9]{4,12}$/.test(pedido) || tel.length < 10) return false;
  const r = await fetch("https://api.mercadopago.com/v1/payments/search?external_reference=" + encodeURIComponent(pedido), {
    headers: { Authorization: "Bearer " + token }
  });
  const d = await r.json();
  const pg = (d.results || []).find(x => x.status === "approved");
  if (!pg) return false;
  if (digitos((pg.metadata || {}).whatsapp) !== tel) return false;
  const itens = (pg.additional_info && pg.additional_info.items) || [];
  return !itens.length || itens.some(i => String(i.id) === produto);
}

function senhaOk(s) {
  const a = Buffer.from(String(s || "").trim()), b = Buffer.from(String(process.env.ADMIN_SENHA || "").trim());
  return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

exports.handler = async (event) => {
  try {
    const db = await abrir(event);
    if (event.httpMethod === "GET") {
      const q = event.queryStringParameters || {};
      const av = (await db.get("avaliacoes")).filter(x => x.status === "aprovada");
      if (q.a === "resumo") {
        const r = {};
        av.forEach(x => { const o = r[x.produto] || (r[x.produto] = { s: 0, n: 0 }); o.s += x.nota; o.n++; });
        Object.keys(r).forEach(k => { r[k] = { m: +(r[k].s / r[k].n).toFixed(1), n: r[k].n }; });
        return J(200, { resumo: r });
      }
      if (!CAT.produtos.some(x => x.id === q.produto)) return J(400, { erro: "Produto inválido." });
      const pe = (await db.get("perguntas")).filter(x => x.status === "respondida" && x.produto === q.produto);
      return J(200, {
        avaliacoes: av.filter(x => x.produto === q.produto).sort((a, b) => b.data.localeCompare(a.data))
          .map(({ nome, cidade, nota, texto, data, verificado }) => ({ nome, cidade, nota, texto, data, verificado })),
        perguntas: pe.sort((a, b) => b.data.localeCompare(a.data)).map(({ nome, texto, data, resposta, dataResp }) => ({ nome, texto, data, resposta, dataResp }))
      });
    }
    const b = JSON.parse(event.body || "{}");

    if (b.a === "avaliar" || b.a === "perguntar") {
      if (b.site) return J(200, { ok: true });                       // campo-isca contra robôs
      if (!CAT.produtos.some(x => x.id === b.produto)) return J(400, { erro: "Produto inválido." });
      const nome = limpa(b.nome, 40);
      if (nome.length < 2) return J(400, { erro: "Digite seu nome." });
      if (b.a === "perguntar") {
        const texto = limpa(b.texto, 400);
        if (texto.length < 8) return J(400, { erro: "Escreva sua pergunta com mais detalhes." });
        const lista = await db.get("perguntas");
        lista.push({ id: novoId(), produto: b.produto, nome, texto, data: new Date().toISOString(), status: "pendente", resposta: "" });
        await db.set("perguntas", lista.slice(-500));
        return J(200, { ok: true });
      }
      const cidade = limpa(b.cidade, 40), texto = limpa(b.texto, 600), nota = parseInt(b.nota, 10);
      if (cidade.length < 2) return J(400, { erro: "Digite sua cidade." });
      if (!(nota >= 1 && nota <= 5)) return J(400, { erro: "Escolha de 1 a 5 estrelas." });
      if (texto.length < 10) return J(400, { erro: "Conte um pouco mais sobre a peça." });
      const pedido = limpa(b.pedido, 20).toUpperCase(), tel = digitos(b.tel);
      const lista = await db.get("avaliacoes");
      let verificado = false;
      if (pedido) {
        if (lista.some(x => x.pedido === pedido && x.produto === b.produto)) return J(400, { erro: "Esse pedido já avaliou esta peça." });
        verificado = await compraVerificada(pedido, tel, b.produto).catch(() => false);
      }
      lista.push({ id: novoId(), produto: b.produto, nome, cidade, nota, texto, data: new Date().toISOString(),
        pedido: verificado ? pedido : "", verificado, status: verificado ? "aprovada" : "pendente" });
      await db.set("avaliacoes", lista.slice(-2000));
      return J(200, { ok: true, publicada: verificado });
    }

    if (String(b.a).startsWith("adm_")) {
      if (!senhaOk(b.senha)) return J(401, { erro: "Senha incorreta." });
      let av = await db.get("avaliacoes"), pe = await db.get("perguntas");
      if (b.a === "adm_acao") {
        const lista = b.tipo === "pergunta" ? pe : av, it = lista.find(x => x.id === b.id);
        if (!it) return J(404, { erro: "Item não encontrado." });
        if (b.acao === "excluir") { const k = lista.indexOf(it); lista.splice(k, 1); }
        else if (b.acao === "aprovar" && b.tipo !== "pergunta") it.status = "aprovada";
        else if (b.acao === "responder" && b.tipo === "pergunta") {
          const r = limpa(b.resposta, 600); if (!r) return J(400, { erro: "Escreva a resposta." });
          it.resposta = r; it.dataResp = new Date().toISOString(); it.status = "respondida";
        } else return J(400, { erro: "Ação inválida." });
        await db.set(b.tipo === "pergunta" ? "perguntas" : "avaliacoes", lista);
      }
      const nomeP = id => (CAT.produtos.find(p => p.id === id) || {}).nome || id;
      return J(200, {
        avaliacoes: av.slice().reverse().map(x => ({ ...x, produtoNome: nomeP(x.produto) })),
        perguntas: pe.slice().reverse().map(x => ({ ...x, produtoNome: nomeP(x.produto) }))
      });
    }
    return J(400, { erro: "Ação inválida." });
  } catch (e) {
    return J(500, { erro: "Erro no servidor." });
  }
};
