// ═══════════════════════════════════════════════════════════════
// CEM — Conciliação bancária (OFX ↔ pagamentos/despesas)
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const { db, log, agora } = require('../db');
const { rota } = require('../util');

const router = express.Router();

const MARGEM_VALOR = 0.01;  // diferença aceitável de centavo
const MARGEM_DIAS  = 3;     // janela de data para matching

// ── Helpers ──────────────────────────────────────────────────

function vinculos(transacaoId) {
  return db.prepare(`
    SELECT v.*, v.entidade, v.entidade_id, v.valor_vinculado
      FROM ofx_vinculos v WHERE v.transacao_id = ?`).all(transacaoId);
}

function sugestoesCREDIT(valor, data, transacaoId) {
  return db.prepare(`
    SELECT p.id, p.valor, p.data_pagamento, p.forma, p.observacoes,
           m.descricao AS mensalidade_desc, m.competencia,
           a.nome AS aluno_nome, a.matricula
      FROM pagamentos p
      LEFT JOIN mensalidades m ON m.id = p.mensalidade_id
      LEFT JOIN alunos a ON a.id = m.aluno_id
     WHERE ABS(p.valor - ?) < ?
       AND p.data_pagamento BETWEEN date(?, '-${MARGEM_DIAS} days')
                                AND date(?, '+${MARGEM_DIAS} days')
       AND NOT EXISTS (
         SELECT 1 FROM ofx_vinculos v
          WHERE v.entidade = 'pagamento' AND v.entidade_id = p.id
       )
     ORDER BY ABS(julianday(p.data_pagamento) - julianday(?))
     LIMIT 5`).all(valor, MARGEM_VALOR, data, data, data);
}

function sugestoesDEBIT(valor, data, transacaoId) {
  return db.prepare(`
    SELECT d.id, d.valor, d.data_pagamento, d.descricao, d.fornecedor,
           cc.nome AS centro_nome
      FROM despesas d
      LEFT JOIN centros_custo cc ON cc.id = d.centro_custo_id
     WHERE ABS(d.valor - ?) < ?
       AND d.data_pagamento BETWEEN date(?, '-${MARGEM_DIAS} days')
                                AND date(?, '+${MARGEM_DIAS} days')
       AND NOT EXISTS (
         SELECT 1 FROM ofx_vinculos v
          WHERE v.entidade = 'despesa' AND v.entidade_id = d.id
       )
     ORDER BY ABS(julianday(d.data_pagamento) - julianday(?))
     LIMIT 5`).all(valor, MARGEM_VALOR, data, data, data);
}

function enriquecerTransacao(t) {
  const links = vinculos(t.id);
  let sugestoes = [];

  if (t.status === 'pendente') {
    sugestoes = t.tipo === 'CREDIT'
      ? sugestoesCREDIT(t.valor, t.data_lancamento, t.id)
      : sugestoesDEBIT(t.valor, t.data_lancamento, t.id);
  }

  return { ...t, vinculos: links, sugestoes };
}

// ══════════════════ TRANSAÇÕES ════════════════════════════════

router.get('/transacoes', rota((req, res) => {
  const { importacao_id, conta_id, status, tipo } = req.query;
  const cond = [];
  const par  = [];

  if (importacao_id) { cond.push('t.importacao_id = ?'); par.push(Number(importacao_id)); }
  if (conta_id)      { cond.push('t.conta_id = ?');      par.push(Number(conta_id)); }
  if (status)        { cond.push('t.status = ?');         par.push(status); }
  if (tipo)          { cond.push('t.tipo = ?');           par.push(tipo); }

  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const lista = db.prepare(`
    SELECT t.*,
           cb.nome AS conta_nome, cb.banco, cb.agencia, cb.conta AS numero_conta,
           i.nome_arquivo, i.periodo_inicio, i.periodo_fim
      FROM ofx_transacoes t
      LEFT JOIN contas_bancarias cb ON cb.id = t.conta_id
      LEFT JOIN importacoes_ofx i ON i.id = t.importacao_id
      ${where}
     ORDER BY t.data_lancamento DESC, t.id DESC
     LIMIT 500`).all(...par);

  res.json(lista.map(enriquecerTransacao));
}));

