const router = require('express').Router();
const auth = require('../middleware/auth');
const supabase = require('../db');

// GET /sorteios
router.get('/', auth, async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    let q = supabase.from('sorteios')
      .select('*, extracoes(name)')
      .order('date', { ascending: false })
      .order('hora', { ascending: true })
      .limit(parseInt(limit));
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /sorteios/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('sorteios')
      .select('*, extracoes(name)')
      .eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Sorteio não encontrado' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /sorteios
router.post('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('sorteios').insert(req.body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /sorteios/:id
router.patch('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('sorteios').update(req.body).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /sorteios/:id/resultado — processa resultado via RPC
router.post('/:id/resultado', auth, async (req, res) => {
  try {
    const sid = parseInt(req.params.id);
    const { resultado } = req.body;
    const { error: upErr } = await supabase.from('sorteios')
      .update({ resultado, status: 'closed' }).eq('id', sid);
    if (upErr) return res.status(400).json({ error: upErr.message });

    await supabase.from('apostas')
      .update({ status: 'pending', prize_amount: 0 })
      .eq('draw_id', sid)
      .in('status', ['pending', 'won', 'lost']);

    const { data: rpcData, error: rpcErr } = await supabase.rpc('processar_resultado', { p_sorteio_id: sid });
    if (rpcErr) return res.status(400).json({ error: rpcErr.message });

    res.json({ ok: true, resultado: rpcData });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
