const router = require('express').Router();
const auth = require('../middleware/auth');
const supabase = require('../db');

// GET /apostas
router.get('/', auth, async (req, res) => {
  try {
    const { draw_id, vendedor_id, status, limit = 200 } = req.query;
    let q = supabase.from('apostas')
      .select('*, vendedores(name)')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));
    if (draw_id) q = q.eq('draw_id', draw_id);
    if (vendedor_id) q = q.eq('vendedor_id', vendedor_id);
    if (status) q = q.eq('status', status);
    // Gerente/cambista só vê as próprias apostas
    if (req.user.role === 'cambista') q = q.eq('vendedor_id', req.user.id);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /apostas/batch — lote de apostas do terminal
router.post('/batch', auth, async (req, res) => {
  try {
    const apostas = req.body; // array de apostas
    if (!Array.isArray(apostas) || !apostas.length)
      return res.status(400).json({ error: 'Payload inválido' });

    // Forçar vendedor_id do token se for cambista
    const rows = apostas.map(a => ({
      ...a,
      vendedor_id: req.user.role === 'cambista' ? req.user.id : (a.vendedor_id || req.user.id),
      status: 'pending'
    }));

    const { data, error } = await supabase.from('apostas').insert(rows).select('id, bet_type, numbers, amount');
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ inserted: data.length, apostas: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /apostas/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('apostas').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Aposta não encontrada' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /apostas/:id
router.patch('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('apostas').update(req.body).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /apostas/:id (cancelar)
router.delete('/:id', auth, async (req, res) => {
  try {
    const { error } = await supabase.from('apostas').update({ status: 'cancelled' }).eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
