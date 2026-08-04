// ═══════════════════════════════════════════════════════════════
// CEM — API do PWA
//
// Atende os dois públicos do aplicativo:
//   • responsável → vê apenas os alunos vinculados ao seu cadastro
//   • funcionário → consulta rápida de alunos/turmas/contatos,
//     respeitando as páginas liberadas no perfil
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const { db, log, agora } = require('../db');
const { rota, idade } = require('../util');
const { temPagina } = require('../auth');

const router = express.Router();

/** Quantas mensagens o responsável ainda não leu. */
function naoLidas(responsavelId) {
  return db.prepare(`
    SELECT COUNT(*) c FROM mensagem_destinatarios
     WHERE responsavel_id = ? AND lido_em IS NULL`).get(responsavelId).c;
}

/** Quantas aguardam ciência. */
function aguardandoCiencia(responsavelId) {
  return db.prepare(`
    SELECT COUNT(*) c
      FROM mensagem_destinatarios d
      JOIN mensagens m ON m.id = d.mensagem_id
     WHERE d.responsavel_id = ? AND m.exige_ciencia = 1 AND d.ciente_em IS NULL`).get(responsavelId).c;
}

/** IDs dos alunos que o responsável logado pode consultar. */
function alunosDoResponsavel(responsavelId) {
  return db.prepare('SELECT aluno_id FROM aluno_responsaveis WHERE responsavel_id = ?')
    .all(responsavelId).map(r => r.aluno_id);
}

function podeVerAluno(usuario, alunoId) {
  if (usuario.tipo === 'funcionario') return temPagina(usuario, 'alunos') || temPagina(usuario, 'turmas');
  return alunosDoResponsavel(usuario.responsavel_id).includes(Number(alunoId));
}

// ── GET /api/portal/inicio — resumo da tela inicial do app ────
router.get('/inicio', rota((req, res) => {
  const u = req.usuario;

  if (u.tipo === 'responsavel') {
    const alunos = db.prepare(`
      SELECT a.id, a.nome, a.matricula, a.foto_url, a.situacao, a.data_nascimento,
             a.turno, t.nome AS turma_nome, t.turno AS turma_turno,
             p.nome AS professor_nome,
             ar.parentesco, ar.tipo_vinculo
        FROM aluno_responsaveis ar
        JOIN alunos a ON a.id = ar.aluno_id
        LEFT JOIN turmas t ON t.id = a.turma_id
        LEFT JOIN funcionarios p ON p.id = t.professor_id
       WHERE ar.responsavel_id = ?
       ORDER BY a.nome`).all(u.responsavel_id);

    const resp = db.prepare('SELECT nome, telefone, whatsapp, email FROM responsaveis WHERE id = ?')
      .get(u.responsavel_id) || {};

    // Situação financeira consolidada dos filhos
    const financeiro = alunos.length ? db.prepare(`
      SELECT COUNT(*) parcelas,
             COALESCE(SUM(m.valor_original - m.valor_desconto + m.valor_acrescimo
               - (SELECT COALESCE(SUM(p.valor),0) FROM pagamentos p WHERE p.mensalidade_id = m.id)), 0) total
        FROM mensalidades m
       WHERE m.status = 'aberta' AND m.vencimento < date('now','localtime')
         AND m.aluno_id IN (${alunos.map(() => '?').join(',')})`)
      .get(...alunos.map(a => a.id)) : { parcelas: 0, total: 0 };

    return res.json({
      perfil: 'responsavel',
      nome: u.nome,
      responsavel: resp,
      alunos: alunos.map(a => ({ ...a, idade: idade(a.data_nascimento) })),
      nao_lidas: naoLidas(u.responsavel_id),
      aguardando_ciencia: aguardandoCiencia(u.responsavel_id),
      financeiro_vencido: { parcelas: financeiro.parcelas, total: Number(Number(financeiro.total).toFixed(2)) },
    });
  }

  // Funcionário
  const f = u.funcionario_id
    ? db.prepare('SELECT nome, cargo, setor, telefone FROM funcionarios WHERE id = ?').get(u.funcionario_id)
    : null;

  const minhasTurmas = u.funcionario_id ? db.prepare(`
    SELECT t.id, t.nome, t.turno, t.sala, t.capacidade,
           (SELECT COUNT(*) FROM alunos a WHERE a.turma_id = t.id AND a.situacao = 'matriculado') AS qtd_alunos
      FROM turmas t
     WHERE t.ativa = 1 AND (t.professor_id = ? OR t.auxiliar_id = ?)
     ORDER BY t.nome`).all(u.funcionario_id, u.funcionario_id) : [];

  const totais = db.prepare(`
    SELECT (SELECT COUNT(*) FROM alunos WHERE situacao = 'matriculado') AS alunos,
           (SELECT COUNT(*) FROM turmas WHERE ativa = 1)                AS turmas,
           (SELECT COUNT(*) FROM funcionarios WHERE ativo = 1)          AS funcionarios`).get();

  res.json({ perfil: 'funcionario', nome: u.nome, funcionario: f, minhasTurmas, totais });
}));

