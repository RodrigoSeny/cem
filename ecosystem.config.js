// ═══════════════════════════════════════════════════════════════
// CEM — configuração do PM2 na VPS Hostinger
// Uso: pm2 start ecosystem.config.js && pm2 save
// ═══════════════════════════════════════════════════════════════
module.exports = {
  apps: [{
    name: 'cem',
    script: 'server.js',
    cwd: '/var/www/cem',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '400M',
    env: {
      NODE_ENV: 'production',
      PORT: '3300',
      // Redundante com o TZ do .env: este arquivo vai pro git (o .env da VPS
      // não vai), então garante o fuso certo mesmo se o .env do servidor
      // estiver desatualizado ou sem essa linha.
      TZ: 'America/Sao_Paulo',
    },
    error_file: '/var/log/cem/err.log',
    out_file: '/var/log/cem/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
