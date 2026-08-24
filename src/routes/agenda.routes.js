// ═══════════════════════════════════════════════════════════════
// CEM — Agenda diária: "dia normal" configurável por turma + exceções
// registradas por aluno. Campo de rotina sem exceção lançada no dia
// mostra o padrão da turma — é assim que "tudo normal" aparece pro
// responsável sem a equipe precisar preencher um formulário em branco
// por criança todo dia.
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const { db, log, agora } = require('../db');
const { filtrarCampos, montarInsert, montarUpdate, rota } = require('../util');

const router = express.Router();

const CAMPOS_ROTINA = ['sono', 'banho', 'disposicao', 'evacuacao', 'colacao', 'almoco', 'lanche', 'jantar'];
const CAMPOS_DIARIA = [...CAMPOS_ROTINA, 'entrada', 'saida', 'observacoes', 'teve_febre', 'temperatura', 'febre_hora', 'antifebril'];

const hoje = () => new Date().toISOString().slice(0, 10);
const dataValida = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

/** Registro efetivo de um aluno num dia: campos de rotina vêm da exceção do
 *  dia quando existir, senão do padrão da turma. Reaproveitado pela tela de
 *  preenchimento (sistema) e pela rota do portal (responsável). */
function agendaEfetiva(alunoId, data) {
  const aluno = db.prepare('SELECT id, nome, turma_id FROM alunos WHERE id = ?').get(alunoId);
  if (!aluno) return null;

  const diaria = db.prepare('SELECT * FROM agenda_diaria WHERE aluno_id = ? AND data = ?').get(alunoId, data);
  const padrao = aluno.turma_id
    ? db.prepare('SELECT * FROM agenda_padrao_turma WHERE turma_id = ?').get(aluno.turma_id)
    : null;

  // `rotina` é o valor efetivo (exceção do dia, senão o padrão da turma) —
  // pro portal do responsável. `excecoes` é só o que foi lançado no dia (sem
  // herdar nada), pra tela de preenchimento saber o que já é override vs o
  // que ainda está "sem alteração".
  const rotina = {};
  const excecoes = {};
  for (const c of CAMPOS_ROTINA) {
    excecoes[c] = diaria ? diaria[c] : null;
    rotina[c] = (diaria && diaria[c] != null) ? diaria[c] : (padrao ? padrao[c] : null);
  }

  const trazer = diaria
    ? db.prepare('SELECT item FROM agenda_diaria_trazer WHERE agenda_diaria_id = ?').all(diaria.id).map(r => r.item)
    : [];
  const medicamentos = diaria
    ? db.prepare('SELECT id, nome_remedio, dosagem, horario, ministrado_por FROM agenda_diaria_medicamentos WHERE agenda_diaria_id = ?').all(diaria.id)
    : [];

  return {
    aluno: { id: aluno.id, nome: aluno.nome, turma_id: aluno.turma_id },
    data,
    entrada: diaria?.entrada || null,
    saida: diaria?.saida || null,
    ...rotina,
    excecoes,
    observacoes: diaria?.observacoes || null,
    teve_febre: diaria?.teve_febre ? 1 : 0,
    temperatura: diaria?.temperatura || null,
    febre_hora: diaria?.febre_hora || null,
    antifebril: diaria?.antifebril || null,
    trazer,
    medicamentos,
    preenchido: !!diaria,
    tem_padrao: !!padrao,
  };
}

// ══════════════════════ PADRÃO DA TURMA ══════════════════════

router.get('/padrao/:turmaId', rota((req, res) => {
  const turmaId = Number(req.params.turmaId);
  const padrao = db.prepare('SELECT * FROM agenda_padrao_turma WHERE turma_id = ?').get(turmaId);
  res.json(padrao || { turma_id: turmaId });
}));

router.put('/padrao/:turmaId', rota((req, res) => {
  const turmaId = Number(req.params.turmaId);
  if (!db.prepare('SELECT id FROM turmas WHERE id = ?').get(turmaId)) {
    return res.status(404).json({ error: 'Turma não encontrada.' });
  }

  const d = filtrarCampos(req.body, CAMPOS_ROTINA);
  for (const c of CAMPOS_ROTINA) if (!(c in d) || d[c] === '') d[c] = null;
  if (d.banho !== null) d.banho = d.banho ? 1 : 0;

  db.prepare(`
    INSERT INTO agenda_padrao_turma (turma_id, sono, banho, disposicao, evacuacao, colacao, almoco, lanche, jantar, atualizado_em)
    VALUES (@turma_id, @sono, @banho, @disposicao, @evacuacao, @colacao, @almoco, @lanche, @jantar, @atualizado_em)
    ON CONFLICT(turma_id) DO UPDATE SET
      sono = excluded.sono, banho = excluded.banho, disposicao = excluded.disposicao, evacuacao = excluded.evacuacao,
      colacao = excluded.colacao, almoco = excluded.almoco, lanche = excluded.lanche, jantar = excluded.jantar,
      atualizado_em = excluded.atualizado_em`
  ).run({ turma_id: turmaId, atualizado_em: agora(), ...d });

  log(req, 'atualizar', 'agenda_padrao_turma', turmaId, null);
  res.json({ ok: true });
}));

