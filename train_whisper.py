"""
train_whisper.py  —  Paxton-speech Whisper fine-tuner
======================================================
Designed for:
  • ~176 labelled audio clips
  • macOS M2 Pro (MPS backend, no CUDA)
  • Phonetic OR standard English transcripts (auto-detected)
  • Downstream pipeline: Whisper → phonetic text → dictionary → LLM

Usage
-----
  python train_whisper.py [epochs] [lr] [batch_size] [transcript_mode]

  transcript_mode   phonetic  (default) — train on "I nee a hell"
                    english             — train on "I need help"

Recommended first runs
  python train_whisper.py 5  5e-6 8 phonetic   # quick proof-of-concept
  python train_whisper.py 15 3e-6 8 phonetic   # if epoch 5 still improving

CSV format (dataset/metadata.csv)
  Required columns  :  file_name, transcription
  Optional columns  :  phonetic, intent
  If 'phonetic' column exists and mode=phonetic, it is used as the label.
  'intent' is stored but not trained on (reserved for LLM layer).
"""

import os
import sys
import re
import json
import numpy as np
import pandas as pd
import torch
import evaluate
from pathlib import Path
from datasets import Dataset, Audio
from transformers import (
    WhisperFeatureExtractor,
    WhisperTokenizer,
    WhisperProcessor,
    WhisperForConditionalGeneration,
    Seq2SeqTrainingArguments,
    Seq2SeqTrainer,
    EarlyStoppingCallback,
)
from dataclasses import dataclass
from typing import Any, Dict, List, Union

# ─── Config ───────────────────────────────────────────────────────────────────

DATASET_DIR   = "dataset"
METADATA_FILE = "metadata.csv"

# whisper-small.en:  244M params — enough capacity to learn atypical phonemes,
#                    still fits M2 Pro RAM easily.
# whisper-base.en:   74M  — faster, use if small proves too slow or overfits.
MODEL_NAME    = "openai/whisper-small.en"

OUTPUT_CHECKPOINTS = "./whisper-paxton-checkpoints"
OUTPUT_FINAL       = "./whisper-paxton-final"

# ─── Device ───────────────────────────────────────────────────────────────────

def get_device() -> torch.device:
    if torch.backends.mps.is_available():
        print("🍎  Apple MPS (Metal) backend")
        return torch.device("mps")
    if torch.cuda.is_available():
        print("🟢  CUDA backend")
        return torch.device("cuda")
    print("🔵  CPU backend")
    return torch.device("cpu")

# ─── Text helpers ─────────────────────────────────────────────────────────────

def clean_transcript(text: str) -> str:
    """
    Minimal cleaning that deliberately preserves:
      - atypical contractions  (nee, gooh, bah, yeyo …)
      - non-standard grammar
      - phonetic spellings

    Only removes invisible junk that would confuse the tokeniser.
    """
    if not isinstance(text, str):
        return ""
    text = text.strip()
    text = re.sub(r" {2,}", " ", text)           # collapse runs of spaces
    text = re.sub(r"[^\x20-\x7E]", "", text)    # drop non-ASCII control chars
    return text

# ─── Audio augmentation ───────────────────────────────────────────────────────

def augment_audio(arr: np.ndarray) -> list:
    """
    Returns the original + 3 variants to expand a small dataset ~4×.
    Variants simulate real-world mic/room variation without distorting
    the phonetic content we need the model to learn.
    """
    arr = arr.astype(np.float32)
    return [
        arr,                                                     # original
        np.clip(arr + np.random.normal(0, 0.003, arr.shape).astype(np.float32), -1, 1),  # noise
        np.clip(arr * 1.15, -1, 1),                              # louder
        arr * 0.82,                                              # quieter
    ]

# ─── Data collator ────────────────────────────────────────────────────────────

