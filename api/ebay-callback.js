export default async function handler(req, res) {
  const { code } = req.query;
  const APP_ID = process.env.EBAY_APP_ID;
  const CERT_ID = process.env.EBAY_CERT_ID;
  const REDIRECT_URI = "Nilson_de_Olive-Nilsonde-app-PR-clscx";

  // Se não vier código na URL, mostra formulário para colar manualmente
  if (!code) {
    return res.status(200).send(`
      <html><body style="font-family:sans-serif;padding:40px">
        <h2>Cole o código de autorização aqui:</h2>
        <form method="GET">
          <textarea name="code" rows="4" cols="80" placeholder="Cole o código aqui..."></textarea>
          <br><br>
          <button type="submit" style="padding:10px 20px;font-size:16px">Trocar pelo Token</button>
        </form>
      </body></html>
    `);
  }

  // Troca o código pelo token
  try {
    const credenciais = Buffer.from(`${APP_ID}:${CERT_ID}`).toString("base64");

    const resposta = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credenciais}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: REDIRECT_URI,
      }).toString(),
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      return res.status(400).send(`
        <html><body style="font-family:sans-serif;padding:40px">
          <h2>❌ Erro ao obter token</h2>
          <pre>${JSON.stringify(dados, null, 2)}</pre>
          <p><a href="/api/ebay-callback">Tentar novamente</a></p>
        </body></html>
      `);
    }

    res.status(200).send(`
      <html><body style="font-family:sans-serif;padding:40px">
        <h2>✅ Token obtido com sucesso!</h2>
        <p><strong>Refresh Token</strong> (guarda este no Vercel):</p>
        <textarea rows="3" cols="100" onclick="this.select()">${dados.refresh
