"""
Ultron Voice Pipeline (Exact Word-Boundary Sync)
"""
import hashlib
import json
import logging
import os
import re
import shutil
from pathlib import Path

import edge_tts

from .prosody import shape_prosody
from .rvc_service import RVCService

logger = logging.getLogger("ultron.tts")

CACHE_DIR = Path(__file__).parent.parent / "audio_cache"
CACHE_DIR.mkdir(exist_ok=True)

rvc_service = RVCService()

TIME_STRETCH_RATE = float(os.getenv('TTS_TIME_STRETCH_RATE', '0.87'))

_CONFIG_SIG = hashlib.md5(
    f"{TIME_STRETCH_RATE}|{os.getenv('RVC_F0_UP_KEY','-5')}|"
    f"{os.getenv('RVC_INDEX_RATE','0.7')}|{os.getenv('RVC_PROTECT','0.33')}|"
    f"{os.getenv('RVC_F0_METHOD','rmvpe')}|v4".encode()
).hexdigest()[:6]


async def generate_audio(text: str) -> str:
    if not text.strip():
        return ""

    text_hash = hashlib.md5(text.encode()).hexdigest()[:12]
    final_path = CACHE_DIR / f"u_{text_hash}_{_CONFIG_SIG}.wav"
    words_path = CACHE_DIR / f"u_{text_hash}_{_CONFIG_SIG}.words.json"

    # CACHE HIT
    if final_path.exists() and final_path.stat().st_size > 1000:
        logger.info(f"⚡ Cache hit: {final_path.name}")
        return f"/audio/{final_path.name}"

    base_path = CACHE_DIR / f"u_{text_hash}_{_CONFIG_SIG}"
    base_audio = f"{base_path}_base.mp3"

    try:
        shaped_text = shape_prosody(text)
        rate_percent = int(round((1.0 - TIME_STRETCH_RATE) * -100))
        rate_str = f"{rate_percent}%"

        if not os.path.exists(base_audio):
            communicate = edge_tts.Communicate(shaped_text, "en-US-ChristopherNeural", rate=rate_str)
            audio_chunks = []
            boundaries = []
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_chunks.append(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    # Exact spoken-word timestamps (offset/duration in 100ns ticks)
                    boundaries.append({
                        "w": re.sub(r"[^a-z0-9']+", "", str(chunk.get("text", "")).lower()),
                        "start": chunk.get("offset", 0) / 1e7,
                        "end": (chunk.get("offset", 0) + chunk.get("duration", 0)) / 1e7,
                    })
            with open(base_audio, "wb") as f:
                for c in audio_chunks:
                    f.write(c)
            with open(words_path, "w", encoding="utf-8") as f:
                json.dump(boundaries, f)

        if rvc_service.enabled:
            produced = rvc_service.convert(base_audio, str(final_path))
            if produced != str(final_path):
                shutil.copyfile(produced, final_path)
        else:
            shutil.copyfile(base_audio, final_path)

        if base_audio != str(final_path) and os.path.exists(base_audio):
            try: os.remove(base_audio)
            except Exception: pass

        return f"/audio/{final_path.name}"

    except Exception as e:
        logger.exception(f"Audio generation failed: {e}")
        return ""