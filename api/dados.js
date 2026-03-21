// api/dados.js
// Sem dependências externas — usa fetch nativo do Node.js 18

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

async function supabaseQuery(tabela, params) {
  const url = SUPABASE_URL + '/rest/v1/' + tabela + '?' + params;
  const res = await fetch(url, {
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type':  'application/json',
    },
  });
  if (!res.ok) throw new Error('Supabase erro ' + res.status);
  return res.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const dias  = parseInt(req.query && req.query.dias) || 30;
  const conta = (req.query && req.query.conta) || null;

  try {
    const desde = new Date();
    desde.setDate(desde.getDate() - dias);

    let params = 'select=*&data_venda=gte.' + desde.toISOString() + '&order=data_venda.desc&limit=100';
    if (conta) params += '&conta=eq.' + encodeURIComponent(conta);

    const vendas = await supabaseQuery('vendas', params);
    const stock  = await supabaseQuery('stock', 'select=*&order=quantidade.asc');

    const lista  = vendas || [];
    const total  = lista.reduce((s, v) => s + parseFloat(v.valor || 0), 0);

    const porPlataforma = {};
    const porConta      = {};
    lista.forEach(v => {
      porPlataforma[v.plataforma] = (porPlataforma[v.plataforma] || 0) + parseFloat(v.valor || 0);
      const c = v.conta || v.plataforma;
      porConta[c] = (porConta[c] || 0) + parseFloat(v.valor || 0);
    });

    const contas = [];
    lista.forEach(v => { if (v.conta && !contas.includes(v.conta)) contas.push(v.conta); });
    contas.sort();

    res.status(200).json({
      ok:           true,
      periodo_dias: dias,
      sincronizado: new Date().toISOString(),
      metricas: {
        receita_total:    total.toFixed(2),
        total_encomendas: lista.length,
        pendentes:        lista.filter(v => v.estado === 'pending').length,
        entregues:        lista.filter(v => v.estado === 'delivered').length,
        valor_medio:      lista.length ? (total / lista.length).toFixed(2) : '0.00',
        por_plataforma:   porPlataforma,
        por_conta:        porConta,
      },
      contas: contas,
      vendas: lista,
      stock:  stock || [],
    });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
};