// ══════════════════ SUGESTÕES ═════════════════════════════════

router.get('/sugestoes/:id', rota((req, res) => {
  const t = db.prepare('SELECT * FROM ofx_transacoes WHERE id = ?').get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Transação não encontrada.' });
  const sugestoes = t.tipo === 'CREDIT'
    ? sugestoesCREDIT(t.valor, t.data_lancamento, t.id)
    : sugestoesDEBIT(t.valor, t.data_lancamento, t.id);
  res.json(sugestoes);
}));

// ══════════════════ ACEITAR / VINCULAR ═══════════════════════

function realizarVinculo(transacaoId, vincData, req) {
  const t = db.prepare('SELECT * FROM ofx_transacoes WHERE id = ?').get(transacaoId);
  if (!t) throw Object.assign(new Error('Transação não encontrada.'), { status: 404 });
  if (t.status === 'descartado') throw Object.assign(new Error('Transação descartada. Restaure antes de vincular.'), { status: 409 });

  if (!Array.isArray(vincData) || !vincData.length)
    throw Object.assign(new Error('Informe ao menos um vínculo.'), { status: 400 });

  const inserir = db.prepare(`
    INSERT OR IGNORE INTO ofx_vinculos (transacao_id, entidade, entidade_id, valor_vinculado, criado_em)
    VALUES (?, ?, ?, ?, ?)`);

  db.transaction(() => {
    for (const v of vincData) {
      if (!v.entidade || !v.entidade_id) continue;
      inserir.run(transacaoId, v.entidade, Number(v.entidade_id), Number(v.valor_vinculado) || t.valor, agora());
    }
    db.prepare(`
      UPDATE ofx_transacoes
         SET status = 'conciliado', conciliado_por = ?, conciliado_nome = ?, conciliado_em = ?
       WHERE id = ?`)
      .run(req.usuario?.id ?? null, req.usuario?.nome ?? null, agora(), transacaoId);
  })();
}

router.post('/aceitar/:id', rota((req, res) => {
  const id = Number(req.params.id);
  realizarVinculo(id, req.body.vinculos, req);
  log(req, 'conciliar', 'ofx_transacoes', id, 'sugestão aceita');
  res.json({ ok: true });
}));

router.post('/vincular/:id', rota((req, res) => {
  const id = Number(req.params.id);
  realizarVinculo(id, req.body.vinculos, req);
  log(req, 'conciliar', 'ofx_transacoes', id, 'vinculação manual');
  res.json({ ok: true });
}));

// ══════════════════ DESVINCULAR ═══════════════════════════════

router.delete('/vinculos/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const t = db.prepare('SELECT id FROM ofx_transacoes WHERE id = ?').get(id);
  if (!t) return res.status(404).json({ error: 'Transação não encontrada.' });
  db.transaction(() => {
    db.prepare('DELETE FROM ofx_vinculos WHERE transacao_id = ?').run(id);
    db.prepare(`UPDATE ofx_transacoes SET status = 'pendente', conciliado_por = NULL,
                conciliado_nome = NULL, conciliado_em = NULL WHERE id = ?`).run(id);
  })();
  log(req, 'desvincular', 'ofx_transacoes', id, null);
  res.json({ ok: true });
}));

// ══════════════════ DESCARTAR / RESTAURAR ═════════════════════

router.post('/descartar/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const t = db.prepare('SELECT id, status FROM ofx_transacoes WHERE id = ?').get(id);
  if (!t) return res.status(404).json({ error: 'Transação não encontrada.' });
  if (t.status === 'conciliado') return res.status(409).json({ error: 'Desvincule antes de descartar.' });
  db.prepare(`UPDATE ofx_transacoes SET status = 'descartado',
              observacoes = ?, conciliado_por = ?, conciliado_nome = ?, conciliado_em = ? WHERE id = ?`)
    .run(req.body.observacoes || null, req.usuario?.id ?? null, req.usuario?.nome ?? null, agora(), id);
  log(req, 'descartar', 'ofx_transacoes', id, null);
  res.json({ ok: true });
}));

