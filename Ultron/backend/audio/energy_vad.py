from __future__ import annotations

import asyncio
from collections import deque
from typing import Awaitable, Callable, Deque, List, Optional

import numpy as np


SAMPLE_RATE = 16000
FRAME_MS = 20
FRAME_SAMPLES = int(SAMPLE_RATE * FRAME_MS / 1000)
FRAME_BYTES = FRAME_SAMPLES * 2


class EnergyVAD:
    """
    Energy-based Voice Activity Detection with barge-in support.

    mode="normal":   standard detection (user speaking while Ultron silent)
    mode="speaking": high-threshold detection (user interrupting Ultron's speech)
    """

    def __init__(
        self,
        rms_threshold: float = 0.02,
        start_frames: int = 10,
        silence_end_ms: int = 900,
        min_speech_ms: int = 350,
        max_utterance_ms: int = 15000,
        pre_roll_frames: int = 40,
        barge_rms_threshold: float = 0.09,
        barge_start_frames: int = 8,
    ) -> None:
        self.rms_threshold = rms_threshold
        self.start_frames = start_frames
        self.silence_end_frames = int(silence_end_ms / FRAME_MS)
        self.min_speech_frames = int(min_speech_ms / FRAME_MS)
        self.max_utterance_frames = int(max_utterance_ms / FRAME_MS)

        self.barge_rms_threshold = barge_rms_threshold
        self.barge_start_frames = barge_start_frames

        self.mode = "normal"

        self.leftover = b""
        self.pre_roll: Deque[bytes] = deque(maxlen=pre_roll_frames)
        self.speech_frames: List[bytes] = []

        self.enabled = False
        self.in_speech = False
        self.is_processing = False

        self.voice_frames = 0
        self.silence_frames = 0

        self.on_speech_start: Optional[Callable[[], Awaitable[None]]] = None
        self.on_utterance: Optional[Callable[[bytes], Awaitable[None]]] = None
        self.on_barge_in: Optional[Callable[[], Awaitable[None]]] = None

    def reset(self) -> None:
        self.leftover = b""
        self.pre_roll.clear()
        self.speech_frames = []
        self.in_speech = False
        self.voice_frames = 0
        self.silence_frames = 0

    def set_mode(self, mode: str) -> None:
        if self.mode != mode:
            self.mode = mode
            self.voice_frames = 0
            self.silence_frames = 0

    def add_bytes(self, data: bytes) -> None:
        if not self.enabled:
            return

        data = self.leftover + data
        offset = 0

        while len(data) - offset >= FRAME_BYTES:
            frame = data[offset : offset + FRAME_BYTES]
            offset += FRAME_BYTES
            self._process_frame(frame)

        if offset < len(data):
            self.leftover = data[offset:]

    def _frame_rms(self, frame: bytes) -> float:
        if not frame:
            return 0.0
        samples = np.frombuffer(frame, dtype=np.int16).astype(np.float32) / 32768.0
        if samples.size == 0:
            return 0.0
        return float(np.sqrt(np.mean(samples ** 2)))

    def _process_frame(self, frame: bytes) -> None:
        rms = self._frame_rms(frame)

        if self.is_processing:
            self.pre_roll.append(frame)
            return

        # ---------- SPEAKING MODE: watch for interruption ----------
        if self.mode == "speaking":
            is_voice = rms >= self.barge_rms_threshold

            if is_voice:
                self.voice_frames += 1
            else:
                self.voice_frames = max(0, self.voice_frames - 1)

            self.pre_roll.append(frame)

            if self.voice_frames >= self.barge_start_frames:
                self.voice_frames = 0
                # User is talking over Ultron. Capture this utterance NOW.
                self.in_speech = True
                self.silence_frames = 0
                self.speech_frames = list(self.pre_roll)
                self.mode = "normal"

                if self.on_barge_in is not None:
                    asyncio.create_task(self.on_barge_in())
            return

        # ---------- NORMAL MODE ----------
        is_voice = rms >= self.rms_threshold

        if not self.in_speech:
            self.pre_roll.append(frame)

            if is_voice:
                self.voice_frames += 1
            else:
                self.voice_frames = max(0, self.voice_frames - 1)

            if self.voice_frames >= self.start_frames:
                self.in_speech = True
                self.silence_frames = 0
                self.speech_frames = list(self.pre_roll)

                if self.on_speech_start is not None:
                    asyncio.create_task(self.on_speech_start())
            return

        self.speech_frames.append(frame)

        if is_voice:
            self.silence_frames = 0
        else:
            self.silence_frames += 1

        should_end = (
            self.silence_frames >= self.silence_end_frames
            or len(self.speech_frames) >= self.max_utterance_frames
        )

        if should_end:
            self._finalize()

    def _finalize(self) -> None:
        if not self.in_speech:
            return

        frames = self.speech_frames
        duration_ms = len(frames) * FRAME_MS

        self.in_speech = False
        self.voice_frames = 0
        self.silence_frames = 0
        self.speech_frames = []
        self.pre_roll.clear()

        if duration_ms < (self.min_speech_frames * FRAME_MS):
            return

        if not frames:
            return

        if self.is_processing:
            return

        audio = b"".join(frames)
        self.is_processing = True

        if self.on_utterance is not None:
            asyncio.create_task(self._emit_utterance(audio))
        else:
            self.is_processing = False

    async def _emit_utterance(self, audio: bytes) -> None:
        try:
            if self.on_utterance is not None:
                await self.on_utterance(audio)
        finally:
            self.is_processing = False