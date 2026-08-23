// ═══════════════════════════════════════════════════════════════
// CEM — Rotas de Funcionários
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const { db, log, agora } = require('../db');
const { filtrarCampos, montarInsert, montarUpdate, soNumeros, bool01, cpfValido, rota, idade } = require('../util');

const router = express.Router();

const CAMPOS = [
  'matricula', 'nome', 'nome_social', 'cpf', 'rg', 'orgao_expedidor',
  'data_nascimento', 'sexo', 'estado_civil',
  'telefone', 'whatsapp', 'email',
  'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado',
  'cargo', 'setor', 'tipo_contrato', 'data_admissao', 'data_demissao',
  'salario', 'carga_horaria', 'turno', 'formacao', 'especializacao',
  'pis', 'ctps', 'banco', 'agencia', 'conta', 'pix',
  'contato_emergencia', 'telefone_emergencia',
  'foto_url', 'observacoes', 'ativo',
];

const CONFLITOS = {
  'funcionarios.cpf': 'Já existe um funcionário cadastrado com este CPF.',
  'funcionarios.matricula': 'Já existe um funcionário com esta matrícula.',
};

function preparar(body) {
  const d = filtrarCampos(body, CAMPOS);
  if ('cpf' in d) d.cpf = soNumeros(d.cpf);
  if ('cep' in d) d.cep = soNumeros(d.cep);
  if ('ativo' in d) d.ativo = bool01(d.ativo);
  if ('salario' in d) d.salario = d.salario ? Number(String(d.salario).replace(/\./g, '').replace(',', '.')) : null;
  return d;
}

/** Próxima matrícula funcional no formato F0001. */
function proximaMatricula() {
  const row = db.prepare(
    `SELECT matricula FROM funcionarios WHERE matricula LIKE 'F%' ORDER BY matricula DESC LIMIT 1`
  ).get();
  const seq = row ? Number(String(row.matricula).slice(1)) + 1 : 1;
  return `F${String(seq).padStart(4, '0')}`;
}

// ── GET /api/funcionarios ─────────────────────────────────────
router.get('/', rota((req, res) => {
  const { busca, cargo, setor, ativo } = req.query;
  const cond = [];
  const par = [];

  if (busca) {
    cond.push('(f.nome LIKE ? OR f.matricula LIKE ? OR f.cpf LIKE ? OR f.cargo LIKE ?)');
    const b = `%${busca}%`;
    par.push(b, b, b, b);
  }
  if (cargo) { cond.push('f.cargo = ?'); par.push(cargo); }
  if (setor) { cond.push('f.setor = ?'); par.push(setor); }
  if (ativo === '1' || ativo === '0') { cond.push('f.ativo = ?'); par.push(Number(ativo)); }

  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : '';
  const linhas = db.prepare(`
    SELECT f.*,
           (SELECT COUNT(*) FROM turmas t WHERE t.professor_id = f.id AND t.ativa = 1) AS qtd_turmas,
           (SELECT COUNT(*) FROM usuarios u WHERE u.funcionario_id = f.id AND u.ativo = 1) AS tem_acesso
      FROM funcionarios f${where}
     ORDER BY f.nome`).all(...par);
  res.json(linhas.map(f => ({ ...f, idade: idade(f.data_nascimento) })));
}));

// ── GET /api/funcionarios/proxima-matricula ───────────────────
router.get('/proxima-matricula', rota((req, res) => {
  res.json({ matricula: proximaMatricula() });
}));

// ── GET /api/funcionarios/:id ─────────────────────────────────
router.get('/:id', rota((req, res) => {
  const f = db.prepare('SELECT * FROM funcionarios WHERE id = ?').get(Number(req.params.id));
  if (!f) return res.status(404).json({ error: 'Funcionário não encontrado.' });

  f.idade = idade(f.data_nascimento);
  f.turmas = db.prepare(`
    SELECT id, nome, turno, ano_letivo FROM turmas
     WHERE (professor_id = ? OR auxiliar_id = ?) AND ativa = 1
     ORDER BY nome`).all(f.id, f.id);
  f.usuario = db.prepare('SELECT id, login, ativo, ultimo_login FROM usuarios WHERE funcionario_id = ?').get(f.id) || null;
  res.json(f);
}));

// ── POST /api/funcionarios ────────────────────────────────────
router.post('/', rota((req, res) => {
  const d = preparar(req.body);
  if (!d.nome) return res.status(400).json({ error: 'O nome do funcionário é obrigatório.' });
  if (!d.cargo) return res.status(400).json({ error: 'Informe o cargo do funcionário.' });
  if (d.cpf && !cpfValido(d.cpf)) return res.status(400).json({ error: 'CPF inválido.' });
  if (!d.matricula) d.matricula = proximaMatricula();
  d.criado_em = agora();

  const { sql, valores } = montarInsert('funcionarios', d);
  const info = db.prepare(sql).run(...valores);

  log(req, 'criar', 'funcionarios', info.lastInsertRowid, d.nome);
  res.status(201).json({ id: info.lastInsertRowid, matricula: d.matricula });
}, CONFLITOS));

// ── PUT /api/funcionarios/:id ─────────────────────────────────
router.put('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM funcionarios WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Funcionário não encontrado.' });
  }
  const d = preparar(req.body);
  if ('nome' in d && !d.nome) return res.status(400).json({ error: 'O nome do funcionário é obrigatório.' });
  if (d.cpf && !cpfValido(d.cpf)) return res.status(400).json({ error: 'CPF inválido.' });
  d.atualizado_em = agora();

  const { sql, valores } = montarUpdate('funcionarios', d, id);
  db.prepare(sql).run(...valores);

  log(req, 'atualizar', 'funcionarios', id, d.nome || null);
  res.json({ ok: true });
}, CONFLITOS));

// ── DELETE /api/funcionarios/:id ──────────────────────────────
router.delete('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const f = db.prepare('SELECT nome FROM funcionarios WHERE id = ?').get(id);
  if (!f) return res.status(404).json({ error: 'Funcionário não encontrado.' });

  const turmas = db.prepare('SELECT COUNT(*) c FROM turmas WHERE professor_id = ? OR auxiliar_id = ?').get(id, id).c;
  if (turmas) {
    return res.status(409).json({ error: `Este funcionário está vinculado a ${turmas} turma(s). Troque o professor antes de excluir.` });
  }

  db.prepare('DELETE FROM usuarios WHERE funcionario_id = ?').run(id);
  db.prepare('DELETE FROM funcionarios WHERE id = ?').run(id);
  log(req, 'excluir', 'funcionarios', id, f.nome);
  res.json({ ok: true });
}));

module.exports = router;
