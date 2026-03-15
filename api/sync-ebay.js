// api/sync-ebay.js
// Sincroniza encomendas das 3 contas eBay para a Supabase
// Ficará completo assim que o eBay aprovar a conta de programador

const { createClient } = require('@supabase/supabase-js');

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Configuração das 3 contas eBay
// Os tokens serão adicionados após aprovação do eBay Developer
const CONTAS_EBAY = [
  {
    nome:          'eBay Nilson 1',
    access_token:  process.env.EBAY_TOKEN_1,
    refresh_token: process.env.EBAY_REFRESH_1,
  },
  {
    nome:          'eBay Nilson 2',
    access_token:  process.env.EBAY_TOKEN_2,
    refresh_token: process.env.EBAY_REFRESH_2,
  },
  {
    nome:          'eBay Nilson 3',
    access_token:  process.env.EBAY_TOKEN_3,
    refresh_token: process.env.EBAY_REFRESH_3,
  },
];

const EBAY_APP_ID    = process.env.EBAY_APP_ID;
const EBAY_CERT_ID   = process.env.EBAY_CERT_ID;
const EBAY_API_BASE  = 'https://api.ebay.com';

// ── Renovar Access Token usando Refresh Token ─────────────
async function renovarToken(refreshToken) {
  const credenciais = Buffer.from(EBAY_APP_ID + ':' + EBAY_CERT_ID).toString('base64');

  const res = await fetch(EBAY_API_BASE + '/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + credenciais,
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken),
  });

  if (!res.ok) throw new Error('Erro ao renovar token eBay: ' + res.status);
  const dados = await res.json();
  return dados.access_token;
}

// ── Buscar encomendas de uma conta eBay ───────────────────
async function buscarEncomendas(accessToken, nomeConta) {
  const res = await fetch(
    EBAY_API_BASE + '/sell/fulfillment/v1/order?limit=50&orderingStatus=IN_PROGRESS,COMPLETED',
    {
      headers: {
        'Authorization':  'Bearer ' + accessToken,
        'Content-Type':   'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_GB',
      },
    }
  );

  if (!res.ok) throw new Error('Erro ao buscar encomendas eBay: ' + res.status);

  const dados = await res.json();
  const orders = dados.orders || [];

  return orders.map(o => ({
    plataforma:  'eBay',
    conta:       nomeConta,
    order_id:    'EB-' + o.orderId,
    produto:     o.lineItems?.[0]?.title || 'Produto eBay',
    valor:       parseFloat(o.pricingSummary?.total?.value || 0),
    moeda:       o.pricingSummary?.total?.currency || 'GBP',
    comprador:   o.buyer?.username || '—',
    estado:      mapEstado(o.orderFulfillmentStatus),
    data_venda:  o.creationDate || new Date().toISOString(),
  }));
}

// ── Mapear estados do eBay ────────────────────────────────
function mapEstado(status) {
  const mapa = {
    'FULFILLED':      'delivered',
    'IN_PROGRESS':    'sent',
    'NOT_STARTED':    'pending',
    'PENDING_PICKUP': 'pending',
  };
  return mapa[status] || 'pending';
}

// ── Guardar encomendas na Supabase ────────────────────────
async function guardarEncomendas(encomendas) {
  if (!encomendas.length) return 0;
  const { error } = await db
    .from('vendas')
    .upsert(encomendas, { onConflict: 'order_id', ignoreDuplicates: false });
  if (error) throw new Error('Erro Supabase: ' + error.message);
  return encomendas.length;
}

// ── Handler principal ─────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Verificar se os tokens estão configurados
  if (!EBAY_APP_ID || !EBAY_CERT_ID) {
    return res.status(200).json({
      ok: false,
      mensagem: 'eBay ainda não configurado — aguardar aprovação do Developer Portal',
    });
  }

  const resultados = {
    sincronizado:    new Date().toISOString(),
    contas:          [],
    total_importado: 0,
    erros:           [],
  };

  for (const conta of CONTAS_EBAY) {
    if (!conta.access_token && !conta.refresh_token) {
      resultados.contas.push({ nome: conta.nome, ok: false, erro: 'Token não configurado' });
      continue;
    }

    try {
      console.log('A sincronizar:', conta.nome);

      // Tentar renovar token primeiro
      let token = conta.access_token;
      if (conta.refresh_token) {
        try { token = await renovarToken(conta.refresh_token); } catch(e) { /* usa token actual */ }
      }

      const encomendas = await buscarEncomendas(token, conta.nome);
      const total      = await guardarEncomendas(encomendas);

      resultados.contas.push({ nome: conta.nome, importado: total, ok: true });
      resultados.total_importado += total;

    } catch (e) {
      console.error(conta.nome + ' erro:', e.message);
      resultados.erros.push({ conta: conta.nome, erro: e.message });
      resultados.contas.push({ nome: conta.nome, importado: 0, ok: false, erro: e.message });
    }
  }

  res.status(200).json(resultados);
};
