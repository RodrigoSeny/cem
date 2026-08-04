// ═══════════════════════════════════════════════════════════════
// CEM — Cobranças variáveis e gerador do movimento mensal
//
// A secretaria cria a cobrança escolhendo alcance (todos, turma,
// turno ou aluno), periodicidade e o modo:
//   • embutir  → soma na mensalidade do mês (documento único)
//   • separada → gera documento próprio (a "extra avulsa")
//
// O gerador varre a competência, junta a mensalidade base com as
// cobranças pendentes e monta o lançamento discriminado.
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const { db, log, agora } = require('../db');
const { filtrarCampos, montarInsert, montarUpdate, bool01, rota } = require('../util');

const router = express.Router();

const PERIODOS = { unica: 0, mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };

/** 'AAAA-MM' + n meses → 'AAAA-MM' */
function somarMeses(competencia, meses) {
  const [ano, mes] = competencia.split('-').map(Number);
  const total = (ano * 12) + (mes - 1) + meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Competências que a cobrança atinge, conforme periodicidade. */
function competenciasDa(c) {
  const passo = PERIODOS[c.periodicidade] ?? 0;
  const vezes = passo === 0 ? 1 : Math.max(1, c.ocorrencias);
  const lista = [];
  for (let i = 0; i < vezes; i++) lista.push(somarMeses(c.competencia_inicio, passo * i));
  return lista;
}

/** Alunos alcançados pelo escopo, no momento da consulta. */
function alunosDoEscopo(c) {
  if (c.escopo === 'aluno') {
    return db.prepare(`SELECT id FROM alunos WHERE id = ? AND situacao = 'matriculado'`).all(c.aluno_id);
  }
  if (c.escopo === 'turma') {
    return db.prepare(`SELECT id FROM alunos WHERE turma_id = ? AND situacao = 'matriculado'`).all(c.turma_id);
  }
  if (c.escopo === 'turno') {
    // O turno vale o da turma; sem turma, cai no turno do próprio aluno
    return db.prepare(`
      SELECT a.id FROM alunos a
        LEFT JOIN turmas t ON t.id = a.turma_id
       WHERE a.situacao = 'matriculado' AND COALESCE(t.turno, a.turno) = ?`).all(c.turno);
  }
  return db.prepare(`SELECT id FROM alunos WHERE situacao = 'matriculado'`).all();
}

/**
 * Cria as linhas que faltam em cobranca_alunos.
 * Roda na criação e de novo antes de gerar o movimento, para pegar
 * quem matriculou depois que a cobrança foi cadastrada.
 */
function sincronizar(cobrancaId) {
  const c = db.prepare('SELECT * FROM cobrancas WHERE id = ?').get(cobrancaId);
  if (!c || !c.ativa) return 0;

  const alunos = alunosDoEscopo(c);
  const competencias = competenciasDa(c);

  const inserir = db.prepare(`
    INSERT OR IGNORE INTO cobranca_alunos (cobranca_id, aluno_id, competencia, valor, criado_em)
    VALUES (?, ?, ?, ?, ?)`);

  let criadas = 0;
  const tx = db.transaction(() => {
    for (const comp of competencias) {
      for (const a of alunos) {
        const r = inserir.run(c.id, a.id, comp, c.valor, agora());
        criadas += r.changes;
      }
    }
  });
  tx();
  return criadas;
}

const SELECT_COBRANCA = `
  SELECT c.*,
         cc.codigo AS centro_codigo, cc.nome AS centro_nome,
         t.nome AS turma_nome,
         a.nome AS aluno_nome,
         (SELECT COUNT(*) FROM cobranca_alunos x WHERE x.cobranca_id = c.id) AS alcancados,
         (SELECT COUNT(*) FROM cobranca_alunos x WHERE x.cobranca_id = c.id AND x.status = 'lancada') AS lancados,
         (SELECT COALESCE(SUM(x.valor),0) FROM cobranca_alunos x WHERE x.cobranca_id = c.id AND x.status <> 'cancelada') AS total_previsto
    FROM cobrancas c
    LEFT JOIN centros_custo cc ON cc.id = c.centro_custo_id
    LEFT JOIN turmas t ON t.id = c.turma_id
    LEFT JOIN alunos a ON a.id = c.aluno_id
`;

// ── GET /api/financeiro/cobrancas ─────────────────────────────
router.get('/', rota((req, res) => {
  const { competencia, ativa, centro_custo_id } = req.query;
  const cond = [];
  const par = [];
  if (ativa === '1' || ativa === '0') { cond.push('c.ativa = ?'); par.push(Number(ativa)); }
  if (centro_custo_id) { cond.push('c.centro_custo_id = ?'); par.push(Number(centro_custo_id)); }
  if (competencia) {
    cond.push(`EXISTS (SELECT 1 FROM cobranca_alunos x WHERE x.cobranca_id = c.id AND x.competencia = ?)`);
    par.push(competencia);
  }
  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : '';
  res.json(db.prepare(`${SELECT_COBRANCA}${where} ORDER BY c.id DESC`).all(...par));
}));

// ── GET /api/financeiro/cobrancas/:id ─────────────────────────
router.get('/:id', rota((req, res) => {
  const c = db.prepare(`${SELECT_COBRANCA} WHERE c.id = ?`).get(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Cobrança não encontrada.' });

  c.competencias = competenciasDa(c);
  c.alunos = db.prepare(`
    SELECT ca.id, ca.competencia, ca.valor, ca.status, ca.mensalidade_id,
           a.id AS aluno_id, a.nome AS aluno_nome, t.nome AS turma_nome
      FROM cobranca_alunos ca
      JOIN alunos a ON a.id = ca.aluno_id
      LEFT JOIN turmas t ON t.id = a.turma_id
     WHERE ca.cobranca_id = ?
     ORDER BY ca.competencia, a.nome`).all(c.id);

  res.json(c);
}));

const CAMPOS = [
  'descricao', 'valor', 'centro_custo_id', 'modo', 'escopo', 'turma_id', 'turno',
  'aluno_id', 'periodicidade', 'competencia_inicio', 'ocorrencias', 'dia_vencimento',
  'observacoes', 'ativa',
];

function preparar(body) {
  const d = filtrarCampos(body, CAMPOS);
  for (const n of ['valor', 'centro_custo_id', 'turma_id', 'aluno_id', 'ocorrencias', 'dia_vencimento']) {
    if (n in d) d[n] = d[n] === null || d[n] === '' ? null : Number(d[n]);
  }
  if ('ativa' in d) d.ativa = bool01(d.ativa);
  return d;
}

// ── POST /api/financeiro/cobrancas ────────────────────────────
router.post('/', rota((req, res) => {
  const d = preparar(req.body);

  if (!d.descricao) return res.status(400).json({ error: 'Descreva a cobrança.' });
  if (!(d.valor > 0)) return res.status(400).json({ error: 'Informe um valor maior que zero.' });
  if (!d.competencia_inicio) return res.status(400).json({ error: 'Informe a competência inicial.' });
  if (d.escopo === 'turma' && !d.turma_id) return res.status(400).json({ error: 'Selecione a turma.' });
  if (d.escopo === 'turno' && !d.turno) return res.status(400).json({ error: 'Selecione o turno.' });
  if (d.escopo === 'aluno' && !d.aluno_id) return res.status(400).json({ error: 'Selecione o aluno.' });

  d.ocorrencias = d.periodicidade === 'unica' ? 1 : (d.ocorrencias || 1);
  d.ativa = 'ativa' in d ? d.ativa : 1;
  d.criado_por = req.usuario?.id ?? null;
  d.criado_nome = req.usuario?.nome ?? null;
  d.criado_em = agora();

  const { sql, valores } = montarInsert('cobrancas', d);
  const info = db.prepare(sql).run(...valores);

  const criadas = sincronizar(info.lastInsertRowid);
  log(req, 'criar', 'cobrancas', info.lastInsertRowid, `${d.descricao} · ${criadas} lançamento(s) previsto(s)`);
  res.status(201).json({ id: info.lastInsertRowid, previstos: criadas });
}));

// ── PUT /api/financeiro/cobrancas/:id ─────────────────────────
router.put('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const atual = db.prepare('SELECT * FROM cobrancas WHERE id = ?').get(id);
  if (!atual) return res.status(404).json({ error: 'Cobrança não encontrada.' });

  const lancadas = db.prepare(
    `SELECT COUNT(*) c FROM cobranca_alunos WHERE cobranca_id = ? AND status = 'lancada'`).get(id).c;
  if (lancadas && (req.body.valor !== undefined || req.body.escopo !== undefined)) {
    return res.status(409).json({
      error: `Esta cobrança já foi lançada para ${lancadas} aluno(s). Valor e alcance não podem mudar — cancele e crie outra.`,
    });
  }

  const d = preparar(req.body);
  if (!Object.keys(d).length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });

  const { sql, valores } = montarUpdate('cobrancas', d, id);
  db.prepare(sql).run(...valores);

  // Valor mudou: reflete nas linhas ainda pendentes
  if (d.valor !== undefined) {
    db.prepare(`UPDATE cobranca_alunos SET valor = ? WHERE cobranca_id = ? AND status = 'pendente'`)
      .run(d.valor, id);
  }
  sincronizar(id);

  log(req, 'atualizar', 'cobrancas', id, atual.descricao);
  res.json({ ok: true });
}));

