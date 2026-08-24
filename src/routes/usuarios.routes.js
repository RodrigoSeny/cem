// ═══════════════════════════════════════════════════════════════
// CEM — Usuários do sistema e perfis de acesso
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const bcrypt = require('bcryptjs');
const { db, log, agora } = require('../db');
const { rota } = require('../util');
const { PAGINAS, isMaster, isAdmin, PERFIL_MASTER, PAGINAS_MASTER } = require('../auth');

const usuarios = express.Router();
const perfis = express.Router();

const CONFLITOS = { 'usuarios.login': 'Já existe um usuário com este login.' };

// Prazo pra usar uma senha provisória (enviada no convite do app) antes de expirar.
const VALIDADE_PROVISORIA_DIAS = 7;
const validadeProvisoria = () => agora(VALIDADE_PROVISORIA_DIAS * 86400000);

/** Só o Master enxerga e manipula o perfil Master e quem o usa. */
const soMaster = (req, res) =>
  res.status(403).json({ error: 'O perfil Master é gerenciado apenas por um usuário Master.' });

/** O perfil_id informado dá acesso administrativo (Master ou Direção)? */
const perfilEhAdmin = perfilId => isAdmin({ tipo: 'funcionario', perfil_id: perfilId });

/** Só quem já é administrativo (Master/Direção) mexe em conta administrativa
 *  ou concede perfil administrativo a alguém — senão dá pra se autopromover. */
const soAdmin = (req, res) =>
  res.status(403).json({ error: 'Somente um perfil administrativo pode conceder ou alterar um perfil administrativo.' });

// ══════════════════════ USUÁRIOS ══════════════════════════════

usuarios.get('/', rota((req, res) => {
  // Para quem não é Master, os usuários Master simplesmente não existem
  const filtro = isMaster(req.usuario) ? '' : `WHERE u.perfil_id IS NOT '${PERFIL_MASTER}'`;

  res.json(db.prepare(`
    SELECT u.id, u.nome, u.login, u.email, u.tipo, u.ativo, u.ultimo_login,
           u.precisa_trocar_senha, u.senha_valida_ate, u.perfil_id, p.nome AS perfil_nome,
           u.funcionario_id, f.nome AS funcionario_nome,
           u.responsavel_id, r.nome AS responsavel_nome
      FROM usuarios u
      LEFT JOIN perfis p        ON p.id = u.perfil_id
      LEFT JOIN funcionarios f  ON f.id = u.funcionario_id
      LEFT JOIN responsaveis r  ON r.id = u.responsavel_id
      ${filtro}
     ORDER BY u.tipo, u.nome`).all());
}));

usuarios.post('/', rota((req, res) => {
  const nome = String(req.body.nome || '').trim();
  const login = String(req.body.login || '').trim();
  const senha = String(req.body.senha || '');
  const tipo = req.body.tipo === 'responsavel' ? 'responsavel' : 'funcionario';

  if (!nome || !login) return res.status(400).json({ error: 'Informe nome e login.' });
  if (senha.length < 6) return res.status(400).json({ error: 'A senha precisa ter ao menos 6 caracteres.' });
  if (tipo === 'funcionario' && !req.body.perfil_id) {
    return res.status(400).json({ error: 'Selecione o perfil de acesso do funcionário.' });
  }
  // Só um Master cria outro Master
  if (req.body.perfil_id === PERFIL_MASTER && !isMaster(req.usuario)) return soMaster(req, res);
  if (tipo === 'responsavel' && !req.body.responsavel_id) {
    return res.status(400).json({ error: 'Selecione o responsável vinculado a este acesso.' });
  }

  const precisaTrocar = req.body.precisa_trocar_senha === false ? 0 : 1;
  const senhaValidaAte = precisaTrocar ? validadeProvisoria() : null;

  const info = db.prepare(`
    INSERT INTO usuarios (nome, login, email, senha_hash, tipo, perfil_id, funcionario_id, responsavel_id, ativo, precisa_trocar_senha, senha_valida_ate, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`)
    .run(
      nome, login, req.body.email || null, bcrypt.hashSync(senha, 10), tipo,
      tipo === 'funcionario' ? (req.body.perfil_id || null) : 'PERFIL-RESPONSAVEL',
      req.body.funcionario_id ? Number(req.body.funcionario_id) : null,
      req.body.responsavel_id ? Number(req.body.responsavel_id) : null,
      precisaTrocar, senhaValidaAte,
      agora()
    );

  log(req, 'criar', 'usuarios', info.lastInsertRowid, `${login} (${tipo})`);
  res.status(201).json({ id: info.lastInsertRowid, senha_valida_ate: senhaValidaAte });
}, CONFLITOS));

