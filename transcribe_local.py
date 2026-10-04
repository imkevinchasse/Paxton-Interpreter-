#!/usr/bin/env python3
"""
transcribe_local.py  —  High-Performance Local Paxton Inference Engine
======================================================================
Usage:
  python3 transcribe_local.py <audio_file_path> [model_path]

Outputs JSON to stdout:
  {"text": "...", "confidence": 0.95, "device": "mps", "model": "whisper-paxton-final"}
"""

import os
import sys
import json
import warnings
warnings.filterwarnings("ignore")

# Safety shim
try:
    import typing_extensions
except ImportError:
    import types, typing
    te = types.ModuleType("typing_extensions")
    for _a in dir(typing):
        setattr(te, _a, getattr(typing, _a))
    te.Self = getattr(typing, "Self", object)
    te.deprecated = lambda msg, **kw: (lambda fn: fn)
    te.override = lambda fn: fn
    te.TypeAliasType = getattr(typing, "TypeAliasType", object)
    te.Buffer = getattr(typing, "Buffer", object)
    sys.modules["typing_extensions"] = te

from pathlib import Path
import torch
import soundfile as sf
import numpy as np
from transformers import WhisperForConditionalGeneration, WhisperProcessor


def resolve_model_dir(preferred_path=None):
    if preferred_path and Path(preferred_path).exists():
        return Path(preferred_path)

    # 1. Final release model
    final_dir = Path("./whisper-paxton-final")
    if final_dir.exists() and (final_dir / "model.safetensors").exists():
        return final_dir

    # 2. Best checkpoint in checkpoints directory
    ckpts_dir = Path("./whisper-paxton-checkpoints")
    if ckpts_dir.exists():
        # Checkpoint 98 is the best (Epoch 2)
        ckpt_98 = ckpts_dir / "checkpoint-98"
        if ckpt_98.exists():
            return ckpt_98
        # Any checkpoint
        all_ckpts = sorted(ckpts_dir.glob("checkpoint-*"), key=lambda p: int(p.name.split("-")[-1]) if p.name.split("-")[-1].isdigit() else 0, reverse=True)
        if all_ckpts:
            return all_ckpts[0]

    # 3. Fallback base model
    return "openai/whisper-small.en"


def load_audio(audio_path):
    try:
        arr, sr = sf.read(audio_path, dtype="float32")
    except Exception:
        import librosa
        arr, sr = librosa.load(audio_path, sr=16000, mono=True)
        return arr.astype(np.float32)

    if arr.ndim > 1:
        arr = arr.mean(axis=1)

    if sr != 16000:
        import librosa
        arr = librosa.resample(arr, orig_sr=sr, target_sr=16000)

    return arr.astype(np.float32)


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No audio path provided", "text": ""}))
        sys.exit(1)

    audio_path = sys.argv[1]
    preferred_model = sys.argv[2] if len(sys.argv) > 2 else None

    if not os.path.exists(audio_path):
        print(json.dumps({"error": f"File not found: {audio_path}", "text": ""}))
        sys.exit(1)

    model_target = resolve_model_dir(preferred_model)
    model_name_str = str(model_target.name) if isinstance(model_target, Path) else str(model_target)

    # Determine device: prefer Apple Silicon MPS
    if torch.backends.mps.is_available():
        device = torch.device("mps")
        dev_str = "mps"
    elif torch.cuda.is_available():
        device = torch.device("cuda")
        dev_str = "cuda"
    else:
        device = torch.device("cpu")
        dev_str = "cpu"

    try:
        model = WhisperForConditionalGeneration.from_pretrained(model_target).to(device)
        model.eval()

        try:
            processor = WhisperProcessor.from_pretrained(model_target)
        except Exception:
            processor = WhisperProcessor.from_pretrained("openai/whisper-small.en")

        audio_arr = load_audio(audio_path)
        input_features = processor(audio_arr, sampling_rate=16000, return_tensors="pt").input_features.to(device)

        gen_kwargs = {
            "max_length": 225,
            "no_repeat_ngram_size": 3,
            "predict_timestamps": False
        }

        with torch.no_grad():
            predicted_ids = model.generate(input_features, **gen_kwargs)

        transcription = processor.batch_decode(predicted_ids, skip_special_tokens=True)[0].strip()

        output = {
            "text": transcription,
            "model": model_name_str,
            "device": dev_str,
            "success": True
        }
        print(json.dumps(output))

    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "text": "",
            "success": False,
            "model": model_name_str,
            "device": dev_str
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
