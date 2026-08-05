// ═══════════════════════════════════════════════════════════════
// CEM — Contas bancárias e importação de extratos OFX
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const { db, log, agora } = require('../db');
const { filtrarCampos, montarInsert, montarUpdate, bool01, rota } = require('../util');

const router = express.Router();

// ── Parser OFX ───────────────────────────────────────────────
function parsearData(raw) {
  if (!raw) return '';
  const m = String(raw).match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

function parsearOFX(conteudo) {
  const texto = conteudo.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const ehXML = /^\s*<\?xml/i.test(texto);

  let bankId = '', branchId = '', acctId = '', dtStart = '', dtEnd = '';
  const transacoes = [];

  if (ehXML) {
    const tag = (t, src) => {
      const m = src.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`, 'i'));
      return m ? m[1].trim() : '';
    };
    bankId   = tag('BANKID', texto);
    branchId = tag('BRANCHID', texto);
    acctId   = tag('ACCTID', texto);
    dtStart  = parsearData(tag('DTSTART', texto));
    dtEnd    = parsearData(tag('DTEND', texto));

    for (const [, bloco] of texto.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)) {
      const amt   = parseFloat(tag('TRNAMT', bloco)) || 0;
      const fitid = tag('FITID', bloco);
      const dt    = parsearData(tag('DTPOSTED', bloco));
      if (!fitid || !dt) continue;
      transacoes.push({
        fitid,
        tipo: amt >= 0 ? 'CREDIT' : 'DEBIT',
        data_lancamento: dt,
        valor: Math.abs(amt),
        descricao: tag('MEMO', bloco) || tag('NAME', bloco) || '',
        nome_beneficiario: tag('NAME', bloco) || '',
      });
    }
  } else {
    // OFX 1.x SGML — pula o cabeçalho de chave:valor
    const corte = texto.indexOf('\n\n');
    const body  = corte >= 0 ? texto.slice(corte) : texto;

    const tagVal = (t, src) => {
      const m = src.match(new RegExp(`<${t}>([^<\\n]*)`, 'i'));
      return m ? m[1].trim() : '';
    };

    bankId   = tagVal('BANKID', body);
    branchId = tagVal('BRANCHID', body);
    acctId   = tagVal('ACCTID', body);
    dtStart  = parsearData(tagVal('DTSTART', body));
    dtEnd    = parsearData(tagVal('DTEND', body));

    const partes = body.split(/<STMTTRN>/i);
    for (let i = 1; i < partes.length; i++) {
      const bloco = partes[i];
      const amt   = parseFloat((tagVal('TRNAMT', bloco) || '0').replace(',', '.')) || 0;
      const fitid = tagVal('FITID', bloco);
      const dt    = parsearData(tagVal('DTPOSTED', bloco));
      if (!fitid || !dt) continue;
      transacoes.push({
        fitid,
        tipo: amt >= 0 ? 'CREDIT' : 'DEBIT',
        data_lancamento: dt,
        valor: Math.abs(amt),
        descricao: tagVal('MEMO', bloco) || tagVal('NAME', bloco) || '',
        nome_beneficiario: tagVal('NAME', bloco) || '',
      });
    }
  }

  return { bankId, branchId, acctId, dtStart, dtEnd, transacoes };
}

// ══════════════════ CONTAS BANCÁRIAS ═════════════════════════

router.get('/contas', rota((req, res) => {
  const contas = db.prepare(`
    SELECT cb.*,
           (SELECT COUNT(*) FROM importacoes_ofx i WHERE i.conta_id = cb.id) AS qtd_importacoes,
           (SELECT COUNT(*) FROM ofx_transacoes t
             JOIN importacoes_ofx i ON i.id = t.importacao_id
            WHERE i.conta_id = cb.id AND t.status = 'pendente') AS pendentes
      FROM contas_bancarias cb ORDER BY cb.ativa DESC, cb.nome`).all();
  res.json(contas);
}));

router.post('/contas', rota((req, res) => {
  const d = filtrarCampos(req.body, ['nome','banco','codigo_banco','agencia','conta','tipo','saldo_inicial','data_inicial','ativa']);
  if (!d.nome) return res.status(400).json({ error: 'Informe o nome da conta.' });
  if (!d.banco) return res.status(400).json({ error: 'Informe o banco.' });
  d.saldo_inicial = Number(d.saldo_inicial) || 0;
  d.ativa = 'ativa' in d ? bool01(d.ativa) : 1;
  const { sql, valores } = montarInsert('contas_bancarias', d);
  const info = db.prepare(sql).run(...valores);
  log(req, 'criar', 'contas_bancarias', info.lastInsertRowid, d.nome);
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.put('/contas/:id', rota((req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM contas_bancarias WHERE id = ?').get(id))
    return res.status(404).json({ error: 'Conta não encontrada.' });
  const d = filtrarCampos(req.body, ['nome','banco','codigo_banco','agencia','conta','tipo','saldo_inicial','data_inicial','ativa']);
  if (!Object.keys(d).length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
  if ('ativa' in d) d.ativa = bool01(d.ativa);
  if ('saldo_inicial' in d) d.saldo_inicial = Number(d.saldo_inicial) || 0;
  const { sql, valores } = montarUpdate('contas_bancarias', d, id);
  db.prepare(sql).run(...valores);
  log(req, 'atualizar', 'contas_bancarias', id, null);
  res.json({ ok: true });
}));

router.delete('/contas/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const imp = db.prepare('SELECT COUNT(*) c FROM importacoes_ofx WHERE conta_id = ?').get(id).c;
  if (imp) return res.status(409).json({ error: `Esta conta possui ${imp} importação(ões). Remova-as antes de excluir.` });
  db.prepare('DELETE FROM contas_bancarias WHERE id = ?').run(id);
  log(req, 'excluir', 'contas_bancarias', id, null);
  res.json({ ok: true });
}));

// ══════════════════ IMPORTAÇÃO OFX ═══════════════════════════

router.post('/importar', rota((req, res) => {
  const { conta_id, nome_arquivo, conteudo } = req.body;
  if (!conteudo) return res.status(400).json({ error: 'Envie o conteúdo do arquivo OFX.' });
  if (!conta_id) return res.status(400).json({ error: 'Selecione a conta bancária.' });

  const conta = db.prepare('SELECT * FROM contas_bancarias WHERE id = ?').get(Number(conta_id));
  if (!conta) return res.status(404).json({ error: 'Conta não encontrada.' });

  let parsed;
  try { parsed = parsearOFX(conteudo); }
  catch (e) { return res.status(400).json({ error: 'Arquivo OFX inválido ou não reconhecido: ' + e.message }); }

  if (!parsed.transacoes.length)
    return res.status(400).json({ error: 'Nenhuma transação encontrada no arquivo.' });

  // Verifica duplicatas: fitids já importados para esta conta
  const existentes = new Set(
    db.prepare(`
      SELECT t.fitid FROM ofx_transacoes t
       JOIN importacoes_ofx i ON i.id = t.importacao_id
      WHERE i.conta_id = ?`).all(Number(conta_id)).map(r => r.fitid)
  );

  const novas = parsed.transacoes.filter(t => !existentes.has(t.fitid));
  const duplicadas = parsed.transacoes.length - novas.length;

  const salvar = db.transaction(() => {
    const imp = db.prepare(`
      INSERT INTO importacoes_ofx
        (conta_id, banco_origem, agencia_origem, conta_origem, periodo_inicio, periodo_fim,
         total_transacoes, nome_arquivo, importado_por, importado_nome, importado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        conta.id, parsed.bankId || conta.banco, parsed.branchId || conta.agencia,
        parsed.acctId || conta.conta, parsed.dtStart, parsed.dtEnd,
        novas.length, nome_arquivo || 'extrato.ofx',
        req.usuario?.id ?? null, req.usuario?.nome ?? null, agora()
      );

    const stmt = db.prepare(`
      INSERT INTO ofx_transacoes
        (importacao_id, conta_id, fitid, tipo, data_lancamento, valor, descricao, nome_beneficiario, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    for (const t of novas) {
      stmt.run(imp.lastInsertRowid, conta.id, t.fitid, t.tipo, t.data_lancamento,
               t.valor, t.descricao, t.nome_beneficiario, agora());
    }

    return imp.lastInsertRowid;
  });

  const importacaoId = salvar();
  log(req, 'importar-ofx', 'importacoes_ofx', importacaoId,
      `${novas.length} transação(ões) · ${duplicadas} duplicada(s)`);

  res.status(201).json({
    id: importacaoId,
    importadas: novas.length,
    duplicadas,
    periodo_inicio: parsed.dtStart,
    periodo_fim: parsed.dtEnd,
  });
}));

router.get('/importacoes', rota((req, res) => {
  const { conta_id } = req.query;
  const cond = conta_id ? 'WHERE i.conta_id = ?' : '';
  const par  = conta_id ? [Number(conta_id)] : [];
  const lista = db.prepare(`
    SELECT i.*,
           cb.nome AS conta_nome, cb.banco, cb.agencia, cb.conta AS numero_conta,
           (SELECT COUNT(*) FROM ofx_transacoes t WHERE t.importacao_id = i.id) AS total,
           (SELECT COUNT(*) FROM ofx_transacoes t WHERE t.importacao_id = i.id AND t.status = 'pendente') AS pendentes,
           (SELECT COUNT(*) FROM ofx_transacoes t WHERE t.importacao_id = i.id AND t.status = 'conciliado') AS conciliados,
           (SELECT COUNT(*) FROM ofx_transacoes t WHERE t.importacao_id = i.id AND t.status = 'descartado') AS descartados
      FROM importacoes_ofx i
      LEFT JOIN contas_bancarias cb ON cb.id = i.conta_id
      ${cond}
     ORDER BY i.importado_em DESC`).all(...par);
  res.json(lista);
}));

router.delete('/importacoes/:id', rota((req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM importacoes_ofx WHERE id = ?').get(id))
    return res.status(404).json({ error: 'Importação não encontrada.' });
  db.prepare('DELETE FROM importacoes_ofx WHERE id = ?').run(id);
  log(req, 'excluir', 'importacoes_ofx', id, null);
  res.json({ ok: true });
}));

module.exports = router;
