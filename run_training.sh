#!/usr/bin/env bash
# =============================================================================
#  train.sh  —  Paxton Whisper fine-tuner launcher
#  Usage:  ./train.sh [epochs] [lr] [batch_size] [transcript_mode]
#  Example: ./train.sh 5 5e-6 8 phonetic
# =============================================================================
set -euo pipefail

# ── Pinned dependency versions ────────────────────────────────────────────────
# Bump deliberately after testing — never automatically.
TORCH_VERSION="2.3.1"
TRANSFORMERS_VERSION="4.41.2"
DATASETS_VERSION="2.20.0"
ACCELERATE_VERSION="0.31.0"
EVALUATE_VERSION="0.4.2"
SOUNDFILE_VERSION="0.12.1"
LIBROSA_VERSION="0.10.2"
TORCHAUDIO_VERSION="2.3.1"
PANDAS_VERSION="2.2.2"
JIW_VERSION="0.3.0"       # jiwer — WER metric backend

PYTHON_SCRIPT="train_whisper.py"
VENV_DIR="venv_train"
LOG_DIR="logs"

# ── HuggingFace cache — avoids re-downloading Whisper on every experiment ────
export HF_HOME="${HOME}/.cache/huggingface"

# ── Timestamp for this run ────────────────────────────────────────────────────
RUN_TS=$(date +"%Y%m%d_%H%M%S")
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/training_${RUN_TS}.log"

# Tee: write to timestamped log AND show in terminal simultaneously
exec > >(tee -a "$LOG_FILE") 2>&1

echo "============================================================"
echo "  Paxton Whisper fine-tuner"
echo "  Run : $RUN_TS"
echo "  Log : $LOG_FILE"
echo "  HF  : $HF_HOME"
echo "============================================================"
echo ""

# ── Arguments with visible defaults ──────────────────────────────────────────
EPOCHS="${1:-15}"
LR="${2:-5e-6}"
BATCH="${3:-8}"
MODE="${4:-phonetic}"
echo "  epochs=$EPOCHS  lr=$LR  batch=$BATCH  mode=$MODE"
echo ""

# ── Git commit (if in a repo) ─────────────────────────────────────────────────
# Records exactly which version of the code produced this model.
# Once you start comparing runs it's invaluable: code + data + params → result.
if git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
    GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    GIT_DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
    GIT_NOTE=""
    if [[ "$GIT_DIRTY" -gt 0 ]]; then
        GIT_NOTE=" (⚠️  $GIT_DIRTY uncommitted change(s))"
    fi
    echo "  git : $GIT_COMMIT$GIT_NOTE"
else
    echo "  git : not a repository (commit tracking skipped)"
fi
echo ""

# ── Python check ──────────────────────────────────────────────────────────────
echo "[1/6] Checking Python …"
if ! command -v python3 &>/dev/null; then
    echo "❌  python3 not found."
    echo "    Fix: brew install python@3.11"
    exit 1
fi

PY_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)

if [[ "$PY_MAJOR" -lt 3 || ( "$PY_MAJOR" -eq 3 && "$PY_MINOR" -lt 10 ) ]]; then
    echo "❌  Python 3.10+ required (found $PY_VERSION)."
    echo "    Fix: brew install python@3.11"
    exit 1
fi
echo "   ✅  Python $PY_VERSION"

# ── Platform check ────────────────────────────────────────────────────────────
echo "[2/6] Checking platform …"
ARCH=$(uname -m)
OS=$(uname -s)

if [[ "$OS" == "Darwin" && "$ARCH" == "arm64" ]]; then
    echo "   ✅  Apple Silicon ($ARCH) — MPS acceleration expected"
    IS_APPLE_SILICON=true
else
    echo "   ℹ️   $OS / $ARCH — will use CUDA or CPU"
    IS_APPLE_SILICON=false
fi

# ── Virtual environment ───────────────────────────────────────────────────────
echo "[3/6] Setting up virtual environment …"

if [[ ! -d "$VENV_DIR" ]]; then
    echo "   Creating $VENV_DIR …"
    python3 -m venv "$VENV_DIR"
else
    echo "   Found existing $VENV_DIR"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
echo "   ✅  Activated: $(which python3)"

# ── Dependencies ──────────────────────────────────────────────────────────────
echo "[4/6] Installing / verifying dependencies …"
echo "   (pip output goes to log only)"

pip install --upgrade pip --quiet

# PyTorch on Apple Silicon:
# The standard PyPI wheel already includes MPS support since PyTorch 2.x.
# The --index-url cpu wheel was intended for Linux CI; using it on M-series
# Macs can actually install a CPU-only build and disable MPS.
# We install from PyPI directly here regardless of platform.
pip install --quiet \
    "torch==${TORCH_VERSION}" \
    "torchaudio==${TORCHAUDIO_VERSION}"

pip install --quiet \
    "transformers==${TRANSFORMERS_VERSION}" \
    "datasets==${DATASETS_VERSION}" \
    "accelerate==${ACCELERATE_VERSION}" \
    "evaluate==${EVALUATE_VERSION}" \
    "soundfile==${SOUNDFILE_VERSION}" \
    "librosa==${LIBROSA_VERSION}" \
    "pandas==${PANDAS_VERSION}" \
    "jiwer==${JIW_VERSION}"

echo "   ✅  Dependencies ready"

