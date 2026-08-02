const router = require('express').Router();
const auth = require('../middleware/auth');
const supabase = require('../db');

// GET /modality-settings
router.get('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('modality_settings')
      .select('*')
      .eq('is_active', true)
      .order('id');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
