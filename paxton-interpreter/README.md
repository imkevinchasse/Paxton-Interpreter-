# Paxton Interpreter: Simplified Mode (Whisper-Large-v3-Turbo + LoRA)

An end-to-end, streamlined speech interpreter built specifically for severe speech motor differences (cerebral palsy, childhood apraxia, oral hypotonia, Down syndrome).

## Architecture: Fast 3-Step Pipeline
```
Audio (Mic or File)
        ↓
Fine-tuned Whisper-turbo (openai/whisper-large-v3-turbo with LoRA adapter)
        ↓
Hypothesis + Confidence Metric
        ↓
[Low Confidence? (<0.82)] → Context-Aware Light LLM Correction (Ollama / Local LLM)
        ↓
Final English Sentence
        ↓
Offline Text-to-Speech (TTS Speak)
```

## Recommended Model
- **Base Model**: `openai/whisper-large-v3-turbo` (809M parameters).
- Best speed/memory trade-off for personalization. Full large-v3 requires substantially more VRAM with negligible gains on small datasets.

## Directory Structure
```
paxton-interpreter/
├── data/
│   ├── raw/                 # Raw unprocessed audio files
│   ├── pairs/               # Cleaned pairs: {id}.wav + {id}.txt (intended sentence)
│   └── dataset/             # Hugging Face Dataset format (train/test split)
├── models/
│   ├── base/                # Downloaded whisper-large-v3-turbo base checkpoint
│   └── fine_tuned/          # Trained LoRA adapters (models/fine_tuned/lora)
├── src/
│   ├── prepare_data.py      # Extracts pairs from training data & formats HF dataset
│   ├── train.py             # LoRA fine-tuning with Seq2SeqTrainer
│   ├── infer.py             # Real-time / batch inference pipeline
│   ├── correct.py           # Light context-aware LLM correction layer
│   └── tts.py               # Text-to-speech output
├── app.py                   # Standalone mic/CLI and FastAPI microservice
├── requirements.txt
└── README.md
```

## Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
# Optional offline neural TTS:
pip install piper-tts
```

### 2. Extract & Format Your Audio Pairs
```bash
# Automatically pulls from web studio database or pairs directory
python src/prepare_data.py
```
This writes:
- `data/pairs/{id}.wav`
- `data/pairs/{id}.txt`
- Compiled Hugging Face dataset in `data/dataset` with a 90/10 train/test split.

### 3. Fine-Tune with LoRA
```bash
python src/train.py
```
Key LoRA hyperparameters optimized for severe speech + small sample size (~300 pairs):
- `r = 32`, `lora_alpha = 64`
- `target_modules = ["q_proj", "v_proj", "k_proj", "out_proj"]`
- `dropout = 0.05`
- `lr = 1e-4`, `warmup_steps = 50`, `epochs = 8-15`

### 4. Run Standalone Inference
```bash
# Test on single audio file:
python src/infer.py path/to/sample.wav

# Or launch the mic listener / API server:
python app.py
```

## Continuous Improvement Loop
Every time the system misinterprets an utterance:
1. Save the `.wav` audio.
2. Save the correct intended sentence to `.txt`.
3. Put into `data/pairs/`.
4. Re-run `python src/train.py` to continuously adapt the LoRA weights!
