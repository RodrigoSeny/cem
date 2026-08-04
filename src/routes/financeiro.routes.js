// ═══════════════════════════════════════════════════════════════
// CEM — Financeiro do aluno
//
// Fluxo: plano de pagamento → contrato do aluno no ano letivo →
// geração das parcelas → baixa dos pagamentos.
// "Vencida" não é status gravado: é parcela aberta com vencimento
// anterior a hoje, calculado na consulta.
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const { db, log, agora } = require('../db');
const { filtrarCampos, montarInsert, montarUpdate, bool01, rota } = require('../util');

const router = express.Router();

const FORMAS = ['dinheiro', 'pix', 'transferencia', 'cartao_credito', 'cartao_debito', 'boleto', 'cheque'];

const hoje = () => new Date().toISOString().slice(0, 10);

/** Valor devido de uma parcela. */
const valorTotal = m => Number(m.valor_original) - Number(m.valor_desconto) + Number(m.valor_acrescimo);

// ══════════════════════ PLANOS ════════════════════════════════

router.get('/planos', rota((req, res) => {
  res.json(db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM contratos_financeiros c WHERE c.plano_id = p.id) AS qtd_contratos
      FROM planos_pagamento p ORDER BY p.ativo DESC, p.nome`).all());
}));

router.post('/planos', rota((req, res) => {
  const d = filtrarCampos(req.body, ['nome', 'valor_mensalidade', 'taxa_matricula', 'num_parcelas', 'dia_vencimento', 'descricao', 'ativo']);
  if (!d.nome) return res.status(400).json({ error: 'Informe o nome do plano.' });

  d.valor_mensalidade = Number(d.valor_mensalidade) || 0;
  d.taxa_matricula = Number(d.taxa_matricula) || 0;
  d.num_parcelas = Number(d.num_parcelas) || 12;
  d.dia_vencimento = Number(d.dia_vencimento) || 10;
  d.ativo = 'ativo' in d ? bool01(d.ativo) : 1;

  const { sql, valores } = montarInsert('planos_pagamento', d);
  const info = db.prepare(sql).run(...valores);
  log(req, 'criar', 'planos_pagamento', info.lastInsertRowid, d.nome);
  res.status(201).json({ id: info.lastInsertRowid });
}, { 'planos_pagamento.nome': 'Já existe um plano com este nome.' }));

router.put('/planos/:id', rota((req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM planos_pagamento WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Plano não encontrado.' });
  }
  const d = filtrarCampos(req.body, ['nome', 'valor_mensalidade', 'taxa_matricula', 'num_parcelas', 'dia_vencimento', 'descricao', 'ativo']);
  if (!Object.keys(d).length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
  if ('ativo' in d) d.ativo = bool01(d.ativo);
  for (const n of ['valor_mensalidade', 'taxa_matricula', 'num_parcelas', 'dia_vencimento']) {
    if (n in d) d[n] = Number(d[n]) || 0;
  }

  const { sql, valores } = montarUpdate('planos_pagamento', d, id);
  db.prepare(sql).run(...valores);
  log(req, 'atualizar', 'planos_pagamento', id, d.nome || null);
  res.json({ ok: true });
}, { 'planos_pagamento.nome': 'Já existe um plano com este nome.' }));

router.delete('/planos/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const uso = db.prepare('SELECT COUNT(*) c FROM contratos_financeiros WHERE plano_id = ?').get(id).c;
  if (uso) return res.status(409).json({ error: `Este plano é usado por ${uso} contrato(s). Desative-o em vez de excluir.` });

  db.prepare('DELETE FROM planos_pagamento WHERE id = ?').run(id);
  log(req, 'excluir', 'planos_pagamento', id, null);
  res.json({ ok: true });
}));

// ══════════════════════ CONTRATOS ═════════════════════════════

const SELECT_CONTRATO = `
  SELECT c.*,
         a.nome AS aluno_nome, a.matricula, t.nome AS turma_nome,
         p.nome AS plano_nome,
         r.nome AS responsavel_nome, r.whatsapp AS responsavel_contato,
         (SELECT COUNT(*) FROM mensalidades m WHERE m.contrato_id = c.id) AS qtd_parcelas
    FROM contratos_financeiros c
    JOIN alunos a ON a.id = c.aluno_id
    LEFT JOIN turmas t ON t.id = a.turma_id
    JOIN planos_pagamento p ON p.id = c.plano_id
    LEFT JOIN responsaveis r ON r.id = c.responsavel_id
`;

router.get('/contratos', rota((req, res) => {
  const { ano_letivo, aluno_id, status } = req.query;
  const cond = [];
  const par = [];
  if (ano_letivo) { cond.push('c.ano_letivo = ?'); par.push(Number(ano_letivo)); }
  if (aluno_id) { cond.push('c.aluno_id = ?'); par.push(Number(aluno_id)); }
  if (status) { cond.push('c.status = ?'); par.push(status); }

  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : '';
  res.json(db.prepare(`${SELECT_CONTRATO}${where} ORDER BY a.nome`).all(...par));
}));

/** Gera as parcelas do contrato. Nunca mexe em parcela já paga. */
function gerarParcelas(contrato) {
  const existentes = db.prepare(
    `SELECT competencia, parcela, status FROM mensalidades WHERE contrato_id = ?`
  ).all(contrato.id);
  const pagas = new Set(existentes.filter(m => m.status === 'paga').map(m => `${m.competencia}|${m.parcela}`));

  // Remove as em aberto para recriar com os valores atuais
  db.prepare(`DELETE FROM mensalidades WHERE contrato_id = ? AND status <> 'paga'`).run(contrato.id);

  const desconto = (Number(contrato.desconto_percentual) + Number(contrato.bolsa_percentual)) / 100;
  const bruto = Number(contrato.valor_mensalidade);
  const valorDesconto = Number((bruto * Math.min(desconto, 1)).toFixed(2));

  const stmt = db.prepare(`
    INSERT INTO mensalidades (contrato_id, aluno_id, competencia, parcela, descricao, valor_original, valor_desconto, vencimento, status, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aberta', ?)`);

  let criadas = 0;
  for (let i = 0; i < contrato.num_parcelas; i++) {
    const mes0 = (contrato.mes_inicio - 1) + i;
    const ano = contrato.ano_letivo + Math.floor(mes0 / 12);
    const mes = (mes0 % 12) + 1;
    const competencia = `${ano}-${String(mes).padStart(2, '0')}`;
    const parcela = i + 1;
    if (pagas.has(`${competencia}|${parcela}`)) continue;

    // Dia 31 em mês de 30 cai no último dia do mês
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const dia = Math.min(contrato.dia_vencimento, ultimoDia);
    const vencimento = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

    stmt.run(
      contrato.id, contrato.aluno_id, competencia, parcela,
      `Mensalidade ${String(mes).padStart(2, '0')}/${ano}`,
      bruto, valorDesconto, vencimento, agora()
    );
    criadas++;
  }
  return criadas;
}

router.post('/contratos', rota((req, res) => {
  const d = filtrarCampos(req.body, [
    'aluno_id', 'plano_id', 'responsavel_id', 'ano_letivo', 'valor_mensalidade',
    'desconto_percentual', 'bolsa_percentual', 'dia_vencimento', 'num_parcelas',
    'mes_inicio', 'status', 'observacoes',
  ]);

  if (!d.aluno_id) return res.status(400).json({ error: 'Selecione o aluno.' });
  if (!d.plano_id) return res.status(400).json({ error: 'Selecione o plano de pagamento.' });

  const plano = db.prepare('SELECT * FROM planos_pagamento WHERE id = ?').get(Number(d.plano_id));
  if (!plano) return res.status(400).json({ error: 'Plano não encontrado.' });

  d.aluno_id = Number(d.aluno_id);
  d.plano_id = Number(d.plano_id);
  d.responsavel_id = d.responsavel_id ? Number(d.responsavel_id) : null;
  d.ano_letivo = Number(d.ano_letivo) || new Date().getFullYear();
  d.valor_mensalidade = d.valor_mensalidade != null ? Number(d.valor_mensalidade) : plano.valor_mensalidade;
  d.desconto_percentual = Number(d.desconto_percentual) || 0;
  d.bolsa_percentual = Number(d.bolsa_percentual) || 0;
  d.dia_vencimento = Number(d.dia_vencimento) || plano.dia_vencimento;
  d.num_parcelas = Number(d.num_parcelas) || plano.num_parcelas;
  d.mes_inicio = Number(d.mes_inicio) || 1;
  d.status = d.status || 'ativo';
  d.criado_em = agora();

  // Responsável financeiro padrão: o principal do aluno
  if (!d.responsavel_id) {
    const r = db.prepare(`
      SELECT responsavel_id FROM aluno_responsaveis
       WHERE aluno_id = ? AND tipo_vinculo IN ('financeiro','ambos')
       ORDER BY principal DESC LIMIT 1`).get(d.aluno_id);
    d.responsavel_id = r ? r.responsavel_id : null;
  }

  const { sql, valores } = montarInsert('contratos_financeiros', d);
  const info = db.prepare(sql).run(...valores);

  const contrato = db.prepare('SELECT * FROM contratos_financeiros WHERE id = ?').get(info.lastInsertRowid);
  const criadas = gerarParcelas(contrato);

  log(req, 'criar', 'contratos_financeiros', contrato.id, `aluno ${d.aluno_id} · ${criadas} parcelas`);
  res.status(201).json({ id: contrato.id, parcelas: criadas });
}, { 'contratos_financeiros.aluno_id, contratos_financeiros.ano_letivo': 'Este aluno já possui contrato neste ano letivo.' }));

router.put('/contratos/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const atual = db.prepare('SELECT * FROM contratos_financeiros WHERE id = ?').get(id);
  if (!atual) return res.status(404).json({ error: 'Contrato não encontrado.' });

  const d = filtrarCampos(req.body, [
    'plano_id', 'responsavel_id', 'valor_mensalidade', 'desconto_percentual',
    'bolsa_percentual', 'dia_vencimento', 'num_parcelas', 'mes_inicio', 'status', 'observacoes',
  ]);
  if (!Object.keys(d).length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });

  for (const n of ['plano_id', 'responsavel_id', 'valor_mensalidade', 'desconto_percentual',
                   'bolsa_percentual', 'dia_vencimento', 'num_parcelas', 'mes_inicio']) {
    if (n in d) d[n] = d[n] === null ? null : Number(d[n]);
  }

  const { sql, valores } = montarUpdate('contratos_financeiros', d, id);
  db.prepare(sql).run(...valores);

  const contrato = db.prepare('SELECT * FROM contratos_financeiros WHERE id = ?').get(id);
  const criadas = req.body.regerar === false ? 0 : gerarParcelas(contrato);

  log(req, 'atualizar', 'contratos_financeiros', id, `${criadas} parcelas regeradas`);
  res.json({ ok: true, parcelas: criadas });
}));

