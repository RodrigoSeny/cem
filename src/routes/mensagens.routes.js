// ═══════════════════════════════════════════════════════════════
// CEM — Mensageria (escola → responsáveis)
//
// Ao publicar, a mensagem é distribuída: uma linha por responsável
// (com o aluno de contexto) em mensagem_destinatarios. É ali que
// ficam a leitura e a ciência, com data e hora.
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const { db, log, agora } = require('../db');
const { bool01, rota } = require('../util');
const Push = require('../push');

const router = express.Router();

const TIPOS = [
  { id: 'comunicado',  nome: 'Comunicado' },
  { id: 'evento',      nome: 'Evento' },
  { id: 'reuniao',     nome: 'Reunião' },
  { id: 'financeiro',  nome: 'Financeiro' },
  { id: 'saude',       nome: 'Saúde' },
  { id: 'urgente',     nome: 'Urgente' },
];

/** Responsáveis que devem receber a mensagem, com o aluno de contexto. */
function destinatarios({ alvo, turma_id, aluno_id }) {
  const base = `
    SELECT DISTINCT ar.responsavel_id, ar.aluno_id
      FROM aluno_responsaveis ar
      JOIN alunos a       ON a.id = ar.aluno_id
      JOIN responsaveis r ON r.id = ar.responsavel_id
     WHERE r.ativo = 1 AND a.situacao = 'matriculado'`;

  if (alvo === 'turma') return db.prepare(`${base} AND a.turma_id = ?`).all(Number(turma_id));
  if (alvo === 'aluno') return db.prepare(`${base} AND a.id = ?`).all(Number(aluno_id));
  return db.prepare(base).all();
}

// ── GET /api/mensagens/tipos ──────────────────────────────────
router.get('/tipos', rota((req, res) => res.json(TIPOS)));

/** A mensagem já foi confirmada por pelo menos um responsável? */
function temCiencia(mensagemId) {
  return !!db.prepare(
    'SELECT 1 FROM mensagem_destinatarios WHERE mensagem_id = ? AND ciente_em IS NOT NULL LIMIT 1'
  ).get(mensagemId);
}

// ── GET /api/mensagens ────────────────────────────────────────
// Por padrão só mostra as ativas (não invalidadas) — passe situacao=todas
// ou situacao=invalidadas para ver as demais.
router.get('/', rota((req, res) => {
  const { situacao } = req.query;
  const where = situacao === 'todas' ? ''
    : situacao === 'invalidadas' ? 'WHERE m.invalidada_em IS NOT NULL'
    : 'WHERE m.invalidada_em IS NULL';

  res.json(db.prepare(`
    SELECT m.*,
           t.nome AS turma_nome,
           a.nome AS aluno_nome,
           (SELECT COUNT(*) FROM mensagem_destinatarios d WHERE d.mensagem_id = m.id) AS total,
           (SELECT COUNT(*) FROM mensagem_destinatarios d WHERE d.mensagem_id = m.id AND d.lido_em IS NOT NULL) AS lidos,
           (SELECT COUNT(*) FROM mensagem_destinatarios d WHERE d.mensagem_id = m.id AND d.ciente_em IS NOT NULL) AS cientes
      FROM mensagens m
      LEFT JOIN turmas t ON t.id = m.turma_id
      LEFT JOIN alunos a ON a.id = m.aluno_id
     ${where}
     ORDER BY m.id DESC LIMIT 200`).all());
}));

