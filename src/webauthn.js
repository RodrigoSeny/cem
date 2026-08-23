// ═══════════════════════════════════════════════════════════════
// CEM — Login por biometria/PIN do celular (WebAuthn) no app dos
// responsáveis. Guarda só o desafio de cada cerimônia em memória (TTL
// curto) — seguro porque o processo roda sempre com instances:1 no PM2.
// ═══════════════════════════════════════════════════════════════
const crypto = require('crypto');

const TTL_MS = 2 * 60 * 1000;
const desafios = new Map(); // flowId -> { challenge, criadoEm }

function novoFlowId() {
  return crypto.randomBytes(16).toString('hex');
}

function guardarDesafio(flowId, challenge) {
  desafios.set(flowId, { challenge, expira: Date.now() + TTL_MS });
}

/** Resgata e apaga o desafio (uso único). Devolve null se não existe/expirou. */
function resgatarDesafio(flowId) {
  const d = desafios.get(flowId);
  desafios.delete(flowId);
  if (!d || d.expira < Date.now()) return null;
  return d.challenge;
}

/** RP ID e origem esperados, derivados da própria requisição — funciona
 *  igual em localhost:3300 (dev) e no domínio real (produção), sem .env novo. */
function rpDaRequisicao(req) {
  return {
    rpID: req.hostname,
    rpName: 'Centro Educacional Milezi',
    origin: `${req.protocol}://${req.get('host')}`,
  };
}

module.exports = { novoFlowId, guardarDesafio, resgatarDesafio, rpDaRequisicao };
