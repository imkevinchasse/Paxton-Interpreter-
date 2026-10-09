#!/usr/bin/env python3
"""
src/correct.py
Light context-aware LLM correction layer for low-confidence transcriptions.
"""

import os
import json
import requests
from typing import Optional, Dict, Any

OLLAMA_ENDPOINT = os.getenv("OLLAMA_ENDPOINT", "http://127.0.0.1:11434")
DEFAULT_CORRECTION_MODEL = os.getenv("CORRECTION_MODEL", "gemma2")


def correct_transcription(
    raw_text: str,
    confidence: float,
    context: Optional[Dict[str, Any]] = None,
    model: str = DEFAULT_CORRECTION_MODEL,
    endpoint: str = OLLAMA_ENDPOINT
) -> Dict[str, Any]:
    """
    Applies light context-aware LLM restoration when acoustic confidence is low.
    """
    clean_raw = (raw_text or "").strip()
    if not clean_raw:
        return {"corrected": "", "was_corrected": False, "reason": "Empty input"}

    # If confidence is already high (>=0.82), keep original hypothesis
    if confidence >= 0.82:
        return {
            "corrected": clean_raw,
            "was_corrected": False,
            "confidence": confidence,
            "reason": "High acoustic confidence"
        }

    ctx_info = ""
    if context:
        loc = context.get("location")
        time_str = context.get("time")
        if loc:
            ctx_info += f" Location: {loc}."
        if time_str:
            ctx_info += f" Time: {time_str}."

    prompt = f"""You are a specialized speech translation and restoration module for Paxton, who has severe speech motor differences and idiosyncratic habits.
Raw acoustic transcription from fine-tuned Whisper (confidence: {confidence:.2f}):
"{clean_raw}"
{ctx_info}

Paxton's Verified Translation Rules:
- "Watubah" -> "I want talk about" / "want talk about"
- "Wakabah" -> "I wan talk to" / "want talk to"
- "Tobah" -> "toilet paper"
- "dussin" (in names/asking) -> "Dustin", (before verbs) -> "doesn't"
- "caskon" -> "cat's gone"
- "Cassin" -> "Cat"
- "blackwet" -> "black white"
- "wah out" -> "ran out"
- "best you ah" -> "go back to work"
- "Am I a black" -> "I like mower, black"
- "see you some" -> "sing a song / sing song"
- "nee a hell" -> "need some help"
- "wike dat" -> "like that"
- "foo" -> "food", "ha" -> "have", "lunsh" -> "lunch"

Task:
Translate and restore Paxton's intended natural English sentence accurately using his rules above. Preserve his exact message. Do not invent unrelated content.

Reply with JSON only:
{{"corrected": "intended english sentence", "changes": "brief note of what was translated"}}"""

    try:
        url = f"{endpoint.rstrip('/')}/api/generate"
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.1, "num_predict": 128}
        }
        res = requests.post(url, json=payload, timeout=8)
        if res.status_code == 200:
            data = res.json()
            raw_response = data.get("response", "{}")
            parsed = json.loads(raw_response)
            corrected_text = parsed.get("corrected") or clean_raw
            return {
                "corrected": corrected_text.strip(),
                "was_corrected": corrected_text.strip().lower() != clean_raw.lower(),
                "confidence": min(0.92, confidence + 0.18),
                "model_used": model,
                "changes": parsed.get("changes", "Polished phonetics")
            }
    except Exception as e:
        # Graceful fallback: return raw transcription without crashing
        pass

    # Simple rule-based fallbacks for common Paxton tokens if LLM is offline
    fallback_text = clean_raw
    replacements = {
        "watubah": "I want talk about",
        "wakabah": "I wan talk to",
        "tobah": "toilet paper",
        "wah out": "ran out",
        "best you ah": "go back to work",
        "bad caskon": "black cat's gone",
        "caskon": "cat's gone",
        "cassin": "Cat",
        "blackwet": "black white",
        "mya": "my",
        "am i a black": "I like mower, black",
        "see you some": "sing a song",
        "nee a hell": "need some help",
        "i nee": "I need",
        "dussin": "doesn't",
        "ba-man": "Batman",
        "wike": "like",
        "dis": "this",
        "dat": "that",
        "yeyo": "yellow",
        "gooh": "good",
        "foo": "food",
        "no ha": "didn't have",
        "i hunry": "I am hungry"
    }
    for k, v in replacements.items():
        if k in fallback_text.lower():
            fallback_text = fallback_text.replace(k, v)

    return {
        "corrected": fallback_text,
        "was_corrected": fallback_text != clean_raw,
        "confidence": confidence,
        "reason": "Rule-based phonetic fallback"
    }


if __name__ == "__main__":
    test_sample = "i nee a hell"
    res = correct_transcription(test_sample, confidence=0.65)
    print(json.dumps(res, indent=2))
