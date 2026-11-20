// Armazenamento simples (Netlify Blobs) para avaliações e perguntas.
// Para testes locais, defina DADOS_MEM=1 (guarda só na memória).
const mem = {};
async function abrir(event) {
  if (process.env.DADOS_MEM) return { get: async k => mem[k] || [], set: async (k, v) => { mem[k] = v; } };
  const { getStore, connectLambda } = require("@netlify/blobs");
  try { connectLambda(event); } catch (e) {}
  const st = getStore("el-glamour-feedback");
  return { get: async k => (await st.get(k, { type: "json" })) || [], set: (k, v) => st.setJSON(k, v) };
}
module.exports = { abrir };
