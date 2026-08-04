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
# IPv4 e IPv6 são consultados separadamente: sem o -4/-6 o curl escolhe
# um dos dois e a comparação acaba sendo IPv6 da VPS contra IPv4 do DNS.
IP4_VPS=$(curl -4 -s --max-time 10 ifconfig.me 2>/dev/null || echo '')
IP6_VPS=$(curl -6 -s --max-time 10 ifconfig.me 2>/dev/null || echo '')

IP4_DNS=$(getent ahostsv4 "$DOMINIO" 2>/dev/null | awk '{print $1}' | head -1 || echo '')
IP6_DNS=$(getent ahostsv6 "$DOMINIO" 2>/dev/null | awk '{print $1}' | head -1 || echo '')

echo ""
echo "   VPS   IPv4: ${IP4_VPS:-—}    IPv6: ${IP6_VPS:-—}"
echo "   $DOMINIO"
echo "         A:    ${IP4_DNS:-—}    AAAA: ${IP6_DNS:-—}"
echo ""

if [ -z "$IP4_DNS" ] && [ -z "$IP6_DNS" ]; then
  echo "❌ $DOMINIO não resolve."
  echo "   Crie um registro A apontando para ${IP4_VPS:-o IPv4 desta VPS}"
  echo "   e rode de novo depois que o DNS propagar."
  exit 1
fi

CONFERE=0
[ -n "$IP4_DNS" ] && [ "$IP4_DNS" = "$IP4_VPS" ] && CONFERE=1
[ -n "$IP6_DNS" ] && [ "$IP6_DNS" = "$IP6_VPS" ] && CONFERE=1

if [ "$CONFERE" != "1" ]; then
  echo "⚠️  O domínio NÃO aponta para esta VPS."
  echo ""
  echo "   O Certbot valida o domínio acessando-o pela internet: se o DNS"
  echo "   levar a outro servidor, a emissão do certificado vai falhar."
  echo ""
  echo "   Corrija no painel de DNS: registro A de $DOMINIO → ${IP4_VPS:-IPv4 da VPS}"
  echo ""
  read -p "   Continuar mesmo assim (só configura o Nginx, sem certificado)? [s/N] " RESP
  [ "$RESP" = "s" ] || exit 1
  PULAR_CERTBOT=1
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
if [ "${PULAR_CERTBOT:-0}" = "1" ]; then
  echo ""
  echo "⏭️  Certificado não emitido: o DNS ainda não aponta para esta VPS."
  echo "    Ajuste o registro A e rode este script de novo."
  echo ""
  echo "    Por enquanto: http://$DOMINIO/  (sem instalação do PWA)"
  exit 0
fi

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