// ── GET /api/mensagens/:id — com a lista de quem leu / deu ciência ──
router.get('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const m = db.prepare(`
    SELECT m.*, t.nome AS turma_nome, a.nome AS aluno_nome
      FROM mensagens m
      LEFT JOIN turmas t ON t.id = m.turma_id
      LEFT JOIN alunos a ON a.id = m.aluno_id
     WHERE m.id = ?`).get(id);
  if (!m) return res.status(404).json({ error: 'Mensagem não encontrada.' });

  m.destinatarios = db.prepare(`
    SELECT d.id, d.lido_em, d.ciente_em,
           r.nome AS responsavel_nome, r.telefone, r.whatsapp,
           al.nome AS aluno_nome, tu.nome AS turma_nome
      FROM mensagem_destinatarios d
      JOIN responsaveis r ON r.id = d.responsavel_id
      LEFT JOIN alunos al ON al.id = d.aluno_id
      LEFT JOIN turmas tu ON tu.id = al.turma_id
     WHERE d.mensagem_id = ?
     ORDER BY (d.ciente_em IS NULL), (d.lido_em IS NULL), r.nome`).all(id);

  res.json(m);
}));

// ── POST /api/mensagens ───────────────────────────────────────
router.post('/', rota((req, res) => {
  const titulo = String(req.body.titulo || '').trim();
  const conteudo = String(req.body.conteudo || '').trim();
  const alvo = ['todos', 'turma', 'aluno'].includes(req.body.alvo) ? req.body.alvo : 'todos';

  if (!titulo) return res.status(400).json({ error: 'Informe o título da mensagem.' });
  if (!conteudo) return res.status(400).json({ error: 'Escreva o conteúdo da mensagem.' });
  if (alvo === 'turma' && !req.body.turma_id) return res.status(400).json({ error: 'Selecione a turma.' });
  if (alvo === 'aluno' && !req.body.aluno_id) return res.status(400).json({ error: 'Selecione o aluno.' });

  const lista = destinatarios({ alvo, turma_id: req.body.turma_id, aluno_id: req.body.aluno_id });
  if (!lista.length) {
    return res.status(400).json({ error: 'Nenhum responsável ativo encontrado para este público.' });
  }

  const criar = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO mensagens (titulo, conteudo, tipo, exige_ciencia, alvo, turma_id, aluno_id, criado_por, criado_nome, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        titulo, conteudo,
        req.body.tipo || 'comunicado',
        bool01(req.body.exige_ciencia),
        alvo,
        alvo === 'turma' ? Number(req.body.turma_id) : null,
        alvo === 'aluno' ? Number(req.body.aluno_id) : null,
        req.usuario?.id ?? null,
        req.usuario?.nome ?? null,
        agora()
      );

    const stmt = db.prepare(
      'INSERT OR IGNORE INTO mensagem_destinatarios (mensagem_id, responsavel_id, aluno_id) VALUES (?, ?, ?)'
    );
    for (const d of lista) stmt.run(info.lastInsertRowid, d.responsavel_id, d.aluno_id);
    return info.lastInsertRowid;
  });

  const id = criar();
  log(req, 'criar', 'mensagens', id, `${titulo} → ${lista.length} destinatário(s)`);

  Push.enviarParaResponsaveis(lista.map(d => d.responsavel_id), {
    titulo: '✉️ Nova mensagem da escola',
    corpo: titulo,
    tela: 'mensagens',
  }).catch(e => console.error('[push/mensagens]', e.message));

  res.status(201).json({ id, destinatarios: lista.length });
}));

// ── DELETE /api/mensagens/:id ─────────────────────────────────
router.delete('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const m = db.prepare('SELECT titulo FROM mensagens WHERE id = ?').get(id);
  if (!m) return res.status(404).json({ error: 'Mensagem não encontrada.' });

  if (temCiencia(id)) {
    return res.status(409).json({
      error: 'Esta mensagem já foi confirmada por um responsável e não pode mais ser excluída. Invalide-a, informando o motivo.',
    });
  }

  db.prepare('DELETE FROM mensagens WHERE id = ?').run(id);
  log(req, 'excluir', 'mensagens', id, m.titulo);
  res.json({ ok: true });
}));

// ── POST /api/mensagens/:id/invalidar ─────────────────────────
// Não apaga a mensagem: ela continua visível, só marcada como inválida
// (com o motivo), para preservar o histórico de comunicação com a família.
router.post('/:id/invalidar', rota((req, res) => {
  const id = Number(req.params.id);
  const m = db.prepare('SELECT titulo, invalidada_em FROM mensagens WHERE id = ?').get(id);
  if (!m) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  if (m.invalidada_em) return res.status(409).json({ error: 'Esta mensagem já está invalidada.' });

  const motivo = String(req.body.motivo || '').trim();
  if (!motivo) return res.status(400).json({ error: 'Informe o motivo da invalidação.' });

  db.prepare(`
    UPDATE mensagens SET invalidada_em = ?, invalidada_motivo = ?, invalidada_por = ?
     WHERE id = ?`).run(agora(), motivo, req.usuario?.id ?? null, id);

  log(req, 'invalidar', 'mensagens', id, `${m.titulo} · ${motivo}`);
  res.json({ ok: true });
}));

module.exports = { router, TIPOS };
