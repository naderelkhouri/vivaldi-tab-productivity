#!/usr/bin/env bash
# build.sh - Gera os pacotes de distribuição para Chromium (Vivaldi, Chrome, Edge, Brave, Opera, Arc) e Firefox

set -e
PROJECT_DIR="/home/nader/Documents/Projects/vivaldi-tab-productivity"
cd "$PROJECT_DIR"

echo "🔨 Iniciando compilação Multi-Browser..."

rm -rf dist
mkdir -p dist/chromium dist/firefox

# 1. Empacotar versão Chromium (Vivaldi, Chrome, Edge, Brave, Opera, Arc)
echo "📦 1/2 Gerando pacote Chromium..."
cp -r icons dist/chromium/
cp background.js popup.js popup.html styles.css logger.js manifest.json dist/chromium/
cd dist/chromium
zip -r ../omnitab-productivity-chromium.zip . -x "*.git*"
cd "$PROJECT_DIR"

# 2. Empacotar versão Firefox / Floorp (Manifest v3 com fallback para scripts e sidebar_action)
echo "🦊 2/2 Gerando pacote Firefox..."
cp -r icons dist/firefox/
cp background.js popup.js popup.html styles.css logger.js dist/firefox/
cp manifest.firefox.json dist/firefox/manifest.json
cd dist/firefox
zip -r ../omnitab-productivity-firefox.xpi . -x "*.git*"
cd "$PROJECT_DIR"

echo "✅ Compilação concluída com sucesso!"
echo "📍 Pacotes prontos na pasta 'dist/':"
ls -lh dist/*.zip dist/*.xpi
