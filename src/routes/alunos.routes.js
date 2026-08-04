// ═══════════════════════════════════════════════════════════════
// CEM — Rotas de Alunos (+ vínculo com responsáveis)
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const { db, log, agora } = require('../db');
const { filtrarCampos, montarInsert, montarUpdate, soNumeros, bool01, rota, idade } = require('../util');

const router = express.Router();

const CAMPOS = [
  'matricula', 'nome', 'nome_social', 'data_nascimento', 'sexo', 'cpf', 'rg',
  'certidao_nascimento', 'nis', 'naturalidade', 'uf_nascimento', 'nacionalidade', 'cor_raca',
  'turma_id', 'ano_letivo', 'turno', 'situacao', 'data_matricula', 'data_saida', 'escola_anterior',
  'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado',
  'tipo_sanguineo', 'alergias', 'medicamentos', 'restricoes_alimentares', 'plano_saude',
  'medico_referencia', 'contato_emergencia', 'telefone_emergencia',
  'necessidades_especiais', 'laudo',
  'autoriza_imagem', 'autoriza_medicamento', 'autoriza_passeio',
  'foto_url', 'observacoes',
];

const CONFLITOS = {
  'alunos.matricula': 'Já existe um aluno com esta matrícula.',
};

/** Normaliza os campos vindos do formulário. */
function preparar(body) {
  const d = filtrarCampos(body, CAMPOS);
  if ('cpf' in d) d.cpf = soNumeros(d.cpf);
  if ('cep' in d) d.cep = soNumeros(d.cep);
  for (const b of ['autoriza_imagem', 'autoriza_medicamento', 'autoriza_passeio']) {
    if (b in d) d[b] = bool01(d[b]);
  }
  if ('turma_id' in d) d.turma_id = d.turma_id ? Number(d.turma_id) : null;
  if ('ano_letivo' in d) d.ano_letivo = d.ano_letivo ? Number(d.ano_letivo) : null;
  return d;
}

/** Próxima matrícula no formato AAAA0001. */
function proximaMatricula() {
  const ano = new Date().getFullYear();
  const row = db.prepare(
    `SELECT matricula FROM alunos WHERE matricula LIKE ? ORDER BY matricula DESC LIMIT 1`
  ).get(`${ano}%`);
  const seq = row ? Number(String(row.matricula).slice(4)) + 1 : 1;
  return `${ano}${String(seq).padStart(4, '0')}`;
}

const SELECT_BASE = `
  SELECT a.*,
         t.nome  AS turma_nome,
         t.turno AS turma_turno,
         t.etapa AS turma_etapa,
         (SELECT COUNT(*) FROM aluno_responsaveis ar WHERE ar.aluno_id = a.id) AS qtd_responsaveis
    FROM alunos a
    LEFT JOIN turmas t ON t.id = a.turma_id
`;

// ── GET /api/alunos ───────────────────────────────────────────
router.get('/', rota((req, res) => {
  const { busca, turma_id, situacao, ano_letivo } = req.query;
  const cond = [];
  const par = [];

  if (busca) {
    cond.push('(a.nome LIKE ? OR a.matricula LIKE ? OR a.cpf LIKE ?)');
    const b = `%${busca}%`;
    par.push(b, b, soNumeros(busca) ? `%${soNumeros(busca)}%` : b);
  }
  if (turma_id) { cond.push('a.turma_id = ?'); par.push(Number(turma_id)); }
  if (situacao) { cond.push('a.situacao = ?'); par.push(situacao); }
  if (ano_letivo) { cond.push('a.ano_letivo = ?'); par.push(Number(ano_letivo)); }

  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : '';
  const linhas = db.prepare(`${SELECT_BASE}${where} ORDER BY a.nome`).all(...par);
  res.json(linhas.map(a => ({ ...a, idade: idade(a.data_nascimento) })));
}));

// ── GET /api/alunos/proxima-matricula ─────────────────────────
router.get('/proxima-matricula', rota((req, res) => {
  res.json({ matricula: proximaMatricula() });
}));

