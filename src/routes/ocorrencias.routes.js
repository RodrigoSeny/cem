// ═══════════════════════════════════════════════════════════════
// CEM — Ocorrências (histórico do aluno)
//
// Registra faltas relevantes, acidentes, incidentes, atendimentos
// e elogios. Cada ocorrência pode ou não ser compartilhada com os
// responsáveis, e aceita anexos (fotos, documentos).
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const { db, log, agora } = require('../db');
const { filtrarCampos, montarInsert, montarUpdate, bool01, rota } = require('../util');
const Push = require('../push');

const router = express.Router();

const TIPOS = [
  { id: 'falta',         nome: 'Falta relevante',        gravidade: 'informativa' },
  { id: 'atraso',        nome: 'Atraso',                 gravidade: 'informativa' },
  { id: 'saida_antecipada', nome: 'Saída antecipada',    gravidade: 'informativa' },
  { id: 'acidente',      nome: 'Acidente',               gravidade: 'grave' },
  { id: 'incidente',     nome: 'Incidente',              gravidade: 'atencao' },
  { id: 'saude',         nome: 'Ocorrência de saúde',    gravidade: 'atencao' },
  { id: 'medicamento',   nome: 'Medicamento administrado', gravidade: 'informativa' },
  { id: 'comportamento', nome: 'Comportamento',          gravidade: 'atencao' },
  { id: 'pedagogica',    nome: 'Pedagógica',             gravidade: 'informativa' },
  { id: 'elogio',        nome: 'Elogio',                 gravidade: 'informativa' },
  { id: 'reuniao',       nome: 'Reunião com responsável', gravidade: 'informativa' },
  { id: 'outro',         nome: 'Outro',                  gravidade: 'informativa' },
];

const CAMPOS = [
  'aluno_id', 'tipo', 'gravidade', 'titulo', 'descricao',
  'data_ocorrencia', 'hora_ocorrencia', 'local_ocorrencia',
  'providencia', 'visivel_responsavel', 'exige_ciencia',
];

function preparar(body) {
  const d = filtrarCampos(body, CAMPOS);
  if ('aluno_id' in d) d.aluno_id = Number(d.aluno_id);
  if ('visivel_responsavel' in d) d.visivel_responsavel = bool01(d.visivel_responsavel);
  if ('exige_ciencia' in d) d.exige_ciencia = bool01(d.exige_ciencia);
  return d;
}

const SELECT_BASE = `
  SELECT o.*,
         a.nome AS aluno_nome, a.matricula,
         t.nome AS turma_nome,
         (SELECT COUNT(*) FROM anexos an WHERE an.entidade = 'ocorrencia' AND an.entidade_id = o.id) AS qtd_anexos,
         (SELECT COUNT(*) FROM ocorrencia_ciencias oc WHERE oc.ocorrencia_id = o.id) AS qtd_ciencias
    FROM ocorrencias o
    JOIN alunos a ON a.id = o.aluno_id
    LEFT JOIN turmas t ON t.id = a.turma_id
`;

// ── GET /api/ocorrencias/tipos ────────────────────────────────
router.get('/tipos', rota((req, res) => res.json(TIPOS)));

// ── GET /api/ocorrencias ──────────────────────────────────────
// Por padrão só mostra as ativas (não invalidadas) — passe situacao=todas
// ou situacao=invalidadas para ver as demais.
router.get('/', rota((req, res) => {
  const { aluno_id, turma_id, tipo, gravidade, de, ate, visivel, situacao } = req.query;
  const cond = [];
  const par = [];

  if (aluno_id) { cond.push('o.aluno_id = ?'); par.push(Number(aluno_id)); }
  if (turma_id) { cond.push('a.turma_id = ?'); par.push(Number(turma_id)); }
  if (tipo) { cond.push('o.tipo = ?'); par.push(tipo); }
  if (gravidade) { cond.push('o.gravidade = ?'); par.push(gravidade); }
  if (de) { cond.push('o.data_ocorrencia >= ?'); par.push(de); }
  if (ate) { cond.push('o.data_ocorrencia <= ?'); par.push(ate); }
  if (visivel === '1' || visivel === '0') { cond.push('o.visivel_responsavel = ?'); par.push(Number(visivel)); }

  if (situacao === 'invalidadas') cond.push('o.invalidada_em IS NOT NULL');
  else if (situacao !== 'todas') cond.push('o.invalidada_em IS NULL');

  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : '';
  res.json(db.prepare(`${SELECT_BASE}${where}
    ORDER BY o.data_ocorrencia DESC, o.id DESC LIMIT 300`).all(...par));
}));