# ── MPS runtime check ─────────────────────────────────────────────────────────
if [[ "$IS_APPLE_SILICON" == true ]]; then
    echo "[5/6] Verifying MPS in PyTorch …"
    MPS_CHECK=$(python3 - <<'EOF'
import torch
ok = torch.backends.mps.is_available() and torch.backends.mps.is_built()
print("ok" if ok else "unavailable")
EOF
)
    if [[ "$MPS_CHECK" == "ok" ]]; then
        echo "   ✅  MPS available — GPU acceleration active"
    else
        echo "   ⚠️   MPS not available at runtime. Training will use CPU (slower)."
        echo "       Debug: python3 -c \"import torch; print(torch.__version__, torch.backends.mps.is_built())\""
    fi
else
    echo "[5/6] Skipping MPS check"
fi

# ── Dataset validation + report ───────────────────────────────────────────────
echo "[6/6] Checking dataset …"

if [[ ! -f "dataset/metadata.csv" ]]; then
    echo "❌  dataset/metadata.csv not found."
    echo ""
    echo "    Expected layout:"
    echo "      dataset/"
    echo "        metadata.csv    ← required  (file_name, transcription, [phonetic], [intent])"
    echo "        benchmark.csv   ← optional  (20-30 held-out clips, never used in training)"
    echo "        *.wav / *.mp3   ← audio files"
    exit 1
fi

# Print a dataset report — more useful than a raw row count.
# Tells you vocabulary coverage gaps before you waste a training run.
python3 - <<'EOF'
import pandas as pd
import os
import re
from collections import Counter

META = "dataset/metadata.csv"
df   = pd.read_csv(META)

print(f"\n  ── Dataset report ──────────────────────────────")
print(f"  Total rows       : {len(df)}")

# Label column availability
for col in ("transcription", "phonetic", "intent"):
    if col in df.columns:
        filled = df[col].notna().sum()
        print(f"  '{col}' column   : {filled}/{len(df)} filled")

# Audio file existence check
if "file_name" in df.columns:
    missing = df["file_name"].apply(lambda p: not os.path.exists(str(p))).sum()
    if missing:
        print(f"  ⚠️   Missing audio files : {missing}")
    else:
        print(f"  Audio files      : all present ✅")

# Word frequency from whichever label column is richer
label_col = "phonetic" if "phonetic" in df.columns else "transcription"
if label_col in df.columns:
    all_words = []
    for t in df[label_col].dropna():
        all_words.extend(re.findall(r"\b\w+\b", str(t).lower()))
    counter  = Counter(all_words)
    unique   = len(counter)
    singletons = sum(1 for v in counter.values() if v == 1)
    print(f"\n  Vocabulary ({label_col})")
    print(f"  Unique words     : {unique}")
    print(f"  Seen only once   : {singletons}  ← these will be hard to learn")
    print(f"\n  Most common words:")
    for word, count in counter.most_common(10):
        bar = "█" * min(count, 30)
        print(f"    {word:<20} {count:>4}  {bar}")
    print(f"\n  Rarest words (seen ≤ 2×) — consider collecting more clips:")
    rare = [w for w, c in counter.items() if c <= 2]
    if rare:
        print(f"    {', '.join(sorted(rare)[:20])}")
        if len(rare) > 20:
            print(f"    … and {len(rare)-20} more")
    else:
        print("    none — good coverage!")

# Intent distribution
if "intent" in df.columns:
    print(f"\n  Intent distribution:")
    for intent, count in df["intent"].value_counts().head(15).items():
        bar = "█" * min(count, 30)
        print(f"    {str(intent):<25} {count:>3}  {bar}")

print(f"  ────────────────────────────────────────────────\n")
EOF

ROW_COUNT=$(python3 -c "import pandas as pd; print(len(pd.read_csv('dataset/metadata.csv')))")
if [[ "$ROW_COUNT" -lt 5 ]]; then
    echo "❌  Only $ROW_COUNT rows — not enough to train."
    exit 1
fi

if [[ -f "dataset/benchmark.csv" ]]; then
    BM_COUNT=$(python3 -c "import pandas as pd; print(len(pd.read_csv('dataset/benchmark.csv')))")
    echo "   ✅  benchmark.csv: $BM_COUNT held-out clips"
else
    echo "   ℹ️   No benchmark.csv — held-out eval will be skipped."
    echo "       Recommended: 20-30 clips Paxton recorded that never enter training."
fi

# ── Training script check ─────────────────────────────────────────────────────
if [[ ! -f "$PYTHON_SCRIPT" ]]; then
    echo "❌  $PYTHON_SCRIPT not found in current directory."
    exit 1
fi

# ── Run ───────────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  Starting training  $(date)"
echo "============================================================"
echo ""

python3 "$PYTHON_SCRIPT" "$EPOCHS" "$LR" "$BATCH" "$MODE"
EXIT_CODE=$?

echo ""
echo "============================================================"
if [[ $EXIT_CODE -eq 0 ]]; then
    echo "  ✅  Training complete  $(date)"
    echo "  Model  → ./whisper-paxton-final/"
    echo "  Log    → $LOG_FILE"
else
    echo "  ❌  Training failed (exit $EXIT_CODE)  $(date)"
    echo "  Log    → $LOG_FILE"
fi
echo "============================================================"

exit $EXIT_CODE