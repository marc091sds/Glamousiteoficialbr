// Cria o pagamento no Mercado Pago (Checkout Pro) e devolve o link para o cliente pagar.
// Os PREÇOS e o FRETE são recalculados aqui no servidor — o navegador não decide valores.
const { CAT, norm, montarItens, viacep, cotar } = require("../lib/comum");

exports.handler = async (event) => {
  const h = { "Content-Type": "application/json" };
  const erro = (c, m) => ({ statusCode: c, headers: h, body: JSON.stringify({ erro: m }) });
  try {
    if (!process.env.MP_ACCESS_TOKEN) return erro(503, "Pagamento online ainda não configurado.");
    const { cliente = {}, endereco = {}, itens, entrega = {} } = JSON.parse(event.body || "{}");
    const cep = String(endereco.cep || "").replace(/\D/g, "");
    if (cep.length !== 8 || !cliente.nome || !endereco.numero) return erro(400, "Dados incompletos.");
    const lista = montarItens(itens);

    // frete
    let frete = 0, modo = "envio", servico = "";
    const v = await viacep(cep);
    if (entrega.modo === "moto") {
      if (!CAT.loja.cidadesMoto.some(c => norm(c) === norm(v.localidade))) return erro(400, "Moto/Uber indisponível para essa cidade.");
      modo = "moto";
    } else {
      const ops = await cotar(cep, itens);
      const o = ops.find(x => x.id === String(entrega.servico_id));
      if (!o) return erro(400, "Opção de frete inválida. Calcule o frete novamente.");
      frete = o.preco; servico = o.nome;
    }

    const site = (process.env.SITE_URL || event.headers.origin || "").replace(/\/$/, "");
    const tel = String(cliente.tel || "").replace(/\D/g, "");
    const pedido = "ELG-" + Date.now().toString(36).toUpperCase();
    const pref = {
      items: lista.map(({ p, qtd, tam }) => ({ id: p.id, title: p.nome + (tam ? " (" + tam + ")" : ""),
        quantity: qtd, unit_price: p.preco, currency_id: "BRL" })),
      payer: { name: cliente.nome, phone: { area_code: tel.slice(0, 2), number: tel.slice(2) },
        address: { zip_code: cep, street_name: v.logradouro || endereco.rua || "", street_number: String(endereco.numero) } },
      shipments: { cost: frete, mode: "not_specified" },
      external_reference: pedido,
      statement_descriptor: "EL GLAMOUR",
      metadata: { modo, servico, cidade: v.localidade, uf: v.uf, bairro: v.bairro, compl: endereco.compl || "", whatsapp: tel },
      back_urls: { success: site + "/?pagamento=ok&pedido=" + pedido, failure: site + "/?pagamento=erro", pending: site + "/?pagamento=pendente" },
      auto_return: "approved"
    };
    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.MP_ACCESS_TOKEN },
      body: JSON.stringify(pref)
    });
    const d = await r.json();
    if (!d.init_point) return erro(502, "Não foi possível iniciar o pagamento.");
    return { statusCode: 200, headers: h, body: JSON.stringify({ url: d.init_point, pedido }) };
  } catch (e) {
    return erro(400, e.message);
  }
};
