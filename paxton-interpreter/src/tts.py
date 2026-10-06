#!/usr/bin/env python3
"""
src/tts.py
Offline Text-to-Speech output module.
"""

import os
import sys
import shutil
import subprocess
from typing import Optional


def speak(text: str, voice: Optional[str] = None) -> bool:
    """
    Speaks the given text using available offline TTS engines (Piper, eSpeak, or system say).
    """
    clean = (text or "").strip()
    if not clean:
        return False

    print(f"[TTS] Speaking: \"{clean}\"")

    # 1. macOS 'say' command
    if sys.platform == "darwin" and shutil.which("say"):
        try:
            subprocess.run(["say", clean], check=True)
            return True
        except Exception:
            pass

    # 2. Piper TTS
    if shutil.which("piper"):
        try:
            cmd = f'echo "{clean}" | piper --output-raw | aplay -r 22050 -f S16_LE -t raw -'
            subprocess.run(cmd, shell=True, check=True)
            return True
        except Exception:
            pass

    # 3. eSpeak / eSpeak-NG (common on Linux / Raspberry Pi)
    for espeak_cmd in ["espeak-ng", "espeak"]:
        if shutil.which(espeak_cmd):
            try:
                subprocess.run([espeak_cmd, "-s", "150", "-v", "en-us", clean], check=True)
                return True
            except Exception:
                pass

    print(f"[TTS (simulated)]: \"{clean}\"")
    return True


if __name__ == "__main__":
    test_phrase = sys.argv[1] if len(sys.argv) > 1 else "I need some help."
    speak(test_phrase)
