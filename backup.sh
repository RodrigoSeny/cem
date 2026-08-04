#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# CEM — backup do banco e dos documentos
#
# Uso:  bash /var/www/cem/backup.sh [pasta-destino]
#       (padrão: /var/backups/cem)
#
# O banco é copiado com VACUUM INTO, que consolida o WAL num único
# arquivo consistente. Copiar o .db "na mão" NÃO funciona: em modo
# WAL as gravações recentes ficam no arquivo -wal e o .db sozinho
# pode sair vazio.
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

APP_DIR="/var/www/cem"
DESTINO="${1:-/var/backups/cem}"
RETENCAO_DIAS=30
CARIMBO=$(date +%Y%m%d-%H%M%S)

BANCO="$APP_DIR/dados/cem.db"
ARQ_BANCO="$DESTINO/cem-$CARIMBO.db"
ARQ_UPLOADS="$DESTINO/uploads-$CARIMBO.tar.gz"

mkdir -p "$DESTINO"
cd "$APP_DIR"

echo "🎓 Backup do CEM — $CARIMBO"

# ── 1. Banco (VACUUM INTO) ────────────────────────────────────
if [ ! -f "$BANCO" ]; then
  echo "❌ Banco não encontrado em $BANCO"
  exit 1
fi

node -e "
const Database = require('better-sqlite3');
const db = new Database('$BANCO', { readonly: true });
db.exec(\"VACUUM INTO '$ARQ_BANCO'\");
db.close();
"
echo "   ✔ banco:    $(du -h "$ARQ_BANCO" | cut -f1)  $ARQ_BANCO"

# ── 2. Conferência da cópia ───────────────────────────────────
VERIFICA=$(node -e "
const Database = require('better-sqlite3');
const db = new Database('$ARQ_BANCO', { readonly: true });
const ok = db.pragma('integrity_check', { simple: true });
const t = n => db.prepare('SELECT COUNT(*) c FROM ' + n).get().c;
console.log(ok + '|' + t('alunos') + '|' + t('responsaveis') + '|' + t('funcionarios') + '|' + t('mensalidades'));
db.close();
")

INTEGRIDADE=$(echo "$VERIFICA" | cut -d'|' -f1)
if [ "$INTEGRIDADE" != "ok" ]; then
  echo "❌ Cópia corrompida (integrity_check: $INTEGRIDADE). Backup abortado."
  rm -f "$ARQ_BANCO"
  exit 1
fi

echo "   ✔ íntegro: alunos=$(echo "$VERIFICA" | cut -d'|' -f2)" \
     "responsáveis=$(echo "$VERIFICA" | cut -d'|' -f3)" \
     "funcionários=$(echo "$VERIFICA" | cut -d'|' -f4)" \
     "mensalidades=$(echo "$VERIFICA" | cut -d'|' -f5)"

# ── 3. Documentos anexados ────────────────────────────────────
if [ -d "$APP_DIR/uploads" ] && [ -n "$(ls -A "$APP_DIR/uploads" 2>/dev/null)" ]; then
  tar -czf "$ARQ_UPLOADS" -C "$APP_DIR" uploads
  echo "   ✔ uploads:  $(du -h "$ARQ_UPLOADS" | cut -f1)  $ARQ_UPLOADS"
else
  echo "   • uploads:  vazio, nada a salvar"
fi

# ── 4. .env (senhas e JWT_SECRET) ─────────────────────────────
if [ -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env" "$DESTINO/env-$CARIMBO.bak"
  chmod 600 "$DESTINO/env-$CARIMBO.bak"
  echo "   ✔ .env salvo (contém segredos — mantenha a pasta restrita)"
fi

# ── 5. Rotação ────────────────────────────────────────────────
find "$DESTINO" -maxdepth 1 -name 'cem-*.db'          -mtime +$RETENCAO_DIAS -delete
find "$DESTINO" -maxdepth 1 -name 'uploads-*.tar.gz'  -mtime +$RETENCAO_DIAS -delete
find "$DESTINO" -maxdepth 1 -name 'env-*.bak'         -mtime +$RETENCAO_DIAS -delete

echo ""
echo "✅ Backup concluído em $DESTINO"
echo "   Cópias mantidas por $RETENCAO_DIAS dias."
echo ""
echo "Para restaurar:"
echo "   pm2 stop cem"
echo "   cp $ARQ_BANCO $APP_DIR/dados/cem.db"
echo "   rm -f $APP_DIR/dados/cem.db-wal $APP_DIR/dados/cem.db-shm"
echo "   tar -xzf $ARQ_UPLOADS -C $APP_DIR      # se houver documentos"
echo "   pm2 start cem"
