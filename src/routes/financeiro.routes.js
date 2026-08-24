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

/** Desconto/bolsa: 0 (sem desconto) ou entre 0,01% e 99,99%. */
function validarPercentual(valor, rotulo) {
  if (valor < 0 || (valor > 0 && valor < 0.01) || valor > 99.99) {
    return `${rotulo} deve ficar entre 0,01% e 99,99% (ou 0, para não aplicar).`;
  }
  return null;
}

// ══════════════════════ PLANOS ════════════════════════════════

router.get('/planos', rota((req, res) => {
  res.json(db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM contratos_financeiros c WHERE c.plano_id = p.id) AS qtd_contratos
      FROM planos_pagamento p ORDER BY p.ativo DESC, p.nome`).all());
}));

const CAMPOS_PLANO = [
  'nome', 'valor_mensalidade', 'taxa_matricula', 'num_parcelas', 'dia_vencimento', 'descricao', 'ativo',
  'desconto_irmao2_percentual', 'desconto_irmao3_percentual',
];

router.post('/planos', rota((req, res) => {
  const d = filtrarCampos(req.body, CAMPOS_PLANO);
  if (!d.nome) return res.status(400).json({ error: 'Informe o nome do plano.' });

  d.valor_mensalidade = Number(d.valor_mensalidade) || 0;
  d.taxa_matricula = Number(d.taxa_matricula) || 0;
  d.num_parcelas = Number(d.num_parcelas) || 12;
  d.dia_vencimento = Number(d.dia_vencimento) || 10;
  d.ativo = 'ativo' in d ? bool01(d.ativo) : 1;
  d.desconto_irmao2_percentual = Number(d.desconto_irmao2_percentual) || 0;
  d.desconto_irmao3_percentual = Number(d.desconto_irmao3_percentual) || 0;

  const erro2 = validarPercentual(d.desconto_irmao2_percentual, 'O desconto do 2º filho');
  if (erro2) return res.status(400).json({ error: erro2 });
  const erro3 = validarPercentual(d.desconto_irmao3_percentual, 'O desconto do 3º filho');
  if (erro3) return res.status(400).json({ error: erro3 });

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
  const d = filtrarCampos(req.body, CAMPOS_PLANO);
  if (!Object.keys(d).length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
  if ('ativo' in d) d.ativo = bool01(d.ativo);
  for (const n of ['valor_mensalidade', 'taxa_matricula', 'num_parcelas', 'dia_vencimento',
                   'desconto_irmao2_percentual', 'desconto_irmao3_percentual']) {
    if (n in d) d[n] = Number(d[n]) || 0;
  }

  if ('desconto_irmao2_percentual' in d) {
    const erro = validarPercentual(d.desconto_irmao2_percentual, 'O desconto do 2º filho');
    if (erro) return res.status(400).json({ error: erro });
  }
  if ('desconto_irmao3_percentual' in d) {
    const erro = validarPercentual(d.desconto_irmao3_percentual, 'O desconto do 3º filho');
    if (erro) return res.status(400).json({ error: erro });
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

// ── Valores do plano por turma / tipo de aluno ────────────────
router.get('/planos/:id/valores', rota((req, res) => {
  res.json(db.prepare(`
    SELECT pv.*, t.nome AS turma_nome FROM plano_valores pv
      LEFT JOIN turmas t ON t.id = pv.turma_id
     WHERE pv.plano_id = ?
     ORDER BY t.nome IS NULL DESC, t.nome, pv.tipo_aluno`).all(Number(req.params.id)));
}));

router.put('/planos/:id/valores', rota((req, res) => {
  const planoId = Number(req.params.id);
  if (!db.prepare('SELECT id FROM planos_pagamento WHERE id = ?').get(planoId)) {
    return res.status(404).json({ error: 'Plano não encontrado.' });
  }
  const linhas = Array.isArray(req.body.valores) ? req.body.valores : [];

  const substituir = db.transaction(() => {
    db.prepare('DELETE FROM plano_valores WHERE plano_id = ?').run(planoId);
    const inserir = db.prepare(`
      INSERT INTO plano_valores (plano_id, turma_id, tipo_aluno, valor_mensalidade)
      VALUES (?, ?, ?, ?)`);
    for (const l of linhas) {
      if (!(Number(l.valor_mensalidade) > 0)) continue;
      inserir.run(
        planoId,
        l.turma_id ? Number(l.turma_id) : null,
        ['novo', 'antigo', 'ambos'].includes(l.tipo_aluno) ? l.tipo_aluno : 'ambos',
        Number(l.valor_mensalidade)
      );
    }
  });
  substituir();

  log(req, 'atualizar', 'plano_valores', planoId, `${linhas.length} linha(s)`);
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
  // Preserva não só as já quitadas, mas qualquer parcela com pagamento (mesmo
  // parcial) associado — apagar essas linhas cascateia e destrói o histórico
  // do pagamento real, mesmo a parcela ainda estando tecnicamente "aberta".
  const existentes = db.prepare(`
    SELECT m.competencia, m.parcela, m.status,
           EXISTS(SELECT 1 FROM pagamentos p WHERE p.mensalidade_id = m.id) AS tem_pagamento
      FROM mensalidades m WHERE m.contrato_id = ?`
  ).all(contrato.id);
  const preservadas = new Set(
    existentes.filter(m => m.status === 'paga' || m.tem_pagamento).map(m => `${m.competencia}|${m.parcela}`)
  );

  // Remove as em aberto (sem nenhum pagamento) para recriar com os valores atuais
  db.prepare(`
    DELETE FROM mensalidades WHERE contrato_id = ? AND status <> 'paga'
      AND id NOT IN (SELECT DISTINCT mensalidade_id FROM pagamentos WHERE mensalidade_id IS NOT NULL)`
  ).run(contrato.id);

  // Desconto, bolsa e desconto de irmão são camadas em cascata, aplicadas em
  // sequência sobre o valor já reduzido pela camada anterior — nunca somadas
  // e aplicadas de uma vez sobre o valor cheio.
  const bruto = Number(contrato.valor_mensalidade);

  const descontoPct = Math.min(Number(contrato.desconto_percentual) / 100, 1);
  const apósDesconto = bruto * (1 - descontoPct);
  const valorDesconto1 = Number((bruto - apósDesconto).toFixed(2));

  const bolsaPct = Math.min(Number(contrato.bolsa_percentual) / 100, 1);
  const apósBolsa = apósDesconto * (1 - bolsaPct);
  const valorBolsa = Number((apósDesconto - apósBolsa).toFixed(2));

  const descontoIrmao = Math.min(Number(contrato.desconto_irmao_percentual) / 100, 1);
  const valorFinal = apósBolsa * (1 - descontoIrmao);
  const valorDescontoIrmao = Number((apósBolsa - valorFinal).toFixed(2));

  const valorDesconto = Number((valorDesconto1 + valorBolsa + valorDescontoIrmao).toFixed(2));

  const stmt = db.prepare(`
    INSERT INTO mensalidades (contrato_id, aluno_id, competencia, parcela, descricao, valor_original, valor_desconto, vencimento, status, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aberta', ?)`);

  // A parcela nasce já detalhada: sem o item base, o documento do mês
  // sairia só com as cobranças extras e o centro de custo não fecharia.
  const item = db.prepare(`
    INSERT INTO mensalidade_itens (mensalidade_id, descricao, valor, tipo, ordem)
    VALUES (?, ?, ?, ?, ?)`);

  let criadas = 0;
  for (let i = 0; i < contrato.num_parcelas; i++) {
    const mes0 = (contrato.mes_inicio - 1) + i;
    const ano = contrato.ano_letivo + Math.floor(mes0 / 12);
    const mes = (mes0 % 12) + 1;
    const competencia = `${ano}-${String(mes).padStart(2, '0')}`;
    const parcela = i + 1;
    if (preservadas.has(`${competencia}|${parcela}`)) continue;

    // Dia 31 em mês de 30 cai no último dia do mês
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const dia = Math.min(contrato.dia_vencimento, ultimoDia);
    const vencimento = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

    const descricao = `Mensalidade ${String(mes).padStart(2, '0')}/${ano}`;
    const info = stmt.run(
      contrato.id, contrato.aluno_id, competencia, parcela,
      descricao, bruto, valorDesconto, vencimento, agora()
    );

    item.run(info.lastInsertRowid, descricao, bruto, 'mensalidade', 0);
    if (valorDesconto1 > 0) item.run(info.lastInsertRowid, 'Desconto', -valorDesconto1, 'desconto', 1);
    if (valorBolsa > 0) item.run(info.lastInsertRowid, 'Bolsa', -valorBolsa, 'desconto', 2);
    if (valorDescontoIrmao > 0) item.run(info.lastInsertRowid, 'Desconto de irmão', -valorDescontoIrmao, 'desconto', 3);

    criadas++;
  }
  return criadas;
}

/**
 * Monta e grava um contrato + parcelas a partir de um corpo já no formato da
 * API. Não lança: devolve { erro, status } em caso de falha, ou { contrato,
 * parcelas }. Usada tanto pelo POST /contratos avulso quanto pelo lote.
 */
function criarContrato(corpo) {
  const d = filtrarCampos(corpo, [
    'aluno_id', 'plano_id', 'responsavel_id', 'ano_letivo', 'valor_mensalidade',
    'desconto_percentual', 'bolsa_percentual', 'desconto_irmao_percentual', 'tipo_aluno',
    'dia_vencimento', 'num_parcelas', 'mes_inicio', 'status', 'observacoes',
  ]);

  if (!d.aluno_id) return { erro: 'Selecione o aluno.', status: 400 };
  if (!d.plano_id) return { erro: 'Selecione o plano de pagamento.', status: 400 };

  const plano = db.prepare('SELECT * FROM planos_pagamento WHERE id = ?').get(Number(d.plano_id));
  if (!plano) return { erro: 'Plano não encontrado.', status: 400 };

  d.aluno_id = Number(d.aluno_id);
  d.plano_id = Number(d.plano_id);
  d.responsavel_id = d.responsavel_id ? Number(d.responsavel_id) : null;
  d.ano_letivo = Number(d.ano_letivo) || new Date().getFullYear();
  d.valor_mensalidade = d.valor_mensalidade != null ? Number(d.valor_mensalidade) : plano.valor_mensalidade;
  d.desconto_percentual = Number(d.desconto_percentual) || 0;
  d.bolsa_percentual = Number(d.bolsa_percentual) || 0;
  d.desconto_irmao_percentual = Number(d.desconto_irmao_percentual) || 0;
  if (!['novo', 'antigo'].includes(d.tipo_aluno)) d.tipo_aluno = null;

  const erroDesc = validarPercentual(d.desconto_percentual, 'O desconto');
  if (erroDesc) return { erro: erroDesc, status: 400 };
  const erroBolsa = validarPercentual(d.bolsa_percentual, 'A bolsa');
  if (erroBolsa) return { erro: erroBolsa, status: 400 };
  const erroIrmao = validarPercentual(d.desconto_irmao_percentual, 'O desconto de irmão');
  if (erroIrmao) return { erro: erroIrmao, status: 400 };

  d.dia_vencimento = Number(d.dia_vencimento) || plano.dia_vencimento;
  d.num_parcelas = Number(d.num_parcelas) || plano.num_parcelas;
  d.mes_inicio = Number(d.mes_inicio) || 1;
  d.status = d.status || 'ativo';
  d.criado_em = agora();

  if (d.responsavel_id) {
    const vinculado = db.prepare(
      'SELECT 1 FROM aluno_responsaveis WHERE aluno_id = ? AND responsavel_id = ?'
    ).get(d.aluno_id, d.responsavel_id);
    if (!vinculado) return { erro: 'Este responsável não está vinculado ao aluno selecionado.', status: 400 };
  } else {
    // Responsável financeiro padrão: o principal do aluno
    const r = db.prepare(`
      SELECT responsavel_id FROM aluno_responsaveis
       WHERE aluno_id = ? AND tipo_vinculo IN ('financeiro','ambos')
       ORDER BY principal DESC LIMIT 1`).get(d.aluno_id);
    d.responsavel_id = r ? r.responsavel_id : null;
  }

  let info;
  try {
    const { sql, valores } = montarInsert('contratos_financeiros', d);
    info = db.prepare(sql).run(...valores);
  } catch (e) {
    if (String(e.message).includes('UNIQUE constraint failed')) {
      return { erro: 'Este aluno já possui contrato neste ano letivo.', status: 409 };
    }
    throw e;
  }

  const contrato = db.prepare('SELECT * FROM contratos_financeiros WHERE id = ?').get(info.lastInsertRowid);
  const parcelas = gerarParcelas(contrato);
  return { contrato, parcelas };
}

router.post('/contratos', rota((req, res) => {
  const r = criarContrato(req.body);
  if (r.erro) return res.status(r.status).json({ error: r.erro });

  log(req, 'criar', 'contratos_financeiros', r.contrato.id, `aluno ${r.contrato.aluno_id} · ${r.parcelas} parcelas`);
  res.status(201).json({ id: r.contrato.id, parcelas: r.parcelas });
}));

router.put('/contratos/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const atual = db.prepare('SELECT * FROM contratos_financeiros WHERE id = ?').get(id);
  if (!atual) return res.status(404).json({ error: 'Contrato não encontrado.' });

  const d = filtrarCampos(req.body, [
    'plano_id', 'responsavel_id', 'valor_mensalidade', 'desconto_percentual',
    'bolsa_percentual', 'dia_vencimento', 'num_parcelas', 'mes_inicio', 'status', 'observacoes',
  ]);
  if (!Object.keys(d).length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });

  for (const n of ['plano_id', 'responsavel_id', 'valor_mensalidade',
                   'dia_vencimento', 'num_parcelas', 'mes_inicio']) {
    if (n in d) d[n] = d[n] === null ? null : Number(d[n]);
  }
  // desconto_percentual/bolsa_percentual são NOT NULL no banco (padrão 0) — campo
  // vazio no formulário vira null aqui em cima e quebraria o UPDATE; trata como 0,
  // igual ao POST já fazia.
  for (const n of ['desconto_percentual', 'bolsa_percentual']) {
    if (n in d) d[n] = Number(d[n]) || 0;
  }

  if ('desconto_percentual' in d) {
    const erro = validarPercentual(d.desconto_percentual, 'O desconto');
    if (erro) return res.status(400).json({ error: erro });
  }
  if ('bolsa_percentual' in d) {
    const erro = validarPercentual(d.bolsa_percentual, 'A bolsa');
    if (erro) return res.status(400).json({ error: erro });
  }

  if (d.responsavel_id) {
    const vinculado = db.prepare(
      'SELECT 1 FROM aluno_responsaveis WHERE aluno_id = ? AND responsavel_id = ?'
    ).get(atual.aluno_id, d.responsavel_id);
    if (!vinculado) return res.status(400).json({ error: 'Este responsável não está vinculado ao aluno selecionado.' });
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

// ── Montagem de plano por lote (família) ──────────────────────

/** Detecta novo/antigo pelo histórico: sem contrato em ano anterior = novo. */
function detectarTipoAluno(alunoId, anoLetivo) {
  const teveAntes = db.prepare(
    'SELECT 1 FROM contratos_financeiros WHERE aluno_id = ? AND ano_letivo < ? LIMIT 1'
  ).get(alunoId, anoLetivo);
  return teveAntes ? 'antigo' : 'novo';
}

/**
 * Valor base do plano pra uma turma/tipo de aluno, pela matriz de
 * plano_valores. Prioridade: (turma exata+tipo exato) → (turma exata+ambos)
 * → (turma NULL+tipo exato) → (turma NULL+ambos) → planos_pagamento.valor_mensalidade.
 */
function valorBasePlano(planoId, turmaId, tipoAluno) {
  const linha = db.prepare(`
    SELECT valor_mensalidade FROM plano_valores
     WHERE plano_id = ?
       AND (turma_id = ? OR turma_id IS NULL)
       AND (tipo_aluno = ? OR tipo_aluno = 'ambos')
     ORDER BY (turma_id = ?) DESC, (tipo_aluno = ?) DESC
     LIMIT 1`
  ).get(planoId, turmaId, tipoAluno, turmaId, tipoAluno);
  if (linha) return linha.valor_mensalidade;
  return db.prepare('SELECT valor_mensalidade FROM planos_pagamento WHERE id = ?').get(planoId).valor_mensalidade;
}

router.get('/responsaveis/:id/filhos-matriculados', rota((req, res) => {
  const responsavelId = Number(req.params.id);
  const anoLetivo = Number(req.query.ano_letivo) || new Date().getFullYear();

  const filhos = db.prepare(`
    SELECT a.id, a.nome, a.matricula, a.turma_id, a.data_nascimento, a.data_matricula, t.nome AS turma_nome
      FROM aluno_responsaveis ar
      JOIN alunos a ON a.id = ar.aluno_id
      LEFT JOIN turmas t ON t.id = a.turma_id
     WHERE ar.responsavel_id = ? AND a.situacao = 'matriculado'
     ORDER BY COALESCE(a.data_matricula, a.criado_em)`
  ).all(responsavelId);

  res.json(filhos.map(a => ({
    ...a,
    tipo_aluno: detectarTipoAluno(a.id, anoLetivo),
    ja_tem_contrato: !!db.prepare(
      'SELECT 1 FROM contratos_financeiros WHERE aluno_id = ? AND ano_letivo = ?'
    ).get(a.id, anoLetivo),
  })));
}));

router.post('/contratos/lote', rota((req, res) => {
  const { responsavel_id, ano_letivo, plano_id, alunos } = req.body;
  const responsavelId = Number(responsavel_id);
  const anoLetivo = Number(ano_letivo) || new Date().getFullYear();
  const planoId = Number(plano_id);

  if (!responsavelId) return res.status(400).json({ error: 'Selecione o responsável.' });
  const plano = db.prepare('SELECT * FROM planos_pagamento WHERE id = ?').get(planoId);
  if (!plano) return res.status(400).json({ error: 'Plano não encontrado.' });
  if (!Array.isArray(alunos) || !alunos.length) return res.status(400).json({ error: 'Selecione ao menos um aluno.' });

  // Posição na família: todos os filhos matriculados do responsável, ordenados
  // por data de matrícula (quem matriculou primeiro é o 1º filho) — inclui
  // contratos já existentes de outras sessões, não só os deste lote.
  const filhosFamilia = db.prepare(`
    SELECT a.id FROM aluno_responsaveis ar
      JOIN alunos a ON a.id = ar.aluno_id
     WHERE ar.responsavel_id = ? AND a.situacao = 'matriculado'
     ORDER BY COALESCE(a.data_matricula, a.criado_em)`
  ).all(responsavelId).map(a => a.id);

  const resultados = [];
  let parcelasTotais = 0;

  for (const item of alunos) {
    const alunoId = Number(item.aluno_id);
    const aluno = db.prepare('SELECT * FROM alunos WHERE id = ?').get(alunoId);
    if (!aluno) { resultados.push({ aluno_id: alunoId, erro: 'Aluno não encontrado.' }); continue; }

    const posicao = filhosFamilia.indexOf(alunoId) + 1;
    let descontoIrmao = 0;
    if (posicao === 2) descontoIrmao = Number(plano.desconto_irmao2_percentual) || 0;
    else if (posicao >= 3) descontoIrmao = Number(plano.desconto_irmao3_percentual) || 0;

    const tipoAluno = ['novo', 'antigo'].includes(item.tipo_aluno)
      ? item.tipo_aluno
      : detectarTipoAluno(alunoId, anoLetivo);

    const valorBase = valorBasePlano(planoId, aluno.turma_id, tipoAluno);

    const r = criarContrato({
      aluno_id: alunoId,
      plano_id: planoId,
      responsavel_id: responsavelId,
      ano_letivo: anoLetivo,
      valor_mensalidade: valorBase,
      desconto_percentual: item.desconto_percentual || 0,
      bolsa_percentual: item.bolsa_percentual || 0,
      desconto_irmao_percentual: descontoIrmao,
      tipo_aluno: tipoAluno,
    });

    if (r.erro) {
      resultados.push({ aluno_id: alunoId, erro: r.erro });
    } else {
      resultados.push({ aluno_id: alunoId, contrato_id: r.contrato.id, parcelas: r.parcelas, posicao, tipo_aluno: tipoAluno });
      parcelasTotais += r.parcelas;
    }
  }

  const criados = resultados.filter(r => !r.erro).length;
  log(req, 'criar_lote', 'contratos_financeiros', null, `responsável ${responsavelId} · ${criados}/${alunos.length} contrato(s)`);
  res.status(criados ? 201 : 400).json({ criados, parcelas_totais: parcelasTotais, resultados });
}));

// ── Reajuste geral ──────────────────────────────────────────────

function aplicarPercentual(valor, percentual) {
  return Number((Number(valor) * (1 + percentual / 100)).toFixed(2));
}

router.post('/reajuste', rota((req, res) => {
  const { escopo, referencia, retroativo, confirmar } = req.body;
  const pct = Number(req.body.percentual);

  if (!['geral', 'turno', 'turma'].includes(escopo)) return res.status(400).json({ error: 'Escopo inválido.' });
  if (!pct || pct <= -100 || pct > 500) return res.status(400).json({ error: 'Informe um percentual de reajuste válido.' });
  if (escopo !== 'geral' && !referencia) return res.status(400).json({ error: 'Informe a referência (turno ou turma) do reajuste.' });

  let turmaIds = [];
  if (escopo === 'turma') {
    turmaIds = [Number(referencia)];
  } else if (escopo === 'turno') {
    turmaIds = db.prepare('SELECT id FROM turmas WHERE turno = ?').all(referencia).map(t => t.id);
  }

  const planosBase = escopo === 'geral'
    ? db.prepare('SELECT id, valor_mensalidade FROM planos_pagamento WHERE ativo = 1').all()
    : [];

  let valoresLinhas = [];
  if (escopo === 'geral') {
    valoresLinhas = db.prepare('SELECT * FROM plano_valores').all();
  } else if (turmaIds.length) {
    valoresLinhas = db.prepare(
      `SELECT * FROM plano_valores WHERE turma_id IN (${turmaIds.map(() => '?').join(',')})`
    ).all(...turmaIds);
  }

  let contratos = [];
  if (retroativo) {
    if (escopo === 'geral') {
      contratos = db.prepare(`SELECT * FROM contratos_financeiros WHERE status = 'ativo'`).all();
    } else if (turmaIds.length) {
      contratos = db.prepare(`
        SELECT c.* FROM contratos_financeiros c
          JOIN alunos a ON a.id = c.aluno_id
         WHERE c.status = 'ativo' AND a.turma_id IN (${turmaIds.map(() => '?').join(',')})`
      ).all(...turmaIds);
    }
  }

  const planosAfetados = planosBase.length + valoresLinhas.length;

  if (!confirmar) {
    return res.json({
      planos_afetados: planosAfetados,
      contratos_afetados: contratos.length,
      previa: {
        planos: planosBase.map(p => ({ id: p.id, de: p.valor_mensalidade, para: aplicarPercentual(p.valor_mensalidade, pct) })),
      },
    });
  }

  const aplicar = db.transaction(() => {
    const upPlano = db.prepare('UPDATE planos_pagamento SET valor_mensalidade = ? WHERE id = ?');
    for (const p of planosBase) upPlano.run(aplicarPercentual(p.valor_mensalidade, pct), p.id);

    const upValor = db.prepare('UPDATE plano_valores SET valor_mensalidade = ? WHERE id = ?');
    for (const v of valoresLinhas) upValor.run(aplicarPercentual(v.valor_mensalidade, pct), v.id);

    const upContrato = db.prepare('UPDATE contratos_financeiros SET valor_mensalidade = ? WHERE id = ?');
    for (const c of contratos) {
      upContrato.run(aplicarPercentual(c.valor_mensalidade, pct), c.id);
      const atualizado = db.prepare('SELECT * FROM contratos_financeiros WHERE id = ?').get(c.id);
      gerarParcelas(atualizado);
    }

    db.prepare(`
      INSERT INTO reajustes_historico (escopo, referencia, percentual, retroativo, planos_afetados, contratos_afetados, aplicado_por, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(escopo, referencia != null ? String(referencia) : null, pct, retroativo ? 1 : 0,
          planosAfetados, contratos.length, req.usuario?.id ?? null, agora());
  });
  aplicar();

  log(req, 'reajuste', 'planos_pagamento', null, `${escopo} ${pct}% · ${contratos.length} contrato(s) retroativo=${!!retroativo}`);
  res.json({ ok: true, planos_afetados: planosAfetados, contratos_afetados: contratos.length });
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
  const linhas = db.prepare(`${SELECT_MENS}${where} ORDER BY a.nome, m.vencimento LIMIT 1000`).all(...par);
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
  d.origem = 'avulsa';
  d.criado_em = agora();

  const centro = req.body.centro_custo_id ? Number(req.body.centro_custo_id) : null;

  const { sql, valores } = montarInsert('mensalidades', d);
  const info = db.prepare(sql).run(...valores);

  db.prepare(`
    INSERT INTO mensalidade_itens (mensalidade_id, descricao, valor, tipo, centro_custo_id, ordem)
    VALUES (?, ?, ?, 'cobranca', ?, 0)`)
    .run(info.lastInsertRowid, d.descricao, d.valor_original, centro);

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

  // "paga" só pode ser resultado de um pagamento de verdade (rota /pagar) —
  // senão dá pra "quitar" uma parcela sem nenhum dinheiro entrar, sem deixar rastro.
  if (d.status === 'paga') {
    return res.status(400).json({ error: 'Para quitar a parcela, registre o pagamento em vez de alterar o status diretamente.' });
  }

  for (const n of ['valor_original', 'valor_desconto', 'valor_acrescimo']) {
    if (n in d) d[n] = Math.max(Number(d[n]) || 0, 0);
  }
  const original = 'valor_original' in d ? d.valor_original : m.valor_original;
  const desconto = 'valor_desconto' in d ? d.valor_desconto : m.valor_desconto;
  if (desconto > original) {
    return res.status(400).json({ error: 'O desconto não pode ser maior que o valor original da parcela.' });
  }

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

// ── Planilha de cobrança do mês ───────────────────────────────
// Enquanto o boleto é emitido pelo banco, esta é a lista que a
// secretaria usa: responsável financeiro, aluno, itens e total.
// A estrutura já é a de uma remessa — o dia que virar arquivo
// bancário (CNAB), é daqui que os dados saem.
router.get('/planilha', rota((req, res) => {
  const competencia = String(req.query.competencia || hoje().slice(0, 7)).slice(0, 7);
  const somenteAberto = req.query.status !== 'todas';

  const filtroStatus = somenteAberto ? `AND m.status = 'aberta'` : `AND m.status <> 'cancelada'`;

  const linhas = db.prepare(`
    SELECT m.id, m.competencia, m.descricao, m.vencimento, m.status, m.origem,
           m.valor_original, m.valor_desconto, m.valor_acrescimo,
           (SELECT COALESCE(SUM(p.valor),0) FROM pagamentos p WHERE p.mensalidade_id = m.id) AS valor_pago,
           a.id AS aluno_id, a.nome AS aluno_nome, a.matricula,
           t.nome AS turma_nome, COALESCE(t.turno, a.turno) AS turno,
           r.id AS responsavel_id, r.nome AS responsavel_nome, r.cpf AS responsavel_cpf,
           COALESCE(r.whatsapp, r.telefone) AS responsavel_contato, r.email AS responsavel_email,
           r.logradouro, r.numero, r.bairro, r.cidade, r.estado, r.cep
      FROM mensalidades m
      JOIN alunos a ON a.id = m.aluno_id
      LEFT JOIN turmas t ON t.id = a.turma_id
      LEFT JOIN contratos_financeiros c ON c.id = m.contrato_id
      LEFT JOIN responsaveis r ON r.id = c.responsavel_id
     WHERE m.competencia = ? ${filtroStatus}
     ORDER BY r.nome, a.nome`).all(competencia);

  const itens = db.prepare(`
    SELECT i.mensalidade_id, i.descricao, i.valor, i.tipo, cc.codigo AS centro_codigo
      FROM mensalidade_itens i
      LEFT JOIN centros_custo cc ON cc.id = i.centro_custo_id
     WHERE i.mensalidade_id IN (SELECT id FROM mensalidades WHERE competencia = ?)
     ORDER BY i.ordem`).all(competencia);

  const porMensalidade = new Map();
  for (const i of itens) {
    if (!porMensalidade.has(i.mensalidade_id)) porMensalidade.set(i.mensalidade_id, []);
    porMensalidade.get(i.mensalidade_id).push(i);
  }

  const documentos = linhas.map(l => {
    const total = Number((l.valor_original - l.valor_desconto + l.valor_acrescimo).toFixed(2));
    return {
      ...l,
      itens: porMensalidade.get(l.id) || [],
      valor_total: total,
      saldo: Number((total - l.valor_pago).toFixed(2)),
      endereco: [l.logradouro, l.numero, l.bairro, l.cidade, l.estado].filter(Boolean).join(', '),
    };
  });

  // Agrupado por responsável: é assim que a cobrança sai na prática
  const porResponsavel = [];
  const indice = new Map();
  for (const d of documentos) {
    const chave = d.responsavel_id || `sem-${d.aluno_id}`;
    if (!indice.has(chave)) {
      indice.set(chave, {
        responsavel_id: d.responsavel_id,
        responsavel_nome: d.responsavel_nome || '— sem responsável financeiro —',
        responsavel_cpf: d.responsavel_cpf,
        responsavel_contato: d.responsavel_contato,
        responsavel_email: d.responsavel_email,
        endereco: d.endereco,
        documentos: [],
        total: 0,
      });
      porResponsavel.push(indice.get(chave));
    }
    const g = indice.get(chave);
    g.documentos.push(d);
    g.total = Number((g.total + d.saldo).toFixed(2));
  }

  res.json({
    competencia,
    documentos,
    responsaveis: porResponsavel,
    totais: {
      documentos: documentos.length,
      responsaveis: porResponsavel.length,
      valor: Number(documentos.reduce((s, d) => s + d.saldo, 0).toFixed(2)),
      sem_responsavel: documentos.filter(d => !d.responsavel_id).length,
    },
  });
}));

// ── Baixa em lote ─────────────────────────────────────────────
router.post('/mensalidades/pagar-lote', rota((req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: 'Selecione ao menos uma parcela.' });

  const forma = FORMAS.includes(req.body.forma) ? req.body.forma : 'dinheiro';
  const data = req.body.data_pagamento || hoje();

  const inserir = db.prepare(`
    INSERT INTO pagamentos (mensalidade_id, valor, data_pagamento, forma, observacoes, registrado_por, registrado_nome, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  let quitadas = 0, ignoradas = 0, total = 0;

  const baixar = db.transaction(() => {
    for (const id of ids) {
      const linha = db.prepare(`${SELECT_MENS} WHERE m.id = ?`).get(id);
      if (!linha) { ignoradas++; continue; }
      const m = enriquecer(linha);
      if (m.status !== 'aberta' || m.saldo <= 0) { ignoradas++; continue; }

      inserir.run(id, m.saldo, data, forma, req.body.observacoes || 'Baixa em lote',
                  req.usuario?.id ?? null, req.usuario?.nome ?? null, agora());
      db.prepare(`UPDATE mensalidades SET status = 'paga' WHERE id = ?`).run(id);
      quitadas++;
      total += m.saldo;
    }
  });
  baixar();

  log(req, 'pagar-lote', 'mensalidades', null, `${quitadas} parcela(s) · R$ ${total.toFixed(2)}`);
  res.json({ ok: true, quitadas, ignoradas, total: Number(total.toFixed(2)) });
}));

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

    // Detalhamento do documento (mensalidade + cobranças do mês)
    p.itens = db.prepare(`
      SELECT i.descricao, i.valor, i.tipo, cc.codigo AS centro_codigo, cc.nome AS centro_nome
        FROM mensalidade_itens i
        LEFT JOIN centros_custo cc ON cc.id = i.centro_custo_id
       WHERE i.mensalidade_id = ? ORDER BY i.ordem`).all(p.id);
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
