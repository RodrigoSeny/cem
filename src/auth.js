// ═══════════════════════════════════════════════════════════════
// CEM — Autenticação (JWT) e controle de acesso por página
//
// Dois universos de usuário convivem no mesmo login:
//   • tipo 'funcionario' → sistema completo (index.html), acesso
//     filtrado pelas páginas do perfil.
//   • tipo 'responsavel' → apenas o portal PWA (/api/portal/**),
//     restrito aos alunos vinculados a ele.
// ═══════════════════════════════════════════════════════════════
require('dotenv').config();
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'cem_jwt_secret_dev_mude_em_producao';
if (JWT_SECRET === 'cem_jwt_secret_dev_mude_em_producao') {
  console.warn('⚠️  JWT_SECRET usando valor padrão. Defina JWT_SECRET no .env antes de publicar.');
}
const JWT_EXPIRES = process.env.JWT_EXPIRES || '12h';

// Emissor gravado e exigido em todo token. Impede que um token emitido por
// outro sistema (SuperPet, CicleSystem) seja aceito aqui caso, por descuido,
// os segredos venham a coincidir.
const JWT_ISSUER = 'cem-erp';

// ─────────────────────────────────────────────────────────────
// CATÁLOGO DE PÁGINAS — fonte única de verdade do controle de acesso
//
// Toda tela nova entra AQUI. Na subida do servidor o seed sincroniza
// a lista com o perfil Master (que passa a enxergar a novidade na
// hora) e não mexe nos demais perfis: a liberação para secretaria,
// coordenação etc. é decisão consciente, feita em Perfis de Acesso.
//
// `master: true` marca página exclusiva do Master — nem a Direção vê,
// e ela nem aparece na tela de montagem de perfis.
// ─────────────────────────────────────────────────────────────
const PAGINAS = [
  { id: 'dashboard',     nome: 'Dashboard',            grupo: 'Geral' },
  { id: 'alunos',        nome: 'Alunos',               grupo: 'Secretaria' },
  { id: 'responsaveis',  nome: 'Responsáveis',         grupo: 'Secretaria' },
  { id: 'turmas',        nome: 'Turmas',               grupo: 'Secretaria' },
  { id: 'ocorrencias',   nome: 'Ocorrências',          grupo: 'Secretaria' },
  { id: 'mensagens',     nome: 'Mensagens',            grupo: 'Secretaria' },
  { id: 'funcionarios',  nome: 'Funcionários',         grupo: 'Administrativo' },
  { id: 'financeiro',    nome: 'Financeiro',           grupo: 'Administrativo' },
  { id: 'relatorios',    nome: 'Relatórios',           grupo: 'Administrativo' },
  { id: 'usuarios',      nome: 'Usuários e Acessos',   grupo: 'Sistema' },
  { id: 'configuracoes', nome: 'Configurações',        grupo: 'Sistema' },
  { id: 'sql-manager',   nome: 'SQL Manager',          grupo: 'Sistema', master: true },
];

/** Todas as páginas (o Master recebe esta lista inteira). */
const TODAS_PAGINAS = PAGINAS.map(p => p.id);

/** Páginas que só o Master enxerga. */
const PAGINAS_MASTER = PAGINAS.filter(p => p.master).map(p => p.id);

const PERFIL_MASTER = 'PERFIL-MASTER';

// Prefixo de rota → páginas que liberam o acesso (qualquer uma basta)
const ROTA_PAGINAS = {
  '/api/alunos':        ['alunos', 'turmas', 'relatorios'],
  '/api/responsaveis':  ['responsaveis', 'alunos', 'relatorios'],
  '/api/funcionarios':  ['funcionarios', 'turmas', 'relatorios'],
  '/api/turmas':        ['turmas', 'alunos', 'relatorios'],
  '/api/ocorrencias':   ['ocorrencias', 'alunos'],
  '/api/mensagens':     ['mensagens'],
  '/api/financeiro':    ['financeiro'],
  '/api/anexos':        ['alunos', 'responsaveis', 'funcionarios', 'ocorrencias'],
  '/api/relatorios':    ['relatorios'],
  '/api/dashboard':     ['dashboard'],
  '/api/usuarios':      ['usuarios'],
  '/api/perfis':        ['usuarios'],
  '/api/escola':        ['configuracoes'],
  '/api/sql':           ['sql-manager'],
};

const ROTAS_PUBLICAS = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/escola/publica',
  '/api/status',            // health check do servidor
];

