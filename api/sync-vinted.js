// api/sync-vinted.js - v3
// Login via endpoint correcto do Vinted UK

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BASE_URL          = 'https://www.vinted.co.uk';

const CONTAS = [
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

async function supabaseUpsert(vendas) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/vendas', {
    method:  'POST',
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates',
    },
    body: JSON.stringify(vendas),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Supabase erro ' + res.status + ': ' + txt.slice(0, 200));
  }
  return vendas.length;
}

async function loginVinted(email, password) {
  // Passo 1: obter cookies iniciais e CSRF token
  const r1 = await fetch(BASE_URL + '/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept':     'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });

  // Extrair cookies da resposta inicial
  const setCookie = r1.headers.get('set-cookie') || '';
  const cookies   = setCookie.split(',')
    .map(c => c.trim().split(';')[0])
    .filter(c => c.includes('='))
    .join('; ');

  // Passo 2: fazer login com endpoint correcto
  const r2 = await fetch(BASE_URL + '/web/api/v2/sessions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'User-Agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept':        'application/json',
      'Cookie':        cookies,
      'Origin':        BASE_URL,
      'Referer':       BASE_URL + '/login',
    },
    body: JSON.stringify({
      user: { login: email, password: password },
    }),
  });

  if (!r2.ok) {
    // Tentar endpoint alternativo
    const r3 = await fetch(BASE_URL + '/web/api/v2/users/login', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':   'Mozilla/5.0',
        'Cookie':       cookies,
      },
      body: JSON.stringify({ login: email, password }),
    });

    if (!r3.ok) throw new Error('Login falhou: ' + r2.status + ' e ' + r3.status);

    const d3       = await r3.json();
    const cookies3 = (r3.headers.get('set-cookie') || '').split(',').map(c => c.trim().split(';')[0]).join('; ');
    return {
      token:   (d3.user && d3.user.auth_token) || null,
      cookies: cookies + '; ' + cookies3,
    };
  }

  const dados    = await r2.json();
  const cookies2 = (r2.headers.get('set-cookie') || '').split(',').map(c => c.trim().split(';')[0]).join('; ');

  return {
    token:   (dados.user && dados.user.auth_token) || dados.access_token || null,
    cookies: cookies + '; ' + cookies2,
  };
}

async function buscarTransacoes(auth, nomeConta) {
  const headers = {
    'User-Agent': 'Mozilla/5.0',
    'Accept':     'application/json',
  };
  if (auth.token)   headers['X-Auth-Token'] = auth.token;
  if (auth.cookies) headers['Cookie']       = auth.cookies;

  // Tentar endpoint de transacções
  const r = await fetch(BASE_URL + '/web/api/v2/transactions?page=1&per_page=50', { headers });

  if (!r.ok) {
    // Tentar endpoint alternativo de items vendidos
    const r2 = await fetch(BASE_URL + '/web/api/v2/items?status=sold&page=1&per_page=50', { headers });
    if (!r2.ok) throw new Error('Erro a buscar vendas: ' + r.status);
    const d2   = await r2.json();
    const list = d2.items || [];
    return list.map(t => ({
      plataforma: 'Vinted',
      conta:      nomeConta,
      order_id:   'VT-' + t.id,
      produto:    t.title || 'Produto Vinted',
      valor:      parseFloat(t.price || 0),
      moeda:      'GBP',
      comprador:  '-',
      estado:     'delivered',
      data_venda: t.updated_at || new Date().toISOString(),
    }));
  }

  const dados = await r.json();
  const lista = dados.transactions || dados.items || [];
  const map   = { completed:'delivered', delivered:'delivered', shipped:'sent', in_transit:'sent', awaiting_shipment:'pending', confirmed:'pending', cancelled:'cancelled' };

  return lista.map(t => ({
    plataforma: 'Vinted',
    conta:      nomeConta,
    order_id:   'VT-' + t.id,
    produto:    t.item_title || t.title || 'Produto Vinted',
    valor:      parseFloat(t.total_item_price || t.price || 0),
    moeda:      'GBP',
    comprador:  (t.buyer && t.buyer.login) || t.buyer_login || '-',
    estado:     map[t.status] || 'pending',
    data_venda: t.created_at || new Date().toISOString(),
  }));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const resultado = {
    ok:              true,
    sincronizado:    new Date().toISOString(),
    contas:          [],
    total_importado: 0,
    erros:           [],
  };

  for (const conta of CONTAS) {
    try {
      if (!conta.email || !conta.password) throw new Error('Credenciais nao configuradas no Vercel');
      const auth       = await loginVinted(conta.email, conta.password);
      const transacoes = await buscarTransacoes(auth, conta.nome);
      const total      = transacoes.length ? await supabaseUpsert(transacoes) : 0;
      resultado.contas.push({ nome: conta.nome, importado: total, ok: true });
      resultado.total_importado += total;
    } catch (e) {
      resultado.erros.push({ conta: conta.nome, erro: e.message });
      resultado.contas.push({ nome: conta.nome, importado: 0, ok: false, erro: e.message });
    }
  }

  if (resultado.erros.length > 0) resultado.ok = false;
  res.status(200).json(resultado);
};
