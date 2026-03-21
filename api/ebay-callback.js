export default async function handler(req, res) {
  const APP_ID = process.env.EBAY_APP_ID;
  const CERT_ID = process.env.EBAY_CERT_ID;
  const REDIRECT_URI = "Nilson_de_Olive-Nilsonde-app-PR-clscx";
  const CODE = "v^1.1#i^1#r^1#I^3#p^3#f^0#t^Ul41XzM6MDY0Q0I2RUUxNDI2QTJEQjZGOUU3NEJBNjNDNEJFRDRfMV8xI0VeMjYw";

  const credenciais = Buffer.from(`${APP_ID}:${CERT_ID}`).toString("base64");

  const resposta = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credenciais}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: CODE,
      redirect_uri: REDIRECT_URI,
    }).toString(),
  });

  const dados = await resposta.json();
  res.status(200).json(dados);
}
```

Faz commit **imediatamente** e depois abre:
```
https://shopsync-dashboard.vercel.app/api/ebay-callback
