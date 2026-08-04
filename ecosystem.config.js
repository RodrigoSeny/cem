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
    },
    error_file: '/var/log/cem/err.log',
    out_file: '/var/log/cem/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
