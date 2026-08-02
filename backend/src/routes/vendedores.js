const router = require('express').Router();
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const supabase = require('../db');

// GET /vendedores
router.get('/', auth, async (req, res) => {
  try {
    let q = supabase.from('vendedores')
      .select('id, name, phone, role, is_active, balance, commission_rate, cidade_id, gerente_id, created_at')
      .order('name');
    // Gerente só vê seus cambistas
    if (req.user.role === 'gerente') q = q.eq('gerente_id', req.user.id);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /vendedores/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('vendedores')
      .select('id, name, phone, role, is_active, balance, commission_rate, cidade_id, gerente_id')
      .eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Vendedor não encontrado' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /vendedores
router.post('/', auth, async (req, res) => {
  try {
    const { name, phone, password, role, commission_rate, cidade_id, gerente_id } = req.body;
    if (!name || !phone || !password) return res.status(400).json({ error: 'Dados incompletos' });
    const password_hash = await bcrypt.hash(password, 10);
    const { data, error } = await supabase.from('vendedores')
      .insert({ name, phone, password_hash, role: role || 'cambista', commission_rate, cidade_id, gerente_id, is_active: true, balance: 0 })
      .select('id, name, phone, role, is_active').single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /vendedores/:id
router.patch('/:id', auth, async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.password) {
      updates.password_hash = await bcrypt.hash(updates.password, 10);
      delete updates.password;
    }
    delete updates.id;
    const { data, error } = await supabase.from('vendedores').update(updates).eq('id', req.params.id)
      .select('id, name, phone, role, is_active, balance, commission_rate').single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /vendedores/:id (desativar)
router.delete('/:id', auth, async (req, res) => {
  try {
    const { error } = await supabase.from('vendedores').update({ is_active: false }).eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