const PERFIS_ADMIN = ['PERFIL-MASTER', 'PERFIL-DIRECAO'];

function gerarToken(usuario) {
  return jwt.sign(
    {
      id: usuario.id,
      nome: usuario.nome,
      login: usuario.login,
      tipo: usuario.tipo,
      perfil_id: usuario.perfil_id,
      perfil_nome: usuario.perfil_nome,
      paginas: usuario.paginas || [],
      funcionario_id: usuario.funcionario_id || null,
      responsavel_id: usuario.responsavel_id || null,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES, issuer: JWT_ISSUER, audience: JWT_ISSUER }
  );
}

function isAdmin(u) {
  return !!u && u.tipo === 'funcionario' && PERFIS_ADMIN.includes(u.perfil_id);
}

/** Master é o único que enxerga e manipula o próprio perfil Master. */
function isMaster(u) {
  return !!u && u.tipo === 'funcionario' && u.perfil_id === PERFIL_MASTER;
}

function temPagina(u, pagina) {
  // Página exclusiva do Master não é liberada nem pelo atalho de admin
  if (PAGINAS_MASTER.includes(pagina)) return isMaster(u);
  if (isAdmin(u)) return true;
  return Array.isArray(u?.paginas) && u.paginas.includes(pagina);
}

function paginasDaRota(url) {
  const path = url.split('?')[0];
  for (const [prefixo, paginas] of Object.entries(ROTA_PAGINAS)) {
    if (path.startsWith(prefixo)) return paginas;
  }
  return null; // rota não mapeada = livre para autenticados
}

/** Middleware principal: valida o token e o acesso à rota. */
function authMiddleware(req, res, next) {
  const url = req.path || req.url;

  if (!url.startsWith('/api/')) return next();
  if (ROTAS_PUBLICAS.some(p => url.startsWith(p))) return next();

  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Não autenticado. Faça login para continuar.' });

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET, { issuer: JWT_ISSUER, audience: JWT_ISSUER });
  } catch {
    return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  }

  // Token sem tipo reconhecido não é deste sistema — recusa antes de qualquer rota.
  if (payload.tipo !== 'funcionario' && payload.tipo !== 'responsavel') {
    return res.status(401).json({ error: 'Token inválido para este sistema.' });
  }

  req.usuario = payload;

  // Responsável só enxerga o portal
  if (payload.tipo === 'responsavel') {
    if (url.startsWith('/api/portal/') || url.startsWith('/api/auth/')) return next();
    return res.status(403).json({ error: 'Acesso restrito ao portal de responsáveis.' });
  }

  const requeridas = paginasDaRota(url);

  // Rota de página exclusiva do Master: barra antes do atalho de admin,
  // senão a Direção entraria no SQL Manager.
  if (requeridas && requeridas.some(p => PAGINAS_MASTER.includes(p))) {
    if (!isMaster(payload)) {
      return res.status(403).json({ error: 'Recurso exclusivo do perfil Master.' });
    }
    return next();
  }

  if (isAdmin(payload)) return next();

  if (requeridas && !requeridas.some(p => (payload.paginas || []).includes(p))) {
    return res.status(403).json({ error: 'Acesso negado a este módulo.', paginas_requeridas: requeridas });
  }
  next();
}

/** Exige uma página específica numa rota (uso pontual em escritas). */
function requirePagina(...paginas) {
  return (req, res, next) => {
    if (isAdmin(req.usuario)) return next();
    if (paginas.some(p => (req.usuario?.paginas || []).includes(p))) return next();
    return res.status(403).json({ error: 'Acesso negado a esta operação.' });
  };
}

/** Exige perfil administrativo (master/direção). */
function requireAdmin(req, res, next) {
  if (isAdmin(req.usuario)) return next();
  return res.status(403).json({ error: 'Operação permitida apenas à direção.' });
}

/** Exige o perfil Master. */
function requireMaster(req, res, next) {
  if (isMaster(req.usuario)) return next();
  return res.status(403).json({ error: 'Operação exclusiva do perfil Master.' });
}

module.exports = {
  authMiddleware, requirePagina, requireAdmin, requireMaster,
  gerarToken, isAdmin, isMaster, temPagina,
  PERFIL_MASTER, TODAS_PAGINAS, PAGINAS_MASTER,
  JWT_SECRET, JWT_EXPIRES, PAGINAS,
};
