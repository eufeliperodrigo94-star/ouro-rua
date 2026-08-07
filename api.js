// ─── Sorte Ouro API ─────────────────────────────────────────────────────────
// Rotas alinhadas com SistemaTerminal.html _apiFetch()
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const jwt     = require('jsonwebtoken');
const cors    = require('cors');

const app = express();

// ─── CORS: preflight explícito ANTES de qualquer rota ────────────────────────
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.sendStatus(204);
});

app.use(express.json());

// ─── Configuração ─────────────────────────────────────────────────────────────
const SB_URL     = process.env.SUPABASE_URL || 'https://kopdmeuihtkmpisaedxo.supabase.co';
const SB_KEY     = process.env.SUPABASE_SERVICE_KEY || process.env.SB_ANON_KEY || '';
const SB_SVC_KEY = process.env.SUPABASE_SERVICE_KEY || SB_KEY;
const JWT_SECRET  = process.env.JWT_SECRET  || 'sorte-ouro-secret-2026-mude-em-producao';
const JWT_EXPIRES = '30d';
const PORT        = process.env.PORT || 8000;

if (!SB_KEY) console.warn('[WARN] SUPABASE_SERVICE_KEY não definida');

// ─── Helpers Supabase REST ────────────────────────────────────────────────────
const sbHeaders = (svc = false) => ({
  'apikey':        svc ? SB_SVC_KEY : SB_KEY,
  'Authorization': `Bearer ${svc ? SB_SVC_KEY : SB_KEY}`,
  'Content-Type':  'application/json',
  'Accept':        'application/json',
});

async function sbGet(table, qs = '', svc = false) {
  const res  = await fetch(`${SB_URL}/rest/v1/${table}?${qs}`, { headers: sbHeaders(svc) });
  const body = await res.text();
  if (!res.ok) throw new Error(`sbGet ${table}: ${res.status} ${body}`);
  return JSON.parse(body);
}

async function sbPost(table, data, svc = false) {
  const res  = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...sbHeaders(svc), 'Prefer': 'return=representation' },
    body: JSON.stringify(data),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`sbPost ${table}: ${res.status} ${body}`);
  return JSON.parse(body);
}

