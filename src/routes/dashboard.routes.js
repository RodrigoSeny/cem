// ═══════════════════════════════════════════════════════════════
// CEM — Indicadores do painel inicial
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const { db } = require('../db');
const { rota } = require('../util');

const router = express.Router();

router.get('/', rota((req, res) => {
  const ano = Number(req.query.ano_letivo) || new Date().getFullYear();
  const um = (sql, ...p) => db.prepare(sql).get(...p);

  const alunosAtivos = um(`SELECT COUNT(*) c FROM alunos WHERE situacao = 'matriculado'`).c;
  const preMatricula = um(`SELECT COUNT(*) c FROM alunos WHERE situacao = 'pre_matricula'`).c;
  const semTurma = um(`SELECT COUNT(*) c FROM alunos WHERE situacao = 'matriculado' AND turma_id IS NULL`).c;
  const semResponsavel = um(`
    SELECT COUNT(*) c FROM alunos a
     WHERE a.situacao = 'matriculado'
       AND NOT EXISTS (SELECT 1 FROM aluno_responsaveis ar WHERE ar.aluno_id = a.id)`).c;

  const responsaveis = um(`SELECT COUNT(*) c FROM responsaveis WHERE ativo = 1`).c;
  const funcionarios = um(`SELECT COUNT(*) c FROM funcionarios WHERE ativo = 1`).c;
  const professores = um(`SELECT COUNT(*) c FROM funcionarios WHERE ativo = 1 AND cargo LIKE '%rofessor%'`).c;
  const turmas = um(`SELECT COUNT(*) c FROM turmas WHERE ativa = 1 AND ano_letivo = ?`, ano).c;

  const porTurno = db.prepare(`
    SELECT t.turno, COUNT(a.id) AS total
      FROM turmas t LEFT JOIN alunos a ON a.turma_id = t.id AND a.situacao = 'matriculado'
     WHERE t.ativa = 1 AND t.ano_letivo = ?
     GROUP BY t.turno`).all(ano);

  const porSituacao = db.prepare(`
    SELECT situacao, COUNT(*) AS total FROM alunos GROUP BY situacao`).all();

  const ocupacaoTurmas = db.prepare(`
    SELECT t.id, t.nome, t.turno, t.capacidade,
           (SELECT COUNT(*) FROM alunos a WHERE a.turma_id = t.id AND a.situacao = 'matriculado') AS ocupacao
      FROM turmas t
     WHERE t.ativa = 1 AND t.ano_letivo = ?
     ORDER BY t.nome`).all(ano);

  // O ORDER BY fica fora do UNION: em SELECT composto o SQLite só aceita
  // ordenar por colunas do resultado, não por expressões.
  const aniversariantes = db.prepare(`
    SELECT * FROM (
      SELECT nome, data_nascimento, 'aluno' AS tipo FROM alunos
       WHERE situacao = 'matriculado' AND data_nascimento IS NOT NULL
         AND strftime('%m', data_nascimento) = strftime('%m','now','localtime')
      UNION ALL
      SELECT nome, data_nascimento, 'funcionario' AS tipo FROM funcionarios
       WHERE ativo = 1 AND data_nascimento IS NOT NULL
         AND strftime('%m', data_nascimento) = strftime('%m','now','localtime')
    )
    ORDER BY strftime('%d', data_nascimento)`).all();

  const ultimasMatriculas = db.prepare(`
    SELECT a.id, a.nome, a.matricula, a.data_matricula, t.nome AS turma_nome
      FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id
     ORDER BY a.id DESC LIMIT 8`).all();

  const alertasSaude = db.prepare(`
    SELECT id, nome, alergias, necessidades_especiais
      FROM alunos
     WHERE situacao = 'matriculado'
       AND ((alergias IS NOT NULL AND alergias <> '') OR (necessidades_especiais IS NOT NULL AND necessidades_especiais <> ''))
     ORDER BY nome LIMIT 12`).all();

  res.json({
    ano_letivo: ano,
    cards: { alunosAtivos, preMatricula, semTurma, semResponsavel, responsaveis, funcionarios, professores, turmas },
    porTurno, porSituacao, ocupacaoTurmas, aniversariantes, ultimasMatriculas, alertasSaude,
  });
}));

module.exports = router;
