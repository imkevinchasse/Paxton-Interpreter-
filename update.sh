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
PROTECTED_FILES=("db.json" "training_data.json" "settings.json" "optimized_context.json" "audio_bank.json" "audio_bank" "whisper.cpp" "models" "audio" "uploads" ".env")

echo "📦 Backing up protected data..."
# Use a backup dir outside of git's view or explicitly excluded
mkdir -p .backup
for file in "${PROTECTED_FILES[@]}"; do
  if [ -e "$file" ]; then
    cp -r "$file" .backup/ 2>/dev/null || true
  fi
done

echo "📥 Synchronizing with source..."
# Overwrite local uncommitted changes except our backups
git reset --hard origin/$BRANCH || echo "Failed to pull changes."
git clean -fd -e .backup -e db.json -e training_data.json -e settings.json -e optimized_context.json -e audio_bank.json -e audio_bank -e whisper.cpp -e models -e audio -e uploads -e .env

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

echo "✅ Update complete! If run.sh is currently running, the system will automatically reload the changes."