// ── GET /api/ocorrencias/:id ──────────────────────────────────
router.get('/:id', rota((req, res) => {
  const o = db.prepare(`${SELECT_BASE} WHERE o.id = ?`).get(Number(req.params.id));
  if (!o) return res.status(404).json({ error: 'Ocorrência não encontrada.' });

  o.anexos = db.prepare(`
    SELECT id, categoria, descricao, nome_original, mime, tamanho, criado_em
      FROM anexos WHERE entidade = 'ocorrencia' AND entidade_id = ?
     ORDER BY criado_em DESC`).all(o.id);

  res.json(o);
}));

// ── POST /api/ocorrencias ─────────────────────────────────────
router.post('/', rota((req, res) => {
  const d = preparar(req.body);
  if (!d.aluno_id) return res.status(400).json({ error: 'Selecione o aluno.' });
  if (!d.titulo) return res.status(400).json({ error: 'Informe um título para a ocorrência.' });
  if (!d.tipo) d.tipo = 'outro';
  if (!d.gravidade) d.gravidade = TIPOS.find(t => t.id === d.tipo)?.gravidade || 'informativa';
  if (!d.data_ocorrencia) d.data_ocorrencia = new Date().toISOString().slice(0, 10);

  d.registrado_por = req.usuario?.id ?? null;
  d.registrado_nome = req.usuario?.nome ?? null;
  d.criado_em = agora();

  const { sql, valores } = montarInsert('ocorrencias', d);
  const info = db.prepare(sql).run(...valores);

  log(req, 'criar', 'ocorrencias', info.lastInsertRowid, `${d.tipo}: ${d.titulo}`);

  if (d.visivel_responsavel) {
    const aluno = db.prepare('SELECT nome FROM alunos WHERE id = ?').get(d.aluno_id);
    const vinculados = db.prepare('SELECT responsavel_id FROM aluno_responsaveis WHERE aluno_id = ?').all(d.aluno_id);
    Push.enviarParaResponsaveis(vinculados.map(v => v.responsavel_id), {
      titulo: '📌 Nova ocorrência',
      corpo: `${aluno?.nome || 'Um aluno'}: ${d.titulo}`,
      tela: 'ocorrencias',
    }).catch(e => console.error('[push/ocorrencias]', e.message));
  }

  res.status(201).json({ id: info.lastInsertRowid });
}));

/** A ocorrência já foi confirmada por pelo menos um responsável? */
function temCiencia(ocorrenciaId) {
  return !!db.prepare(
    'SELECT 1 FROM ocorrencia_ciencias WHERE ocorrencia_id = ? LIMIT 1'
  ).get(ocorrenciaId);
}

// ── PUT /api/ocorrencias/:id ──────────────────────────────────
router.put('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM ocorrencias WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Ocorrência não encontrada.' });
  }
  if (temCiencia(id)) {
    return res.status(409).json({
      error: 'Esta ocorrência já foi confirmada por um responsável e não pode mais ser editada. Invalide-a, informando o motivo.',
    });
  }

  const d = preparar(req.body);
  d.atualizado_em = agora();

  const { sql, valores } = montarUpdate('ocorrencias', d, id);
  db.prepare(sql).run(...valores);

  log(req, 'atualizar', 'ocorrencias', id, d.titulo || null);
  res.json({ ok: true });
}));

// ── DELETE /api/ocorrencias/:id ───────────────────────────────
router.delete('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const o = db.prepare('SELECT titulo FROM ocorrencias WHERE id = ?').get(id);
  if (!o) return res.status(404).json({ error: 'Ocorrência não encontrada.' });

  if (temCiencia(id)) {
    return res.status(409).json({
      error: 'Esta ocorrência já foi confirmada por um responsável e não pode mais ser excluída. Invalide-a, informando o motivo.',
    });
  }

  db.prepare('DELETE FROM ocorrencias WHERE id = ?').run(id);
  log(req, 'excluir', 'ocorrencias', id, o.titulo);
  res.json({ ok: true });
}));

// ── POST /api/ocorrencias/:id/invalidar ───────────────────────
// Não apaga a ocorrência: ela continua visível, só marcada como inválida
// (com o motivo), para preservar o histórico do aluno.
router.post('/:id/invalidar', rota((req, res) => {
  const id = Number(req.params.id);
  const o = db.prepare('SELECT titulo, invalidada_em FROM ocorrencias WHERE id = ?').get(id);
  if (!o) return res.status(404).json({ error: 'Ocorrência não encontrada.' });
  if (o.invalidada_em) return res.status(409).json({ error: 'Esta ocorrência já está invalidada.' });

  const motivo = String(req.body.motivo || '').trim();
  if (!motivo) return res.status(400).json({ error: 'Informe o motivo da invalidação.' });

  db.prepare(`
    UPDATE ocorrencias SET invalidada_em = ?, invalidada_motivo = ?, invalidada_por = ?
     WHERE id = ?`).run(agora(), motivo, req.usuario?.id ?? null, id);

  log(req, 'invalidar', 'ocorrencias', id, `${o.titulo} · ${motivo}`);
  res.json({ ok: true });
}));

module.exports = { router, TIPOS };