// ── GET /api/alunos/:id ───────────────────────────────────────
router.get('/:id', rota((req, res) => {
  const a = db.prepare(`${SELECT_BASE} WHERE a.id = ?`).get(Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'Aluno não encontrado.' });

  a.idade = idade(a.data_nascimento);
  a.responsaveis = db.prepare(`
    SELECT ar.id AS vinculo_id, ar.parentesco, ar.tipo_vinculo, ar.principal, ar.autorizado_retirar,
           r.id, r.nome, r.cpf, r.telefone, r.whatsapp, r.email, r.profissao
      FROM aluno_responsaveis ar
      JOIN responsaveis r ON r.id = ar.responsavel_id
     WHERE ar.aluno_id = ?
     ORDER BY ar.principal DESC, r.nome
  `).all(a.id);

  res.json(a);
}));

// ── POST /api/alunos ──────────────────────────────────────────
router.post('/', rota((req, res) => {
  const d = preparar(req.body);
  if (!d.nome) return res.status(400).json({ error: 'O nome do aluno é obrigatório.' });
  if (!d.matricula) d.matricula = proximaMatricula();
  if (!d.ano_letivo) d.ano_letivo = new Date().getFullYear();
  if (!d.data_matricula) d.data_matricula = new Date().toISOString().slice(0, 10);
  d.criado_em = agora();

  const { sql, valores } = montarInsert('alunos', d);
  const info = db.prepare(sql).run(...valores);

  // Vínculos de responsáveis enviados junto no cadastro
  vincularLista(info.lastInsertRowid, req.body.responsaveis);

  log(req, 'criar', 'alunos', info.lastInsertRowid, d.nome);
  res.status(201).json({ id: info.lastInsertRowid, matricula: d.matricula });
}, CONFLITOS));

// ── PUT /api/alunos/:id ───────────────────────────────────────
router.put('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const existe = db.prepare('SELECT id FROM alunos WHERE id = ?').get(id);
  if (!existe) return res.status(404).json({ error: 'Aluno não encontrado.' });

  const d = preparar(req.body);
  if ('nome' in d && !d.nome) return res.status(400).json({ error: 'O nome do aluno é obrigatório.' });
  d.atualizado_em = agora();

  const { sql, valores } = montarUpdate('alunos', d, id);
  db.prepare(sql).run(...valores);

  if (Array.isArray(req.body.responsaveis)) {
    db.prepare('DELETE FROM aluno_responsaveis WHERE aluno_id = ?').run(id);
    vincularLista(id, req.body.responsaveis);
  }

  log(req, 'atualizar', 'alunos', id, d.nome || null);
  res.json({ ok: true });
}, CONFLITOS));

// ── DELETE /api/alunos/:id ────────────────────────────────────
router.delete('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const a = db.prepare('SELECT nome FROM alunos WHERE id = ?').get(id);
  if (!a) return res.status(404).json({ error: 'Aluno não encontrado.' });

  db.prepare('DELETE FROM alunos WHERE id = ?').run(id);
  log(req, 'excluir', 'alunos', id, a.nome);
  res.json({ ok: true });
}));

// ── Vínculos com responsáveis ─────────────────────────────────
function vincularLista(alunoId, lista) {
  if (!Array.isArray(lista) || !lista.length) return;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO aluno_responsaveis
      (aluno_id, responsavel_id, parentesco, tipo_vinculo, principal, autorizado_retirar)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const tx = db.transaction(itens => {
    for (const v of itens) {
      if (!v || !v.responsavel_id) continue;
      stmt.run(
        alunoId, Number(v.responsavel_id),
        v.parentesco || null,
        v.tipo_vinculo || 'ambos',
        bool01(v.principal),
        v.autorizado_retirar === undefined ? 1 : bool01(v.autorizado_retirar)
      );
    }
  });
  tx(lista);
}

// POST /api/alunos/:id/responsaveis — vincula um responsável
router.post('/:id/responsaveis', rota((req, res) => {
  const alunoId = Number(req.params.id);
  if (!req.body.responsavel_id) return res.status(400).json({ error: 'Selecione o responsável.' });
  vincularLista(alunoId, [req.body]);
  log(req, 'vincular', 'aluno_responsaveis', alunoId, `resp ${req.body.responsavel_id}`);
  res.status(201).json({ ok: true });
}));

// DELETE /api/alunos/:id/responsaveis/:respId — desvincula
router.delete('/:id/responsaveis/:respId', rota((req, res) => {
  db.prepare('DELETE FROM aluno_responsaveis WHERE aluno_id = ? AND responsavel_id = ?')
    .run(Number(req.params.id), Number(req.params.respId));
  log(req, 'desvincular', 'aluno_responsaveis', Number(req.params.id), `resp ${req.params.respId}`);
  res.json({ ok: true });
}));

module.exports = router;
