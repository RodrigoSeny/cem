// ═══════════════════════════════════════════════════════════════
// CEM — Centros de custo e despesas
//
// O centro de custo amarra receita e despesa. É o que responde
// "a Festa da Criança arrecadou quanto, custou quanto, e quantos
// boletos ainda faltam entrar".
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const { db, log, agora } = require('../db');
const { filtrarCampos, montarInsert, montarUpdate, bool01, rota } = require('../util');

const centros = express.Router();
const despesas = express.Router();

// ══════════════════════ CENTROS DE CUSTO ══════════════════════

const CAMPOS_CENTRO = [
  'codigo', 'nome', 'descricao', 'tipo', 'data_inicio', 'data_fim',
  'orcamento_previsto', 'ativo',
];

const CONFLITO_CENTRO = { 'centros_custo.codigo': 'Já existe um centro de custo com este código.' };

/** Receita e despesa consolidadas de um centro. */
function fechamento(centroId) {
  const receita = db.prepare(`
    SELECT COALESCE(SUM(i.valor), 0) previsto,
           COALESCE(SUM(CASE WHEN m.status = 'paga' THEN i.valor ELSE 0 END), 0) recebido,
           COUNT(*) itens,
           SUM(CASE WHEN m.status = 'paga' THEN 1 ELSE 0 END) itens_pagos
      FROM mensalidade_itens i
      JOIN mensalidades m ON m.id = i.mensalidade_id
     WHERE i.centro_custo_id = ? AND m.status <> 'cancelada'`).get(centroId);

  const despesa = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) total,
           COALESCE(SUM(CASE WHEN status = 'paga' THEN valor ELSE 0 END), 0) pago,
           COUNT(*) qtd
      FROM despesas WHERE centro_custo_id = ? AND status <> 'cancelada'`).get(centroId);

  const arred = v => Number(Number(v).toFixed(2));
  return {
    receita_prevista: arred(receita.previsto),
    receita_recebida: arred(receita.recebido),
    receita_pendente: arred(receita.previsto - receita.recebido),
    itens: receita.itens,
    itens_pagos: receita.itens_pagos || 0,
    despesa_total: arred(despesa.total),
    despesa_paga: arred(despesa.pago),
    despesas_qtd: despesa.qtd,
    saldo_previsto: arred(receita.previsto - despesa.total),
    saldo_realizado: arred(receita.recebido - despesa.pago),
  };
}

centros.get('/', rota((req, res) => {
  const { ativo } = req.query;
  const where = (ativo === '1' || ativo === '0') ? ' WHERE ativo = ?' : '';
  const par = where ? [Number(ativo)] : [];

  const linhas = db.prepare(`SELECT * FROM centros_custo${where} ORDER BY ativo DESC, nome`).all(...par);
  res.json(linhas.map(c => ({ ...c, ...fechamento(c.id) })));
}));

centros.get('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const c = db.prepare('SELECT * FROM centros_custo WHERE id = ?').get(id);
  if (!c) return res.status(404).json({ error: 'Centro de custo não encontrado.' });

  c.resumo = fechamento(id);

  c.cobrancas = db.prepare(`
    SELECT cb.id, cb.descricao, cb.valor, cb.modo, cb.escopo, cb.periodicidade,
           (SELECT COUNT(*) FROM cobranca_alunos x WHERE x.cobranca_id = cb.id AND x.status <> 'cancelada') AS alunos
      FROM cobrancas cb WHERE cb.centro_custo_id = ? ORDER BY cb.id DESC`).all(id);

  c.recebimentos = db.prepare(`
    SELECT i.descricao, i.valor, m.competencia, m.vencimento, m.status,
           a.nome AS aluno_nome, t.nome AS turma_nome
      FROM mensalidade_itens i
      JOIN mensalidades m ON m.id = i.mensalidade_id
      JOIN alunos a ON a.id = m.aluno_id
      LEFT JOIN turmas t ON t.id = a.turma_id
     WHERE i.centro_custo_id = ? AND m.status <> 'cancelada'
     ORDER BY m.status, a.nome LIMIT 500`).all(id);

  c.despesas = db.prepare(`
    SELECT id, descricao, fornecedor, valor, vencimento, data_pagamento, status
      FROM despesas WHERE centro_custo_id = ? ORDER BY vencimento`).all(id);

  res.json(c);
}));

centros.post('/', rota((req, res) => {
  const d = filtrarCampos(req.body, CAMPOS_CENTRO);
  if (!d.nome) return res.status(400).json({ error: 'Informe o nome do centro de custo.' });

  if (!d.codigo) {
    // Gera um código legível a partir do nome: FESTA-CRIANCA-2026
    const base = d.nome.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20);
    d.codigo = `${base}-${new Date().getFullYear()}`;
  }
  d.orcamento_previsto = Number(d.orcamento_previsto) || 0;
  d.ativo = 'ativo' in d ? bool01(d.ativo) : 1;
  d.criado_em = agora();

  const { sql, valores } = montarInsert('centros_custo', d);
  const info = db.prepare(sql).run(...valores);
  log(req, 'criar', 'centros_custo', info.lastInsertRowid, `${d.codigo} · ${d.nome}`);
  res.status(201).json({ id: info.lastInsertRowid, codigo: d.codigo });
}, CONFLITO_CENTRO));

centros.put('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM centros_custo WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Centro de custo não encontrado.' });
  }
  const d = filtrarCampos(req.body, CAMPOS_CENTRO);
  if (!Object.keys(d).length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
  if ('ativo' in d) d.ativo = bool01(d.ativo);
  if ('orcamento_previsto' in d) d.orcamento_previsto = Number(d.orcamento_previsto) || 0;

  const { sql, valores } = montarUpdate('centros_custo', d, id);
  db.prepare(sql).run(...valores);
  log(req, 'atualizar', 'centros_custo', id, d.nome || null);
  res.json({ ok: true });
}, CONFLITO_CENTRO));

centros.delete('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const usos = db.prepare('SELECT COUNT(*) c FROM mensalidade_itens WHERE centro_custo_id = ?').get(id).c
             + db.prepare('SELECT COUNT(*) c FROM despesas WHERE centro_custo_id = ?').get(id).c
             + db.prepare('SELECT COUNT(*) c FROM cobrancas WHERE centro_custo_id = ?').get(id).c;
  if (usos) {
    return res.status(409).json({ error: `Existem ${usos} lançamento(s) neste centro. Desative-o em vez de excluir.` });
  }
  db.prepare('DELETE FROM centros_custo WHERE id = ?').run(id);
  log(req, 'excluir', 'centros_custo', id, null);
  res.json({ ok: true });
}));

// ══════════════════════ DESPESAS ══════════════════════════════

const CAMPOS_DESPESA = [
  'descricao', 'fornecedor', 'documento', 'valor', 'centro_custo_id',
  'competencia', 'vencimento', 'data_pagamento', 'forma', 'status', 'observacoes',
];

function prepararDespesa(body) {
  const d = filtrarCampos(body, CAMPOS_DESPESA);
  if ('valor' in d) d.valor = Number(d.valor) || 0;
  if ('centro_custo_id' in d) d.centro_custo_id = d.centro_custo_id ? Number(d.centro_custo_id) : null;
  return d;
}

despesas.get('/', rota((req, res) => {
  const { centro_custo_id, status, de, ate } = req.query;
  const cond = [];
  const par = [];
  if (centro_custo_id) { cond.push('d.centro_custo_id = ?'); par.push(Number(centro_custo_id)); }
  if (status) { cond.push('d.status = ?'); par.push(status); }
  if (de) { cond.push('d.vencimento >= ?'); par.push(de); }
  if (ate) { cond.push('d.vencimento <= ?'); par.push(ate); }

  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : '';
  const linhas = db.prepare(`
    SELECT d.*, cc.codigo AS centro_codigo, cc.nome AS centro_nome,
           (SELECT COUNT(*) FROM anexos a WHERE a.entidade = 'despesa' AND a.entidade_id = d.id) AS qtd_anexos
      FROM despesas d
      LEFT JOIN centros_custo cc ON cc.id = d.centro_custo_id
      ${where}
     ORDER BY d.vencimento DESC, d.id DESC LIMIT 500`).all(...par);

  const hoje = new Date().toISOString().slice(0, 10);
  res.json(linhas.map(d => ({
    ...d,
    vencida: d.status === 'aberta' && d.vencimento && d.vencimento < hoje,
  })));
}));

despesas.post('/', rota((req, res) => {
  const d = prepararDespesa(req.body);
  if (!d.descricao) return res.status(400).json({ error: 'Descreva a despesa.' });
  if (!(d.valor > 0)) return res.status(400).json({ error: 'Informe um valor maior que zero.' });

  if (!d.competencia && d.vencimento) d.competencia = String(d.vencimento).slice(0, 7);
  d.status = d.status || (d.data_pagamento ? 'paga' : 'aberta');
  d.registrado_por = req.usuario?.id ?? null;
  d.registrado_nome = req.usuario?.nome ?? null;
  d.criado_em = agora();

  const { sql, valores } = montarInsert('despesas', d);
  const info = db.prepare(sql).run(...valores);
  log(req, 'criar', 'despesas', info.lastInsertRowid, `${d.descricao} · R$ ${d.valor.toFixed(2)}`);
  res.status(201).json({ id: info.lastInsertRowid });
}));

despesas.put('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM despesas WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Despesa não encontrada.' });
  }
  const d = prepararDespesa(req.body);
  if (!Object.keys(d).length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
  d.atualizado_em = agora();

  const { sql, valores } = montarUpdate('despesas', d, id);
  db.prepare(sql).run(...valores);
  log(req, 'atualizar', 'despesas', id, d.descricao || null);
  res.json({ ok: true });
}));

/** Baixa da despesa. */
despesas.post('/:id/pagar', rota((req, res) => {
  const id = Number(req.params.id);
  const d = db.prepare('SELECT * FROM despesas WHERE id = ?').get(id);
  if (!d) return res.status(404).json({ error: 'Despesa não encontrada.' });
  if (d.status === 'paga') return res.status(409).json({ error: 'Despesa já quitada.' });

  db.prepare(`UPDATE despesas SET status = 'paga', data_pagamento = ?, forma = ?, atualizado_em = ? WHERE id = ?`)
    .run(req.body.data_pagamento || new Date().toISOString().slice(0, 10),
         req.body.forma || 'dinheiro', agora(), id);

  log(req, 'pagar', 'despesas', id, `R$ ${Number(d.valor).toFixed(2)}`);
  res.json({ ok: true });
}));

despesas.delete('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const d = db.prepare('SELECT descricao FROM despesas WHERE id = ?').get(id);
  if (!d) return res.status(404).json({ error: 'Despesa não encontrada.' });

  db.prepare('DELETE FROM despesas WHERE id = ?').run(id);
  log(req, 'excluir', 'despesas', id, d.descricao);
  res.json({ ok: true });
}));

module.exports = { centros, despesas, fechamento };