router.delete('/contratos/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const pagas = db.prepare(`SELECT COUNT(*) c FROM mensalidades WHERE contrato_id = ? AND status = 'paga'`).get(id).c;
  if (pagas) return res.status(409).json({ error: `Existem ${pagas} parcela(s) paga(s). Encerre o contrato em vez de excluir.` });

  db.prepare('DELETE FROM contratos_financeiros WHERE id = ?').run(id);
  log(req, 'excluir', 'contratos_financeiros', id, null);
  res.json({ ok: true });
}));

// ══════════════════════ MENSALIDADES ══════════════════════════

const SELECT_MENS = `
  SELECT m.*,
         a.nome AS aluno_nome, a.matricula, t.nome AS turma_nome,
         r.nome AS responsavel_nome, r.whatsapp AS responsavel_contato,
         (SELECT COALESCE(SUM(p.valor), 0) FROM pagamentos p WHERE p.mensalidade_id = m.id) AS valor_pago
    FROM mensalidades m
    JOIN alunos a ON a.id = m.aluno_id
    LEFT JOIN turmas t ON t.id = a.turma_id
    LEFT JOIN contratos_financeiros c ON c.id = m.contrato_id
    LEFT JOIN responsaveis r ON r.id = c.responsavel_id
`;

/** Acrescenta total, saldo e a situação calculada (vencida). */
function enriquecer(m) {
  const total = valorTotal(m);
  const pago = Number(m.valor_pago || 0);
  const saldo = Number((total - pago).toFixed(2));
  const vencida = m.status === 'aberta' && m.vencimento < hoje();
  return {
    ...m,
    valor_total: Number(total.toFixed(2)),
    valor_pago: Number(pago.toFixed(2)),
    saldo,
    vencida,
    situacao: m.status === 'paga' ? 'paga' : m.status === 'cancelada' ? 'cancelada' : (vencida ? 'vencida' : 'aberta'),
    dias_atraso: vencida ? Math.floor((new Date(hoje()) - new Date(m.vencimento)) / 86400000) : 0,
  };
}