// ── GET /api/portal/alunos — busca (funcionário) / lista (responsável) ──
router.get('/alunos', rota((req, res) => {
  const u = req.usuario;
  const busca = String(req.query.busca || '').trim();

  if (u.tipo === 'responsavel') {
    const ids = alunosDoResponsavel(u.responsavel_id);
    if (!ids.length) return res.json([]);
    return res.json(db.prepare(`
      SELECT a.id, a.nome, a.matricula, a.situacao, t.nome AS turma_nome
        FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id
       WHERE a.id IN (${ids.map(() => '?').join(',')})
       ORDER BY a.nome`).all(...ids));
  }

  if (!temPagina(u, 'alunos') && !temPagina(u, 'turmas')) {
    return res.status(403).json({ error: 'Sem permissão para consultar alunos.' });
  }

  const par = [];
  let where = `WHERE a.situacao = 'matriculado'`;
  if (busca) { where += ' AND (a.nome LIKE ? OR a.matricula LIKE ?)'; par.push(`%${busca}%`, `%${busca}%`); }

  res.json(db.prepare(`
    SELECT a.id, a.nome, a.matricula, a.situacao, a.foto_url, t.nome AS turma_nome
      FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id
      ${where}
     ORDER BY a.nome LIMIT 60`).all(...par));
}));

// ── GET /api/portal/alunos/:id — ficha resumida ───────────────
router.get('/alunos/:id', rota((req, res) => {
  const id = Number(req.params.id);
  if (!podeVerAluno(req.usuario, id)) {
    return res.status(403).json({ error: 'Você não tem acesso a este aluno.' });
  }

  const a = db.prepare(`
    SELECT a.id, a.nome, a.nome_social, a.matricula, a.data_nascimento, a.sexo, a.situacao,
           a.foto_url, a.turno, a.data_matricula,
           a.tipo_sanguineo, a.alergias, a.medicamentos, a.restricoes_alimentares,
           a.plano_saude, a.medico_referencia, a.contato_emergencia, a.telefone_emergencia,
           a.necessidades_especiais,
           a.autoriza_imagem, a.autoriza_medicamento, a.autoriza_passeio,
           t.nome AS turma_nome, t.turno AS turma_turno, t.sala AS turma_sala,
           p.nome AS professor_nome
      FROM alunos a
      LEFT JOIN turmas t ON t.id = a.turma_id
      LEFT JOIN funcionarios p ON p.id = t.professor_id
     WHERE a.id = ?`).get(id);

  if (!a) return res.status(404).json({ error: 'Aluno não encontrado.' });
  a.idade = idade(a.data_nascimento);

  a.responsaveis = db.prepare(`
    SELECT r.nome, r.telefone, r.whatsapp, r.email,
           ar.parentesco, ar.tipo_vinculo, ar.principal, ar.autorizado_retirar
      FROM aluno_responsaveis ar
      JOIN responsaveis r ON r.id = ar.responsavel_id
     WHERE ar.aluno_id = ?
     ORDER BY ar.principal DESC, r.nome`).all(id);

  res.json(a);
}));