@dataclass
class PaddingCollator:
    processor: Any

    def __call__(self, features: List[Dict[str, Union[List[int], torch.Tensor]]]) -> Dict[str, torch.Tensor]:
        input_features = [{"input_features": f["input_features"]} for f in features]
        batch = self.processor.feature_extractor.pad(input_features, return_tensors="pt")

        label_features = [{"input_ids": f["labels"]} for f in features]
        labels_batch   = self.processor.tokenizer.pad(label_features, return_tensors="pt")
        labels = labels_batch["input_ids"].masked_fill(labels_batch.attention_mask.ne(1), -100)

        # Whisper prepends BOS; the trainer re-adds it so strip it from labels
        if (labels[:, 0] == self.processor.tokenizer.bos_token_id).all().cpu().item():
            labels = labels[:, 1:]

        batch["labels"] = labels
        return batch

# ─── Metrics ──────────────────────────────────────────────────────────────────

def build_metrics(processor):
    wer_fn = evaluate.load("wer")

    def compute_metrics(pred):
        pred_ids  = pred.predictions
        label_ids = pred.label_ids.copy()
        label_ids[label_ids == -100] = processor.tokenizer.pad_token_id

        pred_str  = processor.tokenizer.batch_decode(pred_ids,  skip_special_tokens=True)
        label_str = processor.tokenizer.batch_decode(label_ids, skip_special_tokens=True)

        wer = wer_fn.compute(predictions=pred_str, references=label_str)
        return {"wer": round(wer * 100, 2)}

    return compute_metrics

# ─── Benchmark eval ───────────────────────────────────────────────────────────

