// api/sync-vinted.js
// Sincroniza encomendas das 2 contas Vinted para a Supabase
// Corre automaticamente a cada 6 horas via Vercel Cron

const { createClient } = require('@supabase/supabase-js');

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Configuração das 2 contas Vinted
const CONTAS_VINTED = [
  {
    nome:     'Vinted Nilson',
    email:    process.env.VINTED_EMAIL_NILSON,
    password: process.env.VINTED_PASS_NILSON,
  },
  {
    nome:     'Vinted Jaqueline',
    email:    process.env.VINTED_EMAIL_JAQUELINE,
    password: process.env.VINTED_PASS_JAQUELINE,
  },
];

const BASE_URL = 'https://www.vinted.co.uk';

// ── Fazer login numa conta Vinted ──────────────────────────
async function loginVinted(email, password) {
  try {
    // Passo 1 — obter cookie de sessão inicial
    const res1 = await fetch(BASE_URL + '/web/api/v2/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify({
        client_id:  'web',
        grant_type: 'password',
        username:   email,
        password:   password,
        scope:      'user public',
      }),
    });

    if (!res1.ok) {
      const text = await res1.text();
      throw new Error('Login falhou (' + res1.status + '): ' + text.slice(0, 200));
    }

    const dados = await res1.json();
    return dados.access_token;
  } catch (e) {
    throw new Error('Erro no login Vinted: ' + e.message);
  }
}

// ── Buscar encomendas de uma conta ────────────────────────
async function buscarEncomendas(token, nomeConta) {
  const res = await fetch(BASE_URL + '/api/v2/transactions?page=1&per_page=50', {
    headers: {
      'Authorization': 'Bearer ' + token,
      'User-Agent':    'Mozilla/5.0',
    },
  });

  if (!res.ok) throw new Error('Erro ao buscar encomendas: ' + res.status);

  const dados = await res.json();
  const transacoes = dados.transactions || dados.items || [];

  return transacoes.map(t => ({
    plataforma:  'Vinted',
    conta:       nomeConta,
    order_id:    'VT-' + t.id,
    produto:     t.item_title || t.title || 'Produto Vinted',
    valor:       parseFloat(t.total_item_price || t.price || 0),
    moeda:       'GBP',
    comprador:   t.buyer_login || t.buyer?.login || '—',
    estado:      mapEstado(t.status),
    data_venda:  t.created_at || new Date().toISOString(),
  }));
}

// ── Mapear estados do Vinted para o nosso sistema ─────────
function mapEstado(status) {
  const mapa = {
    'completed':         'delivered',
    'delivered':         'delivered',
    'shipped':           'sent',
    'in_transit':        'sent',
    'awaiting_shipment': 'pending',
    'confirmed':         'pending',
    'cancelled':         'cancelled',
  };
  return mapa[status] || 'pending';
}

// ── Guardar encomendas na Supabase ────────────────────────
async function guardarEncomendas(encomendas) {
  if (!encomendas.length) return 0;

  const { data, error } = await db
    .from('vendas')
    .upsert(encomendas, { onConflict: 'order_id', ignoreDuplicates: false });

  if (error) throw new Error('Erro Supabase: ' + error.message);
  return encomendas.length;
}

// ── Handler principal ─────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const resultados = {
    sincronizado: new Date().toISOString(),
    contas: [],
    total_importado: 0,
    erros: [],
  };

  for (const conta of CONTAS_VINTED) {
    try {
      console.log('A sincronizar:', conta.nome);

      // Login
      const token = await loginVinted(conta.email, conta.password);

      // Buscar encomendas
      const encomendas = await buscarEncomendas(token, conta.nome);

      // Guardar na BD
      const total = await guardarEncomendas(encomendas);

      resultados.contas.push({ nome: conta.nome, importado: total, ok: true });
      resultados.total_importado += total;

      console.log(conta.nome + ': ' + total + ' encomendas sincronizadas');

    } catch (e) {
      console.error(conta.nome + ' erro:', e.message);
      resultados.erros.push({ conta: conta.nome, erro: e.message });
      resultados.contas.push({ nome: conta.nome, importado: 0, ok: false, erro: e.message });
    }
  }

  const status = resultados.erros.length === CONTAS_VINTED.length ? 500 : 200;
  res.status(status).json(resultados);
};