// ── DELETE /api/financeiro/cobrancas/:id ──────────────────────
router.delete('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const c = db.prepare('SELECT descricao FROM cobrancas WHERE id = ?').get(id);
  if (!c) return res.status(404).json({ error: 'Cobrança não encontrada.' });

  const lancadas = db.prepare(
    `SELECT COUNT(*) c FROM cobranca_alunos WHERE cobranca_id = ? AND status = 'lancada'`).get(id).c;
  if (lancadas) {
    return res.status(409).json({
      error: `Já lançada para ${lancadas} aluno(s). Desative-a em vez de excluir — o histórico precisa continuar.`,
    });
  }

  db.prepare('DELETE FROM cobrancas WHERE id = ?').run(id);
  log(req, 'excluir', 'cobrancas', id, c.descricao);
  res.json({ ok: true });
}));

// ── DELETE .../cobrancas/:id/alunos/:alunoId — tira alguém ────
router.delete('/:id/alunos/:alunoId', rota((req, res) => {
  const info = db.prepare(`
    UPDATE cobranca_alunos SET status = 'cancelada'
     WHERE cobranca_id = ? AND aluno_id = ? AND status = 'pendente'`)
    .run(Number(req.params.id), Number(req.params.alunoId));

  if (!info.changes) return res.status(409).json({ error: 'Já foi lançada para este aluno.' });
  log(req, 'cancelar', 'cobranca_alunos', Number(req.params.id), `aluno ${req.params.alunoId}`);
  res.json({ ok: true });
}));

