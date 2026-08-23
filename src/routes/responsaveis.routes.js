// ═══════════════════════════════════════════════════════════════
// CEM — Rotas de Responsáveis
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const { db, log, agora } = require('../db');
const { filtrarCampos, montarInsert, montarUpdate, soNumeros, bool01, cpfValido, rota } = require('../util');

const router = express.Router();

const CAMPOS = [
  'nome', 'cpf', 'rg', 'data_nascimento', 'sexo', 'estado_civil',
  'telefone', 'whatsapp', 'email',
  'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado',
  'profissao', 'local_trabalho', 'telefone_trabalho', 'renda',
  'observacoes', 'ativo',
];

const CONFLITOS = {
  'responsaveis.cpf': 'Já existe um responsável cadastrado com este CPF.',
};

const ENDERECO_OBRIGATORIO = ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'estado'];

function validarCpfEndereco(d) {
  if (!d.cpf) return 'Informe o CPF do responsável.';
  if (!cpfValido(d.cpf)) return 'CPF inválido.';
  if (ENDERECO_OBRIGATORIO.some(campo => !d[campo])) return 'Preencha o endereço completo do responsável.';
  return null;
}

function preparar(body) {
  const d = filtrarCampos(body, CAMPOS);
  if ('cpf' in d) d.cpf = soNumeros(d.cpf);
  if ('cep' in d) d.cep = soNumeros(d.cep);
  if ('ativo' in d) d.ativo = bool01(d.ativo);
  if ('renda' in d) d.renda = d.renda ? Number(String(d.renda).replace(',', '.')) : null;
  return d;
}

// ── GET /api/responsaveis ─────────────────────────────────────
router.get('/', rota((req, res) => {
  const { busca, ativo } = req.query;
  const cond = [];
  const par = [];

  if (busca) {
    cond.push('(r.nome LIKE ? OR r.cpf LIKE ? OR r.email LIKE ? OR r.telefone LIKE ?)');
    const b = `%${busca}%`;
    par.push(b, b, b, b);
  }
  if (ativo === '1' || ativo === '0') { cond.push('r.ativo = ?'); par.push(Number(ativo)); }

  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : '';
  const linhas = db.prepare(`
    SELECT r.*,
           (SELECT COUNT(*) FROM aluno_responsaveis ar WHERE ar.responsavel_id = r.id) AS qtd_alunos,
           (SELECT COUNT(*) FROM usuarios u WHERE u.responsavel_id = r.id AND u.ativo = 1)  AS tem_acesso,
           (SELECT id    FROM usuarios u WHERE u.responsavel_id = r.id ORDER BY u.ativo DESC, u.id LIMIT 1) AS usuario_id,
           (SELECT login FROM usuarios u WHERE u.responsavel_id = r.id ORDER BY u.ativo DESC, u.id LIMIT 1) AS usuario_login
      FROM responsaveis r${where}
     ORDER BY r.nome`).all(...par);
  res.json(linhas);
}));

// ── GET /api/responsaveis/:id ─────────────────────────────────
router.get('/:id', rota((req, res) => {
  const r = db.prepare('SELECT * FROM responsaveis WHERE id = ?').get(Number(req.params.id));
  if (!r) return res.status(404).json({ error: 'Responsável não encontrado.' });

  r.alunos = db.prepare(`
    SELECT a.id, a.nome, a.matricula, a.situacao,
           t.nome AS turma_nome,
           ar.parentesco, ar.tipo_vinculo, ar.principal, ar.autorizado_retirar
      FROM aluno_responsaveis ar
      JOIN alunos a ON a.id = ar.aluno_id
      LEFT JOIN turmas t ON t.id = a.turma_id
     WHERE ar.responsavel_id = ?
     ORDER BY a.nome`).all(r.id);

  r.usuario = db.prepare('SELECT id, login, ativo, ultimo_login FROM usuarios WHERE responsavel_id = ?').get(r.id) || null;
  res.json(r);
}));

// ── POST /api/responsaveis ────────────────────────────────────
router.post('/', rota((req, res) => {
  const d = preparar(req.body);
  if (!d.nome) return res.status(400).json({ error: 'O nome do responsável é obrigatório.' });
  const erroEndereco = validarCpfEndereco(d);
  if (erroEndereco) return res.status(400).json({ error: erroEndereco });
  d.criado_em = agora();

  const { sql, valores } = montarInsert('responsaveis', d);
  const info = db.prepare(sql).run(...valores);

  log(req, 'criar', 'responsaveis', info.lastInsertRowid, d.nome);
  res.status(201).json({ id: info.lastInsertRowid });
}, CONFLITOS));

// ── PUT /api/responsaveis/:id ─────────────────────────────────
router.put('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const atual = db.prepare('SELECT * FROM responsaveis WHERE id = ?').get(id);
  if (!atual) return res.status(404).json({ error: 'Responsável não encontrado.' });

  const d = preparar(req.body);
  if ('nome' in d && !d.nome) return res.status(400).json({ error: 'O nome do responsável é obrigatório.' });
  const erroEndereco = validarCpfEndereco({ ...atual, ...d });
  if (erroEndereco) return res.status(400).json({ error: erroEndereco });
  d.atualizado_em = agora();

  const { sql, valores } = montarUpdate('responsaveis', d, id);
  db.prepare(sql).run(...valores);

  log(req, 'atualizar', 'responsaveis', id, d.nome || null);
  res.json({ ok: true });
}, CONFLITOS));

// ── DELETE /api/responsaveis/:id ──────────────────────────────
router.delete('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const r = db.prepare('SELECT nome FROM responsaveis WHERE id = ?').get(id);
  if (!r) return res.status(404).json({ error: 'Responsável não encontrado.' });

  const vinculos = db.prepare('SELECT COUNT(*) c FROM aluno_responsaveis WHERE responsavel_id = ?').get(id).c;
  if (vinculos) {
    return res.status(409).json({ error: `Este responsável está vinculado a ${vinculos} aluno(s). Desvincule antes de excluir.` });
  }

  db.prepare('DELETE FROM usuarios WHERE responsavel_id = ?').run(id);
  db.prepare('DELETE FROM responsaveis WHERE id = ?').run(id);
  log(req, 'excluir', 'responsaveis', id, r.nome);
  res.json({ ok: true });
}));

module.exports = router;