// ══════════════════════ PREENCHIMENTO DO DIA ══════════════════

router.get('/turmas/:turmaId/dia', rota((req, res) => {
  const turmaId = Number(req.params.turmaId);
  const data = dataValida(req.query.data) ? req.query.data : hoje();

  const alunos = db.prepare(`
    SELECT id, nome, matricula FROM alunos
     WHERE turma_id = ? AND situacao NOT IN ('transferido', 'desistente', 'egresso')
     ORDER BY nome`).all(turmaId);

  res.json(alunos.map(a => ({
    ...a,
    preenchido: !!db.prepare('SELECT 1 FROM agenda_diaria WHERE aluno_id = ? AND data = ?').get(a.id, data),
  })));
}));

router.get('/alunos/:alunoId', rota((req, res) => {
  const data = dataValida(req.query.data) ? req.query.data : hoje();
  const efetivo = agendaEfetiva(Number(req.params.alunoId), data);
  if (!efetivo) return res.status(404).json({ error: 'Aluno não encontrado.' });
  res.json(efetivo);
}));

router.put('/alunos/:alunoId', rota((req, res) => {
  const alunoId = Number(req.params.alunoId);
  const data = dataValida(req.query.data) ? req.query.data : hoje();

  const aluno = db.prepare('SELECT id, turma_id FROM alunos WHERE id = ?').get(alunoId);
  if (!aluno) return res.status(404).json({ error: 'Aluno não encontrado.' });

  const d = filtrarCampos(req.body, CAMPOS_DIARIA);
  for (const c of CAMPOS_ROTINA) if (c in d && d[c] === '') d[c] = null;
  if ('banho' in d && d.banho !== null) d.banho = d.banho ? 1 : 0;
  if ('teve_febre' in d) d.teve_febre = d.teve_febre ? 1 : 0;

  const trazer = Array.isArray(req.body.trazer) ? req.body.trazer.filter(Boolean) : [];
  const medicamentos = Array.isArray(req.body.medicamentos) ? req.body.medicamentos.filter(m => m && m.nome_remedio) : [];

  const salvar = db.transaction(() => {
    const existente = db.prepare('SELECT id FROM agenda_diaria WHERE aluno_id = ? AND data = ?').get(alunoId, data);
    let agendaDiariaId;

    if (existente) {
      agendaDiariaId = existente.id;
      if (Object.keys(d).length) {
        const { sql, valores } = montarUpdate('agenda_diaria', { ...d, atualizado_em: agora() }, agendaDiariaId);
        db.prepare(sql).run(...valores);
      }
    } else {
      const { sql, valores } = montarInsert('agenda_diaria', {
        aluno_id: alunoId, turma_id: aluno.turma_id, data,
        criado_por: req.usuario.id, criado_em: agora(), ...d,
      });
      agendaDiariaId = db.prepare(sql).run(...valores).lastInsertRowid;
    }

    db.prepare('DELETE FROM agenda_diaria_trazer WHERE agenda_diaria_id = ?').run(agendaDiariaId);
    const inserirTrazer = db.prepare('INSERT INTO agenda_diaria_trazer (agenda_diaria_id, item) VALUES (?, ?)');
    for (const item of trazer) inserirTrazer.run(agendaDiariaId, item);

    db.prepare('DELETE FROM agenda_diaria_medicamentos WHERE agenda_diaria_id = ?').run(agendaDiariaId);
    const inserirMed = db.prepare(`
      INSERT INTO agenda_diaria_medicamentos (agenda_diaria_id, nome_remedio, dosagem, horario, ministrado_por)
      VALUES (?, ?, ?, ?, ?)`);
    for (const m of medicamentos) {
      inserirMed.run(agendaDiariaId, m.nome_remedio, m.dosagem || null, m.horario || null, m.ministrado_por || null);
    }
  });
  salvar();

  log(req, 'atualizar', 'agenda_diaria', alunoId, data);
  res.json(agendaEfetiva(alunoId, data));
}));

module.exports = { router, agendaEfetiva };
