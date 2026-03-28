// api/sync-vinted.js
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const CONTAS = [
  { nome: "Vinted Nilson", token: process.env.VINTED_TOKEN_NILSON },
];

async function buscarVendasVinted(conta) {
  const url = "https://www.vinted.co.uk/my_orders?type=sold&status=all&per_page=50&page=1";

  const resposta = await fetch(url, {
    headers: {
      "Cookie": `access_token_web=${conta.token}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-uk-fr",
      "Referer": "https://www.vinted.co.uk/my_orders",
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  if (!resposta.ok) {
    const texto = await resposta.text();
    throw new Error(`Erro ${resposta.status}: ${texto.slice(0, 200)}`);
  }

  const dados = await resposta.json();
  return dados.my_orders || [];
}

async function guardarNoSupabase(vendas, nomeConta) {
  if (vendas.length === 0) return { inseridos: 0, ignorados: 0 };

  let inseridos = 0;
  let ignorados = 0;

  for (const v of vendas) {
    const registo = {
      plataforma: "Vinted",
      conta: nomeConta,
      order_id: `vinted_${v.transaction_id || v.conversation_id}`,
      produto: v.title || "Produto Vinted",
      valor: parseFloat(v.total_item_price?.amount || v.price?.amount || 0),
      moeda: v.total_item_price?.currency_code || "GBP",
      comprador: v.buyer?.login || v.opposite_user?.login || "Desconhecido",
      estado: v.status || "completed",
      data_venda: v.created_at || new Date().toISOString(),
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

    if (resposta.status === 201 || resposta.status === 200) {
      inseridos++;
    } else {
      ignorados++;
    }
  }

  return { inseridos, ignorados };
}

export default async function handler(req, res) {
  const resultados = [];

  for (const conta of CONTAS) {
    if (!conta.token) {
      resultados.push({ conta: conta.nome, erro: "Token não configurado" });
      continue;
    }

    try {
      const vendas = await buscarVendasVinted(conta);
      const { inseridos, ignorados } = await guardarNoSupabase(vendas, conta.nome);
      resultados.push({
        conta: conta.nome,
        vendas_encontradas: vendas.length,
        inseridos,
        ignorados,
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
