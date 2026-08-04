// ═══════════════════════════════════════════════════════════════
// CEM — Usuários do sistema e perfis de acesso
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const bcrypt = require('bcryptjs');
const { db, log, agora } = require('../db');
const { rota, tratarErro } = require('../util');
const { PAGINAS } = require('../auth');

const usuarios = express.Router();
const perfis = express.Router();

const CONFLITOS = { 'usuarios.login': 'Já existe um usuário com este login.' };

// ══════════════════════ USUÁRIOS ══════════════════════════════

usuarios.get('/', rota((req, res) => {
  res.json(db.prepare(`
    SELECT u.id, u.nome, u.login, u.email, u.tipo, u.ativo, u.ultimo_login,
           u.precisa_trocar_senha, u.perfil_id, p.nome AS perfil_nome,
           u.funcionario_id, f.nome AS funcionario_nome,
           u.responsavel_id, r.nome AS responsavel_nome
      FROM usuarios u
      LEFT JOIN perfis p        ON p.id = u.perfil_id
      LEFT JOIN funcionarios f  ON f.id = u.funcionario_id
      LEFT JOIN responsaveis r  ON r.id = u.responsavel_id
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
  if (tipo === 'responsavel' && !req.body.responsavel_id) {
    return res.status(400).json({ error: 'Selecione o responsável vinculado a este acesso.' });
  }

  const info = db.prepare(`
    INSERT INTO usuarios (nome, login, email, senha_hash, tipo, perfil_id, funcionario_id, responsavel_id, ativo, precisa_trocar_senha, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
    .run(
      nome, login, req.body.email || null, bcrypt.hashSync(senha, 10), tipo,
      tipo === 'funcionario' ? (req.body.perfil_id || null) : 'PERFIL-RESPONSAVEL',
      req.body.funcionario_id ? Number(req.body.funcionario_id) : null,
      req.body.responsavel_id ? Number(req.body.responsavel_id) : null,
      req.body.precisa_trocar_senha === false ? 0 : 1,
      agora()
    );

  log(req, 'criar', 'usuarios', info.lastInsertRowid, `${login} (${tipo})`);
  res.status(201).json({ id: info.lastInsertRowid });
}, CONFLITOS));

usuarios.put('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });

  if (u.perfil_id === 'PERFIL-MASTER' && req.body.ativo === 0 && req.usuario.id !== u.id) {
    return res.status(403).json({ error: 'O usuário master não pode ser desativado.' });
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
  if (!db.prepare('SELECT id FROM usuarios WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }
  db.prepare('UPDATE usuarios SET senha_hash = ?, precisa_trocar_senha = 1, tentativas = 0, bloqueado_ate = NULL, atualizado_em = ? WHERE id = ?')
    .run(bcrypt.hashSync(senha, 10), agora(), id);
  log(req, 'redefinir-senha', 'usuarios', id, null);
  res.json({ ok: true });
}));

usuarios.delete('/:id', rota((req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (u.perfil_id === 'PERFIL-MASTER') return res.status(403).json({ error: 'O usuário master não pode ser excluído.' });
  if (u.id === req.usuario.id) return res.status(403).json({ error: 'Você não pode excluir o próprio acesso.' });

  db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
  log(req, 'excluir', 'usuarios', id, u.login);
  res.json({ ok: true });
}));

// ══════════════════════ PERFIS ════════════════════════════════

perfis.get('/paginas', rota((req, res) => res.json(PAGINAS)));

perfis.get('/', rota((req, res) => {
  const linhas = db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM usuarios u WHERE u.perfil_id = p.id) AS qtd_usuarios
      FROM perfis p ORDER BY p.sistema DESC, p.nome`).all();
  res.json(linhas.map(p => ({ ...p, paginas: JSON.parse(p.paginas || '[]') })));
}));

perfis.post('/', rota((req, res) => {
  const nome = String(req.body.nome || '').trim();
  if (!nome) return res.status(400).json({ error: 'Informe o nome do perfil.' });

  const semAcento = nome.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const id = 'PERFIL-' + semAcento.replace(/[^A-Z0-9]+/g, '-').slice(0, 24);
  const paginas = JSON.stringify(Array.isArray(req.body.paginas) ? req.body.paginas : []);

  db.prepare('INSERT INTO perfis (id, nome, descricao, paginas, sistema) VALUES (?, ?, ?, ?, 0)')
    .run(id, nome, req.body.descricao || null, paginas);
  log(req, 'criar', 'perfis', null, nome);
  res.status(201).json({ id });
}, { 'perfis.nome': 'Já existe um perfil com este nome.' }));

perfis.put('/:id', rota((req, res) => {
  const p = db.prepare('SELECT * FROM perfis WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Perfil não encontrado.' });
  if (p.id === 'PERFIL-MASTER') return res.status(403).json({ error: 'O perfil Master não pode ser alterado.' });

  const paginas = Array.isArray(req.body.paginas) ? JSON.stringify(req.body.paginas) : p.paginas;
  db.prepare('UPDATE perfis SET nome = ?, descricao = ?, paginas = ? WHERE id = ?')
    .run(req.body.nome ?? p.nome, req.body.descricao ?? p.descricao, paginas, p.id);
  log(req, 'atualizar', 'perfis', null, p.nome);
  res.json({ ok: true });
}, { 'perfis.nome': 'Já existe um perfil com este nome.' }));

perfis.delete('/:id', rota((req, res) => {
  const p = db.prepare('SELECT * FROM perfis WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Perfil não encontrado.' });
  if (p.sistema) return res.status(403).json({ error: 'Perfis do sistema não podem ser excluídos.' });

  const uso = db.prepare('SELECT COUNT(*) c FROM usuarios WHERE perfil_id = ?').get(p.id).c;
  if (uso) return res.status(409).json({ error: `Existem ${uso} usuário(s) com este perfil.` });

  db.prepare('DELETE FROM perfis WHERE id = ?').run(p.id);
  log(req, 'excluir', 'perfis', null, p.nome);
  res.json({ ok: true });
}));

module.exports = { usuarios, perfis };
