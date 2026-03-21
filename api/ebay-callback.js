export default async function handler(req, res) {
  try {
    const { code } = req.query;
    const APP_ID = process.env.EBAY_APP_ID;
    const CERT_ID = process.env.EBAY_CERT_ID;
    const REDIRECT_URI = "Nilson_de_Olive-Nilsonde-app-PR-clscx";

    if (!code) {
      return res.status(200).send(`
        <html><body style="font-family:sans-serif;padding:40px">
          <h2>Sem código recebido</h2>
          <pre>${JSON.stringify(req.query, null, 2)}</pre>
        </body></html>
      `);
    }

    const credenciais = Buffer.from(`${APP_ID}:${CERT_ID}`).toString("base64");

    const resposta = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credenciais}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${REDIRECT_URI}`,
    });

    const texto = await resposta.text();

    let dados;
    try {
      dados = JSON.parse(texto);
    } catch(e) {
      return res.status(200).send(`
        <html><body style="font-family:sans-serif;padding:40px">
          <h2>Resposta do eBay:</h2>
          <pre>${texto}</pre>
        </body></html>
      `);
    }

    if (dados.refresh_token) {
      return res.status(200).send(`
        <html><body style="font-family:sans-serif;padding:40px;max-width:900px">
          <h2>✅ Refresh Token obtido!</h2>
          <p>Guarda este valor no Vercel:</p>
          <textarea rows="3" cols="80" onclick="this.select()" style="width:100%">${dados.refresh_token}</textarea>
          <p style="color:green">Expira em: ${Math.round(dados.refresh_token_expires_in / 86400)} dias</p>
        </body></html>
      `);
    }

    return res.status(200).send(`
      <html><body style="font-family:sans-serif;padding:40px">
        <h2>Resposta:</h2>
        <pre>${JSON.stringify(dados, null, 2)}</pre>
      </body></html>
    `);

  } catch(erro) {
    return res.status(200).send(`
      <html><body style="font-family:sans-serif;padding:40px">
        <h2>Erro: ${erro.message}</h2>
        <pre>${erro.stack}</pre>
      </body></html>
    `);
  }
}
