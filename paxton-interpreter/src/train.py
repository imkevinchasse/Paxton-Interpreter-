#!/usr/bin/env python3
"""
src/train.py
Fine-tunes openai/whisper-large-v3-turbo with LoRA for Paxton's atypical speech.
"""

import os
import sys
import argparse
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATASET_DIR = BASE_DIR / "data" / "dataset"
MODELS_DIR = BASE_DIR / "models"
BASE_MODEL_DIR = MODELS_DIR / "base"
FINE_TUNED_DIR = MODELS_DIR / "fine_tuned"
LORA_OUTPUT_DIR = FINE_TUNED_DIR / "lora"

DEFAULT_MODEL_ID = "openai/whisper-small"


def parse_args():
    parser = argparse.ArgumentParser(description="LoRA Fine-tuning for Whisper (openai/whisper-small or whisper-large-v3-turbo)")
    parser.add_argument("--model-id", type=str, default=DEFAULT_MODEL_ID, help="Base Whisper model ID (e.g. openai/whisper-small, openai/whisper-large-v3-turbo)")
    parser.add_argument("--epochs", type=int, default=15, help="Number of training epochs (8-20 recommended for severe speech)")
    parser.add_argument("--lr", type=float, default=1e-4, help="Learning rate for LoRA adapters")
    parser.add_argument("--batch-size", type=int, default=8, help="Per device train batch size (8 for small, 4 for turbo)")
    parser.add_argument("--grad-accum", type=int, default=2, help="Gradient accumulation steps")
    parser.add_argument("--lora-r", type=int, default=32, help="LoRA rank dimension")
    parser.add_argument("--lora-alpha", type=int, default=64, help="LoRA alpha scaling factor")
    parser.add_argument("--fp16", action="store_true", default=True, help="Use mixed precision fp16")
    return parser.parse_args()


def train(args):
    try:
        import torch
        from datasets import load_from_disk
        from transformers import (
            WhisperForConditionalGeneration,
            WhisperProcessor,
            Seq2SeqTrainingArguments,
            Seq2SeqTrainer,
        )
        from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
        import evaluate
    except ImportError as e:
        print(f"[ERROR] Missing required ML library: {e}")
        print("Please run: pip install transformers datasets accelerate peft evaluate jiwer torch torchaudio soundfile")
        sys.exit(1)

    print("=" * 65)
    print(" Paxton Interpreter: Whisper-Large-v3-Turbo LoRA Training")
    print(f" Target Model:  {args.model_id}")
    print(f" LoRA Rank:     r={args.lora_r}, alpha={args.lora_alpha}")
    print(f" Epochs:        {args.epochs}")
    print("=" * 65)

    # Verify dataset exists
    if not DATASET_DIR.exists():
        print(f"[ERROR] Dataset directory not found at {DATASET_DIR}.")
        print("Please run: python src/prepare_data.py first.")
        sys.exit(1)

    print(f"[INFO] Loading dataset from {DATASET_DIR}...")
    ds = load_from_disk(str(DATASET_DIR))
    print(f"[INFO] Train samples: {len(ds['train'])}, Test samples: {len(ds['test'])}")

    # Use local base if downloaded, otherwise Hugging Face model id
    model_source = str(BASE_MODEL_DIR) if BASE_MODEL_DIR.exists() and any(BASE_MODEL_DIR.iterdir()) else args.model_id

    print(f"[INFO] Initializing processor and model from {model_source}...")
    processor = WhisperProcessor.from_pretrained(model_source, language="en", task="transcribe")
    
    device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"[INFO] Training device: {device.upper()}")

    model = WhisperForConditionalGeneration.from_pretrained(
        model_source,
        torch_dtype=torch.float16 if (args.fp16 and device == "cuda") else torch.float32,
    )

    # Disable cache for gradient checkpointing
    model.config.use_cache = False

    # LoRA Configuration tailored for personalized severe speech
    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        target_modules=["q_proj", "v_proj", "k_proj", "out_proj"],
        lora_dropout=0.05,
        bias="none",
    )
    model = get_peft_model(model, lora_config)
    print("\n--- Trainable Parameters ---")
    model.print_trainable_parameters()
    print("----------------------------\n")

    # Data preparation mapping function
    def prepare_batch(batch):
        audio = batch["audio"]
        inputs = processor(audio["array"], sampling_rate=16000, return_tensors="pt")
        batch["input_features"] = inputs.input_features[0]
        batch["labels"] = processor.tokenizer(batch["text"]).input_ids
        return batch

    print("[INFO] Transforming dataset audio to log-mel spectrogram features...")
    ds_processed = ds.map(
        prepare_batch,
        remove_columns=ds["train"].column_names,
        num_proc=1,
    )

    # Metric evaluation (Word Error Rate)
    wer_metric = evaluate.load("wer")

    def compute_metrics(pred):
        pred_ids = pred.predictions
        label_ids = pred.label_ids
        label_ids[label_ids == -100] = processor.tokenizer.pad_token_id
        pred_str = processor.tokenizer.batch_decode(pred_ids, skip_special_tokens=True)
        label_str = processor.tokenizer.batch_decode(label_ids, skip_special_tokens=True)
        wer = 100 * wer_metric.compute(predictions=pred_str, references=label_str)
        return {"wer": wer}

    # Custom collator for seq2seq padding
    from dataclasses import dataclass
    from typing import Any, Dict, List, Union

    @dataclass
    class DataCollatorSpeechSeq2SeqWithPadding:
        processor: Any

        def __call__(self, features: List[Dict[str, Union[List[int], torch.Tensor]]]) -> Dict[str, torch.Tensor]:
            input_features = [{"input_features": feature["input_features"]} for feature in features]
            batch = self.processor.feature_extractor.pad(input_features, return_tensors="pt")
            label_features = [{"input_ids": feature["labels"]} for feature in features]
            labels_batch = self.processor.tokenizer.pad(label_features, return_tensors="pt")
            labels = labels_batch["input_ids"].masked_fill(labels_batch.attention_mask.ne(1), -100)
            if (labels[:, 0] == self.processor.tokenizer.bos_token_id).all().cpu().item():
                labels = labels[:, 1:]
            batch["labels"] = labels
            return batch

    data_collator = DataCollatorSpeechSeq2SeqWithPadding(processor=processor)

    FINE_TUNED_DIR.mkdir(parents=True, exist_ok=True)
    training_args = Seq2SeqTrainingArguments(
        output_dir=str(FINE_TUNED_DIR / "checkpoints"),
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        warmup_steps=50,
        num_train_epochs=args.epochs,
        fp16=(args.fp16 and device == "cuda"),
        evaluation_strategy="epoch",
        save_strategy="epoch",
        predict_with_generate=True,
        generation_max_length=128,
        logging_steps=10,
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="wer",
        greater_is_better=False,
    )

    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=ds_processed["train"],
        eval_dataset=ds_processed["test"],
        data_collator=data_collator,
        compute_metrics=compute_metrics,
        tokenizer=processor.feature_extractor,
    )

    print("[INFO] Beginning LoRA fine-tuning...")
    trainer.train()

    # Save final LoRA adapter weights and processor
    LORA_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[INFO] Saving fine-tuned LoRA weights to {LORA_OUTPUT_DIR}...")
    model.save_pretrained(str(LORA_OUTPUT_DIR))
    processor.save_pretrained(str(LORA_OUTPUT_DIR))
    print(f"[SUCCESS] LoRA fine-tuning completed successfully! Adapter ready at {LORA_OUTPUT_DIR}")


if __name__ == "__main__":
    args = parse_args()
    train(args)
