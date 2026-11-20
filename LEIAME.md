# Loja El Glamour — como colocar no ar

## O que já funciona sem configurar nada
- Vitrine, sacola, escolha de tamanho, preenchimento do endereço pelo CEP (ViaCEP).
- Entrega por moto/Uber só aparece para cidades da lista `cidadesMoto` (hoje: Belém), com valor "a combinar".
- Finalizar o pedido pelo WhatsApp (mensagem pronta com itens, endereço e total).

## Como adicionar peças e categorias
No `catalogo.js`, copie um bloco de produto e troque `id` (sem espaços), `categoria`, `nome`, `preco`, `tamanhos` e `fotos`.
Coloque as fotos na pasta `imagens/` e a descrição em `desc`. **As fotos atuais são provisórias** (recortes do seu Instagram): para trocar, salve a foto nova em `imagens/` com o MESMO nome do arquivo. As categorias (Pijamas, Macaquinhos, Vestidos, Conjuntos, Chinelos, Lingeries) só aparecem no menu
e nos círculos quando têm pelo menos uma peça. Para criar outra categoria, adicione na lista `categorias`.

## O que precisa de configuração (frete automático e pagamento)
Frete e pagamento rodam em "funções" da Netlify (pasta `netlify/functions`). Elas guardam suas chaves em segredo.

1. **Preços e peças:** edite `catalogo.js` (os preços de agora são exemplos). Confira também o número do WhatsApp.
2. **Publicar com funções:** arrastar a pasta no Netlify Drop NÃO publica as funções.
   Use GitHub + Netlify (Add new site > Import from Git) ou o Netlify CLI (`netlify deploy --prod`).
3. **Variáveis de ambiente** (Netlify > Site configuration > Environment variables):
   - `MP_ACCESS_TOKEN` — Access Token de produção do Mercado Pago (Seu negócio > Configurações > Credenciais).
   - `ME_TOKEN` — token do Melhor Envio (cotação real dos Correios e transportadoras).
   - `CEP_ORIGEM` — CEP de onde você envia (só números).
   - `SITE_URL` — endereço do site, ex.: https://elglamour.netlify.app (para o cliente voltar após pagar).
   - `ADMIN_SENHA` — senha do painel de avaliações (admin.html).
   - `ME_EMAIL` — seu e-mail (o Melhor Envio pede para identificar a aplicação).
4. O frete também é estimado automaticamente no navegador quando as funções não estão ativas (marcado como "estimativa"). Sem `ME_TOKEN`, o site mostra um frete ESTIMADO por região (marcado como "estimativa"). Configure o token para ter o valor real.

## Avaliações e perguntas das clientes
Funcionam nas funções da Netlify (precisam de publicar pelo GitHub/CLI) e guardam os dados no Netlify Blobs (já incluso, sem custo extra de cadastro).
- Variável nova: `ADMIN_SENHA` — a senha do seu painel. O painel é o endereço `seusite.netlify.app/admin.html`: lá você aprova avaliações, responde perguntas e exclui o que quiser.
- **Avaliação com código do pedido** (cliente que pagou pelo site): o sistema confere no Mercado Pago (pagamento aprovado + mesmo WhatsApp + a peça comprada) e publica na hora com o selo "Compra verificada". O código (ex.: ELG-ABC123) aparece para a cliente ao voltar do pagamento.
- **Avaliação sem código** (ex.: comprou pelo WhatsApp): fica aguardando a sua aprovação no painel.
- **Perguntas:** só aparecem no site depois que você responde no painel.
- Aparecem o nome e a cidade da cliente. Para sair do ar, exclua no painel.

## Como você recebe os pedidos
- Pagamento online: o pedido e o dinheiro caem na sua conta do Mercado Pago (você também recebe e-mail do Mercado Pago).
- Pedido pelo WhatsApp: chega pronto no seu WhatsApp.
- Moto/Uber: o cliente escolhe a opção e você combina o valor da entrega pelo WhatsApp.

## Pontos de atenção
- Esta versão não gera etiqueta de envio sozinha: depois de pago, gere a etiqueta no Melhor Envio.
- Teste uma compra real de valor baixo antes de divulgar.
