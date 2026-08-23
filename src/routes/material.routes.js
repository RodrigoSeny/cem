// ═══════════════════════════════════════════════════════════════
// CEM — Pedagógico: listas de material e checklist de entrega por aluno
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const { db, log, agora } = require('../db');
const { filtrarCampos, montarInsert, montarUpdate, rota } = require('../util');

const router = express.Router();

const CAMPOS_LISTA = ['nome', 'tipo', 'escopo', 'ano_letivo', 'valor_alternativo', 'observacoes', 'ativa'];

// ══════════════════════ LISTAS (templates) ══════════════════════

router.get('/listas', rota((req, res) => {
  res.json(db.prepare(`
    SELECT l.*,
           (SELECT COUNT(*) FROM material_lista_itens li WHERE li.lista_id = l.id) AS qtd_itens,
           (SELECT COUNT(*) FROM material_lista_turmas mlt WHERE mlt.lista_id = l.id) AS qtd_turmas
      FROM material_listas l
     ORDER BY l.ativa DESC, l.nome`).all());
}));

router.post('/listas', rota((req, res) => {
  const d = filtrarCampos(req.body, CAMPOS_LISTA);
  if (!d.nome) return res.status(400).json({ error: 'Informe o nome da lista.' });
  if (!['coletivo', 'individual'].includes(d.tipo)) d.tipo = 'coletivo';
  if (!['geral', 'turma'].includes(d.escopo)) d.escopo = 'turma';
  d.ano_letivo = d.ano_letivo ? Number(d.ano_letivo) : null;
  d.valor_alternativo = d.valor_alternativo ? Number(d.valor_alternativo) : null;
  d.ativa = d.ativa === false || d.ativa === 0 || d.ativa === '0' ? 0 : 1;
  d.criado_em = agora();

  const { sql, valores } = montarInsert('material_listas', d);
  const info = db.prepare(sql).run(...valores);
  log(req, 'criar', 'material_listas', info.lastInsertRowid, d.nome);
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.put('/listas/:id', rota((req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM material_listas WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Lista não encontrada.' });
  }
  const d = filtrarCampos(req.body, CAMPOS_LISTA);
  if ('tipo' in d && !['coletivo', 'individual'].includes(d.tipo)) delete d.tipo;
  if ('escopo' in d && !['geral', 'turma'].includes(d.escopo)) delete d.escopo;
  if ('ano_letivo' in d) d.ano_letivo = d.ano_letivo ? Number(d.ano_letivo) : null;
  if ('valor_alternativo' in d) d.valor_alternativo = d.valor_alternativo ? Number(d.valor_alternativo) : null;
  if ('ativa' in d) d.ativa = d.ativa ? 1 : 0;
  d.atualizado_em = agora();

  const { sql, valores } = montarUpdate('material_listas', d, id);
  db.prepare(sql).run(...valores);
  log(req, 'atualizar', 'material_listas', id, null);
  res.json({ ok: true });
}));

router.delete('/listas/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const comEntrega = db.prepare(`
    SELECT COUNT(*) c FROM material_aluno_itens ai
      JOIN material_lista_itens li ON li.id = ai.item_id
     WHERE li.lista_id = ? AND ai.enviado = 1`).get(id).c;
  if (comEntrega) {
    return res.status(409).json({
      error: `Existem ${comEntrega} entrega(s) registrada(s) para itens desta lista. Desative-a em vez de excluir.`,
    });
  }
  db.prepare('DELETE FROM material_listas WHERE id = ?').run(id);
  log(req, 'excluir', 'material_listas', id, null);
  res.json({ ok: true });
}));

// Clona a lista + itens (ids novos). Não copia as turmas vinculadas — a
// duplicação existe pro fluxo "duplicar a lista do ano passado e vincular na
// turma deste ano", então as turmas são escolhidas de novo na cópia.
router.post('/listas/:id/duplicar', rota((req, res) => {
  const id = Number(req.params.id);
  const original = db.prepare('SELECT * FROM material_listas WHERE id = ?').get(id);
  if (!original) return res.status(404).json({ error: 'Lista não encontrada.' });
  const itens = db.prepare('SELECT * FROM material_lista_itens WHERE lista_id = ? ORDER BY ordem').all(id);

  let novoId;
  const duplicar = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO material_listas (nome, tipo, escopo, ano_letivo, valor_alternativo, observacoes, ativa, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `${original.nome} (cópia)`, original.tipo, original.escopo, original.ano_letivo,
      original.valor_alternativo, original.observacoes, original.ativa, agora()
    );
    novoId = info.lastInsertRowid;
    const inserirItem = db.prepare(`
      INSERT INTO material_lista_itens (lista_id, ordem, quantidade, descricao, observacao)
      VALUES (?, ?, ?, ?, ?)`);
    for (const it of itens) inserirItem.run(novoId, it.ordem, it.quantidade, it.descricao, it.observacao);
  });
  duplicar();

  log(req, 'duplicar', 'material_listas', novoId, `cópia de ${original.nome}`);
  res.status(201).json({ id: novoId });
}));

// ── Itens da lista (salvo por diferença — nunca apaga tudo e reinsere,
//    porque material_aluno_itens.item_id referencia o item: apagar destruiria
//    o checklist já marcado a cada edição de texto) ──────────────

router.get('/listas/:id/itens', rota((req, res) => {
  res.json(db.prepare('SELECT * FROM material_lista_itens WHERE lista_id = ? ORDER BY ordem').all(Number(req.params.id)));
}));

router.put('/listas/:id/itens', rota((req, res) => {
  const listaId = Number(req.params.id);
  if (!db.prepare('SELECT id FROM material_listas WHERE id = ?').get(listaId)) {
    return res.status(404).json({ error: 'Lista não encontrada.' });
  }
  const linhas = (Array.isArray(req.body.itens) ? req.body.itens : [])
    .filter(l => String(l.descricao || '').trim());

  const existentes = db.prepare('SELECT id FROM material_lista_itens WHERE lista_id = ?').all(listaId).map(r => r.id);
  const mantidos = linhas.filter(l => l.id).map(l => Number(l.id));
  const removidos = existentes.filter(id => !mantidos.includes(id));

  if (removidos.length) {
    const marcador = removidos.map(() => '?').join(',');
    const comEntrega = db.prepare(`
      SELECT li.descricao FROM material_lista_itens li
       WHERE li.id IN (${marcador})
         AND EXISTS (SELECT 1 FROM material_aluno_itens ai WHERE ai.item_id = li.id AND ai.enviado = 1)`
    ).all(...removidos);
    if (comEntrega.length) {
      return res.status(409).json({
        error: `Não é possível remover "${comEntrega[0].descricao}" — já há entrega registrada para este item. Desative a lista em vez de excluir o item.`,
      });
    }
  }

  const salvar = db.transaction(() => {
    if (removidos.length) {
      const marcador = removidos.map(() => '?').join(',');
      db.prepare(`DELETE FROM material_lista_itens WHERE id IN (${marcador})`).run(...removidos);
    }
    const inserir = db.prepare(`
      INSERT INTO material_lista_itens (lista_id, ordem, quantidade, descricao, observacao)
      VALUES (?, ?, ?, ?, ?)`);
    const atualizar = db.prepare(`
      UPDATE material_lista_itens SET ordem = ?, quantidade = ?, descricao = ?, observacao = ?
       WHERE id = ? AND lista_id = ?`);

    linhas.forEach((l, i) => {
      const quantidade = Number(l.quantidade) || 1;
      const descricao = String(l.descricao).trim();
      const observacao = l.observacao ? String(l.observacao).trim() : null;
      if (l.id) atualizar.run(i, quantidade, descricao, observacao, Number(l.id), listaId);
      else inserir.run(listaId, i, quantidade, descricao, observacao);
    });

    db.prepare('UPDATE material_listas SET atualizado_em = ? WHERE id = ?').run(agora(), listaId);
  });
  salvar();

  log(req, 'atualizar', 'material_lista_itens', listaId, `${linhas.length} item(ns)`);
  res.json({ ok: true });
}));

// ── Turmas vinculadas (aqui sim é seguro apagar tudo e reinserir — não há
//    tabela filha dependente do id de material_lista_turmas) ───────

router.get('/listas/:id/turmas', rota((req, res) => {
  res.json(db.prepare(`
    SELECT mlt.turma_id, t.nome AS turma_nome FROM material_lista_turmas mlt
      JOIN turmas t ON t.id = mlt.turma_id
     WHERE mlt.lista_id = ?
     ORDER BY t.nome`).all(Number(req.params.id)));
}));

router.put('/listas/:id/turmas', rota((req, res) => {
  const listaId = Number(req.params.id);
  if (!db.prepare('SELECT id FROM material_listas WHERE id = ?').get(listaId)) {
    return res.status(404).json({ error: 'Lista não encontrada.' });
  }
  const turmaIds = [...new Set((Array.isArray(req.body.turma_ids) ? req.body.turma_ids : []).map(Number))];

  const substituir = db.transaction(() => {
    db.prepare('DELETE FROM material_lista_turmas WHERE lista_id = ?').run(listaId);
    const inserir = db.prepare('INSERT INTO material_lista_turmas (lista_id, turma_id) VALUES (?, ?)');
    for (const t of turmaIds) inserir.run(listaId, t);
  });
  substituir();

  log(req, 'atualizar', 'material_lista_turmas', listaId, `${turmaIds.length} turma(s)`);
  res.json({ ok: true });
}));

// ══════════════════════ CHECKLIST POR ALUNO ══════════════════════

/** Itens que se aplicam a um aluno: listas ativas 'geral', ou 'turma' vinculadas
 *  à turma do aluno — com o estado marcado (LEFT JOIN; sem linha = não enviado). */
function itensAplicaveis(alunoId, turmaId) {
  return db.prepare(`
    SELECT li.id, li.lista_id, li.ordem, li.quantidade, li.descricao, li.observacao,
           l.nome AS lista_nome, l.tipo AS lista_tipo, l.escopo AS lista_escopo,
           l.valor_alternativo, l.observacoes AS lista_observacoes,
           COALESCE(ai.enviado, 0) AS enviado, ai.enviado_em, ai.marcado_por, u.nome AS marcado_por_nome
      FROM material_lista_itens li
      JOIN material_listas l ON l.id = li.lista_id AND l.ativa = 1
      LEFT JOIN material_aluno_itens ai ON ai.item_id = li.id AND ai.aluno_id = ?
      LEFT JOIN usuarios u ON u.id = ai.marcado_por
     WHERE l.escopo = 'geral'
        OR (l.escopo = 'turma' AND EXISTS (
              SELECT 1 FROM material_lista_turmas mlt WHERE mlt.lista_id = l.id AND mlt.turma_id = ?
            ))
     ORDER BY l.escopo DESC, l.nome, li.ordem`
  ).all(alunoId, turmaId);
}

router.get('/alunos/:alunoId/checklist', rota((req, res) => {
  const alunoId = Number(req.params.alunoId);
  const aluno = db.prepare(`
    SELECT a.id, a.nome, a.matricula, a.turma_id, t.nome AS turma_nome
      FROM alunos a LEFT JOIN turmas t ON t.id = a.turma_id WHERE a.id = ?`).get(alunoId);
  if (!aluno) return res.status(404).json({ error: 'Aluno não encontrado.' });

  res.json({ aluno, itens: itensAplicaveis(alunoId, aluno.turma_id) });
}));

// Registrada ANTES de '/itens/:itemId' — senão o Express casaria "lote" como
// se fosse um itemId (rota literal precisa vir antes da rota com parâmetro).
router.post('/alunos/:alunoId/itens/lote', rota((req, res) => {
  const alunoId = Number(req.params.alunoId);
  if (!db.prepare('SELECT id FROM alunos WHERE id = ?').get(alunoId)) {
    return res.status(404).json({ error: 'Aluno não encontrado.' });
  }
  const itemIds = Array.isArray(req.body.item_ids) ? req.body.item_ids.map(Number) : [];
  const enviado = req.body.enviado ? 1 : 0;
  const quando = enviado ? agora() : null;

  const marcarTodos = db.transaction((ids) => {
    const buscar = db.prepare('SELECT id FROM material_aluno_itens WHERE aluno_id = ? AND item_id = ?');
    const atualizar = db.prepare('UPDATE material_aluno_itens SET enviado = ?, enviado_em = ?, marcado_por = ? WHERE id = ?');
    const inserir = db.prepare(`
      INSERT INTO material_aluno_itens (aluno_id, item_id, enviado, enviado_em, marcado_por)
      VALUES (?, ?, ?, ?, ?)`);
    for (const itemId of ids) {
      const existente = buscar.get(alunoId, itemId);
      if (existente) atualizar.run(enviado, quando, req.usuario.id, existente.id);
      else inserir.run(alunoId, itemId, enviado, quando, req.usuario.id);
    }
  });
  marcarTodos(itemIds);

  log(req, enviado ? 'marcar-entregue-lote' : 'desmarcar-lote', 'material_aluno_itens', null, `aluno ${alunoId} · ${itemIds.length} item(ns)`);
  res.json({ ok: true, marcados: itemIds.length });
}));

router.post('/alunos/:alunoId/itens/:itemId', rota((req, res) => {
  const alunoId = Number(req.params.alunoId);
  const itemId = Number(req.params.itemId);
  if (!db.prepare('SELECT id FROM alunos WHERE id = ?').get(alunoId)) {
    return res.status(404).json({ error: 'Aluno não encontrado.' });
  }
  if (!db.prepare('SELECT id FROM material_lista_itens WHERE id = ?').get(itemId)) {
    return res.status(404).json({ error: 'Item não encontrado.' });
  }
  const enviado = req.body.enviado ? 1 : 0;
  const quando = enviado ? agora() : null;

  const existente = db.prepare('SELECT id FROM material_aluno_itens WHERE aluno_id = ? AND item_id = ?').get(alunoId, itemId);
  if (existente) {
    db.prepare('UPDATE material_aluno_itens SET enviado = ?, enviado_em = ?, marcado_por = ? WHERE id = ?')
      .run(enviado, quando, req.usuario.id, existente.id);
  } else {
    db.prepare(`
      INSERT INTO material_aluno_itens (aluno_id, item_id, enviado, enviado_em, marcado_por)
      VALUES (?, ?, ?, ?, ?)`
    ).run(alunoId, itemId, enviado, quando, req.usuario.id);
  }

  log(req, enviado ? 'marcar-entregue' : 'desmarcar', 'material_aluno_itens', itemId, `aluno ${alunoId}`);
  res.json({ ok: true });
}));

// ══════════════════════ RESUMO POR TURMA ══════════════════════

router.get('/turmas/:turmaId/checklist-resumo', rota((req, res) => {
  const turmaId = Number(req.params.turmaId);
  const alunos = db.prepare(`
    SELECT id, nome, matricula FROM alunos
     WHERE turma_id = ? AND situacao NOT IN ('transferido', 'desistente', 'egresso')
     ORDER BY nome`).all(turmaId);

  const resumo = alunos.map(a => {
    const itens = itensAplicaveis(a.id, turmaId);
    const total = itens.length;
    const entregues = itens.filter(i => i.enviado).length;
    return { ...a, total_itens: total, entregues, percentual: total ? Math.round((entregues / total) * 100) : 0 };
  });

  res.json(resumo);
}));

module.exports = router;