usuarios.put('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });

  // Mexer num usuário Master, ou promover alguém a Master, é coisa de Master
  if (u.perfil_id === PERFIL_MASTER && !isMaster(req.usuario)) return soMaster(req, res);
  if (req.body.perfil_id === PERFIL_MASTER && !isMaster(req.usuario)) return soMaster(req, res);

  // Mexer numa conta administrativa (Direção), ou conceder um perfil
  // administrativo a alguém, é coisa de quem já é administrativo — senão
  // dá pra qualquer um com a página "Usuários" se autopromover a Direção.
  if (perfilEhAdmin(u.perfil_id) && !isAdmin(req.usuario)) return soAdmin(req, res);
  if (req.body.perfil_id && perfilEhAdmin(req.body.perfil_id) && !isAdmin(req.usuario)) return soAdmin(req, res);

  // Não deixar o sistema ficar sem nenhum Master ativo
  if (u.perfil_id === PERFIL_MASTER) {
    const virandoOutroPerfil = req.body.perfil_id && req.body.perfil_id !== PERFIL_MASTER;
    const desativando = req.body.ativo !== undefined && !req.body.ativo;
    if (virandoOutroPerfil || desativando) {
      const ativos = db.prepare(
        `SELECT COUNT(*) c FROM usuarios WHERE perfil_id = ? AND ativo = 1 AND id <> ?`
      ).get(PERFIL_MASTER, id).c;
      if (!ativos) {
        return res.status(409).json({
          error: 'Este é o último Master ativo. Crie outro Master antes de desativar ou rebaixar este.',
        });
      }
    }
  }

  db.prepare(`
    UPDATE usuarios SET nome = ?, login = ?, email = ?, perfil_id = ?, ativo = ?, atualizado_em = ?
     WHERE id = ?`)
    .run(
      req.body.nome ?? u.nome,
      String(req.body.login ?? u.login).trim(),
      req.body.email ?? u.email,
      u.tipo === 'responsavel' ? 'PERFIL-RESPONSAVEL' : (req.body.perfil_id ?? u.perfil_id),
      req.body.ativo === undefined ? u.ativo : (req.body.ativo ? 1 : 0),
      agora(), id
    );

  log(req, 'atualizar', 'usuarios', id, u.login);
  res.json({ ok: true });
}, CONFLITOS));

usuarios.post('/:id/senha', rota((req, res) => {
  const id = Number(req.params.id);
  const senha = String(req.body.senha || '');
  if (senha.length < 6) return res.status(400).json({ error: 'A senha precisa ter ao menos 6 caracteres.' });

  const alvo = db.prepare('SELECT perfil_id FROM usuarios WHERE id = ?').get(id);
  if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });

  // Redefinir a senha de um Master daria acesso total a quem não é Master
  if (alvo.perfil_id === PERFIL_MASTER && !isMaster(req.usuario)) return soMaster(req, res);
  // Idem pra qualquer conta administrativa (Direção) redefinida por quem
  // não é administrativo — senão dá pra sequestrar a conta de um colega.
  if (perfilEhAdmin(alvo.perfil_id) && !isAdmin(req.usuario)) return soAdmin(req, res);
  const senhaValidaAte = validadeProvisoria();
  db.prepare('UPDATE usuarios SET senha_hash = ?, precisa_trocar_senha = 1, senha_valida_ate = ?, tentativas = 0, bloqueado_ate = NULL, atualizado_em = ? WHERE id = ?')
    .run(bcrypt.hashSync(senha, 10), senhaValidaAte, agora(), id);
  log(req, 'redefinir-senha', 'usuarios', id, null);
  res.json({ ok: true, senha_valida_ate: senhaValidaAte });
}));

