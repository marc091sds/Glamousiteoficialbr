// Lógica compartilhada: busca de CEP e cotação de frete.
const CAT = require("../../catalogo.js");

const REGIAO = { AC:"N",AM:"N",AP:"N",PA:"N",RO:"N",RR:"N",TO:"N",
  AL:"NE",BA:"NE",CE:"NE",MA:"NE",PB:"NE",PE:"NE",PI:"NE",RN:"NE",SE:"NE",
  DF:"CO",GO:"CO",MS:"CO",MT:"CO", ES:"SE",MG:"SE",RJ:"SE",SP:"SE", PR:"S",RS:"S",SC:"S" };
// [valor base, prazo em dias úteis] — usado só como ESTIMATIVA quando o Melhor Envio não está configurado
const ESTIMATIVA = { N:[22,6], NE:[28,8], CO:[30,8], SE:[32,7], S:[36,9] };

// Cópia do catálogo original (arquivo catalogo.js), usada quando o painel ainda não salvou nada.
const BASE = JSON.parse(JSON.stringify({ produtos: CAT.produtos, loja: CAT.loja, categorias: CAT.categorias }));

// Atualiza CAT (preços, peças, dimensões, cidades de moto) com o que foi salvo no painel.
// Se algo falhar, continua com o catálogo original — nunca derruba o site.
async function sincronizar(event) {
  try {
    const { abrir } = require("./dados");
    const c = await (await abrir(event)).get("config");
    const ok = c && !Array.isArray(c) && Array.isArray(c.produtos);
    const prod = ok ? c.produtos.filter(p => p && p.ativo !== false && p.id && isFinite(p.preco)) : BASE.produtos;
    CAT.produtos.splice(0, CAT.produtos.length, ...prod.map(p => ({ peso: 0.3, largura: 20, altura: 5, comprimento: 25, ...p })));
    const cm = ok && c.loja && Array.isArray(c.loja.cidadesMoto) ? c.loja.cidadesMoto : BASE.loja.cidadesMoto;
    CAT.loja.cidadesMoto = cm;
  } catch (e) {}
}

const norm = s => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function montarItens(itens) {
  if (!Array.isArray(itens) || !itens.length) throw new Error("Sacola vazia.");
  return itens.map(i => {
    const p = CAT.produtos.find(x => x.id === i.id);
    const qtd = Math.max(1, Math.min(20, parseInt(i.qtd, 10) || 1));
    if (!p) throw new Error("Produto inválido.");
    return { p, qtd, tam: String(i.tam || "").slice(0, 40) };
  });
}

async function viacep(cep) {
  const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  const d = await r.json();
  if (d.erro) throw new Error("CEP não encontrado.");
  return d;
}

async function cotar(cep, itens) {
  const lista = montarItens(itens);
  const token = process.env.ME_TOKEN;
  if (token) {
    const base = process.env.ME_BASE || "https://melhorenvio.com.br";
    const r = await fetch(base + "/api/v2/me/shipment/calculate", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer " + token,
        "User-Agent": "El Glamour (" + (process.env.ME_EMAIL || "contato@elglamour.com") + ")" },
      body: JSON.stringify({
        from: { postal_code: process.env.CEP_ORIGEM },
        to: { postal_code: cep },
        products: lista.map(({ p, qtd }) => ({ id: p.id, width: p.largura, height: p.altura, length: p.comprimento,
          weight: p.peso, insurance_value: p.preco, quantity: qtd }))
      })
    });
    const d = await r.json();
    if (!Array.isArray(d)) throw new Error("Falha na cotação.");
    return d.filter(s => !s.error && (s.custom_price || s.price)).map(s => ({
      id: String(s.id),
      nome: ((s.company && s.company.name) ? s.company.name + " " : "") + s.name,
      preco: Number(s.custom_price || s.price),
      prazo: s.custom_delivery_time || s.delivery_time,
      estimado: false
    })).sort((a, b) => a.preco - b.preco);
  }
  // sem Melhor Envio configurado: estimativa por região
  const v = await viacep(cep);
  const [valor, prazo] = ESTIMATIVA[REGIAO[v.uf] || "SE"];
  const qtdTotal = lista.reduce((s, i) => s + i.qtd, 0);
  return [{ id: "estimado", nome: "Envio", preco: +(valor + 4 * (qtdTotal - 1)).toFixed(2), prazo, estimado: true }];
}

module.exports = { CAT, norm, montarItens, viacep, cotar, sincronizar };