router.get('/mensalidades', rota((req, res) => {
  const { aluno_id, turma_id, status, situacao, competencia, de, ate, ano_letivo } = req.query;
  const cond = [];
  const par = [];

  if (aluno_id) { cond.push('m.aluno_id = ?'); par.push(Number(aluno_id)); }
  if (turma_id) { cond.push('a.turma_id = ?'); par.push(Number(turma_id)); }
  if (status) { cond.push('m.status = ?'); par.push(status); }
  if (competencia) { cond.push('m.competencia = ?'); par.push(competencia); }
  if (ano_letivo) { cond.push('c.ano_letivo = ?'); par.push(Number(ano_letivo)); }
  if (de) { cond.push('m.vencimento >= ?'); par.push(de); }
  if (ate) { cond.push('m.vencimento <= ?'); par.push(ate); }
  if (situacao === 'vencida') { cond.push(`m.status = 'aberta' AND m.vencimento < ?`); par.push(hoje()); }

  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : '';
  const linhas = db.prepare(`${SELECT_MENS}${where} ORDER BY m.vencimento, a.nome LIMIT 1000`).all(...par);
  res.json(linhas.map(enriquecer));
}));

/** Cobrança avulsa (material, uniforme, passeio…). */
router.post('/mensalidades', rota((req, res) => {
  const d = filtrarCampos(req.body, ['aluno_id', 'descricao', 'valor_original', 'valor_desconto', 'valor_acrescimo', 'vencimento', 'competencia', 'observacoes']);
  if (!d.aluno_id) return res.status(400).json({ error: 'Selecione o aluno.' });
  if (!d.descricao) return res.status(400).json({ error: 'Descreva a cobrança.' });
  if (!d.vencimento) return res.status(400).json({ error: 'Informe o vencimento.' });

  const contrato = db.prepare(`
    SELECT id FROM contratos_financeiros WHERE aluno_id = ? AND status = 'ativo'
     ORDER BY ano_letivo DESC LIMIT 1`).get(Number(d.aluno_id));
  if (!contrato) return res.status(400).json({ error: 'O aluno precisa de um contrato financeiro ativo.' });

  d.aluno_id = Number(d.aluno_id);
  d.contrato_id = contrato.id;
  d.competencia = d.competencia || String(d.vencimento).slice(0, 7);
  d.valor_original = Number(d.valor_original) || 0;
  d.valor_desconto = Number(d.valor_desconto) || 0;
  d.valor_acrescimo = Number(d.valor_acrescimo) || 0;
  d.parcela = null;
  d.criado_em = agora();

  const { sql, valores } = montarInsert('mensalidades', d);
  const info = db.prepare(sql).run(...valores);
  log(req, 'criar', 'mensalidades', info.lastInsertRowid, d.descricao);
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.put('/mensalidades/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const m = db.prepare('SELECT * FROM mensalidades WHERE id = ?').get(id);
  if (!m) return res.status(404).json({ error: 'Parcela não encontrada.' });
  if (m.status === 'paga') return res.status(409).json({ error: 'Parcela já quitada. Estorne o pagamento antes de alterar.' });

  const d = filtrarCampos(req.body, ['descricao', 'valor_original', 'valor_desconto', 'valor_acrescimo', 'vencimento', 'status', 'observacoes']);
  if (!Object.keys(d).length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
  for (const n of ['valor_original', 'valor_desconto', 'valor_acrescimo']) if (n in d) d[n] = Number(d[n]) || 0;

  const { sql, valores } = montarUpdate('mensalidades', d, id);
  db.prepare(sql).run(...valores);
  log(req, 'atualizar', 'mensalidades', id, null);
  res.json({ ok: true });
}));

router.delete('/mensalidades/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const m = db.prepare('SELECT status FROM mensalidades WHERE id = ?').get(id);
  if (!m) return res.status(404).json({ error: 'Parcela não encontrada.' });
  if (m.status === 'paga') return res.status(409).json({ error: 'Parcela quitada não pode ser excluída. Estorne o pagamento antes.' });

  db.prepare('DELETE FROM mensalidades WHERE id = ?').run(id);
  log(req, 'excluir', 'mensalidades', id, null);
  res.json({ ok: true });
}));

