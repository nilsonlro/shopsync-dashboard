export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send(`
      <html><body style="font-family:sans-serif;padding:40px">
        <h2>Erro: código não recebido</h2>
        <pre>${JSON.stringify(req.query, null, 2)}</pre>
      </body></html>
    `);
  }

  res.status(200).send(`
    <html><body style="font-family:sans-serif;padding:40px">
      <h2>✅ Autorização recebida!</h2>
      <p>Copia o código abaixo e cola no chat:</p>
      <textarea rows="4" cols="80" onclick="this.select()">${code}</textarea>
      <p style="color:red">⚠️ Este código expira em 5 minutos!</p>
    </body></html>
  `);
}
