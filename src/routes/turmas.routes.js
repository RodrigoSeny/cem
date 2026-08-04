// ═══════════════════════════════════════════════════════════════
// CEM — Rotas de Turmas
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const { db, log } = require('../db');
const { filtrarCampos, montarInsert, montarUpdate, bool01, rota } = require('../util');

const router = express.Router();

const CAMPOS = ['nome', 'etapa', 'serie', 'turno', 'ano_letivo', 'sala', 'capacidade', 'professor_id', 'auxiliar_id', 'ativa'];

const CONFLITOS = {
  'turmas.nome, turmas.ano_letivo': 'Já existe uma turma com este nome neste ano letivo.',
};

function preparar(body) {
  const d = filtrarCampos(body, CAMPOS);
  for (const n of ['ano_letivo', 'capacidade', 'professor_id', 'auxiliar_id']) {
    if (n in d) d[n] = d[n] ? Number(d[n]) : null;
  }
  if ('ativa' in d) d.ativa = bool01(d.ativa);
  return d;
}

const SELECT_BASE = `
  SELECT t.*,
         p.nome AS professor_nome,
         x.nome AS auxiliar_nome,
         (SELECT COUNT(*) FROM alunos a WHERE a.turma_id = t.id AND a.situacao = 'matriculado') AS qtd_alunos
    FROM turmas t
    LEFT JOIN funcionarios p ON p.id = t.professor_id
    LEFT JOIN funcionarios x ON x.id = t.auxiliar_id
`;

// ── GET /api/turmas ───────────────────────────────────────────
router.get('/', rota((req, res) => {
  const { ano_letivo, ativa, turno } = req.query;
  const cond = [];
  const par = [];

  if (ano_letivo) { cond.push('t.ano_letivo = ?'); par.push(Number(ano_letivo)); }
  if (ativa === '1' || ativa === '0') { cond.push('t.ativa = ?'); par.push(Number(ativa)); }
  if (turno) { cond.push('t.turno = ?'); par.push(turno); }

  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : '';
  res.json(db.prepare(`${SELECT_BASE}${where} ORDER BY t.ano_letivo DESC, t.nome`).all(...par));
}));

// ── GET /api/turmas/:id ───────────────────────────────────────
router.get('/:id', rota((req, res) => {
  const t = db.prepare(`${SELECT_BASE} WHERE t.id = ?`).get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Turma não encontrada.' });

  t.alunos = db.prepare(`
    SELECT id, matricula, nome, data_nascimento, situacao
      FROM alunos WHERE turma_id = ? ORDER BY nome`).all(t.id);
  res.json(t);
}));

// ── POST /api/turmas ──────────────────────────────────────────
router.post('/', rota((req, res) => {
  const d = preparar(req.body);
  if (!d.nome) return res.status(400).json({ error: 'Informe o nome da turma.' });
  if (!d.ano_letivo) d.ano_letivo = new Date().getFullYear();

  const { sql, valores } = montarInsert('turmas', d);
  const info = db.prepare(sql).run(...valores);
  log(req, 'criar', 'turmas', info.lastInsertRowid, d.nome);
  res.status(201).json({ id: info.lastInsertRowid });
}, CONFLITOS));

// ── PUT /api/turmas/:id ───────────────────────────────────────
router.put('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM turmas WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Turma não encontrada.' });
  }
  const d = preparar(req.body);
  if (!Object.keys(d).length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });

  const { sql, valores } = montarUpdate('turmas', d, id);
  db.prepare(sql).run(...valores);
  log(req, 'atualizar', 'turmas', id, d.nome || null);
  res.json({ ok: true });
}, CONFLITOS));

// ── DELETE /api/turmas/:id ────────────────────────────────────
router.delete('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const t = db.prepare('SELECT nome FROM turmas WHERE id = ?').get(id);
  if (!t) return res.status(404).json({ error: 'Turma não encontrada.' });

  const alunos = db.prepare('SELECT COUNT(*) c FROM alunos WHERE turma_id = ?').get(id).c;
  if (alunos) return res.status(409).json({ error: `A turma possui ${alunos} aluno(s). Transfira-os antes de excluir.` });

  db.prepare('DELETE FROM turmas WHERE id = ?').run(id);
  log(req, 'excluir', 'turmas', id, t.nome);
  res.json({ ok: true });
}));

module.exports = router;