// ── GET /api/portal/turmas/:id — lista da turma (funcionário) ──
router.get('/turmas/:id', rota((req, res) => {
  const u = req.usuario;
  if (u.tipo !== 'funcionario') return res.status(403).json({ error: 'Consulta disponível para funcionários.' });
  if (!temPagina(u, 'turmas') && !temPagina(u, 'alunos')) {
    return res.status(403).json({ error: 'Sem permissão para consultar turmas.' });
  }

  const t = db.prepare(`
    SELECT t.*, p.nome AS professor_nome FROM turmas t
      LEFT JOIN funcionarios p ON p.id = t.professor_id
     WHERE t.id = ?`).get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Turma não encontrada.' });

  t.alunos = db.prepare(`
    SELECT a.id, a.nome, a.matricula, a.data_nascimento, a.alergias, a.necessidades_especiais
      FROM alunos a WHERE a.turma_id = ? AND a.situacao = 'matriculado' ORDER BY a.nome`).all(t.id)
    .map(a => ({ ...a, idade: idade(a.data_nascimento) }));

  res.json(t);
}));

// ── GET /api/portal/contatos — agenda de contatos da turma ────
router.get('/contatos', rota((req, res) => {
  const u = req.usuario;
  if (u.tipo !== 'funcionario') return res.status(403).json({ error: 'Consulta disponível para funcionários.' });
  if (!temPagina(u, 'responsaveis') && !temPagina(u, 'alunos')) {
    return res.status(403).json({ error: 'Sem permissão para consultar contatos.' });
  }

  const turmaId = req.query.turma_id ? Number(req.query.turma_id) : null;
  const par = [];
  let where = `WHERE a.situacao = 'matriculado'`;
  if (turmaId) { where += ' AND a.turma_id = ?'; par.push(turmaId); }

  res.json(db.prepare(`
    SELECT a.nome AS aluno_nome, t.nome AS turma_nome,
           r.nome AS responsavel_nome, r.telefone, r.whatsapp, r.email,
           ar.parentesco, ar.principal
      FROM aluno_responsaveis ar
      JOIN alunos a       ON a.id = ar.aluno_id
      JOIN responsaveis r ON r.id = ar.responsavel_id
      LEFT JOIN turmas t  ON t.id = a.turma_id
      ${where}
     ORDER BY a.nome, ar.principal DESC`).all(...par));
}));

// ══════════════════════ MENSAGERIA ════════════════════════════

// ── GET /api/portal/mensagens — caixa de entrada do responsável ──
router.get('/mensagens', rota((req, res) => {
  const u = req.usuario;
  if (u.tipo !== 'responsavel') return res.status(403).json({ error: 'Caixa de mensagens do responsável.' });

  res.json(db.prepare(`
    SELECT d.id AS destinatario_id, d.lido_em, d.ciente_em, d.aluno_id,
           m.id, m.titulo, m.conteudo, m.tipo, m.exige_ciencia, m.criado_em, m.criado_nome,
           a.nome AS aluno_nome
      FROM mensagem_destinatarios d
      JOIN mensagens m ON m.id = d.mensagem_id
      LEFT JOIN alunos a ON a.id = d.aluno_id
     WHERE d.responsavel_id = ?
     ORDER BY m.id DESC LIMIT 200`).all(u.responsavel_id));
}));

// ── GET /api/portal/mensagens/nao-lidas — badge do app ────────
router.get('/mensagens/nao-lidas', rota((req, res) => {
  const u = req.usuario;
  if (u.tipo !== 'responsavel') return res.json({ nao_lidas: 0, aguardando_ciencia: 0 });
  res.json({
    nao_lidas: naoLidas(u.responsavel_id),
    aguardando_ciencia: aguardandoCiencia(u.responsavel_id),
  });
}));

// ── POST /api/portal/mensagens/:id/lida ───────────────────────
router.post('/mensagens/:id/lida', rota((req, res) => {
  const u = req.usuario;
  if (u.tipo !== 'responsavel') return res.status(403).json({ error: 'Apenas o responsável marca a leitura.' });

  const info = db.prepare(`
    UPDATE mensagem_destinatarios SET lido_em = ?
     WHERE mensagem_id = ? AND responsavel_id = ? AND lido_em IS NULL`)
    .run(agora(), Number(req.params.id), u.responsavel_id);

  res.json({ ok: true, marcadas: info.changes });
}));

