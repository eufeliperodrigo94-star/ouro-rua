const router = require('express').Router();
const auth = require('../middleware/auth');
const supabase = require('../db');

// GET /modalidades
router.get('/', auth, async (req, res) => {
  try {
    const { ativo } = req.query;
    let q = supabase.from('modalidades').select('*').order('nome');
    if (ativo !== undefined) q = q.eq('ativo', ativo !== 'false');
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /modalidades/:codigo
router.get('/:codigo', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('modalidades').select('*').eq('codigo', req.params.codigo).single();
    if (error) return res.status(404).json({ error: 'Modalidade não encontrada' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /modalidades/:id — atualizar cotação/limite
router.patch('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('modalidades').update(req.body).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
