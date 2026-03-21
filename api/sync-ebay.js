// api/sync-ebay.js
// Sincroniza vendas das 3 contas eBay usando OAuth

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const APP_ID = process.env.EBAY_APP_ID;
const CERT_ID = process.env.EBAY_CERT_ID;

const CONTAS = [
  { nome: "eBay Nilson 1", token: process.env.EBAY_TOKEN_1 },
  { nome: "eBay Nilson 2", token: process.env.EBAY_TOKEN_2 },
  { nome: "eBay Nilson 3", token: process.env.EBAY_TOKEN_3 },
];

async function obterAccessToken(userToken) {
  const credenciais = Buffer.from(`${APP_ID}:${CERT_ID}`).toString("base64");

  const resposta = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credenciais}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
    }).toString(),
  });

  if (!resposta.ok) {
    const erro = await resposta.text();
    throw new Error(`Erro ao obter access token: ${erro}`);
  }

  const dados = await resposta.json();
  return dados.access_token;
}

async function buscarVendasEbay(accessToken) {
  const url = "https://api.ebay.com/sell/fulfillment/v1/order?limit=50";

  const resposta = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_GB",
    },
  });

  if (!resposta.ok) {
    const erro = await resposta.text();
    throw new Error(`Erro ${resposta.status}: ${erro}`);
  }

  const dados = await resposta.json();
  return dados.orders || [];
}

async function guardarNoSupabase(vendas, nomeConta) {
  if (vendas.length === 0) return { inseridos: 0 };

  const registos = vendas.map((v) => {
    const item = v.lineItems?.[0];
    return {
      plataforma: "eBay",
      conta: nomeConta,
      order_id: `ebay_${v.orderId}`,
      produto: item?.title || "Produto eBay",
      valor: parseFloat(v.pricingSummary?.total?.value || 0),
      moeda: v.pricingSummary?.total?.currency || "GBP",
      comprador: v.buyer?.username || "Desconhecido",
      estado: v.orderFulfillmentStatus || "UNKNOWN",
      data_venda: v.creationDate || new Date().toISOString(),
    };
  });

  const resposta = await fetch(`${SUPABASE_URL}/rest/v1/vendas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer": "resolution=ignore-duplicates",
    },
    body: JSON.stringify(registos),
  });

  if (!resposta.ok) {
    const erro = await resposta.text();
    throw new Error(`Erro Supabase: ${erro}`);
  }

  return { inseridos: registos.length };
}

export default async function handler(req, res) {
  const resultados = [];

  // Primeiro obtemos um access token de aplicação
  let accessToken;
  try {
    accessToken = await obterAccessToken();
  } catch (erro) {
    return res.status(500).json({
      erro: "Falha ao obter access token da aplicação",
      detalhe: erro.message,
    });
  }

  // Depois buscamos as vendas de cada conta
  for (const conta of CONTAS) {
    if (!conta.token) {
      resultados.push({ conta: conta.nome, erro: "Token não configurado" });
      continue;
    }

    try {
      const vendas = await buscarVendasEbay(accessToken);
      const { inseridos } = await guardarNoSupabase(vendas, conta.nome);
      resultados.push({
        conta: conta.nome,
        vendas_encontradas: vendas.length,
        inseridos,
      });
    } catch (erro) {
      resultados.push({ conta: conta.nome, erro: erro.message });
    }
  }

  res.status(200).json({
    sincronizado_em: new Date().toISOString(),
    resultados,
  });
}
