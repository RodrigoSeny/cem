#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# CEM — Nginx (proxy reverso) + HTTPS com Certbot
#
# Uso:  bash /var/www/cem/nginx-setup.sh cem.seudominio.com.br
#
# Antes de rodar: o subdomínio precisa já apontar (registro A) para
# o IP desta VPS. Confira com:  dig +short SEU.DOMINIO
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

DOMINIO="${1:-}"
PORTA=3300

if [ -z "$DOMINIO" ]; then
  echo "❌ Informe o domínio."
  echo "   Exemplo: bash nginx-setup.sh cem.seudominio.com.br"
  exit 1
fi

echo "🌐 Configurando o Nginx para $DOMINIO..."

# ── 1. Conferir o DNS ─────────────────────────────────────────
IP_VPS=$(curl -s ifconfig.me || echo '')
IP_DNS=$(getent hosts "$DOMINIO" | awk '{print $1}' | head -1 || echo '')

if [ -z "$IP_DNS" ]; then
  echo "⚠️  $DOMINIO ainda não resolve. Crie o registro A apontando para $IP_VPS"
  echo "    e rode de novo depois que o DNS propagar."
  exit 1
fi

if [ "$IP_DNS" != "$IP_VPS" ]; then
  echo "⚠️  $DOMINIO aponta para $IP_DNS, mas esta VPS é $IP_VPS."
  read -p "    Continuar mesmo assim? [s/N] " RESP
  [ "$RESP" = "s" ] || exit 1
fi

# ── 2. Instalar o necessário ──────────────────────────────────
command -v nginx  >/dev/null || { apt-get update -qq && apt-get install -y nginx; }
command -v certbot >/dev/null || apt-get install -y certbot python3-certbot-nginx

# ── 3. Site do CEM ────────────────────────────────────────────
cat > "/etc/nginx/sites-available/cem" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMINIO;

    # Documentos anexados chegam a 12 MB — o padrão do Nginx (1 MB)
    # derrubaria o upload com 413 antes de chegar ao Node.
    client_max_body_size 15M;

    access_log /var/log/nginx/cem-access.log;
    error_log  /var/log/nginx/cem-error.log;

    location / {
        proxy_pass http://127.0.0.1:$PORTA;
        proxy_http_version 1.1;

        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade           \$http_upgrade;
        proxy_set_header Connection        "upgrade";

        proxy_read_timeout 120s;
    }

    # O service worker não pode ficar preso em cache, senão o
    # celular continua com a versão antiga do app depois do deploy.
    location = /sw.js {
        proxy_pass http://127.0.0.1:$PORTA;
        proxy_set_header Host \$host;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
EOF

ln -sf /etc/nginx/sites-available/cem /etc/nginx/sites-enabled/cem

echo "🔎 Testando a configuração..."
nginx -t
systemctl reload nginx

# ── 4. Certificado ────────────────────────────────────────────
echo "🔐 Emitindo o certificado..."
certbot --nginx -d "$DOMINIO" --redirect --agree-tos --non-interactive \
        -m "${EMAIL_CERTBOT:-jpetcomercio@gmail.com}" || {
  echo "⚠️  O Certbot falhou. O site segue no ar em http://$DOMINIO"
  echo "    Tente manualmente: certbot --nginx -d $DOMINIO"
  exit 1
}

systemctl reload nginx

echo ""
echo "✅ Pronto."
echo "   Sistema: https://$DOMINIO/"
echo "   App:     https://$DOMINIO/app"
echo ""
echo "Agora o PWA pode ser instalado: abra o app no celular e use"
echo "\"Instalar\" (Android) ou Compartilhar → \"Adicionar à Tela de Início\" (iPhone)."
echo ""
echo "A renovação do certificado é automática. Para conferir:"
echo "   certbot renew --dry-run"