router.post('/restaurar/:id', rota((req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM ofx_transacoes WHERE id = ?').get(id))
    return res.status(404).json({ error: 'Transação não encontrada.' });
  db.prepare(`UPDATE ofx_transacoes SET status = 'pendente',
              observacoes = NULL, conciliado_por = NULL, conciliado_nome = NULL, conciliado_em = NULL
              WHERE id = ?`).run(id);
  log(req, 'restaurar', 'ofx_transacoes', id, null);
  res.json({ ok: true });
}));

// ══════════════════ BUSCA MANUAL ═════════════════════════════

router.get('/buscar-pagamentos', rota((req, res) => {
  const { q, de, ate } = req.query;
  const cond = [];
  const par  = [];

  if (de)  { cond.push('p.data_pagamento >= ?'); par.push(de); }
  if (ate) { cond.push('p.data_pagamento <= ?'); par.push(ate); }
  if (q) {
    cond.push('(a.nome LIKE ? OR m.descricao LIKE ? OR m.competencia LIKE ?)');
    const like = `%${q}%`;
    par.push(like, like, like);
  }
  // exclui pagamentos já vinculados a alguma transação
  cond.push(`NOT EXISTS (
    SELECT 1 FROM ofx_vinculos v WHERE v.entidade = 'pagamento' AND v.entidade_id = p.id
  )`);

  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const lista = db.prepare(`
    SELECT p.id, p.valor, p.data_pagamento, p.forma, p.observacoes,
           m.descricao AS mensalidade_desc, m.competencia,
           a.nome AS aluno_nome, a.matricula
      FROM pagamentos p
      LEFT JOIN mensalidades m ON m.id = p.mensalidade_id
      LEFT JOIN alunos a ON a.id = m.aluno_id
      ${where}
     ORDER BY p.data_pagamento DESC LIMIT 100`).all(...par);
  res.json(lista);
}));

router.get('/buscar-despesas', rota((req, res) => {
  const { q, de, ate } = req.query;
  const cond = [];
  const par  = [];

  if (de)  { cond.push('d.data_pagamento >= ?'); par.push(de); }
  if (ate) { cond.push('d.data_pagamento <= ?'); par.push(ate); }
  if (q) {
    cond.push('(d.descricao LIKE ? OR d.fornecedor LIKE ?)');
    const like = `%${q}%`;
    par.push(like, like);
  }
  cond.push(`NOT EXISTS (
    SELECT 1 FROM ofx_vinculos v WHERE v.entidade = 'despesa' AND v.entidade_id = d.id
  )`);

  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const lista = db.prepare(`
    SELECT d.id, d.valor, d.data_pagamento, d.descricao, d.fornecedor,
           cc.nome AS centro_nome
      FROM despesas d
      LEFT JOIN centros_custo cc ON cc.id = d.centro_custo_id
      ${where}
     ORDER BY d.data_pagamento DESC LIMIT 100`).all(...par);
  res.json(lista);
}));

// ══════════════════ RESUMO DA IMPORTAÇÃO ═════════════════════

router.get('/resumo/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const imp = db.prepare(`
    SELECT i.*, cb.nome AS conta_nome, cb.banco, cb.agencia
      FROM importacoes_ofx i
      LEFT JOIN contas_bancarias cb ON cb.id = i.conta_id
     WHERE i.id = ?`).get(id);
  if (!imp) return res.status(404).json({ error: 'Importação não encontrada.' });

  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'pendente'    THEN 1 ELSE 0 END) AS pendentes,
      SUM(CASE WHEN status = 'conciliado'  THEN 1 ELSE 0 END) AS conciliados,
      SUM(CASE WHEN status = 'descartado'  THEN 1 ELSE 0 END) AS descartados,
      SUM(CASE WHEN tipo = 'CREDIT' THEN valor ELSE 0 END) AS total_entradas,
      SUM(CASE WHEN tipo = 'DEBIT'  THEN valor ELSE 0 END) AS total_saidas,
      SUM(CASE WHEN tipo = 'CREDIT' AND status = 'conciliado' THEN valor ELSE 0 END) AS entradas_conciliadas,
      SUM(CASE WHEN tipo = 'DEBIT'  AND status = 'conciliado' THEN valor ELSE 0 END) AS saidas_conciliadas
    FROM ofx_transacoes WHERE importacao_id = ?`).get(id);

  res.json({ importacao: imp, stats });
}));

module.exports = router;
