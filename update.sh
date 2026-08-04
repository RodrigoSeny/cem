#!/bin/bash
# Atualizar o CEM na VPS — rodar depois do git push
# Uso (na VPS): bash /var/www/cem/update.sh
set -e

cd /var/www/cem
git pull origin main
npm install --omit=dev
pm2 restart cem

echo "✅ CEM atualizado e reiniciado."
echo "   Se mexeu no PWA, lembre de subir o CACHE em public/sw.js."
