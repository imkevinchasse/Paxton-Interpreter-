#!/usr/bin/env python3
"""
src/prepare_data.py
Prepares Paxton's verified audio-text pairs into clean .wav/.txt pairs and a Hugging Face Dataset.
"""

import os
import sys
import json
import shutil
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
PAIRS_DIR = DATA_DIR / "pairs"
DATASET_DIR = DATA_DIR / "dataset"
ROOT_DIR = BASE_DIR.parent

# Create target directories
PAIRS_DIR.mkdir(parents=True, exist_ok=True)
RAW_DIR.mkdir(parents=True, exist_ok=True)


def sync_from_app_library():
    """Extract audio recordings and verified intended text from the web studio."""
    training_file = ROOT_DIR / "training_data.json"
    uploads_dir = ROOT_DIR / "uploads"
    audio_bank_dir = ROOT_DIR / "audio_bank"

    synced_count = 0
    if training_file.exists():
        try:
            with open(training_file, "r", encoding="utf-8") as f:
                items = json.load(f)
            
            print(f"[INFO] Found {len(items)} items in {training_file}")
            for idx, item in enumerate(items):
                item_id = str(item.get("id") or f"{idx:04d}")
                meaning = str(item.get("meaning") or "").strip()
                sound = str(item.get("sound") or "").strip()
                audio_file = item.get("audioFile") or item.get("filename") or f"{item_id}.wav"
                
                if not meaning:
                    continue

                # Locate corresponding audio file
                src_audio = None
                for candidate in [
                    uploads_dir / audio_file,
                    audio_bank_dir / audio_file,
                    uploads_dir / f"{item_id}.wav",
                    uploads_dir / f"{item_id}.webm",
                    uploads_dir / f"{item_id}.mp4",
                    RAW_DIR / audio_file,
                ]:
                    if candidate.exists():
                        src_audio = candidate
                        break

                txt_target = PAIRS_DIR / f"{item_id}.txt"
                with open(txt_target, "w", encoding="utf-8") as tf:
                    tf.write(meaning)

                if src_audio:
                    dst_audio = PAIRS_DIR / f"{item_id}.wav"
                    shutil.copy2(src_audio, dst_audio)
                    synced_count += 1
                else:
                    # Synthetic / text pair fallback if audio is pending
                    pass
        except Exception as e:
            print(f"[WARNING] Could not sync training_data.json: {e}")

    # Also check raw directory for direct .wav files
    if RAW_DIR.exists():
        for f in os.listdir(RAW_DIR):
            if f.endswith((".wav", ".mp3", ".webm", ".m4a")):
                stem = Path(f).stem
                txt_file = RAW_DIR / f"{stem}.txt"
                if txt_file.exists():
                    shutil.copy2(RAW_DIR / f, PAIRS_DIR / f"{stem}.wav")
                    shutil.copy2(txt_file, PAIRS_DIR / f"{stem}.txt")
                    synced_count += 1

    print(f"[INFO] Synced {synced_count} audio pairs into {PAIRS_DIR}")
    return synced_count


def load_and_split_dataset(test_size=0.1):
    """
    Converts data/pairs/*.wav and *.txt into a Hugging Face Dataset with train/test split.
    """
    try:
        from datasets import Dataset, Audio
    except ImportError:
        print("[WARNING] 'datasets' library is not installed. Run: pip install datasets soundfile")
        return None

    audio_files = []
    text_labels = []

    for f in sorted(os.listdir(PAIRS_DIR)):
        if f.endswith(".wav"):
            base = f[:-4]
            txt_path = PAIRS_DIR / f"{base}.txt"
            if txt_path.exists():
                wav_path = str(PAIRS_DIR / f)
                with open(txt_path, "r", encoding="utf-8") as tf:
                    text_content = tf.read().strip()
                if text_content:
                    audio_files.append(wav_path)
                    text_labels.append(text_content)

    print(f"[INFO] Loaded {len(audio_files)} verified audio pairs from {PAIRS_DIR}")
    if len(audio_files) == 0:
        print("[WARN] No audio pairs found in data/pairs/. Place .wav and .txt pairs there first.")
        return None

    data = {"audio": audio_files, "text": text_labels}
    ds = Dataset.from_dict(data)
    ds = ds.cast_column("audio", Audio(sampling_rate=16000))

    # Keep a small held-out set (10% or at least 5 examples)
    split_size = max(0.05, min(0.2, test_size)) if len(audio_files) >= 10 else 0.1
    ds_splits = ds.train_test_split(test_size=split_size, seed=42)

    DATASET_DIR.mkdir(parents=True, exist_ok=True)
    ds_splits.save_to_disk(str(DATASET_DIR))
    print(f"[SUCCESS] Dataset successfully saved to {DATASET_DIR}")
    print(f"  - Train examples: {len(ds_splits['train'])}")
    print(f"  - Test examples:  {len(ds_splits['test'])}")
    return ds_splits


def main():
    print("=" * 60)
    print(" Paxton Interpreter: Prepare & Format Dataset")
    print("=" * 60)
    sync_from_app_library()
    load_and_split_dataset()


if __name__ == "__main__":
    main()
