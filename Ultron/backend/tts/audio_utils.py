"""
Ultra-fast audio chunking and concatenation.
"""
import subprocess
import wave
import shutil
from pathlib import Path
import logging

logger = logging.getLogger("ultron.audio")

def get_audio_duration(file_path: str) -> float:
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
             '-of', 'default=noprint_wrappers=1:nokey=1', file_path],
            capture_output=True, text=True, timeout=10, creationflags=subprocess.CREATE_NO_WINDOW
        )
        return float(result.stdout.strip())
    except Exception:
        return 0.0

def split_audio(input_path: str, chunk_seconds: float = 8.0) -> list[str]:
    duration = get_audio_duration(input_path)
    if duration <= chunk_seconds:
        return [input_path]
    
    input_file = Path(input_path)
    temp_dir = input_file.parent / "temp_chunks"
    temp_dir.mkdir(exist_ok=True)
    
    # Clean old chunks to prevent cross-contamination
    for old in temp_dir.glob(f"{input_file.stem}_chunk*.wav"):
        old.unlink()

    # ONE single ffmpeg command to split into all chunks instantly
    cmd = [
        'ffmpeg', '-y', '-i', str(input_path),
        '-f', 'segment', '-segment_time', str(chunk_seconds),
        '-c:a', 'pcm_s16le', '-ar', '16000', '-ac', '1',
        str(temp_dir / f"{input_file.stem}_chunk%03d.wav")
    ]
    
    try:
        subprocess.run(cmd, capture_output=True, timeout=30, creationflags=subprocess.CREATE_NO_WINDOW)
    except Exception as e:
        logger.warning(f"FFmpeg split failed: {e}")
        return [input_path]

    chunks = sorted([str(p) for p in temp_dir.glob(f"{input_file.stem}_chunk*.wav")])
    return chunks if chunks else [input_path]

def concatenate_audio(chunk_paths: list[str], output_path: str) -> str:
    if len(chunk_paths) == 1:
        shutil.copy(chunk_paths[0], output_path)
        return output_path
    
    # Pure Python concatenation (takes milliseconds, no ffmpeg overhead!)
    try:
        with wave.open(chunk_paths[0], 'rb') as first:
            params = first.getparams()
        
        with wave.open(output_path, 'wb') as out:
            out.setparams(params)
            for chunk in chunk_paths:
                with wave.open(chunk, 'rb') as w:
                    out.writeframes(w.readframes(w.getnframes()))
        
        # Cleanup chunks
        for chunk in chunk_paths:
            try: Path(chunk).unlink()
            except: pass
            
        return output_path
    except Exception as e:
        logger.error(f"Python concat failed: {e}, falling back to copy")
        return chunk_paths[0]