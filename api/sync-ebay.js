// api/sync-ebay.js
// Sincroniza vendas das 3 contas eBay para o Supabase

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const CONTAS = [
  { nome: "eBay Nilson 1", token: process.env.EBAY_TOKEN_1 },
  { nome: "eBay Nilson 2", token: process.env.EBAY_TOKEN_2 },
  { nome: "eBay Nilson 3", token: process.env.EBAY_TOKEN_3 },
];

async function buscarVendasEbay(conta) {
  const url = "https://api.ebay.com/sell/fulfillment/v1/order?limit=50&filter=orderfulfillmentstatus:%7BNOT_STARTED%7CIN_PROGRESS%7D";

  const resposta = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${conta.token}`,
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

async function buscarVendasConcluidasEbay(conta) {
  const url = "https://api.ebay.com/sell/fulfillment/v1/order?limit=50";

  const resposta = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${conta.token}`,
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

  for (const conta of CONTAS) {
    if (!conta.token) {
      resultados.push({ conta: conta.nome, erro: "Token não configurado" });
      continue;
    }

    try {
      const vendas = await buscarVendasConcluidasEbay(conta);
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
