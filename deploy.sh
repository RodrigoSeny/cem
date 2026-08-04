#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# CEM — primeira instalação na VPS Hostinger
# Uso (como root, na VPS):  bash deploy.sh
# Pré-requisitos: Node.js 18+ e PM2 já instalados
#                 (o SuperPet e o CicleSystem já usam a mesma base)
# ═══════════════════════════════════════════════════════════════
set -e

APP_DIR="/var/www/cem"
LOG_DIR="/var/log/cem"
REPO_URL="https://github.com/RodrigoSeny/cem.git"

echo "🎓 Instalando o CEM..."

# ── 1. Código ─────────────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  echo "📥 Atualizando repositório..."
  cd "$APP_DIR"
  git pull origin main
else
  echo "📥 Clonando repositório..."
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# ── 2. Dependências ───────────────────────────────────────────
echo "📦 Instalando dependências..."
npm install --omit=dev

# ── 3. Pastas de dados, uploads e log ─────────────────────────
mkdir -p "$APP_DIR/dados" "$APP_DIR/uploads" "$LOG_DIR"

# ── 4. .env ───────────────────────────────────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
  echo "⚙️  Criando .env com segredo aleatório..."
  SEGREDO=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
  cat > "$APP_DIR/.env" <<EOF
PORT=3300
JWT_SECRET=$SEGREDO
JWT_EXPIRES=12h
MASTER_LOGIN=master
MASTER_SENHA=cem@2026
EOF
  echo ""
  echo "⚠️  Usuário master criado com a senha padrão: cem@2026"
  echo "    TROQUE no primeiro acesso."
  echo ""
fi

# ── 5. PM2 ────────────────────────────────────────────────────
echo "🚀 Subindo com o PM2..."
pm2 delete cem 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo ""
echo "✅ CEM instalado."
echo "   Sistema: http://<seu-dominio>:3300/"
echo "   App:     http://<seu-dominio>:3300/app"
echo ""
echo "Próximo passo: configurar o Nginx com domínio e HTTPS —"
echo "o PWA só permite instalação em https."
