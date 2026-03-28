// api/sync-ebay.js
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const APP_ID = process.env.EBAY_APP_ID;
const CERT_ID = process.env.EBAY_CERT_ID;

const CONTAS = [
  { nome: "Nilson Ebay", refresh: process.env.EBAY_REFRESH_1 },
  { nome: "Jaque Ebay",  refresh: process.env.EBAY_REFRESH_2 },
  { nome: "4Bliss Ebay", refresh: process.env.EBAY_REFRESH_3 },
];

async function obterAccessToken(refreshToken) {
  const credenciais = Buffer.from(`${APP_ID}:${CERT_ID}`).toString("base64");
  const resposta = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credenciais}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&scope=https://api.ebay.com/oauth/api_scope%20https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly`,
  });
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(`Erro ao obter access token: ${JSON.stringify(dados)}`);
  return dados.access_token;
}

async function buscarVendasEbay(accessToken) {
  const resposta = await fetch("https://api.ebay.com/sell/fulfillment/v1/order?limit=50", {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_GB",
    },
  });
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(`Erro ao buscar vendas: ${JSON.stringify(dados)}`);
  return dados.orders || [];
}

async function guardarNoSupabase(vendas, nomeConta) {
  if (vendas.length === 0) return { inseridos: 0, ignorados: 0 };
  let inseridos = 0, ignorados = 0;

  for (const v of vendas) {
    const registo = {
      plataforma: "eBay",
      conta: nomeConta,
      order_id: `ebay_${nomeConta.replace(/ /g,'_')}_${v.orderId}`,
      produto: v.lineItems?.[0]?.title || "Produto eBay",
      valor: parseFloat(v.pricingSummary?.total?.value || 0),
      moeda: v.pricingSummary?.total?.currency || "GBP",
      comprador: v.buyer?.username || "Desconhecido",
      estado: v.orderFulfillmentStatus || "UNKNOWN",
      data_venda: v.creationDate || new Date().toISOString(),
    };

    const resposta = await fetch(`${SUPABASE_URL}/rest/v1/vendas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "resolution=ignore-duplicates",
      },
      body: JSON.stringify(registo),
    });

    if (resposta.status === 201 || resposta.status === 200) inseridos++;
    else ignorados++;
  }
  return { inseridos, ignorados };
}

export default async function handler(req, res) {
  const resultados = [];
  for (const conta of CONTAS) {
    if (!conta.refresh) {
      resultados.push({ conta: conta.nome, erro: "Refresh token não configurado" });
      continue;
    }
    try {
      const accessToken = await obterAccessToken(conta.refresh);
      const vendas = await buscarVendasEbay(accessToken);
      const { inseridos, ignorados } = await guardarNoSupabase(vendas, conta.nome);
      resultados.push({ conta: conta.nome, vendas_encontradas: vendas.length, inseridos, ignorados });
    } catch (erro) {
      resultados.push({ conta: conta.nome, erro: erro.message });
    }
  }
  res.status(200).json({ sincronizado_em: new Date().toISOString(), resultados });
}
