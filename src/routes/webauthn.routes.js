// ═══════════════════════════════════════════════════════════════
// CEM — Login por biometria/PIN do celular (WebAuthn), exclusivo do
// app dos responsáveis. Cadastro exige sessão já autenticada; login é
// público (ninguém está logado ainda) e usa credencial descobrível —
// o navegador escolhe a conta salva neste aparelho, sem digitar login.
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const { db, log, agora } = require('../db');
const { rota } = require('../util');
const { gerarToken } = require('../auth');
const { montarSessao } = require('./auth.routes');
const { novoFlowId, guardarDesafio, resgatarDesafio, rpDaRequisicao } = require('../webauthn');

const router = express.Router();

/** Nome amigável do aparelho, a partir do user-agent (best-effort). */
function nomeDoAparelho(userAgent = '') {
  if (/iphone/i.test(userAgent)) return 'iPhone';
  if (/ipad/i.test(userAgent)) return 'iPad';
  if (/android/i.test(userAgent)) return 'Celular Android';
  if (/macintosh/i.test(userAgent)) return 'Mac';
  if (/windows/i.test(userAgent)) return 'Computador Windows';
  return 'Aparelho';
}

// ══════════════════════ CADASTRO (autenticado) ═══════════════════

router.post('/registro-opcoes', rota((req, res) => {
  if (req.usuario.tipo !== 'responsavel') {
    return res.status(403).json({ error: 'Login por biometria é exclusivo do app dos responsáveis.' });
  }
  const { rpID, rpName } = rpDaRequisicao(req);

  const existentes = db.prepare('SELECT credential_id FROM webauthn_credenciais WHERE usuario_id = ?').all(req.usuario.id);

  generateRegistrationOptions({
    rpName, rpID,
    userName: req.usuario.login,
    userDisplayName: req.usuario.nome,
    userID: new TextEncoder().encode(String(req.usuario.id)),
    attestationType: 'none',
    excludeCredentials: existentes.map(c => ({ id: c.credential_id })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required', authenticatorAttachment: 'platform' },
  }).then(opcoes => {
    const flowId = novoFlowId();
    guardarDesafio(flowId, opcoes.challenge);
    res.json({ flowId, opcoes });
  }).catch(e => res.status(500).json({ error: 'Não foi possível preparar o cadastro: ' + e.message }));
}));

router.post('/registro', rota(async (req, res) => {
  if (req.usuario.tipo !== 'responsavel') {
    return res.status(403).json({ error: 'Login por biometria é exclusivo do app dos responsáveis.' });
  }
  const { flowId, resposta } = req.body;
  const challenge = resgatarDesafio(flowId);
  if (!challenge) return res.status(400).json({ error: 'Cadastro expirado — toque no botão de novo.' });

  const { rpID, origin } = rpDaRequisicao(req);

  let verificacao;
  try {
    verificacao = await verifyRegistrationResponse({
      response: resposta, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID,
    });
  } catch (e) {
    return res.status(400).json({ error: 'Não foi possível confirmar o cadastro: ' + e.message });
  }
  if (!verificacao.verified || !verificacao.registrationInfo) {
    return res.status(400).json({ error: 'Não foi possível confirmar o cadastro.' });
  }

  const { credential } = verificacao.registrationInfo;
  db.prepare(`
    INSERT INTO webauthn_credenciais (usuario_id, credential_id, chave_publica, contador, nome_dispositivo, criado_em)
    VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    req.usuario.id, credential.id, Buffer.from(credential.publicKey).toString('base64url'),
    credential.counter, nomeDoAparelho(req.headers['user-agent']), agora()
  );

  log(req, 'criar', 'webauthn_credenciais', req.usuario.id, 'Acesso por biometria cadastrado');
  res.status(201).json({ ok: true });
}));

router.get('/credenciais', rota((req, res) => {
  res.json(db.prepare(`
    SELECT id, nome_dispositivo, criado_em, ultimo_uso FROM webauthn_credenciais
     WHERE usuario_id = ? ORDER BY criado_em DESC`).all(req.usuario.id));
}));

router.delete('/credenciais/:id', rota((req, res) => {
  const info = db.prepare('DELETE FROM webauthn_credenciais WHERE id = ? AND usuario_id = ?')
    .run(Number(req.params.id), req.usuario.id);
  if (!info.changes) return res.status(404).json({ error: 'Acesso não encontrado.' });
  log(req, 'excluir', 'webauthn_credenciais', Number(req.params.id), null);
  res.json({ ok: true });
}));

// ══════════════════════ LOGIN (público) ══════════════════════════

router.post('/login-opcoes', rota((req, res) => {
  const { rpID } = rpDaRequisicao(req);

  generateAuthenticationOptions({ rpID, userVerification: 'required' }).then(opcoes => {
    const flowId = novoFlowId();
    guardarDesafio(flowId, opcoes.challenge);
    res.json({ flowId, opcoes });
  }).catch(e => res.status(500).json({ error: 'Não foi possível preparar o login: ' + e.message }));
}));

router.post('/login', rota(async (req, res) => {
  const { flowId, resposta } = req.body;
  const challenge = resgatarDesafio(flowId);
  if (!challenge) return res.status(400).json({ error: 'Login expirado — toque no botão de novo.' });

  const credencial = db.prepare('SELECT * FROM webauthn_credenciais WHERE credential_id = ?').get(resposta?.id);
  if (!credencial) return res.status(401).json({ error: 'Acesso por biometria não reconhecido. Cadastre novamente pelo app.' });

  const u = db.prepare('SELECT u.*, p.nome AS perfil_nome, p.paginas AS perfil_paginas FROM usuarios u LEFT JOIN perfis p ON p.id = u.perfil_id WHERE u.id = ?').get(credencial.usuario_id);
  if (!u || !u.ativo || u.tipo !== 'responsavel') {
    return res.status(403).json({ error: 'Este acesso não está mais disponível. Faça login com usuário e senha.' });
  }

  const { rpID, origin } = rpDaRequisicao(req);
  let verificacao;
  try {
    verificacao = await verifyAuthenticationResponse({
      response: resposta, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID,
      credential: {
        id: credencial.credential_id,
        publicKey: new Uint8Array(Buffer.from(credencial.chave_publica, 'base64url')),
        counter: credencial.contador,
      },
    });
  } catch (e) {
    return res.status(400).json({ error: 'Não foi possível confirmar o acesso: ' + e.message });
  }
  if (!verificacao.verified) return res.status(401).json({ error: 'Não foi possível confirmar o acesso.' });

  db.prepare('UPDATE webauthn_credenciais SET contador = ?, ultimo_uso = ? WHERE id = ?')
    .run(verificacao.authenticationInfo.newCounter, agora(), credencial.id);
  db.prepare('UPDATE usuarios SET ultimo_login = ? WHERE id = ?').run(agora(), u.id);

  const usuario = montarSessao(u);
  const token = gerarToken(usuario);
  req.usuario = usuario;
  log(req, 'login-biometria', 'usuarios', u.id, `Login por biometria de ${u.login}`);

  res.json({ token, usuario });
}));

module.exports = router;
