"""
Ultron RVC Bridge
"""
from __future__ import annotations

import sys
import io

# ============================================================
# CRITICAL FIX: FORCE UTF-8 FOR PYTHON'S PRINT() ON WINDOWS
# This prevents the 'charmap' crash when RVC prints '【Single Inference】'
# ============================================================
if sys.stdout and hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if sys.stderr and hasattr(sys.stderr, 'buffer'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')


import os
import subprocess
from pathlib import Path


# ============================================================
# CONFIGURATION
# ============================================================

RVC_ROOT = Path(
    r"D:\Downloads\RBVC\RBVC_webUI_main"
)

RVC_PYTHON = (
    RVC_ROOT
    / ".venv"
    / "Scripts"
    / "python.exe"
)

RVC_CLI = (
    RVC_ROOT
    / "infer"
    / "cli.py"
)

RVC_MODEL = (
    RVC_ROOT
    / "assets"
    / "weights"
    / "ultron_e200_s15800.pth"
)

# Index safety guard
RVC_INDEX = os.getenv("RVC_INDEX_PATH", "").strip() or None
PITCH = int(os.getenv("RVC_F0_UP_KEY", "-5"))
PROTECT = float(os.getenv("RVC_PROTECT", "0.33"))

if RVC_INDEX:
    INDEX_RATE = float(os.getenv("RVC_INDEX_RATE", "0.7"))
else:
    INDEX_RATE = 0.0


# ============================================================
# VOICE CONVERSION
# ============================================================

def convert_voice(
    input_audio: str | Path,
    output_audio: str | Path,
    pitch: int = PITCH,
    index_rate: float = INDEX_RATE,
    protect: float = PROTECT,
    index: str | None = RVC_INDEX,
) -> Path:

    input_audio = Path(input_audio).resolve()
    output_audio = Path(output_audio).resolve()

    if not input_audio.exists():
        raise FileNotFoundError(f"Input audio not found:\n{input_audio}")
    if not RVC_ROOT.exists():
        raise FileNotFoundError(f"RVC installation not found:\n{RVC_ROOT}")
    if not RVC_PYTHON.exists():
        raise FileNotFoundError(f"RVC Python executable not found:\n{RVC_PYTHON}")
    if not RVC_CLI.exists():
        raise FileNotFoundError(f"RVC CLI not found:\n{RVC_CLI}")
    if not RVC_MODEL.exists():
        raise FileNotFoundError(f"RVC model not found:\n{RVC_MODEL}")

    output_audio.parent.mkdir(parents=True, exist_ok=True)

    command = [
        str(RVC_PYTHON), "-m", "infer.cli",
        "--model", str(RVC_MODEL),
        "--input", str(input_audio),
        "--output", str(output_audio),
        "--speaker-id", "0",
        "--pitch", str(pitch),
        "--f0-method", "rmvpe",
        "--index-rate", str(index_rate),
        "--resample-sr", "0",
        "--protect", str(protect),
        "--overwrite",
    ]

    if index:
        command.extend(["--index", str(Path(index).resolve())])

    env = os.environ.copy()
    env["PYTHONPATH"] = str(RVC_ROOT) + os.pathsep + env.get("PYTHONPATH", "")
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"

    print("\n[ULTRON RVC] Starting conversion...")
    print(f"[ULTRON RVC] Input:   {input_audio.name}")
    print(f"[ULTRON RVC] Model:   {RVC_MODEL.name}")
    print(f"[ULTRON RVC] Output:  {output_audio.name}")
    print(f"[ULTRON RVC] Pitch:   {pitch}")
    print("[ULTRON RVC] F0:      RMVPE")
    print(f"[ULTRON RVC] Index:   {index_rate}")
    print(f"[ULTRON RVC] Protect: {protect}")

    try:
        if os.name == "nt":
            os.system("chcp 65001 > nul")

        result = subprocess.run(
            command,
            cwd=str(RVC_ROOT),
            env=env,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            check=False,
            stdin=subprocess.DEVNULL,
        )

        if result.stdout:
            print(result.stdout)

        if result.stderr:
            print(result.stderr)

        if result.returncode != 0:
            raise RuntimeError(
                "RVC inference failed.\n"
                f"Exit Code: {result.returncode}\n"
                f"Error:\n{result.stderr}"
            )

        if not output_audio.exists():
            raise RuntimeError(
                "RVC finished but did not create the output file."
            )

        print("[ULTRON RVC] Conversion complete!")
        return output_audio

    except Exception as e:
        print(f"[ULTRON RVC] Conversion failed: {e}")
        raise


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Test Ultron RVC Bridge")
    parser.add_argument("--input", required=True, help="Path to test WAV file")
    parser.add_argument("--output", required=True, help="Path to save output WAV")
    args = parser.parse_args()

    try:
        convert_voice(args.input, args.output)
        print("\nSUCCESS! Check the output file.")
    except Exception as e:
        print(f"\nFAILED: {e}")
        sys.exit(1)