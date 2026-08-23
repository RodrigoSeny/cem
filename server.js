// ═══════════════════════════════════════════════════════════════
// CEM — Centro Educacional Milezi
// ERP Escolar — servidor Express + SQLite
// ═══════════════════════════════════════════════════════════════
require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { db, DB_PATH } = require('./src/db');
const { seed } = require('./src/seed');
const { authMiddleware } = require('./src/auth');

const app = express();
const PORT = Number(process.env.PORT) || 3300;

// ── Segurança e desempenho ────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false,          // páginas usam estilo/script inline
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Limite de tentativas no login (protege contra força bruta)
app.use('/api/auth/login', rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Aguarde alguns minutos.' },
}));

// ── Autenticação (protege tudo sob /api, exceto rotas públicas) ──
app.use(authMiddleware);

// ── Rotas da API ──────────────────────────────────────────────
const { usuarios: rotasUsuarios, perfis: rotasPerfis } = require('./src/routes/usuarios.routes');

app.use('/api/auth',          require('./src/routes/auth.routes'));
app.use('/api/escola',        require('./src/routes/escola.routes'));
app.use('/api/alunos',        require('./src/routes/alunos.routes'));
app.use('/api/responsaveis',  require('./src/routes/responsaveis.routes'));
app.use('/api/funcionarios',  require('./src/routes/funcionarios.routes'));
app.use('/api/turmas',        require('./src/routes/turmas.routes'));
app.use('/api/dashboard',     require('./src/routes/dashboard.routes'));
app.use('/api/relatorios',    require('./src/routes/relatorios.routes'));
app.use('/api/portal',        require('./src/routes/portal.routes'));
app.use('/api/anexos',        require('./src/routes/anexos.routes').router);
app.use('/api/ocorrencias',   require('./src/routes/ocorrencias.routes').router);
app.use('/api/mensagens',     require('./src/routes/mensagens.routes').router);
app.use('/api/material',      require('./src/routes/material.routes').router);
// As rotas específicas do financeiro vêm antes do router geral,
// senão '/planos' e companhia capturariam '/cobrancas', '/despesas'…
const custos = require('./src/routes/custos.routes');
app.use('/api/financeiro/centros-custo', custos.centros);
app.use('/api/financeiro/despesas',      custos.despesas);
app.use('/api/financeiro/cobrancas',     require('./src/routes/cobrancas.routes').router);
app.use('/api/financeiro',    require('./src/routes/financeiro.routes').router);
app.use('/api/banco',         require('./src/routes/banco.routes'));
app.use('/api/conciliacao',  require('./src/routes/conciliacao.routes'));
app.use('/api/municipios',    require('./src/routes/municipios.routes'));
app.use('/api/sql',           require('./src/routes/sql.routes'));
app.use('/api/sistema',       require('./src/routes/sistema.routes'));
app.use('/api/usuarios',      rotasUsuarios);
app.use('/api/perfis',        rotasPerfis);

app.get('/api/status', (req, res) => {
  res.json({ ok: true, sistema: 'CEM — ERP Escolar', versao: require('./package.json').version });
});

// ── Front-end estático ────────────────────────────────────────
const PUBLIC = path.join(__dirname, 'public');
// maxAge 0 + ETag: o navegador revalida a cada carga e recebe 304 quando nada
// mudou. Sem isso, uma atualização de .js/.css fica "presa" no cache do Chrome
// e o usuário continua vendo a versão antiga depois do deploy.
// index: false — a raiz "/" é o login, não o index.html do sistema.
app.use(express.static(PUBLIC, { maxAge: 0, etag: true, extensions: ['html'], index: false }));
// Imagens e ícones podem ficar em cache longo (mudam junto com o nome do arquivo).
app.use('/img', express.static(path.join(__dirname, 'img'), { maxAge: '7d' }));

app.get('/', (req, res) => res.sendFile(path.join(PUBLIC, 'login.html')));
app.get('/sistema', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));
app.get('/app', (req, res) => res.sendFile(path.join(PUBLIC, 'portal.html')));
// Login próprio do aplicativo — visual distinto do sistema da escola
app.get('/app-login', (req, res) => res.sendFile(path.join(PUBLIC, 'login-app.html')));

// 404 da API em JSON (evita devolver HTML para o fetch)
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// Qualquer outra rota volta para o login
app.use((req, res) => res.sendFile(path.join(PUBLIC, 'login.html')));

// ── Tratamento final de erros ─────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[erro não tratado]', err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

// ── Subida ────────────────────────────────────────────────────
seed();

const server = app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║   CEM — Centro Educacional Milezi            ║');
  console.log('  ║   ERP Escolar                                ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Sistema ....... http://localhost:${PORT}/`);
  console.log(`  App (PWA) ..... http://localhost:${PORT}/app`);
  console.log(`  Banco ......... ${DB_PATH}`);
  console.log('');
});

function encerrar() {
  console.log('\nEncerrando...');
  server.close(() => {
    try { db.close(); } catch {}
    process.exit(0);
  });
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