// ── Baixa de pagamento ────────────────────────────────────────
router.post('/mensalidades/:id/pagar', rota((req, res) => {
  const id = Number(req.params.id);
  const linha = db.prepare(`${SELECT_MENS} WHERE m.id = ?`).get(id);
  if (!linha) return res.status(404).json({ error: 'Parcela não encontrada.' });

  const m = enriquecer(linha);
  if (m.status === 'cancelada') return res.status(409).json({ error: 'Parcela cancelada.' });
  if (m.saldo <= 0) return res.status(409).json({ error: 'Parcela já está quitada.' });

  const valor = req.body.valor != null ? Number(req.body.valor) : m.saldo;
  if (!(valor > 0)) return res.status(400).json({ error: 'Informe um valor válido.' });
  if (valor > m.saldo + 0.005) return res.status(400).json({ error: `Valor acima do saldo devedor (${m.saldo.toFixed(2)}).` });

  const forma = FORMAS.includes(req.body.forma) ? req.body.forma : 'dinheiro';
  const data = req.body.data_pagamento || hoje();

  const baixar = db.transaction(() => {
    db.prepare(`
      INSERT INTO pagamentos (mensalidade_id, valor, data_pagamento, forma, observacoes, registrado_por, registrado_nome, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, valor, data, forma, req.body.observacoes || null,
           req.usuario?.id ?? null, req.usuario?.nome ?? null, agora());

    const pago = db.prepare('SELECT COALESCE(SUM(valor),0) s FROM pagamentos WHERE mensalidade_id = ?').get(id).s;
    if (pago >= valorTotal(linha) - 0.005) {
      db.prepare(`UPDATE mensalidades SET status = 'paga' WHERE id = ?`).run(id);
      return true;
    }
    return false;
  });

  const quitada = baixar();
  log(req, 'pagar', 'mensalidades', id, `R$ ${valor.toFixed(2)} · ${forma}`);
  res.json({ ok: true, quitada });
}));

// ── Estorno ───────────────────────────────────────────────────
router.delete('/pagamentos/:id', rota((req, res) => {
  const p = db.prepare('SELECT * FROM pagamentos WHERE id = ?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Pagamento não encontrado.' });

  db.transaction(() => {
    db.prepare('DELETE FROM pagamentos WHERE id = ?').run(p.id);
    db.prepare(`UPDATE mensalidades SET status = 'aberta' WHERE id = ?`).run(p.mensalidade_id);
  })();

  log(req, 'estornar', 'pagamentos', p.id, `R$ ${Number(p.valor).toFixed(2)}`);
  res.json({ ok: true });
}));

// ══════════════════════ EXTRATO E RESUMO ══════════════════════

router.get('/aluno/:id', rota((req, res) => {
  const alunoId = Number(req.params.id);
  const aluno = db.prepare(`
    SELECT a.id, a.nome, a.matricula, t.nome AS turma_nome
      FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id WHERE a.id = ?`).get(alunoId);
  if (!aluno) return res.status(404).json({ error: 'Aluno não encontrado.' });

  const contratos = db.prepare(`${SELECT_CONTRATO} WHERE c.aluno_id = ? ORDER BY c.ano_letivo DESC`).all(alunoId);
  const parcelas = db.prepare(`${SELECT_MENS} WHERE m.aluno_id = ? ORDER BY m.vencimento`).all(alunoId).map(enriquecer);

  for (const p of parcelas) {
    p.pagamentos = db.prepare(`
      SELECT id, valor, data_pagamento, forma, observacoes, registrado_nome
        FROM pagamentos WHERE mensalidade_id = ? ORDER BY data_pagamento`).all(p.id);
  }

  const abertas = parcelas.filter(p => p.status === 'aberta');
  res.json({
    aluno,
    contratos,
    parcelas,
    totais: {
      total_ano: Number(parcelas.reduce((s, p) => s + p.valor_total, 0).toFixed(2)),
      pago: Number(parcelas.reduce((s, p) => s + p.valor_pago, 0).toFixed(2)),
      em_aberto: Number(abertas.reduce((s, p) => s + p.saldo, 0).toFixed(2)),
      vencido: Number(abertas.filter(p => p.vencida).reduce((s, p) => s + p.saldo, 0).toFixed(2)),
      parcelas_vencidas: abertas.filter(p => p.vencida).length,
    },
  });
}));

router.get('/resumo', rota((req, res) => {
  const mes = req.query.competencia || hoje().slice(0, 7);
  const d = hoje();

  const recebidoMes = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) v FROM pagamentos WHERE substr(data_pagamento, 1, 7) = ?`).get(mes).v;

  const previsto = db.prepare(`
    SELECT COALESCE(SUM(valor_original - valor_desconto + valor_acrescimo), 0) v
      FROM mensalidades WHERE competencia = ? AND status <> 'cancelada'`).get(mes).v;

  const abertas = db.prepare(`${SELECT_MENS} WHERE m.status = 'aberta'`).all().map(enriquecer);
  const vencidas = abertas.filter(p => p.vencida);

  const inadimplentes = db.prepare(`
    SELECT a.id, a.nome, a.matricula, t.nome AS turma_nome,
           r.nome AS responsavel_nome, r.whatsapp AS responsavel_contato,
           COUNT(m.id) AS parcelas,
           SUM(m.valor_original - m.valor_desconto + m.valor_acrescimo
               - (SELECT COALESCE(SUM(p.valor),0) FROM pagamentos p WHERE p.mensalidade_id = m.id)) AS total
      FROM mensalidades m
      JOIN alunos a ON a.id = m.aluno_id
      LEFT JOIN turmas t ON t.id = a.turma_id
      LEFT JOIN contratos_financeiros c ON c.id = m.contrato_id
      LEFT JOIN responsaveis r ON r.id = c.responsavel_id
     WHERE m.status = 'aberta' AND m.vencimento < ?
     GROUP BY a.id ORDER BY total DESC`).all(d);

  res.json({
    competencia: mes,
    recebido_mes: Number(recebidoMes.toFixed(2)),
    previsto_mes: Number(previsto.toFixed(2)),
    em_aberto: Number(abertas.reduce((s, p) => s + p.saldo, 0).toFixed(2)),
    vencido: Number(vencidas.reduce((s, p) => s + p.saldo, 0).toFixed(2)),
    qtd_vencidas: vencidas.length,
    qtd_inadimplentes: inadimplentes.length,
    inadimplentes: inadimplentes.map(i => ({ ...i, total: Number(Number(i.total).toFixed(2)) })),
    alunos_sem_contrato: db.prepare(`
      SELECT a.id, a.nome, a.matricula FROM alunos a
       WHERE a.situacao = 'matriculado'
         AND NOT EXISTS (SELECT 1 FROM contratos_financeiros c WHERE c.aluno_id = a.id AND c.status = 'ativo')
       ORDER BY a.nome`).all(),
  });
}));

module.exports = { router, FORMAS };
