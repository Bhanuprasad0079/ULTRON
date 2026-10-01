"""
RVC Service with Keep-Alive Socket and Chunking.
"""
import json
import logging
import os
import socket
import subprocess
import sys
from pathlib import Path

from .audio_utils import split_audio, concatenate_audio, get_audio_duration

logger = logging.getLogger("ultron.rvc")

DAEMON_HOST = "127.0.0.1"
DAEMON_PORT = int(os.getenv("ULTRON_RVC_PORT", "8765"))
CHUNK_DURATION = float(os.getenv("RVC_CHUNK_SECONDS", "8.0"))

class RVCService:
    def __init__(self):
        self.infer_script = Path(__file__).parent.parent / "infer.py"
        self.subprocess_ok = self.infer_script.exists()
        self.enabled = True
        logger.info(f"✅ RVC Service initialized (chunk={CHUNK_DURATION}s)")

    def _subprocess_convert(self, input_audio: str, output_audio: str) -> str:
        if not self.subprocess_ok: return input_audio
        cmd = [sys.executable, str(self.infer_script), "--input", input_audio, "--output", output_audio]
        env = os.environ.copy()
        env["CUDA_MODULE_LOADING"] = "LAZY"
        try:
            result = subprocess.run(cmd, text=True, encoding='utf-8', errors='replace',
                                    capture_output=True, timeout=120, check=False,
                                    stdin=subprocess.DEVNULL, env=env, creationflags=subprocess.CREATE_NO_WINDOW)
            if result.returncode == 0 and Path(output_audio).exists(): return output_audio
            return input_audio
        except Exception:
            return input_audio

    def convert(self, input_audio: str, output_audio: str) -> str:
        if not self.enabled or (Path(output_audio).exists() and Path(output_audio).stat().st_size > 1000):
            return output_audio if Path(output_audio).exists() else input_audio

        duration = get_audio_duration(input_audio)
        chunks = split_audio(input_audio, CHUNK_DURATION)
        
        if len(chunks) == 1:
            logger.info(f"🎙️  Single chunk ({duration:.1f}s). Trying daemon...")
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(60)
                sock.connect((DAEMON_HOST, DAEMON_PORT))
                req = {
                    "input": str(Path(input_audio).resolve()), "output": str(Path(output_audio).resolve()),
                    "pitch": int(os.getenv("RVC_F0_UP_KEY", "-5")), "index_rate": float(os.getenv("RVC_INDEX_RATE", "0.0")),
                    "protect": float(os.getenv("RVC_PROTECT", "0.33")), "f0_method": os.getenv("RVC_F0_METHOD", "rmvpe"),
                }
                sock.sendall((json.dumps(req) + "\n").encode("utf-8"))
                data = b""
                while b"\n" not in data: data += sock.recv(65536)
                sock.close()
                resp = json.loads(data.decode("utf-8").strip())
                if resp.get("ok") and Path(output_audio).exists():
                    logger.info("✅ RVC (daemon) complete")
                    return output_audio
            except Exception as e:
                logger.warning(f"Daemon failed: {e}. Falling back to subprocess.")
            return self._subprocess_convert(input_audio, output_audio)

        # MULTIPLE CHUNKS: Use Keep-Alive Socket
        logger.info(f"🎙️  Streaming {len(chunks)} chunks via Keep-Alive socket...")
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(120)
            sock.connect((DAEMON_HOST, DAEMON_PORT))
            
            converted_chunks = []
            for i, chunk in enumerate(chunks):
                chunk_output = str(Path(chunk).with_suffix('.converted.wav'))
                req = {
                    "input": str(Path(chunk).resolve()), "output": str(Path(chunk_output).resolve()),
                    "pitch": int(os.getenv("RVC_F0_UP_KEY", "-5")), "index_rate": float(os.getenv("RVC_INDEX_RATE", "0.0")),
                    "protect": float(os.getenv("RVC_PROTECT", "0.33")), "f0_method": os.getenv("RVC_F0_METHOD", "rmvpe"),
                }
                sock.sendall((json.dumps(req) + "\n").encode("utf-8"))
                
                data = b""
                while b"\n" not in data: data += sock.recv(65536)
                resp = json.loads(data.decode("utf-8").strip())
                
                if resp.get("ok") and Path(chunk_output).exists():
                    converted_chunks.append(chunk_output)
                else:
                    logger.warning(f"Chunk {i+1} failed via daemon, using original")
                    converted_chunks.append(chunk)

            sock.close()
            
            logger.info("🎙️  Concatenating chunks in memory...")
            result = concatenate_audio(converted_chunks, output_audio)
            if Path(result).exists():
                logger.info("✅ RVC (chunked) complete")
                return result
        except Exception as e:
            logger.error(f"Keep-alive socket failed: {e}")

        # Fallback if socket completely dies
        return self._subprocess_convert(input_audio, output_audio)