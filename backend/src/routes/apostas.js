const router = require('express').Router();
const auth = require('../middleware/auth');
const supabase = require('../db');

// GET /apostas
router.get('/', auth, async (req, res) => {
  try {
    const { draw_id, user_id, ticket_code, status, limit = 200 } = req.query;
    let q = supabase.from('apostas')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));
    if (draw_id)      q = q.eq('draw_id', draw_id);
    if (user_id)      q = q.eq('user_id', user_id);
    if (ticket_code)  q = q.eq('ticket_code', ticket_code);
    if (status)       q = q.eq('status', status);
    // Cambista só vê as próprias apostas
    if (req.user.role === 'cambista') q = q.eq('user_id', req.user.id);
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

    const userId    = req.user.id;
    const userPhone = req.user.phone || null;

    const rows = apostas.map(a => ({
      user_id:      req.user.role === 'cambista' ? userId : (a.user_id || userId),
      user_phone:   a.user_phone || userPhone,
      draw_id:      a.draw_id   || null,
      bet_type:     a.bet_type,
      numbers:      a.numbers,
      amount:       a.amount,
      total_amount: a.total_amount || a.amount,
      prize_amount: 0,
      status:       'pending',
      ticket_code:  a.ticket_code || null
    }));

    const { data, error } = await supabase.from('apostas').insert(rows).select('id, bet_type, numbers, amount, ticket_code');
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
