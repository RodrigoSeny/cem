// ═══════════════════════════════════════════════════════════════
// CEM — Fontes de dados dos relatórios
// A renderização (com logo e cabeçalho) acontece no front, em
// public/js/relatorios.js — aqui devolvemos só os dados.
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const { db } = require('../db');
const { rota, idade } = require('../util');

const router = express.Router();

// ── Relação de alunos (com filtros) ───────────────────────────
router.get('/alunos', rota((req, res) => {
  const { turma_id, situacao, ano_letivo, turno } = req.query;
  const cond = [];
  const par = [];

  if (turma_id) { cond.push('a.turma_id = ?'); par.push(Number(turma_id)); }
  if (situacao) { cond.push('a.situacao = ?'); par.push(situacao); }
  if (ano_letivo) { cond.push('a.ano_letivo = ?'); par.push(Number(ano_letivo)); }
  if (turno) { cond.push('COALESCE(t.turno, a.turno) = ?'); par.push(turno); }

  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : '';
  const linhas = db.prepare(`
    SELECT a.id, a.matricula, a.nome, a.data_nascimento, a.sexo, a.situacao,
           a.telefone_emergencia, a.contato_emergencia,
           t.nome AS turma_nome, COALESCE(t.turno, a.turno) AS turno,
           (SELECT r.nome FROM aluno_responsaveis ar JOIN responsaveis r ON r.id = ar.responsavel_id
             WHERE ar.aluno_id = a.id ORDER BY ar.principal DESC LIMIT 1) AS responsavel_nome,
           (SELECT COALESCE(r.whatsapp, r.telefone) FROM aluno_responsaveis ar JOIN responsaveis r ON r.id = ar.responsavel_id
             WHERE ar.aluno_id = a.id ORDER BY ar.principal DESC LIMIT 1) AS responsavel_contato
      FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id
      ${where}
     ORDER BY t.nome, a.nome`).all(...par);

  res.json(linhas.map(a => ({ ...a, idade: idade(a.data_nascimento) })));
}));

// ── Ficha completa do aluno ───────────────────────────────────
router.get('/ficha-aluno/:id', rota((req, res) => {
  const a = db.prepare(`
    SELECT a.*, t.nome AS turma_nome, t.turno AS turma_turno, t.sala AS turma_sala,
           p.nome AS professor_nome
      FROM alunos a
      LEFT JOIN turmas t ON t.id = a.turma_id
      LEFT JOIN funcionarios p ON p.id = t.professor_id
     WHERE a.id = ?`).get(Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'Aluno não encontrado.' });

  a.idade = idade(a.data_nascimento);
  a.responsaveis = db.prepare(`
    SELECT r.*, ar.parentesco, ar.tipo_vinculo, ar.principal, ar.autorizado_retirar
      FROM aluno_responsaveis ar JOIN responsaveis r ON r.id = ar.responsavel_id
     WHERE ar.aluno_id = ? ORDER BY ar.principal DESC, r.nome`).all(a.id);

  res.json(a);
}));

// ── Relação de responsáveis / agenda de contatos ──────────────
router.get('/responsaveis', rota((req, res) => {
  const turmaId = req.query.turma_id ? Number(req.query.turma_id) : null;
  const par = [];
  let where = `WHERE a.situacao = 'matriculado'`;
  if (turmaId) { where += ' AND a.turma_id = ?'; par.push(turmaId); }

  res.json(db.prepare(`
    SELECT r.nome AS responsavel_nome, r.cpf, r.telefone, r.whatsapp, r.email, r.profissao,
           a.nome AS aluno_nome, a.matricula, t.nome AS turma_nome,
           ar.parentesco, ar.tipo_vinculo, ar.principal, ar.autorizado_retirar
      FROM aluno_responsaveis ar
      JOIN responsaveis r ON r.id = ar.responsavel_id
      JOIN alunos a       ON a.id = ar.aluno_id
      LEFT JOIN turmas t  ON t.id = a.turma_id
      ${where}
     ORDER BY a.nome, ar.principal DESC`).all(...par));
}));

// ── Quadro de funcionários ────────────────────────────────────
router.get('/funcionarios', rota((req, res) => {
  const { ativo, setor } = req.query;
  const cond = [];
  const par = [];
  if (ativo === '1' || ativo === '0') { cond.push('f.ativo = ?'); par.push(Number(ativo)); }
  if (setor) { cond.push('f.setor = ?'); par.push(setor); }

  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : '';
  const linhas = db.prepare(`
    SELECT f.id, f.matricula, f.nome, f.cargo, f.setor, f.tipo_contrato,
           f.data_admissao, f.data_nascimento, f.telefone, f.whatsapp, f.email,
           f.formacao, f.turno, f.ativo
      FROM funcionarios f${where}
     ORDER BY f.setor, f.nome`).all(...par);

  res.json(linhas.map(f => ({ ...f, idade: idade(f.data_nascimento) })));
}));

// ── Ficha médica da turma (uso pedagógico) ────────────────────
router.get('/ficha-medica', rota((req, res) => {
  const turmaId = req.query.turma_id ? Number(req.query.turma_id) : null;
  const par = [];
  let where = `WHERE a.situacao = 'matriculado'`;
  if (turmaId) { where += ' AND a.turma_id = ?'; par.push(turmaId); }

  res.json(db.prepare(`
    SELECT a.nome, a.matricula, a.data_nascimento, a.tipo_sanguineo, a.alergias,
           a.medicamentos, a.restricoes_alimentares, a.necessidades_especiais,
           a.plano_saude, a.contato_emergencia, a.telefone_emergencia,
           t.nome AS turma_nome
      FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id
      ${where}
     ORDER BY t.nome, a.nome`).all(...par));
}));

// ── Alunos por turma (consolidado) ────────────────────────────
router.get('/turmas', rota((req, res) => {
  const ano = Number(req.query.ano_letivo) || new Date().getFullYear();
  res.json(db.prepare(`
    SELECT t.id, t.nome, t.etapa, t.serie, t.turno, t.sala, t.capacidade,
           p.nome AS professor_nome, x.nome AS auxiliar_nome,
           (SELECT COUNT(*) FROM alunos a WHERE a.turma_id = t.id AND a.situacao = 'matriculado') AS qtd_alunos
      FROM turmas t
      LEFT JOIN funcionarios p ON p.id = t.professor_id
      LEFT JOIN funcionarios x ON x.id = t.auxiliar_id
     WHERE t.ano_letivo = ?
     ORDER BY t.turno, t.nome`).all(ano));
}));

module.exports = router;
