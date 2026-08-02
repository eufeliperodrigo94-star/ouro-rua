const router = require('express').Router();
const auth = require('../middleware/auth');
const supabase = require('../db');

// GET /relatorios/geral?draw_id=&data=
router.get('/geral', auth, async (req, res) => {
  try {
    const { draw_id, data_inicio, data_fim } = req.query;
    let q = supabase.from('apostas')
      .select('amount, prize_amount, status, bet_type, vendedor_id, draw_id, vendedores(name, commission_rate)')
      .neq('status', 'cancelled');
    if (draw_id) q = q.eq('draw_id', draw_id);
    if (data_inicio) q = q.gte('created_at', data_inicio);
    if (data_fim) q = q.lte('created_at', data_fim + 'T23:59:59');
    if (req.user.role === 'cambista') q = q.eq('vendedor_id', req.user.id);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });

    const total_arrecadado = data.reduce((s, a) => s + Number(a.amount), 0);
    const total_premios = data.reduce((s, a) => s + Number(a.prize_amount || 0), 0);
    const total_comissao = data.reduce((s, a) => {
      const rate = a.vendedores?.commission_rate || 0;
      return s + Number(a.amount) * Number(rate) / 100;
    }, 0);
    const saldo = total_arrecadado - total_premios - total_comissao;

    res.json({
      total_apostas: data.length,
      total_arrecadado,
      total_premios,
      total_comissao,
      saldo,
      por_status: {
        pending: data.filter(a => a.status === 'pending').length,
        won: data.filter(a => a.status === 'won').length,
        lost: data.filter(a => a.status === 'lost').length,
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /relatorios/ranking?draw_id=
router.get('/ranking', auth, async (req, res) => {
  try {
    const { draw_id, data_inicio, data_fim } = req.query;
    let q = supabase.from('apostas')
      .select('amount, prize_amount, vendedor_id, vendedores(name, commission_rate)')
      .neq('status', 'cancelled');
    if (draw_id) q = q.eq('draw_id', draw_id);
    if (data_inicio) q = q.gte('created_at', data_inicio);
    if (data_fim) q = q.lte('created_at', data_fim + 'T23:59:59');
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });

    const vendedorMap = {};
    for (const a of data) {
      const vid = a.vendedor_id;
      if (!vendedorMap[vid]) vendedorMap[vid] = {
        vendedor_id: vid, name: a.vendedores?.name || 'N/A',
        total_apostas: 0, total_arrecadado: 0, total_premios: 0, comissao: 0
      };
      vendedorMap[vid].total_apostas++;
      vendedorMap[vid].total_arrecadado += Number(a.amount);
      vendedorMap[vid].total_premios += Number(a.prize_amount || 0);
      vendedorMap[vid].comissao += Number(a.amount) * Number(a.vendedores?.commission_rate || 0) / 100;
    }
    const ranking = Object.values(vendedorMap)
      .map(v => ({ ...v, saldo: v.total_arrecadado - v.total_premios - v.comissao }))
      .sort((a, b) => b.total_arrecadado - a.total_arrecadado);
    res.json(ranking);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /relatorios/risco?draw_id=
router.get('/risco', auth, async (req, res) => {
  try {
    const { draw_id } = req.query;
    let q = supabase.from('risk_exposure').select('*').order('valor_vendido', { ascending: false });
    if (draw_id) q = q.eq('draw_id', draw_id);
    const { data: exposure, error: e1 } = await q;
    let q2 = supabase.from('risk_discharge').select('*').order('created_at', { ascending: false }).limit(50);
    if (draw_id) q2 = q2.eq('draw_id', draw_id);
    const { data: discharge } = await q2;
    if (e1) return res.status(400).json({ error: e1.message });
    res.json({ exposure: exposure || [], discharge: discharge || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /relatorios/caixa?data=YYYY-MM-DD
router.get('/caixa', auth, async (req, res) => {
  try {
    const { data: dataParam } = req.query;
    const inicio = dataParam ? dataParam + 'T00:00:00' : new Date().toISOString().slice(0,10) + 'T00:00:00';
    const fim = dataParam ? dataParam + 'T23:59:59' : new Date().toISOString().slice(0,10) + 'T23:59:59';
    const { data, error } = await supabase.from('apostas')
      .select('amount, prize_amount, status, vendedor_id, vendedores(name, commission_rate)')
      .neq('status', 'cancelled')
      .gte('created_at', inicio).lte('created_at', fim);
    if (error) return res.status(400).json({ error: error.message });

    const total_bruto = data.reduce((s, a) => s + Number(a.amount), 0);
    const total_premios = data.reduce((s, a) => s + Number(a.prize_amount || 0), 0);
    const total_comissao = data.reduce((s, a) => s + Number(a.amount) * Number(a.vendedores?.commission_rate || 0) / 100, 0);
    res.json({
      data: dataParam || new Date().toISOString().slice(0,10),
      total_apostas: data.length,
      total_bruto,
      total_premios,
      total_comissao,
      liquido: total_bruto - total_premios - total_comissao
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
