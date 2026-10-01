from abc import ABC, abstractmethod


class STTService(ABC):
    @abstractmethod
    async def transcribe_pcm16(self, audio: bytes) -> str:
        """
        Transcribe raw PCM audio.

        Expected format:
        - PCM signed 16-bit little-endian
        - mono
        - 16000 Hz
        """
        raise NotImplementedError