// ══════════════════ MOVIMENTO MENSAL ══════════════════════════

/** Monta o que cada aluno deve na competência, sem gravar nada. */
function montarPrevia(competencia) {
  // Sincroniza antes: pega quem matriculou depois da cobrança criada
  for (const c of db.prepare('SELECT id FROM cobrancas WHERE ativa = 1').all()) sincronizar(c.id);

  const pendentes = db.prepare(`
    SELECT ca.id, ca.aluno_id, ca.valor, ca.competencia,
           c.id AS cobranca_id, c.descricao, c.modo, c.centro_custo_id, c.dia_vencimento,
           cc.codigo AS centro_codigo
      FROM cobranca_alunos ca
      JOIN cobrancas c ON c.id = ca.cobranca_id
      LEFT JOIN centros_custo cc ON cc.id = c.centro_custo_id
     WHERE ca.competencia = ? AND ca.status = 'pendente' AND c.ativa = 1`).all(competencia);

  const mensalidades = db.prepare(`
    SELECT m.id, m.aluno_id, m.competencia, m.descricao, m.vencimento, m.status,
           m.valor_original, m.valor_desconto, m.valor_acrescimo,
           a.nome AS aluno_nome, t.nome AS turma_nome
      FROM mensalidades m
      JOIN alunos a ON a.id = m.aluno_id
      LEFT JOIN turmas t ON t.id = a.turma_id
     WHERE m.competencia = ? AND m.origem = 'contrato' AND m.status <> 'cancelada'`).all(competencia);

  const porAluno = new Map();
  const nomeAluno = id => db.prepare('SELECT nome FROM alunos WHERE id = ?').get(id)?.nome || '—';

  for (const m of mensalidades) {
    porAluno.set(m.aluno_id, {
      aluno_id: m.aluno_id, aluno_nome: m.aluno_nome, turma_nome: m.turma_nome,
      mensalidade_id: m.id, vencimento: m.vencimento, ja_paga: m.status === 'paga',
      base: Number((m.valor_original - m.valor_desconto).toFixed(2)),
      acrescimo_atual: Number(m.valor_acrescimo),
      embutidas: [], separadas: [],
    });
  }

  for (const p of pendentes) {
    let linha = porAluno.get(p.aluno_id);
    if (!linha) {
      // Aluno sem mensalidade de contrato na competência (ex.: só cobrança avulsa)
      linha = {
        aluno_id: p.aluno_id, aluno_nome: nomeAluno(p.aluno_id), turma_nome: null,
        mensalidade_id: null, vencimento: null, ja_paga: false,
        base: 0, acrescimo_atual: 0, embutidas: [], separadas: [],
      };
      porAluno.set(p.aluno_id, linha);
    }
    (p.modo === 'separada' ? linha.separadas : linha.embutidas).push(p);
  }

  const linhas = [...porAluno.values()].map(l => {
    const somaEmbutidas = l.embutidas.reduce((s, x) => s + x.valor, 0);
    const somaSeparadas = l.separadas.reduce((s, x) => s + x.valor, 0);
    return {
      ...l,
      soma_embutidas: Number(somaEmbutidas.toFixed(2)),
      soma_separadas: Number(somaSeparadas.toFixed(2)),
      total_documento: Number((l.base + l.acrescimo_atual + somaEmbutidas).toFixed(2)),
    };
  }).filter(l => l.mensalidade_id || l.embutidas.length || l.separadas.length)
    .sort((a, b) => a.aluno_nome.localeCompare(b.aluno_nome, 'pt-BR'));

  return {
    competencia,
    linhas,
    totais: {
      alunos: linhas.length,
      mensalidades: Number(linhas.reduce((s, l) => s + l.total_documento, 0).toFixed(2)),
      extras: Number(linhas.reduce((s, l) => s + l.soma_separadas, 0).toFixed(2)),
      cobrancas_pendentes: pendentes.length,
    },
  };
}

