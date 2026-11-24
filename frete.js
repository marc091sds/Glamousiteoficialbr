// POST { cep, itens:[{id,qtd}] }  ->  { opcoes:[{id,nome,preco,prazo,estimado}] }
const { cotar } = require("../lib/comum");

exports.handler = async (event) => {
  const h = { "Content-Type": "application/json" };
  try {
    const { cep, itens } = JSON.parse(event.body || "{}");
    const c = String(cep || "").replace(/\D/g, "");
    if (c.length !== 8) throw new Error("CEP inválido.");
    return { statusCode: 200, headers: h, body: JSON.stringify({ opcoes: await cotar(c, itens) }) };
  } catch (e) {
    return { statusCode: 400, headers: h, body: JSON.stringify({ erro: e.message }) };
  }
};
