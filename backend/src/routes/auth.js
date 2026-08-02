const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../db');

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'Dados inválidos' });

    const { data: users, error } = await supabase
      .from('vendedores')
      .select('id, name, phone, role, password_hash, is_active, commission_rate, cidade_id, gerente_id')
      .eq('phone', phone)
      .limit(1);

    if (error || !users?.length) return res.status(401).json({ error: 'Usuário não encontrado' });

    const user = users[0];
    if (!user.is_active) return res.status(401).json({ error: 'Usuário inativo' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Senha incorreta' });

    const payload = {
      id: user.id, name: user.name, phone: user.phone,
      role: user.role, cidade_id: user.cidade_id, gerente_id: user.gerente_id
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '12h' });

    res.json({ token, user: payload });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /auth/me
router.get('/me', require('../middleware/auth'), (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
