require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => res.json({ 
  ok: true, 
  sistema: 'Ouro Rua API', 
  versao: '1.0.0',
  timestamp: new Date().toISOString()
}));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Rotas
app.use('/auth',        require('./routes/auth'));
app.use('/sorteios',    require('./routes/sorteios'));
app.use('/apostas',     require('./routes/apostas'));
app.use('/modalidades', require('./routes/modalidades'));
app.use('/vendedores',  require('./routes/vendedores'));
app.use('/relatorios',  require('./routes/relatorios'));
app.use('/cidades',     require('./routes/cidades'));
app.use('/extracoes',   require('./routes/extracoesConfig'));

// Handler global de erros
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Ouro Rua API rodando na porta ${PORT}`);
});