// ── POST /api/portal/mensagens/:id/ciente ─────────────────────
router.post('/mensagens/:id/ciente', rota((req, res) => {
  const u = req.usuario;
  if (u.tipo !== 'responsavel') return res.status(403).json({ error: 'Apenas o responsável dá ciência.' });

  const id = Number(req.params.id);
  const alvo = db.prepare(`
    SELECT d.id FROM mensagem_destinatarios d
     WHERE d.mensagem_id = ? AND d.responsavel_id = ?`).all(id, u.responsavel_id);
  if (!alvo.length) return res.status(404).json({ error: 'Mensagem não encontrada.' });

  const quando = agora();
  db.prepare(`
    UPDATE mensagem_destinatarios
       SET ciente_em = COALESCE(ciente_em, ?), lido_em = COALESCE(lido_em, ?)
     WHERE mensagem_id = ? AND responsavel_id = ?`)
    .run(quando, quando, id, u.responsavel_id);

  log(req, 'ciencia', 'mensagens', id, `Ciência de ${u.nome}`);
  res.json({ ok: true, ciente_em: quando });
}));

// ══════════════════════ OCORRÊNCIAS ═══════════════════════════

// ── GET /api/portal/alunos/:id/ocorrencias ────────────────────
router.get('/alunos/:id/ocorrencias', rota((req, res) => {
  const id = Number(req.params.id);
  if (!podeVerAluno(req.usuario, id)) return res.status(403).json({ error: 'Você não tem acesso a este aluno.' });

  // Responsável vê apenas as ocorrências compartilhadas
  const filtro = req.usuario.tipo === 'responsavel' ? 'AND o.visivel_responsavel = 1' : '';
  const linhas = db.prepare(`
    SELECT o.id, o.tipo, o.gravidade, o.titulo, o.descricao, o.data_ocorrencia,
           o.hora_ocorrencia, o.local_ocorrencia, o.providencia, o.registrado_nome,
           (SELECT COUNT(*) FROM anexos an WHERE an.entidade = 'ocorrencia' AND an.entidade_id = o.id) AS qtd_anexos
      FROM ocorrencias o
     WHERE o.aluno_id = ? ${filtro}
     ORDER BY o.data_ocorrencia DESC, o.id DESC LIMIT 100`).all(id);

  for (const o of linhas) {
    o.anexos = db.prepare(`
      SELECT id, categoria, nome_original, mime FROM anexos
       WHERE entidade = 'ocorrencia' AND entidade_id = ?`).all(o.id);
  }
  res.json(linhas);
}));

// ══════════════════════ FINANCEIRO ════════════════════════════

// ── GET /api/portal/alunos/:id/financeiro ─────────────────────
router.get('/alunos/:id/financeiro', rota((req, res) => {
  const id = Number(req.params.id);
  if (!podeVerAluno(req.usuario, id)) return res.status(403).json({ error: 'Você não tem acesso a este aluno.' });

  const parcelas = db.prepare(`
    SELECT m.id, m.competencia, m.parcela, m.descricao, m.vencimento, m.status,
           m.valor_original, m.valor_desconto, m.valor_acrescimo,
           (SELECT COALESCE(SUM(p.valor),0) FROM pagamentos p WHERE p.mensalidade_id = m.id) AS valor_pago
      FROM mensalidades m
     WHERE m.aluno_id = ? AND m.status <> 'cancelada'
     ORDER BY m.vencimento`).all(id);

  const hoje = new Date().toISOString().slice(0, 10);
  const detalhadas = parcelas.map(m => {
    const total = Number(m.valor_original) - Number(m.valor_desconto) + Number(m.valor_acrescimo);
    const saldo = Number((total - Number(m.valor_pago)).toFixed(2));
    const vencida = m.status === 'aberta' && m.vencimento < hoje;
    return {
      ...m,
      valor_total: Number(total.toFixed(2)),
      saldo,
      situacao: m.status === 'paga' ? 'paga' : (vencida ? 'vencida' : 'aberta'),
    };
  });

  const abertas = detalhadas.filter(m => m.status === 'aberta');
  res.json({
    parcelas: detalhadas,
    totais: {
      pago: Number(detalhadas.reduce((s, m) => s + Number(m.valor_pago), 0).toFixed(2)),
      em_aberto: Number(abertas.reduce((s, m) => s + m.saldo, 0).toFixed(2)),
      vencido: Number(abertas.filter(m => m.situacao === 'vencida').reduce((s, m) => s + m.saldo, 0).toFixed(2)),
    },
  });
}));

module.exports = router;
