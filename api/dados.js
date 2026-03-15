// api/dados.js
// Endpoint principal — devolve todos os dados para o dashboard
// Chamado pelo dashboard a cada 5 minutos

const { createClient } = require('@supabase/supabase-js');

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const dias  = parseInt(req.query.dias)  || 30;
  const conta = req.query.conta           || null; // filtro opcional por conta

  try {
    const desde = new Date();
    desde.setDate(desde.getDate() - dias);

    // Query base
    let query = db
      .from('vendas')
      .select('*')
      .gte('data_venda', desde.toISOString())
      .order('data_venda', { ascending: false });

    // Filtrar por conta se pedido
    if (conta) query = query.eq('conta', conta);

    const { data: vendas, error } = await query;
    if (error) throw error;

    const lista = vendas || [];

    // ── Calcular métricas ──────────────────────────────────
    const totalReceita  = lista.reduce((s, v) => s + parseFloat(v.valor || 0), 0);
    const totalEnc      = lista.length;
    const pending       = lista.filter(v => v.estado === 'pending').length;
    const entregues     = lista.filter(v => v.estado === 'delivered').length;
    const mediaValor    = totalEnc ? totalReceita / totalEnc : 0;

    // ── Receita por plataforma ─────────────────────────────
    const porPlataforma = {};
    lista.forEach(v => {
      porPlataforma[v.plataforma] = (porPlataforma[v.plataforma] || 0) + parseFloat(v.valor || 0);
    });

    // ── Receita por conta ──────────────────────────────────
    const porConta = {};
    lista.forEach(v => {
      const c = v.conta || v.plataforma;
      porConta[c] = (porConta[c] || 0) + parseFloat(v.valor || 0);
    });

    // ── Contas disponíveis (para filtro no dashboard) ──────
    const contas = [...new Set(lista.map(v => v.conta).filter(Boolean))].sort();

    // ── Buscar stock ───────────────────────────────────────
    const { data: stockData } = await db
      .from('stock')
      .select('*')
      .order('quantidade', { ascending: true });

    res.status(200).json({
      ok: true,
      periodo_dias:  dias,
      sincronizado:  new Date().toISOString(),
      metricas: {
        receita_total:    totalReceita.toFixed(2),
        total_encomendas: totalEnc,
        pendentes:        pending,
        entregues:        entregues,
        valor_medio:      mediaValor.toFixed(2),
        por_plataforma:   porPlataforma,
        por_conta:        porConta,
      },
      contas:   contas,
      vendas:   lista.slice(0, 100),
      stock:    stockData || [],
    });

  } catch (e) {
    console.error('Erro /api/dados:', e.message);
    res.status(500).json({ ok: false, erro: e.message });
  }
};
