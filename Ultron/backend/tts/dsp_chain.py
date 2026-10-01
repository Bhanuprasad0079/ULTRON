"""
Post-RVC DSP chain for cinematic Ultron voice.
Applies EQ, saturation, compression, reverb, and limiting.
"""
import subprocess
import os
from pathlib import Path


class DSPChain:
    def __init__(self):
        # Runtime-configurable EQ bands
        self.eq_low_shelf_freq = int(os.getenv('DSP_EQ_LOW_SHELF_FREQ', '200'))
        self.eq_low_shelf_gain = float(os.getenv('DSP_EQ_LOW_SHELF_GAIN', '4'))
        
        self.eq_low_mid_freq = int(os.getenv('DSP_EQ_LOW_MID_FREQ', '500'))
        self.eq_low_mid_gain = float(os.getenv('DSP_EQ_LOW_MID_GAIN', '-3'))
        
        self.eq_presence_freq = int(os.getenv('DSP_EQ_PRESENCE_FREQ', '2500'))
        self.eq_presence_gain = float(os.getenv('DSP_EQ_PRESENCE_GAIN', '2'))
        
        self.eq_high_freq = int(os.getenv('DSP_EQ_HIGH_FREQ', '8000'))
        self.eq_high_gain = float(os.getenv('DSP_EQ_HIGH_GAIN', '3'))
        
        # Saturation
        self.saturation_drive = float(os.getenv('DSP_SATURATION_DRIVE', '0.15'))
        
        # Compression
        self.comp_threshold = float(os.getenv('DSP_COMP_THRESHOLD', '-18'))
        self.comp_ratio = float(os.getenv('DSP_COMP_RATIO', '3'))
        self.comp_attack = float(os.getenv('DSP_COMP_ATTACK', '5'))
        self.comp_release = float(os.getenv('DSP_COMP_RELEASE', '50'))
        
        # Reverb
        self.reverb_room_size = float(os.getenv('DSP_REVERB_ROOM_SIZE', '0.3'))
        self.reverb_wet = float(os.getenv('DSP_REVERB_WET', '0.15'))
        
        # Limiter
        self.limiter_threshold = float(os.getenv('DSP_LIMITER_THRESHOLD', '-1'))
    
    # backend/tts/dsp_chain.py (Update the process method only)

    def process(self, input_path: str, output_path: str) -> str:
        """Apply DSP chain with error handling."""
        if not os.path.exists(input_path):
            return input_path

        # Simplified filter chain to avoid Windows quoting issues
        # We apply EQ, Compression, and Limiter. Skipping complex reverb for stability.
        filters = [
            "lowshelf=f=200:g=4",       # Boost lows
            "highpass=f=80",            # Cut rumble
            "acompressor=threshold=-20:ratio=4:attack=10:release=100", # Compress
            "alimiter=limit=-1"         # Limit peaks
        ]
        filter_str = ",".join(filters)

        cmd = [
            'ffmpeg', '-y',
            '-i', input_path,
            '-af', filter_str,
            '-ar', '44100', # Ensure sample rate
            output_path
        ]

        try:
            subprocess.run(cmd, check=True, capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
            return output_path
        except subprocess.CalledProcessError as e:
            print(f"️ DSP Chain failed ({e.returncode}). Using raw audio.")
            # Fallback: just copy the file
            import shutil
            shutil.copy(input_path, output_path)
            return output_path
        except FileNotFoundError:
            print("⚠️ FFmpeg not found. Skipping DSP.")
            return input_path