// ═══════════════════════════════════════════════════════════════
// CEM — SQL Manager (exclusivo do perfil Master)
//
// Mesma ideia do SuperPet: inspecionar tabelas e rodar consultas
// direto no banco, para suporte e correção pontual.
//
// Proteções, mesmo para o Master:
//   • tabelas de autenticação bloqueadas (evita dump de hash de
//     senha ou promoção a Master por UPDATE direto)
//   • toda execução vai para a auditoria
//   • escrita exige confirmação explícita no corpo da requisição
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const { db, log } = require('../db');
const { rota } = require('../util');
const { requireMaster } = require('../auth');

const router = express.Router();

// Todas as rotas daqui são do Master
router.use(requireMaster);

// Tabelas que o SQL Manager nunca toca
const PROTEGIDAS = ['usuarios', 'perfis'];

const ehProtegida = nome => PROTEGIDAS.includes(String(nome).toLowerCase());

/** A consulta menciona alguma tabela protegida? */
function mencionaProtegida(sql) {
  return PROTEGIDAS.some(t => new RegExp(`\\b${t}\\b`, 'i').test(sql));
}

const nomeValido = n => typeof n === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(n);

// ── GET /api/sql/tabelas ──────────────────────────────────────
router.get('/tabelas', rota((req, res) => {
  const tabelas = db.prepare(`
    SELECT name AS nome FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`).all();

  res.json(tabelas.map(t => ({
    nome: t.nome,
    protegida: ehProtegida(t.nome),
    registros: ehProtegida(t.nome)
      ? null
      : db.prepare(`SELECT COUNT(*) c FROM "${t.nome}"`).get().c,
  })));
}));

// ── GET /api/sql/schema/:tabela ───────────────────────────────
router.get('/schema/:tabela', rota((req, res) => {
  const { tabela } = req.params;
  if (!nomeValido(tabela)) return res.status(400).json({ error: 'Nome de tabela inválido.' });
  if (ehProtegida(tabela)) return res.status(403).json({ error: 'Tabela protegida pelo sistema.' });

  const colunas = db.pragma(`table_info("${tabela}")`);
  if (!colunas.length) return res.status(404).json({ error: 'Tabela não encontrada.' });

  res.json({
    tabela,
    colunas: colunas.map(c => ({
      nome: c.name, tipo: c.type, obrigatoria: !!c.notnull,
      padrao: c.dflt_value, chave: !!c.pk,
    })),
    indices: db.pragma(`index_list("${tabela}")`).map(i => i.name),
    ddl: db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name = ?`).get(tabela)?.sql || '',
  });
}));

// ── POST /api/sql/executar ────────────────────────────────────
router.post('/executar', rota((req, res) => {
  const sql = String(req.body.sql || '').trim();
  if (!sql) return res.status(400).json({ error: 'Escreva a consulta.' });

  if (mencionaProtegida(sql)) {
    return res.status(403).json({
      error: `Consulta bloqueada: as tabelas ${PROTEGIDAS.join(' e ')} não são acessíveis pelo SQL Manager. ` +
             'Use a tela de Usuários e Perfis.',
    });
  }

  const inicio = Date.now();
  const primeira = sql.replace(/^\s*\(*/, '').split(/\s+/)[0].toUpperCase();
  const leitura = ['SELECT', 'WITH', 'PRAGMA', 'EXPLAIN'].includes(primeira);

  try {
    if (leitura) {
      const linhas = db.prepare(sql).all();
      log(req, 'sql-consulta', 'sql', null, sql.slice(0, 400));
      return res.json({
        tipo: 'leitura',
        colunas: linhas.length ? Object.keys(linhas[0]) : [],
        linhas,
        total: linhas.length,
        ms: Date.now() - inicio,
      });
    }

    // Escrita exige confirmação — evita rodar DELETE sem querer
    if (req.body.confirmar !== true) {
      return res.status(428).json({
        error: 'Esta consulta altera dados. Confirme para executar.',
        precisa_confirmar: true,
        comando: primeira,
      });
    }

    const info = db.prepare(sql).run();
    log(req, 'sql-escrita', 'sql', null, `${primeira} · ${info.changes} linha(s) · ${sql.slice(0, 300)}`);
    return res.json({
      tipo: 'escrita',
      comando: primeira,
      alteradas: info.changes,
      ultimo_id: info.lastInsertRowid,
      ms: Date.now() - inicio,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}));

// ── GET /api/sql/dados/:tabela — navegação rápida ─────────────
router.get('/dados/:tabela', rota((req, res) => {
  const { tabela } = req.params;
  if (!nomeValido(tabela)) return res.status(400).json({ error: 'Nome de tabela inválido.' });
  if (ehProtegida(tabela)) return res.status(403).json({ error: 'Tabela protegida pelo sistema.' });

  const limite = Math.min(Number(req.query.limite) || 100, 500);
  const pagina = Math.max(Number(req.query.pagina) || 1, 1);

  const total = db.prepare(`SELECT COUNT(*) c FROM "${tabela}"`).get().c;
  const linhas = db.prepare(`SELECT * FROM "${tabela}" LIMIT ? OFFSET ?`)
    .all(limite, (pagina - 1) * limite);

  res.json({
    tabela, total, pagina, limite,
    colunas: linhas.length ? Object.keys(linhas[0]) : [],
    linhas,
  });
}));

module.exports = router;
