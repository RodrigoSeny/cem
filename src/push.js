// ═══════════════════════════════════════════════════════════════
// CEM — Notificações push (Web Push / VAPID)
//
// Manda alerta pro celular do responsável mesmo com o app fechado —
// só funciona se o app estiver instalado (Android: Chrome; iPhone:
// Safari a partir do iOS 16.4, com o app adicionado à Tela de Início).
// ═══════════════════════════════════════════════════════════════
const webpush = require('web-push');
const { db } = require('./db');

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:contato@exemplo.com';

const ATIVO = !!(PUBLIC_KEY && PRIVATE_KEY);
if (ATIVO) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
} else {
  console.warn('⚠️  VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas no .env — notificações push desativadas.');
}

/** Logotipo configurado em Configurações — mesmo usado no menu e no login. */
function logoEscola() {
  const e = db.prepare('SELECT logo_url FROM escola WHERE id = 1').get();
  return e?.logo_url || '/img/icone-cem.svg';
}

/** Manda um push para todos os aparelhos inscritos de um usuário. */
async function enviarParaUsuario(usuarioId, payload) {
  if (!ATIVO) return;
  const inscricoes = db.prepare('SELECT * FROM push_subscriptions WHERE usuario_id = ?').all(usuarioId);
  const corpo = JSON.stringify({ icone: logoEscola(), ...payload });

  for (const s of inscricoes) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        corpo
      );
    } catch (e) {
      // Inscrição expirada/revogada pelo navegador — some daqui pra não tentar de novo.
      if (e.statusCode === 404 || e.statusCode === 410) {
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id);
      } else {
        console.error('[push] falha ao enviar:', e.message);
      }
    }
  }
}

/** Manda um push para todos os responsáveis informados (todos os aparelhos de cada um). */
async function enviarParaResponsaveis(responsavelIds, payload) {
  const ids = [...new Set(responsavelIds)].filter(Boolean);
  if (!ATIVO || !ids.length) return;

  const usuarios = db.prepare(`
    SELECT id FROM usuarios
     WHERE tipo = 'responsavel' AND ativo = 1
       AND responsavel_id IN (${ids.map(() => '?').join(',')})
  `).all(...ids);

  await Promise.all(usuarios.map(u => enviarParaUsuario(u.id, payload)));
}

module.exports = { ATIVO, PUBLIC_KEY, enviarParaUsuario, enviarParaResponsaveis };