async function sbPatch(table, qs, data, svc = false) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${qs}`, {
    method: 'PATCH',
    headers: { ...sbHeaders(svc), 'Prefer': 'return=minimal' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`sbPatch ${table}: ${res.status} ${body}`);
  }
}

async function sbRpc(fn, params, svc = false) {
  const res  = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: sbHeaders(svc),
    body: JSON.stringify(params),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`sbRpc ${fn}: ${res.status} ${body}`);
  try { return JSON.parse(body); } catch { return body; }
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token não fornecido' });
  try {
    req.user = jwt.verify(h.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  }
}

// ─── POST /auth/login ─────────────────────────────────────────────────────────
app.post('/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    if (!phone || !password)
      return res.status(400).json({ error: 'Telefone e senha obrigatórios' });

    const user = await sbRpc('vendedor_login', { p_phone: phone, p_password: password }, true);
    if (!user || !user.id)
      return res.status(401).json({ error: 'Credenciais inválidas' });

    const token = jwt.sign(
      { id: user.id, phone: user.phone, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );
    res.json({ token, user });
  } catch (e) {
    const msg = e.message || '';
    if (msg.includes('inválid') || msg.includes('P0001'))
      return res.status(401).json({ error: 'Credenciais inválidas' });
    if (msg.includes('desativad'))
      return res.status(403).json({ error: 'Conta desativada.' });
    console.error('[login]', msg);
    res.status(500).json({ error: 'Erro interno' });
  }
});


// ─── POST /auth/admin/login ───────────────────────────────────────────────────
app.post('/auth/admin/login', async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    if (!phone || !password)
      return res.status(400).json({ error: 'Telefone e senha obrigatórios' });

    const user = await sbRpc('admin_login', { p_phone: phone, p_password: password }, true);
    if (!user || !user.id)
      return res.status(401).json({ error: 'Credenciais inválidas' });

    const token = jwt.sign(
      { id: user.id, phone: user.phone, name: user.name, role: user.role || 'admin', is_admin: true },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );
    res.json({ token, user });
  } catch (e) {
    const msg = e.message || '';
    if (msg.includes('inválid') || msg.includes('P0001'))
      return res.status(401).json({ error: 'Credenciais inválidas' });
    console.error('[admin-login]', msg);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─── GET /auth/me ─────────────────────────────────────────────────────────────
app.get('/auth/me', auth, async (req, res) => {
  try {
    const data = await sbGet('vendedores', `id=eq.${req.user.id}&select=id,name,phone,role,ativo&limit=1`, true);
    const user = (data && data[0]) || { id: req.user.id, name: req.user.name, phone: req.user.phone };
    res.json({ user });
  } catch (e) {
    res.json({ user: { id: req.user.id, name: req.user.name, phone: req.user.phone } });
  }
});

// ─── GET /sorteios ────────────────────────────────────────────────────────────
app.get('/sorteios', async (req, res) => {
  try {
    const status = req.query.status || 'open';
    const limit  = parseInt(req.query.limit || 20);
    const qs = `select=id,title,date,hora,result,status,extracao_id,extracoes(name)&status=eq.${status}&order=date.desc,hora.asc&limit=${limit}`;
    const data = await sbGet('sorteios', qs);
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /modalidades ─────────────────────────────────────────────────────────
app.get('/modalidades', async (req, res) => {
  try {
    const data = await sbGet('modalidades', 'ativo=eq.true&order=ordem_exibicao.asc');
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /modality-settings ───────────────────────────────────────────────────
app.get('/modality-settings', async (req, res) => {
  try {
    const data = await sbGet(
      'modalidades',
      'ativo=eq.true&select=id,nome,codigo,cotacao,max_premios,premios_possiveis,premios_padrao,charge_multiplier,digitos,min_numeros,max_numeros,is_grupo,fator_combinacao,valor_minimo,valor_maximo,metodo_divisao&order=ordem_exibicao.asc'
    );
    const normalized = (data || []).map(m => ({
      id:                m.id,
      name:              m.nome,
      nome:              m.nome,
      bet_type:          m.codigo,
      codigo:            m.codigo,
      multiplier:        Number(m.cotacao || 0),
      cotacao:           Number(m.cotacao || 0),
      max_premios:       m.max_premios || 5,
      premios_possiveis: m.premios_possiveis || [1,2,3,4,5],
      premios_padrao:    m.premios_padrao || [1],
      charge_multiplier: m.charge_multiplier || 1,
      digits:            m.digitos || 4,
      q:                 m.digitos || 4,
      min:               m.min_numeros || 1,
      min_numeros:       m.min_numeros || 1,
      max_numeros:       m.max_numeros || 1,
      is_grupo:          m.is_grupo || false,
      g:                 m.is_grupo || false,
      factor:            m.fator_combinacao || 1,
      fator_combinacao:  m.fator_combinacao || 1,
      valor_minimo:      Number(m.valor_minimo || 1),
      valor_maximo:      Number(m.valor_maximo || 999999),
      metodo_divisao:    m.metodo_divisao || 'dividido',
      is_active:         true,
      ativo:             true,
    }));
    res.json(normalized);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /commission-settings ─────────────────────────────────────────────────
app.get('/commission-settings', async (req, res) => {
  try {
    const data = await sbGet('modalidades', 'ativo=eq.true&select=codigo,cotacao&order=ordem_exibicao.asc');
    res.json(data || []);
  } catch (e) {
    res.json([]);
  }
});

// ─── GET /apostas ─────────────────────────────────────────────────────────────
app.get('/apostas', auth, async (req, res) => {
  try {
    const filters = [];
    if (req.query.user_id)     filters.push(`user_id=eq.${req.query.user_id}`);
    if (req.query.ticket_code) filters.push(`ticket_code=eq.${encodeURIComponent(req.query.ticket_code)}`);
    if (req.query.status)      filters.push(`status=eq.${req.query.status}`);
    const limit = parseInt(req.query.limit || 50);
    filters.push('order=created_at.desc');
    filters.push(`limit=${limit}`);
    const data = await sbGet('apostas', filters.join('&'), true);
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /apostas/ticket/:code ────────────────────────────────────────────────
// DEVE VIR ANTES de POST /apostas/cancelar/:code para evitar conflito de rota
app.get('/apostas/ticket/:code', auth, async (req, res) => {
  try {
    const data = await sbGet(
      'apostas',
      `ticket_code=eq.${encodeURIComponent(req.params.code)}&user_id=eq.${req.user.id}&order=id.asc`,
      true
    );
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /apostas/batch ─────────────────────────────────────────────────────
app.post('/apostas/batch', auth, async (req, res) => {
  try {
    const rows = req.body;
    if (!rows || !rows.length)
      return res.status(400).json({ error: 'Nenhuma aposta enviada' });

    const ticketCode = rows[0].ticket_code ||
      'SO-' + Date.now().toString(36).toUpperCase() + '-' +
      Math.random().toString(36).substring(2, 6).toUpperCase();

    const toInsert = rows.map(b => ({
      user_id:      b.user_id      || req.user.id,
      user_phone:   b.user_phone   || req.user.phone,
      draw_id:      b.draw_id      || null,
      bet_type:     b.bet_type,
      numbers:      typeof b.numbers === 'string' ? b.numbers : JSON.stringify(b.numbers),
      amount:       Number(b.amount),
      total_amount: Number(b.amount),
      prize_amount: 0,
      status:       'pending',
      ticket_code:  ticketCode,
      premio_ini:   b.premio_ini != null ? Number(b.premio_ini) : 1,
      premio_fim:   b.premio_fim != null ? Number(b.premio_fim) : 1,
    }));

    const inserted = await sbPost('apostas', toInsert, true);
    const total    = toInsert.reduce((s, b) => s + Number(b.amount), 0);

    // Descarrego assíncrono — não bloqueia resposta
    Promise.all((inserted || []).map(async (ap, idx) => {
      const b   = rows[idx];
      const bt  = (b.bet_type || '').toLowerCase();
      const mod = bt.replace(/_\d+(?:_\d+)?$/, '') || bt;
      const pm  = bt.match(/_(\d+)(?:_(\d+))?$/);
      const premios = [];
      if (pm) {
        const ps = parseInt(pm[1]), pe = pm[2] ? parseInt(pm[2]) : ps;
        for (let i = ps; i <= pe; i++) premios.push(i);
      } else { premios.push(1); }
      try {
        await sbRpc('aplicar_descarrego', {
          p_sorteio_id:  Number(ap.draw_id || b.draw_id),
          p_aposta_id:   Number(ap.id),
          p_modalidade:  mod,
          p_numero:      String(b.numbers || ''),
          p_premios:     premios,
          p_valor_total: Number(b.amount),
        }, true);
      } catch (err) {
        console.warn(`[descarrego] aposta ${ap.id}:`, err.message);
      }
    })).catch(() => {});

    res.json({
      apostas:      inserted,
      ticketId:     ticketCode,
      ticket_id:    ticketCode,
      ticket_code:  ticketCode,
      totalAmount:  total,
      total_amount: total,
    });
  } catch (e) {
    console.error('[apostas/batch]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /apostas/cancelar/:ticket_code ─────────────────────────────────────
app.post('/apostas/cancelar/:ticket_code', auth, async (req, res) => {
  try {
    const code = req.params.ticket_code;
    const bets = await sbGet(
      'apostas',
      `ticket_code=eq.${encodeURIComponent(code)}&user_id=eq.${req.user.id}&status=eq.pending`,
      true
    );
    if (!bets || !bets.length)
      return res.status(404).json({ error: 'Bilhete não encontrado ou já processado' });

    await sbPatch(
      'apostas',
      `ticket_code=eq.${encodeURIComponent(code)}&user_id=eq.${req.user.id}`,
      { status: 'cancelled', updated_at: new Date().toISOString() },
      true
    );
    res.json({ success: true, cancelled: bets.length, ticket_code: code });
  } catch (e) {
    console.error('[cancelar]', e.message);
    res.status(500).json({ error: e.message });
  }
});


// ─── GET /admin/ticket/:ticket_code ──────────────────────────────────────────
// Admin busca bilhete por código para visualizar antes de cancelar
app.get('/admin/ticket/:ticket_code', auth, async (req, res) => {
  try {
    const code = req.params.ticket_code;
    const bets = await sbGet(
      'apostas',
      `ticket_code=eq.${encodeURIComponent(code)}&select=*&limit=50`,
      true
    );
    if (!bets || !bets.length)
      return res.status(404).json({ error: 'Bilhete não encontrado' });
    const total = bets.reduce((s, b) => s + parseFloat(b.amount || b.total_amount || 0), 0);
    res.json({
      ticket_code: code,
      status: bets[0].status,
      user_phone: bets[0].user_phone,
      total,
      count: bets.length,
      apostas: bets.map(b => ({ id: b.id, bet_type: b.bet_type, numbers: b.numbers, amount: b.amount || b.total_amount, status: b.status }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /admin/cancelar-direto/:ticket_code ─────────────────────────────────
// Admin cancela bilhete diretamente por código, independente do status
app.post('/admin/cancelar-direto/:ticket_code', auth, async (req, res) => {
  try {
    const code = req.params.ticket_code;
    const { motivo } = req.body || {};
    const bets = await sbGet(
      'apostas',
      `ticket_code=eq.${encodeURIComponent(code)}&select=id,status&limit=50`,
      true
    );
    if (!bets || !bets.length)
      return res.status(404).json({ error: 'Bilhete não encontrado' });
    if (bets[0].status === 'cancelled')
      return res.status(400).json({ error: 'Bilhete já está cancelado' });
    if (['won', 'paid'].includes(bets[0].status))
      return res.status(400).json({ error: 'Não é possível cancelar bilhete ' + bets[0].status });

    await sbPatch(
      'apostas',
      `ticket_code=eq.${encodeURIComponent(code)}`,
      {
        status: 'cancelled',
        cancel_approved_by: req.user.id,
        cancel_approved_at: new Date().toISOString(),
        cancel_reason: motivo || 'Cancelado pelo admin',
        updated_at: new Date().toISOString(),
      },
      true
    );
    res.json({ success: true, cancelled: bets.length, ticket_code: code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /vendedores/:id/change-password ────────────────────────────────────
app.post('/vendedores/:id/change-password', auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password)
      return res.status(400).json({ error: 'Informe a senha atual e a nova senha' });
    await sbRpc('vendedor_change_password', {
      p_id:               req.user.id,
      p_current_password: current_password,
      p_new_password:     new_password,
    }, true);
    res.json({ success: true });
  } catch (e) {
    const msg = e.message || '';
    if (msg.includes('incorreta') || msg.includes('P0001'))
      return res.status(401).json({ error: 'Senha atual incorreta' });
    res.status(500).json({ error: 'Erro ao atualizar senha' });
  }
});

// ─── GET /health ──────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', ts: Date.now() }));
app.get('/api/health', (_, res) => res.json({ status: 'ok', ts: Date.now() }));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`[Sorte Ouro API] porta ${PORT}`));
module.exports = app;

// ─── POST /apostas/solicitar-cancelamento/:ticket_code ───────────────────────
// Vendedor solicita cancelamento — fica pendente até admin aprovar
app.post('/apostas/solicitar-cancelamento/:ticket_code', auth, async (req, res) => {
  try {
    const code   = req.params.ticket_code;
    const reason = (req.body && req.body.reason) || '';
    const bets   = await sbGet(
      'apostas',
      `ticket_code=eq.${encodeURIComponent(code)}&user_id=eq.${req.user.id}&status=eq.pending`,
      true
    );
    if (!bets || !bets.length)
      return res.status(404).json({ error: 'Bilhete não encontrado ou já processado' });

    await sbPatch(
      'apostas',
      `ticket_code=eq.${encodeURIComponent(code)}&user_id=eq.${req.user.id}`,
      {
        status: 'cancel_requested',
        cancel_requested_at: new Date().toISOString(),
        cancel_reason: reason || null,
        updated_at: new Date().toISOString(),
      },
      true
    );
    res.json({ success: true, pending_approval: true, ticket_code: code, count: bets.length });
  } catch (e) {
    console.error('[solicitar-cancelamento]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /admin/cancelamentos-pendentes ──────────────────────────────────────
// Admin lista todos os bilhetes aguardando aprovação de cancelamento
app.get('/admin/cancelamentos-pendentes', auth, async (req, res) => {
  try {
    const data = await sbGet(
      'apostas',
      'status=eq.cancel_requested&select=ticket_code,user_id,user_phone,bet_type,numbers,amount,cancel_requested_at,cancel_reason,draw_id&order=cancel_requested_at.asc&limit=200',
      true
    );
    // Agrupar por ticket_code
    const map = {};
    const order = [];
    (data || []).forEach(b => {
      if (!map[b.ticket_code]) {
        map[b.ticket_code] = {
          ticket_code: b.ticket_code,
          user_id: b.user_id,
          user_phone: b.user_phone,
          cancel_requested_at: b.cancel_requested_at,
          cancel_reason: b.cancel_reason,
          apostas: [],
          total: 0,
        };
        order.push(b.ticket_code);
      }
      map[b.ticket_code].apostas.push(b);
      map[b.ticket_code].total += Number(b.amount || 0);
    });
    res.json(order.map(tc => map[tc]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /admin/cancelamentos/:ticket_code/aprovar ──────────────────────────
app.post('/admin/cancelamentos/:ticket_code/aprovar', auth, async (req, res) => {
  try {
    const code = req.params.ticket_code;
    const bets = await sbGet(
      'apostas',
      `ticket_code=eq.${encodeURIComponent(code)}&status=eq.cancel_requested`,
      true
    );
    if (!bets || !bets.length)
      return res.status(404).json({ error: 'Solicitação não encontrada' });

    await sbPatch(
      'apostas',
      `ticket_code=eq.${encodeURIComponent(code)}`,
      {
        status: 'cancelled',
        cancel_approved_by: req.user.id,
        cancel_approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      true
    );
    res.json({ success: true, cancelled: bets.length, ticket_code: code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /admin/cancelamentos/:ticket_code/rejeitar ─────────────────────────
app.post('/admin/cancelamentos/:ticket_code/rejeitar', auth, async (req, res) => {
  try {
    const code = req.params.ticket_code;
    const bets = await sbGet(
      'apostas',
      `ticket_code=eq.${encodeURIComponent(code)}&status=eq.cancel_requested`,
      true
    );
    if (!bets || !bets.length)
      return res.status(404).json({ error: 'Solicitação não encontrada' });

    await sbPatch(
      'apostas',
      `ticket_code=eq.${encodeURIComponent(code)}`,
      { status: 'pending', updated_at: new Date().toISOString() },
      true
    );
    res.json({ success: true, restored: bets.length, ticket_code: code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
