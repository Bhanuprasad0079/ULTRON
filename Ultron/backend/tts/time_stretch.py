"""
Time-stretch audio without pitch shift (Optimized).
"""
import subprocess
from pathlib import Path

def time_stretch_audio(input_path: str, rate: float = 0.87) -> str:
    if rate == 1.0:
        return input_path
    
    input_file = Path(input_path)
    output_file = input_file.parent / f"{input_file.stem}_stretched{input_file.suffix}"
    
    cmd = [
        'ffmpeg', 
        '-hide_banner',      # Hide version info
        '-loglevel', 'error', # Only show fatal errors
        '-nostdin',          # Prevent hanging on background input
        '-threads', '0',     # Use all available CPU threads
        '-i', str(input_file),
        '-filter:a', f'atempo={rate}',
        '-y',
        str(output_file)
    ]
    
    try:
        # CREATE_NO_WINDOW prevents the console from flashing on Windows
        subprocess.run(
            cmd, 
            check=True, 
            capture_output=True, 
            creationflags=subprocess.CREATE_NO_WINDOW
        )
        return str(output_file)
    except Exception as e:
        print(f"⚠️ Time-stretch failed: {e}")
        return str(input_file)