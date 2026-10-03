#!/usr/bin/env bash
# =============================================================================
#  train.sh  —  Paxton Whisper fine-tuner launcher
#  Usage:  ./run_training.sh [epochs] [lr] [batch_size] [transcript_mode]
#  Example: ./run_training.sh 5 5e-6 8 phonetic
# =============================================================================
set -euo pipefail

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

PYTHON_BIN=""

# Candidate paths: prioritize standard macOS Homebrew & pyenv Python 3.11 / 3.12 versions
# which have fully pre-built official Apple Silicon MPS PyTorch wheels.
CANDIDATES=(
    "/opt/homebrew/bin/python3.12"
    "/opt/homebrew/bin/python3.11"
    "/opt/homebrew/bin/python3.10"
    "/opt/homebrew/opt/python@3.12/bin/python3"
    "/opt/homebrew/opt/python@3.11/bin/python3"
    "/opt/homebrew/opt/python@3.10/bin/python3"
    "/usr/local/bin/python3.12"
    "/usr/local/bin/python3.11"
    "/usr/local/bin/python3.10"
    "${HOME}/.pyenv/shims/python3.12"
    "${HOME}/.pyenv/shims/python3.11"
    "python3.12"
    "python3.11"
    "python3.10"
    "python3"
)

for cand in "${CANDIDATES[@]}"; do
    if command -v "$cand" &>/dev/null || [[ -x "$cand" ]]; then
        CAND_VER=$("$cand" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || true)
        C_MAJ=$(echo "$CAND_VER" | cut -d. -f1)
        C_MIN=$(echo "$CAND_VER" | cut -d. -f2)
        if [[ "$C_MAJ" -eq 3 && "$C_MIN" -ge 10 ]]; then
            # If 3.10 - 3.12, prefer it immediately as it has official stable PyTorch prebuilt wheels
            if [[ "$C_MIN" -le 12 ]]; then
                PYTHON_BIN="$cand"
                break
            elif [[ -z "$PYTHON_BIN" ]]; then
                PYTHON_BIN="$cand"
            fi
        fi
    fi
done

if [[ -z "$PYTHON_BIN" ]]; then
    echo "❌  Python 3.10+ required."
    echo "    Fix on macOS: brew install python@3.11"
    exit 1
fi