def run_benchmark(model, processor, benchmark_path: str, device: torch.device):
    """
    Optional: if dataset/benchmark.csv exists (file_name, transcription columns),
    run a final WER pass on clips the model never saw during training.
    This gives you a honest held-out score separate from the val split.
    """
    if not os.path.exists(benchmark_path):
        return

    print(f"\n📊  Running held-out benchmark ({benchmark_path}) …")
    df  = pd.read_csv(benchmark_path)
    fe  = processor.feature_extractor
    tok = processor.tokenizer
    model.eval()

    preds, refs = [], []
    for _, row in df.iterrows():
        from datasets import load_dataset as _ld
        import soundfile as sf
        audio, sr = sf.read(row["file_name"])
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        feats = fe(audio, sampling_rate=sr, return_tensors="pt").input_features.to(device)
        with torch.no_grad():
            ids = model.generate(feats)
        preds.append(tok.decode(ids[0], skip_special_tokens=True))
        refs.append(str(row["transcription"]))

    wer_fn  = evaluate.load("wer")
    score   = wer_fn.compute(predictions=preds, references=refs)
    print(f"   Held-out WER: {round(score * 100, 2)}%")

    # Write a side-by-side for quick inspection
    report = [{"file": r["file_name"], "ref": ref, "pred": pred}
              for (_, r), ref, pred in zip(df.iterrows(), refs, preds)]
    out = os.path.join(OUTPUT_FINAL, "benchmark_results.json")
    with open(out, "w") as f:
        json.dump(report, f, indent=2)
    print(f"   Side-by-side saved → {out}")

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    # ── Args ─────────────────────────────────────────────────────────────────
    epochs          = int(sys.argv[1])   if len(sys.argv) > 1 else 15
    lr              = float(sys.argv[2]) if len(sys.argv) > 2 else 5e-6
    batch_size      = int(sys.argv[3])   if len(sys.argv) > 3 else 8
    transcript_mode = sys.argv[4]        if len(sys.argv) > 4 else "phonetic"

    assert transcript_mode in ("phonetic", "english"), \
        "transcript_mode must be 'phonetic' or 'english'"

    print(f"\n{'='*60}")
    print(f"  Paxton Whisper fine-tuner")
    print(f"  Model   : {MODEL_NAME}")
    print(f"  Mode    : {transcript_mode} transcripts")
    print(f"  Epochs  : {epochs}  |  LR: {lr}  |  Batch: {batch_size}")
    print(f"{'='*60}\n")

    # ── Load CSV ─────────────────────────────────────────────────────────────
    meta = os.path.join(DATASET_DIR, METADATA_FILE)
    if not os.path.exists(meta):
        sys.exit(f"❌  {meta} not found.")

    print("[1/5] Loading metadata …")
    df = pd.read_csv(meta)

    # Choose which column becomes the training label
    if transcript_mode == "phonetic" and "phonetic" in df.columns:
        label_col = "phonetic"
        print("   Using 'phonetic' column as training labels  →  Paxton-style spellings")
    else:
        label_col = "transcription"
        mode_desc = "standard English" if transcript_mode == "english" else \
                    "'phonetic' column not found — falling back to 'transcription'"
        print(f"   Using 'transcription' column  ({mode_desc})")

    df["_label"] = df[label_col].apply(clean_transcript)

    # Drop rows with no audio path or empty label
    before = len(df)
    df = df[df["file_name"].notna() & (df["_label"].str.len() > 0)].reset_index(drop=True)
    if len(df) < before:
        print(f"   ⚠️  Dropped {before - len(df)} unusable rows")

    if len(df) == 0:
        sys.exit("❌  No usable samples after cleaning.")

    print(f"   {len(df)} usable samples")

    # ── Split ────────────────────────────────────────────────────────────────
    # For 176 samples an 85/15 split gives slightly more training data
    # than 80/20, while keeping enough eval samples to be meaningful.
    val_size = max(10, int(len(df) * 0.15))
    dataset  = Dataset.from_pandas(df[["file_name", "_label"]].rename(
        columns={"_label": "transcription"}
    ))
    dataset = dataset.cast_column("file_name", Audio(sampling_rate=16000))
    split   = dataset.train_test_split(test_size=val_size, seed=42)
    train_ds = split["train"]
    eval_ds  = split["test"]
    print(f"   Train: {len(train_ds)}  |  Val: {len(eval_ds)}")

    # ── Processor ────────────────────────────────────────────────────────────
    print(f"\n[2/5] Loading processor for {MODEL_NAME} …")
    feature_extractor = WhisperFeatureExtractor.from_pretrained(MODEL_NAME)
    tokenizer = WhisperTokenizer.from_pretrained(
        MODEL_NAME, language="english", task="transcribe"
    )
    processor = WhisperProcessor.from_pretrained(
        MODEL_NAME, language="english", task="transcribe"
    )

    # ── Preprocess ───────────────────────────────────────────────────────────
    base_cols = dataset.column_names
    USE_AUG   = len(train_ds) < 500

    def prep_single(batch):
        audio = batch["file_name"]
        batch["input_features"] = feature_extractor(
            audio["array"], sampling_rate=audio["sampling_rate"]
        ).input_features[0]
        batch["labels"] = tokenizer(batch["transcription"]).input_ids
        return batch

    def prep_augmented(examples):
        feats_out, labels_out = [], []
        for i in range(len(examples["file_name"])):
            audio = examples["file_name"][i]
            ids   = tokenizer(examples["transcription"][i]).input_ids
            for variant in augment_audio(audio["array"]):
                feats_out.append(
                    feature_extractor(variant, sampling_rate=audio["sampling_rate"]).input_features[0]
                )
                labels_out.append(ids)
        return {"input_features": feats_out, "labels": labels_out}

    print("\n[3/5] Preprocessing audio …")
    if USE_AUG:
        n_aug = len(train_ds) * 4
        print(f"   🔀 Augmentation ON  ({len(train_ds)} → ~{n_aug} effective samples)")
        train_ds = train_ds.map(
            prep_augmented, batched=True, batch_size=16, remove_columns=base_cols
        )
    else:
        train_ds = train_ds.map(prep_single, remove_columns=base_cols, num_proc=1)

    eval_ds = eval_ds.map(prep_single, remove_columns=base_cols, num_proc=1)
    print(f"   Effective train size: {len(train_ds)}")

    # ── Model ────────────────────────────────────────────────────────────────
    device = get_device()
    print(f"\n[4/5] Loading model …")
    model = WhisperForConditionalGeneration.from_pretrained(MODEL_NAME)
    model.config.forced_decoder_ids   = None
    model.config.suppress_tokens      = []
    # Do NOT suppress atypical tokens (contractions, phonetic spellings)
    model.config.begin_suppress_tokens = []
    model = model.to(device)

    # ── Training args ────────────────────────────────────────────────────────
    use_fp16 = torch.cuda.is_available()
    # M2 supports bfloat16 natively via MPS; this is more stable than fp16 on MPS
    use_bf16 = (not use_fp16) and device.type == "mps"

    training_args = Seq2SeqTrainingArguments(
        output_dir                  = OUTPUT_CHECKPOINTS,
        per_device_train_batch_size = batch_size,
        gradient_accumulation_steps = 2,          # effective batch = batch_size * 2
        learning_rate               = lr,
        lr_scheduler_type           = "cosine",   # smoother decay vs. linear
        warmup_ratio                = 0.1,        # 10% of steps for warmup
        num_train_epochs            = epochs,
        gradient_checkpointing      = True,
        fp16                        = use_fp16,
        bf16                        = use_bf16,
        evaluation_strategy         = "epoch",
        save_strategy               = "epoch",
        per_device_eval_batch_size  = batch_size,
        predict_with_generate       = True,
        generation_max_length       = 225,
        logging_steps               = 5,
        report_to                   = ["none"],
        load_best_model_at_end      = True,
        metric_for_best_model       = "wer",
        greater_is_better           = False,
        push_to_hub                 = False,
        dataloader_pin_memory       = False,      # MPS requirement
        optim                       = "adamw_torch",
        # Keep only the 3 best checkpoints to save disk space
        save_total_limit            = 3,
    )

    collator = PaddingCollator(processor=processor)
    metrics  = build_metrics(processor)

    trainer = Seq2SeqTrainer(
        args            = training_args,
        model           = model,
        train_dataset   = train_ds,
        eval_dataset    = eval_ds,
        data_collator   = collator,
        compute_metrics = metrics,
        tokenizer       = processor.feature_extractor,
        callbacks       = [
            # Stop early if val WER doesn't improve for 5 epochs in a row.
            # With early stopping, the 'epochs' ceiling is a safety cap, not a target.
            EarlyStoppingCallback(early_stopping_patience=5)
        ],
    )

    # ── Train ─────────────────────────────────────────────────────────────────
    print("\n[5/5] Training …")
    print("   Watch: if train loss ↓ but val WER ↑  →  overfitting; stop early.")
    trainer.train()

    # ── Save ──────────────────────────────────────────────────────────────────
    Path(OUTPUT_FINAL).mkdir(parents=True, exist_ok=True)
    trainer.save_model(OUTPUT_FINAL)
    processor.save_pretrained(OUTPUT_FINAL)

    # Save a training manifest so you know what produced this model
    manifest = {
        "model_base"       : MODEL_NAME,
        "transcript_mode"  : transcript_mode,
        "label_column"     : label_col,
        "train_samples"    : len(train_ds),
        "val_samples"      : len(eval_ds),
        "epochs_ceiling"   : epochs,
        "lr"               : lr,
        "batch_size"       : batch_size,
        "augmentation"     : USE_AUG,
    }
    with open(os.path.join(OUTPUT_FINAL, "training_manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"\n✅  Saved → {OUTPUT_FINAL}/")
    print(f"   training_manifest.json included for reproducibility\n")

    # ── Optional held-out benchmark ──────────────────────────────────────────
    run_benchmark(
        model, processor,
        os.path.join(DATASET_DIR, "benchmark.csv"),
        device,
    )

    print(
        "💡  Load for inference:\n"
        "   from transformers import pipeline\n"
        f"  pipe = pipeline('automatic-speech-recognition', model='{OUTPUT_FINAL}')\n"
        "   result = pipe('clip.wav')\n"
        "   print(result['text'])   # → phonetic Paxton output e.g. 'I nee a hell'\n"
    )


if __name__ == "__main__":
    main()