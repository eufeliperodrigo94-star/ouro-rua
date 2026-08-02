const router = require('express').Router();
const auth = require('../middleware/auth');
const supabase = require('../db');

router.get('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('cidades').select('*').order('nome');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('cidades').insert(req.body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
