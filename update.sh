#!/bin/bash

# Configuration
REPO_URL="https://github.com/imkevinchasse/Paxton-Interpreter-.git"
BRANCH="main"

echo "🔄 Paxton Interpreter Updater"
echo "============================="

if [ ! -d ".git" ]; then
  echo "⚠️ Not a git repository. Initializing..."
  git init
  git remote add origin $REPO_URL
  git fetch origin
  git reset --hard origin/$BRANCH
else
  # Fetch latest
  git fetch origin $BRANCH
fi

# Files to protect from being overwritten
PROTECTED_FILES=("db.json" "training_data.json" "settings.json" "optimized_context.json" "audio_bank" "whisper.cpp" "models" "audio")

echo "📦 Backing up protected data..."
mkdir -p .backup
for file in "${PROTECTED_FILES[@]}"; do
  if [ -e "$file" ]; then
    cp -r "$file" .backup/ 2>/dev/null || true
  fi
done

echo "📥 Synchronizing with source..."
# Overwrite local uncommitted changes except our backups
git reset --hard origin/$BRANCH || echo "Failed to pull changes."
git clean -fd

echo "🛡️ Restoring protected data..."
for file in "${PROTECTED_FILES[@]}"; do
  if [ -e ".backup/$file" ]; then
    rm -rf "$file"
    mv .backup/"$file" ./"$file" 2>/dev/null || true
  fi
done
rm -rf .backup

echo "📦 Installing new dependencies if any..."
npm install

echo "🔨 Rebuilding applet..."
npm run build

echo "✅ Update complete! Please restart your app to apply."
