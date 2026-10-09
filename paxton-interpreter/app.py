#!/usr/bin/env python3
"""
app.py
Main entry point for Paxton Interpreter (Standalone Mic -> Transcribe -> TTS & API Server).
"""

import os
import sys
import json
from pathlib import Path

# Add src to path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from src.infer import PaxtonInterpreter
from src.tts import speak


def run_cli_interactive():
    print("=" * 65)
    print(" Paxton Interpreter: Simplified Mode (Whisper-Large-v3-Turbo + LoRA)")
    print("=" * 65)
    print("Loading models...")
    interpreter = PaxtonInterpreter()
    print("\nInterpreter ready! Enter path to audio file, or type text to simulate:")
    
    while True:
        try:
            line = input("\n[Audio file / text]> ").strip()
            if not line:
                continue
            if line.lower() in ["exit", "quit", "q"]:
                break
            
            if os.path.exists(line):
                res = interpreter.transcribe(line)
            else:
                # Text simulation
                from src.correct import correct_transcription
                res = correct_transcription(line, confidence=0.70)
                res = {
                    "raw_transcription": line,
                    "final_text": res.get("corrected", line),
                    "final_confidence": res.get("confidence", 0.70),
                }

            print(f"-> Interpreted: {res['final_text']}")
            speak(res['final_text'])
            
            # Continuous improvement prompt
            correct_feedback = input("Was this correct? (y / actual sentence): ").strip()
            if correct_feedback.lower() not in ["y", "yes", ""]:
                # Save correction to data/pairs/
                import time
                pair_id = f"corr_{int(time.time())}"
                pairs_dir = BASE_DIR / "data" / "pairs"
                pairs_dir.mkdir(parents=True, exist_ok=True)
                with open(pairs_dir / f"{pair_id}.txt", "w", encoding="utf-8") as f:
                    f.write(correct_feedback)
                if os.path.exists(line):
                    import shutil
                    shutil.copy2(line, pairs_dir / f"{pair_id}.wav")
                print(f"[FEEDBACK SAVED] Added '{correct_feedback}' to data/pairs/{pair_id} for next LoRA retrain.")

        except (KeyboardInterrupt, EOFError):
            print("\nExiting.")
            break


def run_api_server(host="0.0.0.0", port=8000):
    try:
        from fastapi import FastAPI, UploadFile, File, Form
        import uvicorn
        import shutil
        import tempfile
    except ImportError:
        print("[ERROR] FastAPI or uvicorn not installed. Run: pip install fastapi uvicorn")
        sys.exit(1)

    app = FastAPI(title="Paxton Interpreter API (Whisper-Large-v3-Turbo LoRA)")
    interpreter = PaxtonInterpreter()

    @app.get("/health")
    def health():
        return {"status": "ok", "model": interpreter.model_id, "lora_active": interpreter.use_lora}

    @app.post("/transcribe")
    async def transcribe_endpoint(audio: UploadFile = File(...)):
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            shutil.copyfileobj(audio.file, tmp)
            tmp_path = tmp.name

        try:
            result = interpreter.transcribe(tmp_path)
            return result
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    @app.post("/feedback")
    def feedback(audio_id: str = Form(...), intended_text: str = Form(...)):
        pairs_dir = BASE_DIR / "data" / "pairs"
        pairs_dir.mkdir(parents=True, exist_ok=True)
        txt_path = pairs_dir / f"{audio_id}.txt"
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(intended_text.strip())
        return {"success": True, "saved_to": str(txt_path)}

    print(f"[INFO] Starting FastAPI server on {host}:{port}...")
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    if "--server" in sys.argv:
        run_api_server()
    else:
        run_cli_interactive()
