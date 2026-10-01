from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel

from .base import STTService

# ============================================================
# CRITICAL FIX: Add NVIDIA DLLs to Windows PATH for ctranslate2
# ============================================================
if sys.platform == "win32":
    site_packages = Path(sys.executable).parent / "Lib" / "site-packages"
    if not site_packages.exists():
        site_packages = Path(sys.executable).parent.parent / "Lib" / "site-packages"
    
    if site_packages.exists():
        for pkg in ["cublas", "cudnn", "cuda_runtime", "cuda_nvrtc"]:
            bin_dir = site_packages / "nvidia" / pkg / "bin"
            if bin_dir.exists():
                # Add to PATH so ctranslate2 finds it during lazy loading
                os.environ["PATH"] = str(bin_dir) + os.pathsep + os.environ.get("PATH", "")
                try:
                    os.add_dll_directory(str(bin_dir))
                except Exception:
                    pass
# ============================================================

logger = logging.getLogger("ultron.stt")


class FasterWhisperSTT(STTService):
    def __init__(self, model_size: str = "base"):
        device_pref = os.getenv("ULTRON_STT_DEVICE", "auto")
        
        # 1. Attempt CUDA
        if device_pref != "cpu":
            try:
                logger.info("Attempting to load faster-whisper on CUDA...")
                self.model = WhisperModel(model_size, device="cuda", compute_type="float16")
                
                # Force lazy load of CUDA libraries NOW with a dummy inference
                # If this fails, we catch it and fall back to CPU
                self.model.transcribe(np.zeros(16000, dtype=np.float32), beam_size=1)
                
                self.device = "cuda"
                self.compute_type = "float16"
                logger.info("✅ faster-whisper verified and ready on CUDA!")
                return
            except Exception as e:
                logger.warning(f"CUDA initialization failed ({e}). Falling back to CPU.")

        # 2. Fallback to CPU
        logger.info("Loading faster-whisper on CPU...")
        self.model = WhisperModel(model_size, device="cpu", compute_type="int8")
        self.device = "cpu"
        self.compute_type = "int8"
        logger.info("✅ faster-whisper ready on CPU.")

    async def transcribe_pcm16(self, audio: bytes) -> str:
        if not audio:
            return ""

        def _transcribe() -> str:
            # Read language setting HERE, after load_dotenv() has run
            language = os.getenv("ULTRON_STT_LANGUAGE") or None
            
            audio_np = np.frombuffer(audio, dtype=np.int16).astype(np.float32) / 32768.0
            segments, _ = self.model.transcribe(
                audio_np,
                language=language,
                beam_size=1,
                best_of=1,
                temperature=0.0,
                condition_on_previous_text=False,
                vad_filter=False,
            )
            return " ".join(s.text.strip() for s in segments if s.text).strip()

        return await asyncio.to_thread(_transcribe)