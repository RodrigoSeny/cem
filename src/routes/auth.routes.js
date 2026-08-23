// ═══════════════════════════════════════════════════════════════
// CEM — Rotas de autenticação
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const bcrypt = require('bcryptjs');
const { db, log, agora } = require('../db');
const { gerarToken } = require('../auth');
const { rota } = require('../util');

const router = express.Router();

const MAX_TENTATIVAS = 5;
const BLOQUEIO_MIN = 10;

function carregarUsuario(login) {
  return db.prepare(`
    SELECT u.*, p.nome AS perfil_nome, p.paginas AS perfil_paginas
      FROM usuarios u
      LEFT JOIN perfis p ON p.id = u.perfil_id
     WHERE u.login = ? COLLATE NOCASE
  `).get(login);
}

function montarSessao(u) {
  let paginas = [];
  try { paginas = JSON.parse(u.perfil_paginas || '[]'); } catch { paginas = []; }
  return {
    id: u.id,
    nome: u.nome,
    login: u.login,
    email: u.email,
    tipo: u.tipo,
    perfil_id: u.perfil_id,
    perfil_nome: u.perfil_nome,
    paginas,
    funcionario_id: u.funcionario_id,
    responsavel_id: u.responsavel_id,
    precisa_trocar_senha: !!u.precisa_trocar_senha,
  };
}

// ── POST /api/auth/login ──────────────────────────────────────
router.post('/login', rota((req, res) => {
  const login = String(req.body.login || '').trim();
  const senha = String(req.body.senha || '');

  if (!login || !senha) return res.status(400).json({ error: 'Informe login e senha.' });

  const u = carregarUsuario(login);
  if (!u) return res.status(401).json({ error: 'Login ou senha incorretos.' });

  if (!u.ativo) return res.status(403).json({ error: 'Usuário inativo. Procure a secretaria.' });

  if (u.bloqueado_ate && u.bloqueado_ate > agora()) {
    return res.status(403).json({ error: `Acesso bloqueado temporariamente. Tente novamente após ${u.bloqueado_ate.slice(11, 16)}.` });
  }

  if (!bcrypt.compareSync(senha, u.senha_hash)) {
    const tentativas = (u.tentativas || 0) + 1;
    let bloqueio = null;
    if (tentativas >= MAX_TENTATIVAS) {
      bloqueio = agora(BLOQUEIO_MIN * 60000);
    }
    db.prepare('UPDATE usuarios SET tentativas = ?, bloqueado_ate = ? WHERE id = ?')
      .run(bloqueio ? 0 : tentativas, bloqueio, u.id);

    if (bloqueio) return res.status(403).json({ error: `Muitas tentativas. Acesso bloqueado por ${BLOQUEIO_MIN} minutos.` });
    const restam = MAX_TENTATIVAS - tentativas;
    return res.status(401).json({ error: `Login ou senha incorretos. (${restam} tentativa${restam === 1 ? '' : 's'} restante${restam === 1 ? '' : 's'})` });
  }

  // Senha provisória (enviada no convite do app) tem prazo — passado ele, o
  // acesso é bloqueado até a secretaria enviar uma nova senha provisória.
  if (u.precisa_trocar_senha && u.senha_valida_ate && u.senha_valida_ate < agora()) {
    return res.status(403).json({ error: 'Sua senha provisória expirou. Peça um novo acesso à secretaria.' });
  }

  db.prepare('UPDATE usuarios SET tentativas = 0, bloqueado_ate = NULL, ultimo_login = ? WHERE id = ?')
    .run(agora(), u.id);

  const usuario = montarSessao(u);
  const token = gerarToken(usuario);
  req.usuario = usuario;
  log(req, 'login', 'usuarios', u.id, `Login de ${u.login}`);

  res.json({ token, usuario });
}));

// ── GET /api/auth/eu — dados da sessão atual ──────────────────
router.get('/eu', rota((req, res) => {
  const u = db.prepare(`
    SELECT u.*, p.nome AS perfil_nome, p.paginas AS perfil_paginas
      FROM usuarios u LEFT JOIN perfis p ON p.id = u.perfil_id
     WHERE u.id = ?`).get(req.usuario.id);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
  res.json(montarSessao(u));
}));

// ── POST /api/auth/trocar-senha ───────────────────────────────
router.post('/trocar-senha', rota((req, res) => {
  const atual = String(req.body.senha_atual || '');
  const nova = String(req.body.senha_nova || '');

  if (nova.length < 6) return res.status(400).json({ error: 'A nova senha precisa ter ao menos 6 caracteres.' });

  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
  if (!u || !bcrypt.compareSync(atual, u.senha_hash)) {
    return res.status(401).json({ error: 'Senha atual incorreta.' });
  }

  db.prepare('UPDATE usuarios SET senha_hash = ?, precisa_trocar_senha = 0, senha_valida_ate = NULL, atualizado_em = ? WHERE id = ?')
    .run(bcrypt.hashSync(nova, 10), agora(), u.id);

  log(req, 'trocar-senha', 'usuarios', u.id, null);
  res.json({ ok: true });
}));

// ── POST /api/auth/logout ─────────────────────────────────────
router.post('/logout', (req, res) => res.json({ ok: true }));

module.exports = router;
