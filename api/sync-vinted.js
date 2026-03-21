// api/sync-vinted.js
// Sincroniza vendas do Vinted usando token de sessão do browser

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const CONTAS = [
  {
    nome: "Vinted Nilson",
    token: process.env.VINTED_TOKEN_NILSON,
  },
  {
    nome: "Vinted Jaqueline",
    token: process.env.VINTED_TOKEN_JAQUELINE,
  },
];

async function buscarVendasVinted(conta) {
  const headers = {
    "Cookie": `access_token_web=${conta.token}`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*",
    "X-Requested-With": "XMLHttpRequest",
  };

  // Busca as transações (vendas) da conta
  const url = "https://www.vinted.co.uk/api/v2/transactions?page=1&per_page=50";
  
  const resposta = await fetch(url, { headers });

  if (!resposta.ok) {
    throw new Error(`Erro ${resposta.status} para conta ${conta.nome}. Token expirado?`);
  }

  const dados = await resposta.json();
  return dados.transactions || [];
}

async function guardarNoSupabase(vendas, nomeConta) {
  if (vendas.length === 0) return { inseridos: 0 };

  const registos = vendas.map((v) => ({
    plataforma: "Vinted",
    conta: nomeConta,
    order_id: `vinted_${v.id}`,
    produto: v.item?.title || "Produto Vinted",
    valor: parseFloat(v.amount?.amount || 0),
    moeda: v.amount?.currency_code || "GBP",
    comprador: v.buyer?.login || "Desconhecido",
    estado: v.status || "completed",
    data_venda: v.created_at || new Date().toISOString(),
  }));

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
    throw new Error(`Erro ao guardar no Supabase: ${erro}`);
  }

  return { inseridos: registos.length };
}

export default async function handler(req, res) {
  // Permite chamada manual por GET ou pelo cron job
  const resultados = [];

  for (const conta of CONTAS) {
    if (!conta.token) {
      resultados.push({ conta: conta.nome, erro: "Token não configurado" });
      continue;
    }

    try {
      const vendas = await buscarVendasVinted(conta);
      const { inseridos } = await guardarNoSupabase(vendas, conta.nome);
      resultados.push({ conta: conta.nome, vendas_encontradas: vendas.length, inseridos });
    } catch (erro) {
      resultados.push({ conta: conta.nome, erro: erro.message });
    }
  }

  res.status(200).json({
    sincronizado_em: new Date().toISOString(),
    resultados,
  });
}
