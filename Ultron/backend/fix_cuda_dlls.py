from __future__ import annotations

import asyncio
import logging
import os

import numpy as np
from faster_whisper import WhisperModel

from .base import STTService

logger = logging.getLogger("ultron.stt")
STT_LANGUAGE = os.getenv("ULTRON_STT_LANGUAGE") or None

class FasterWhisperSTT(STTService):
    def __init__(self, model_size: str = "base"):
        device_pref = os.getenv("ULTRON_STT_DEVICE", "auto")
        
        if device_pref != "cpu":
            try:
                import ctranslate2
                if ctranslate2.get_cuda_device_count() > 0:
                    logger.info("CUDA detected by ctranslate2. Loading Whisper on GPU...")
                    self.model = WhisperModel(model_size, device="cuda", compute_type="float16")
                    self.device = "cuda"
                    self.compute_type = "float16"
                    logger.info("✅ faster-whisper loaded on CUDA!")
                    return
                else:
                    logger.warning("ctranslate2 sees 0 CUDA devices. Falling back to CPU.")
            except Exception as e:
                logger.warning(f"CUDA check failed ({e}). Falling back to CPU.")

        logger.info("Loading faster-whisper on CPU...")
        self.model = WhisperModel(model_size, device="cpu", compute_type="int8")
        self.device = "cpu"
        self.compute_type = "int8"
        logger.info("✅ faster-whisper ready on CPU.")

    async def transcribe_pcm16(self, audio: bytes) -> str:
        if not audio:
            return ""

        def _transcribe() -> str:
            audio_np = np.frombuffer(audio, dtype=np.int16).astype(np.float32) / 32768.0
            segments, _ = self.model.transcribe(
                audio_np,
                language=STT_LANGUAGE,
                beam_size=1,
                best_of=1,
                temperature=0.0,
                condition_on_previous_text=False,
                vad_filter=False,
            )
            return " ".join(s.text.strip() for s in segments if s.text).strip()

        return await asyncio.to_thread(_transcribe)