// ── GET /api/financeiro/cobrancas/movimento/previa?competencia= ──
router.get('/movimento/previa', rota((req, res) => {
  const competencia = String(req.query.competencia || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(competencia)) {
    return res.status(400).json({ error: 'Informe a competência no formato AAAA-MM.' });
  }
  res.json(montarPrevia(competencia));
}));

// ── POST /api/financeiro/cobrancas/movimento/gerar ────────────
router.post('/movimento/gerar', rota((req, res) => {
  const competencia = String(req.body.competencia || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(competencia)) {
    return res.status(400).json({ error: 'Informe a competência no formato AAAA-MM.' });
  }

  const previa = montarPrevia(competencia);
  if (!previa.linhas.length) return res.status(400).json({ error: 'Nada a lançar nesta competência.' });

  const inserirItem = db.prepare(`
    INSERT INTO mensalidade_itens (mensalidade_id, descricao, valor, tipo, centro_custo_id, cobranca_id, ordem)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const marcar = db.prepare(`UPDATE cobranca_alunos SET status = 'lancada', mensalidade_id = ? WHERE id = ?`);

  let embutidas = 0, criadasSeparadas = 0, documentos = 0;

  const gerar = db.transaction(() => {
    for (const l of previa.linhas) {
      // ── Embutidas: entram na mensalidade do mês ──────────────
      if (l.embutidas.length && l.mensalidade_id && !l.ja_paga) {
        const ordemBase = db.prepare(
          'SELECT COALESCE(MAX(ordem), 0) o FROM mensalidade_itens WHERE mensalidade_id = ?'
        ).get(l.mensalidade_id).o;

        let i = 1;
        for (const c of l.embutidas) {
          inserirItem.run(l.mensalidade_id, c.descricao, c.valor, 'cobranca',
                          c.centro_custo_id, c.cobranca_id, ordemBase + i++);
          marcar.run(l.mensalidade_id, c.id);
          embutidas++;
        }

        db.prepare(`UPDATE mensalidades SET valor_acrescimo = valor_acrescimo + ? WHERE id = ?`)
          .run(l.soma_embutidas, l.mensalidade_id);
        documentos++;
      }

      // ── Separadas: documento próprio por cobrança ────────────
      for (const c of l.separadas) {
        const contrato = db.prepare(`
          SELECT id FROM contratos_financeiros WHERE aluno_id = ? AND status = 'ativo'
           ORDER BY ano_letivo DESC LIMIT 1`).get(l.aluno_id);
        if (!contrato) continue;   // sem contrato não há a quem cobrar

        const dia = c.dia_vencimento || 10;
        const [ano, mes] = competencia.split('-').map(Number);
        const ultimo = new Date(ano, mes, 0).getDate();
        const vencimento = `${competencia}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`;

        const info = db.prepare(`
          INSERT INTO mensalidades (contrato_id, aluno_id, competencia, parcela, descricao,
                                    valor_original, vencimento, status, origem, criado_em)
          VALUES (?, ?, ?, NULL, ?, ?, ?, 'aberta', 'cobranca', ?)`)
          .run(contrato.id, l.aluno_id, competencia, c.descricao, c.valor, vencimento, agora());

        inserirItem.run(info.lastInsertRowid, c.descricao, c.valor, 'cobranca',
                        c.centro_custo_id, c.cobranca_id, 0);
        marcar.run(info.lastInsertRowid, c.id);
        criadasSeparadas++;
      }
    }
  });

  gerar();

  log(req, 'gerar-movimento', 'mensalidades', null,
      `${competencia}: ${embutidas} embutida(s) em ${documentos} documento(s), ${criadasSeparadas} avulsa(s)`);

  res.json({ ok: true, competencia, embutidas, documentos, separadas: criadasSeparadas });
}));

module.exports = { router, montarPrevia, sincronizar };