PY_VERSION=$("$PYTHON_BIN" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "   ✅  Using: $PYTHON_BIN (Python $PY_VERSION)"

if [[ $(echo "$PY_VERSION" | cut -d. -f2) -gt 12 ]]; then
    echo "   ℹ️   Python $PY_VERSION detected. Note: Apple Silicon PyTorch wheels are officially tested on 3.10-3.12."
fi

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

VENV_PY="$VENV_DIR/bin/python3"
if [[ -d "$VENV_DIR" && -x "$VENV_PY" ]]; then
    CURRENT_VENV_VER=$("$VENV_PY" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "corrupt")
    
    # Check if pip is functional in this existing virtual environment
    if ! "$VENV_PY" -m pip --version &>/dev/null; then
        echo "   Existing venv has missing or broken pip. Recreating fresh venv …"
        rm -rf "$VENV_DIR"
    elif [[ "$CURRENT_VENV_VER" != "$PY_VERSION" || "$CURRENT_VENV_VER" == "corrupt" ]]; then
        echo "   Recreating $VENV_DIR cleanly for $PYTHON_BIN (Python $PY_VERSION) …"
        rm -rf "$VENV_DIR"
    elif ! "$VENV_PY" -c "import typing_extensions" &>/dev/null; then
        # Try quick repair on typing_extensions
        "$VENV_PY" -m pip install --force-reinstall --no-deps --no-cache-dir "typing-extensions>=4.8.0" &>/dev/null || true
        if ! "$VENV_PY" -c "import typing_extensions" &>/dev/null; then
            echo "   Existing venv has broken package metadata. Recreating clean venv …"
            rm -rf "$VENV_DIR"
        fi
    fi
fi

if [[ ! -d "$VENV_DIR" ]]; then
    echo "   Creating fresh $VENV_DIR …"
    "$PYTHON_BIN" -m venv "$VENV_DIR"
    # Ensure pip is present in newly created venv
    if ! "$VENV_DIR/bin/python3" -m pip --version &>/dev/null; then
        "$VENV_DIR/bin/python3" -m ensurepip --upgrade 2>/dev/null || true
    fi
else
    echo "   Found existing $VENV_DIR"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
echo "   ✅  Activated: $(which python3)"

# ── Dependencies ──────────────────────────────────────────────────────────────
echo "[4/6] Installing / verifying dependencies …"

# Helper function to install or synthesize typing_extensions fallback
ensure_typing_extensions() {
    python3 -m pip install --upgrade --force-reinstall --no-deps --no-cache-dir "typing-extensions>=4.8.0" &>/dev/null || true
    if ! python3 -c "import typing_extensions" &>/dev/null; then
        python3 - <<'EOF' 2>/dev/null || true
import sys, os, site
sp_list = site.getsitepackages() if hasattr(site, 'getsitepackages') else []
sp_list += [p for p in sys.path if 'site-packages' in p]
for sp in sp_list:
    if os.path.isdir(sp):
        target = os.path.join(sp, "typing_extensions.py")
        try:
            with open(target, "w") as f:
                f.write('''import sys, types, typing
for _a in dir(typing):
    globals()[_a] = getattr(typing, _a)
if not hasattr(typing, "Self"):
    Self = object
if not hasattr(typing, "deprecated"):
    def deprecated(msg, **kw):
        def dec(fn): return fn
        return dec
if not hasattr(typing, "override"):
    def override(fn): return fn
TypeAliasType = getattr(typing, "TypeAliasType", object)
Buffer = getattr(typing, "Buffer", object)
''')
            break
        except Exception:
            continue
EOF
    fi
}

ensure_typing_extensions

if python3 -c "import torch, torchaudio, transformers, datasets, accelerate, evaluate, soundfile, librosa, pandas, jiwer, typing_extensions" &>/dev/null; then
    TORCH_INSTALLED=$(python3 -c "import torch; print(torch.__version__)")
    echo "   ✅  Dependencies already installed and functional (PyTorch $TORCH_INSTALLED)"
else
    # Bootstrap pip if missing in the environment
    if ! python3 -m pip --version &>/dev/null; then
        echo "   Bootstrapping pip in activated environment …"
        python3 -m ensurepip --upgrade 2>/dev/null || true
    fi

    echo "   Installing compatible wheels for Python $PY_VERSION …"
    python3 -m pip install --upgrade pip setuptools wheel "typing-extensions>=4.8.0" --quiet || true

    # Flexible PyTorch & Torchaudio installation (no rigid legacy ==2.3.1 pin)
    echo "   Installing PyTorch & Torchaudio …"
    if ! python3 -m pip install --quiet torch torchaudio "typing-extensions>=4.8.0"; then
        echo "   Retrying with flexible version bounds …"
        if ! python3 -m pip install --quiet "torch>=2.2.0" "torchaudio>=2.2.0" "typing-extensions>=4.8.0"; then
            echo "   Retrying with pre-release channel …"
            if ! python3 -m pip install --quiet --pre torch torchaudio "typing-extensions>=4.8.0"; then
                echo ""
                echo "❌  Could not find or install a compatible PyTorch wheel for Python $PY_VERSION."
                echo "    Apple Silicon PyTorch wheels are officially prebuilt for Python 3.10, 3.11, and 3.12."
                echo "    Recommended fix in your Mac Terminal:"
                echo "      brew install python@3.11 && rm -rf venv_train"
                echo "    Then re-launch training."
                exit 1
            fi
        fi
    fi

    echo "   Installing Hugging Face & Audio libraries …"
    python3 -m pip install --quiet \
        "typing-extensions>=4.8.0" \
        "transformers>=4.40.0" \
        "datasets>=2.19.0" \
        "accelerate>=0.30.0" \
        "evaluate>=0.4.0" \
        "soundfile>=0.12.0" \
        "librosa>=0.10.0" \
        "pandas>=2.0.0" \
        "jiwer>=0.3.0"

    # Verify PyTorch imports cleanly
    if ! python3 -c "import torch, typing_extensions" &>/dev/null; then
        echo "   Repairing PyTorch core dependencies …"
        ensure_typing_extensions
        python3 -m pip install --quiet sympy networkx jinja2 || true
    fi

    # Final sanity check before passing step 4
    if ! python3 -c "import torch, typing_extensions" &>/dev/null; then
        echo "   Corrupted virtual environment detected. Automatically purging and rebuilding fresh venv …"
        deactivate 2>/dev/null || true
        rm -rf "$VENV_DIR"
        "$PYTHON_BIN" -m venv "$VENV_DIR"
        source "$VENV_DIR/bin/activate"
        python3 -m pip install --upgrade pip setuptools wheel "typing-extensions>=4.8.0" --quiet
        python3 -m pip install torch torchaudio "typing-extensions>=4.8.0" --quiet
        python3 -m pip install "transformers>=4.40.0" "datasets>=2.19.0" "accelerate>=0.30.0" "evaluate>=0.4.0" "soundfile>=0.12.0" "librosa>=0.10.0" "pandas>=2.0.0" "jiwer>=0.3.0" --quiet
        ensure_typing_extensions
    fi

    echo "   ✅  Dependencies ready"
fi

# ── MPS runtime check ─────────────────────────────────────────────────────────
if [[ "$IS_APPLE_SILICON" == true ]]; then
    echo "[5/6] Verifying MPS in PyTorch …"
    MPS_CHECK=$(python3 - <<'EOF'
try:
    import typing_extensions
except ImportError:
    import sys, types, typing
    te = types.ModuleType("typing_extensions")
    for _a in dir(typing):
        setattr(te, _a, getattr(typing, _a))
    te.Self = getattr(typing, "Self", object)
    te.deprecated = lambda msg, **kw: (lambda fn: fn)
    te.override = lambda fn: fn
    te.TypeAliasType = getattr(typing, "TypeAliasType", object)
    te.Buffer = getattr(typing, "Buffer", object)
    sys.modules["typing_extensions"] = te

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
    def check_audio_file(p):
        if not p or not isinstance(p, str):
            return False
        s = str(p).strip()
        return (
            os.path.exists(s) or
            os.path.exists(os.path.join("dataset", s)) or
            os.path.exists(os.path.join("dataset", os.path.basename(s))) or
            os.path.exists(os.path.join("uploads", os.path.basename(s)))
        )
    missing = df["file_name"].apply(lambda p: not check_audio_file(p)).sum()
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