usuarios.delete('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (u.id === req.usuario.id) return res.status(403).json({ error: 'Você não pode excluir o próprio acesso.' });

  if (u.perfil_id === PERFIL_MASTER) {
    // Master só é excluído por outro Master, e nunca o último
    if (!isMaster(req.usuario)) return soMaster(req, res);
    const ativos = db.prepare(
      `SELECT COUNT(*) c FROM usuarios WHERE perfil_id = ? AND ativo = 1 AND id <> ?`
    ).get(PERFIL_MASTER, id).c;
    if (!ativos) {
      return res.status(409).json({ error: 'Este é o último Master ativo — o sistema ficaria sem administrador.' });
    }
  } else if (perfilEhAdmin(u.perfil_id) && !isAdmin(req.usuario)) {
    // Conta administrativa (Direção) só é excluída por quem também é administrativo.
    return soAdmin(req, res);
  }

  db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
  log(req, 'excluir', 'usuarios', id, u.login);
  res.json({ ok: true });
}));

// ══════════════════════ PERFIS ════════════════════════════════

// Páginas exclusivas do Master não aparecem na montagem de perfis
perfis.get('/paginas', rota((req, res) => {
  const lista = isMaster(req.usuario) ? PAGINAS : PAGINAS.filter(p => !p.master);
  res.json(lista);
}));

perfis.get('/', rota((req, res) => {
  const filtro = isMaster(req.usuario) ? '' : `WHERE p.id IS NOT '${PERFIL_MASTER}'`;
  const linhas = db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM usuarios u WHERE u.perfil_id = p.id) AS qtd_usuarios
      FROM perfis p ${filtro} ORDER BY p.sistema DESC, p.nome`).all();
  res.json(linhas.map(p => ({ ...p, paginas: JSON.parse(p.paginas || '[]') })));
}));

perfis.post('/', rota((req, res) => {
  const nome = String(req.body.nome || '').trim();
  if (!nome) return res.status(400).json({ error: 'Informe o nome do perfil.' });

  const semAcento = nome.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const id = 'PERFIL-' + semAcento.replace(/[^A-Z0-9]+/g, '-').slice(0, 24);
  if (id === PERFIL_MASTER) return res.status(409).json({ error: 'Este nome é reservado ao perfil do sistema.' });

  // Ninguém cria um perfil com página exclusiva do Master
  const pedidas = Array.isArray(req.body.paginas) ? req.body.paginas : [];
  const paginas = JSON.stringify(pedidas.filter(p => !PAGINAS_MASTER.includes(p)));

  db.prepare('INSERT INTO perfis (id, nome, descricao, paginas, sistema) VALUES (?, ?, ?, ?, 0)')
    .run(id, nome, req.body.descricao || null, paginas);
  log(req, 'criar', 'perfis', null, nome);
  res.status(201).json({ id });
}, { 'perfis.nome': 'Já existe um perfil com este nome.' }));

perfis.put('/:id', rota((req, res) => {
  const p = db.prepare('SELECT * FROM perfis WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Perfil não encontrado.' });
  if (p.id === PERFIL_MASTER) {
    if (!isMaster(req.usuario)) return soMaster(req, res);
    return res.status(403).json({ error: 'O perfil Master tem acesso total por definição e não é editável.' });
  }

  const paginas = Array.isArray(req.body.paginas)
    ? JSON.stringify(req.body.paginas.filter(x => !PAGINAS_MASTER.includes(x)))
    : p.paginas;
  db.prepare('UPDATE perfis SET nome = ?, descricao = ?, paginas = ? WHERE id = ?')
    .run(req.body.nome ?? p.nome, req.body.descricao ?? p.descricao, paginas, p.id);
  log(req, 'atualizar', 'perfis', null, p.nome);
  res.json({ ok: true });
}, { 'perfis.nome': 'Já existe um perfil com este nome.' }));

perfis.delete('/:id', rota((req, res) => {
  const p = db.prepare('SELECT * FROM perfis WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Perfil não encontrado.' });
  if (p.id === PERFIL_MASTER && !isMaster(req.usuario)) return soMaster(req, res);
  if (p.sistema) return res.status(403).json({ error: 'Perfis do sistema não podem ser excluídos.' });

  const uso = db.prepare('SELECT COUNT(*) c FROM usuarios WHERE perfil_id = ?').get(p.id).c;
  if (uso) return res.status(409).json({ error: `Existem ${uso} usuário(s) com este perfil.` });

  db.prepare('DELETE FROM perfis WHERE id = ?').run(p.id);
  log(req, 'excluir', 'perfis', null, p.nome);
  res.json({ ok: true });
}));

module.exports = { usuarios, perfis };
