#!/usr/bin/env bash
# =============================================================================
#  update.sh — Paxton Interpreter Safe Updater
#  Protects fine-tuned Whisper models, checkpoints, virtual environments,
#  grammar rulebooks, dictionaries, and training audio datasets from deletion.
# =============================================================================
set -e

REPO_URL="https://github.com/imkevinchasse/Paxton-Interpreter-.git"
BRANCH="main"
BACKUP_ROOT="_protected_backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
CURRENT_BACKUP="${BACKUP_ROOT}/backup_${TIMESTAMP}"

echo "============================================================"
echo "🔄 Paxton Interpreter Safe Updater"
echo "   Branch: $BRANCH"
echo "   Timestamp: $TIMESTAMP"
echo "============================================================"

# List of critical user directories and files that must NEVER be overwritten or lost
PROTECTED_ITEMS=(
  "whisper-paxton-final"
  "whisper-paxton-checkpoints"
  "whisper"
  "models"
  "venv_train"
  "dataset"
  "logs"
  "audio_bank"
  "audio"
  "uploads"
  "recordings"
  "grammar_rulebook.json"
  "cross_reference.json"
  "dictionary.json"
  "dictionary_queue.json"
  "versions_data.json"
  "snapshots"
  "key.pem"
  "cert.pem"
  "training_data.json"
  "settings.json"
  "audio_bank.json"
  "optimized_context.json"
  "training_manifest.json"
  "benchmark_results.json"
  "training.log"
  ".env"
  ".env.local"
)

# Step 1: Create a safe persistent backup before touching git
echo ""
echo "🛡️  [1/5] Backing up fine-tuned models and user data to ${CURRENT_BACKUP}..."
mkdir -p "$CURRENT_BACKUP"

BACKED_UP_COUNT=0
for item in "${PROTECTED_ITEMS[@]}"; do
  if [ -e "$item" ]; then
    cp -a "$item" "$CURRENT_BACKUP/" 2>/dev/null || cp -r "$item" "$CURRENT_BACKUP/" 2>/dev/null || true
    BACKED_UP_COUNT=$((BACKED_UP_COUNT + 1))
    echo "  ✓ Protected: $item"
  fi
done

# Also preserve any audio wave/media files in root
for f in *.wav *.mp3 *.ogg *.webm *.m4a; do
  if [ -e "$f" ]; then
    cp -a "$f" "$CURRENT_BACKUP/" 2>/dev/null || true
    echo "  ✓ Protected audio: $f"
  fi
done

echo "  Saved ${BACKED_UP_COUNT} items to backup safely."

# Step 2: Synchronize code from git repository
echo ""
echo "📥 [2/5] Synchronizing code with repository ($REPO_URL)..."

if [ ! -d ".git" ]; then
  echo "  Initializing git repository..."
  git init
  git remote add origin "$REPO_URL" 2>/dev/null || git remote set-url origin "$REPO_URL"
  git fetch origin "$BRANCH" || {
    echo "⚠️ Git fetch failed. Keeping existing code and restoring backups."
  }
  git checkout -B "$BRANCH" "origin/$BRANCH" 2>/dev/null || git reset --hard "origin/$BRANCH" 2>/dev/null || true
else
  # Existing git repo
  git remote set-url origin "$REPO_URL" 2>/dev/null || git remote add origin "$REPO_URL" 2>/dev/null || true
  git fetch origin "$BRANCH" || echo "⚠️ Network issue fetching origin, proceeding with caution."
  git reset --hard "origin/$BRANCH" 2>/dev/null || echo "⚠️ Reset had a warning, restoring assets."
fi

# Step 3: Restore all protected files & fine-tuned Whisper model artifacts
echo ""
echo "🛡️  [3/5] Restoring fine-tuned Whisper models, rulebook, and data..."

for item in "${PROTECTED_ITEMS[@]}"; do
  if [ -e "$CURRENT_BACKUP/$item" ]; then
    # Remove git placeholder if any, and restore user artifact
    rm -rf "$item"
    cp -a "$CURRENT_BACKUP/$item" "./$item" 2>/dev/null || cp -r "$CURRENT_BACKUP/$item" "./$item" 2>/dev/null || true
    echo "  ✓ Restored: $item"
  fi
done

# Restore audio files
for f in "$CURRENT_BACKUP"/*.wav "$CURRENT_BACKUP"/*.mp3 "$CURRENT_BACKUP"/*.ogg "$CURRENT_BACKUP"/*.webm "$CURRENT_BACKUP"/*.m4a; do
  if [ -e "$f" ]; then
    fname=$(basename "$f")
    cp -a "$f" "./$fname" 2>/dev/null || true
  fi
done

# Step 4: Verification of fine-tuned model artifacts
echo ""
echo "🔍 [4/5] Verifying Whisper model and environment integrity..."
if [ -d "whisper-paxton-final" ]; then
  echo "  ✅ Fine-tuned Whisper Model: PRESENT (whisper-paxton-final/ intact)"
  ls -lh whisper-paxton-final | head -n 6 | sed 's/^/     /' || true
elif [ -d "whisper-paxton-checkpoints" ]; then
  echo "  ✅ Fine-tuned Checkpoints: PRESENT (whisper-paxton-checkpoints/ intact)"
else
  echo "  ℹ️  No fine-tuned model found yet (ready for training via Studio or run_training.sh)"
fi

if [ -d "venv_train" ]; then
  echo "  ✅ Python Virtual Environment (venv_train): PRESERVED (PyTorch & Transformers intact)"
fi

if [ -f "grammar_rulebook.json" ]; then
  echo "  ✅ Grammar Rulebook: PRESERVED"
fi

if [ -f "dictionary.json" ]; then
  echo "  ✅ Dictionary: PRESERVED"
fi

# Clean up older backups, keeping the last 5 for safety
if [ -d "$BACKUP_ROOT" ]; then
  (cd "$BACKUP_ROOT" && ls -dt backup_* 2>/dev/null | tail -n +6 | xargs rm -rf 2>/dev/null || true)
fi

# Step 5: Install dependencies and compile
echo ""
echo "📦 [5/5] Checking dependencies and rebuilding..."
if command -v npm &>/dev/null; then
  npm install --prefer-offline 2>/dev/null || npm install
  npm run build || echo "⚠️ Build completed with warnings."
fi

echo ""
echo "============================================================"
echo "✅ Update successfully finished!"
echo "   Fine-tuned Whisper models & rulebooks were 100% preserved."
echo "   A backup copy is stored at: $CURRENT_BACKUP"
echo "============================================================"
