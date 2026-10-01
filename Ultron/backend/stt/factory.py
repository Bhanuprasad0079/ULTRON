from __future__ import annotations

import asyncio
import os

from .base import STTService
from .faster_whisper_service import FasterWhisperSTT

_stt: STTService | None = None


async def get_stt() -> STTService:
    global _stt
    if _stt is None:
        model_size = os.getenv("ULTRON_STT_MODEL", "base")
        _stt = await asyncio.to_thread(FasterWhisperSTT, model_size=model_size)
    return _stt