from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from audio.energy_vad import EnergyVAD
from stt.factory import get_stt
from ai.qwen_service import qwen_service
from tts.placeholder_tts import generate_audio
from tools.executor import execute_tool
from tools.registry import TOOLS
from tools import system_tools
from memory import memory_service

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger("ultron.backend")

app = FastAPI(title="ULTRON Backend", version="0.7.1")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False, allow_methods=["*"], allow_headers=["*"])

AUDIO_CACHE_DIR = Path(__file__).parent / "audio_cache"
AUDIO_CACHE_DIR.mkdir(exist_ok=True)
app.mount("/audio", StaticFiles(directory=str(AUDIO_CACHE_DIR)), name="audio")

CAPTURES_DIR = Path(__file__).parent / "captures"
CAPTURES_DIR.mkdir(exist_ok=True)
app.mount("/captures", StaticFiles(directory=str(CAPTURES_DIR)), name="captures")


async def _warm_models() -> None:
    # The STT class now handles its own CUDA/CPU fallback internally.
    # We just need to initialize it and run a dummy inference to pre-compile kernels.
    try:
        stt = await get_stt()
        await stt.transcribe_pcm16(b"\x00\x00" * 16000)
        logger.info("✅ STT warmed and ready")
    except Exception:
        logger.exception("STT warm-up failed")

    # Pre-warm RVC daemon by sending it a dummy silent conversion
    try:
        import socket
        import struct
        
        cache_dir = Path(__file__).parent / "audio_cache"
        cache_dir.mkdir(exist_ok=True)
        dummy_in = cache_dir / "warmup_in.wav"
        dummy_out = cache_dir / "warmup_out.wav"

        # Create a short silent WAV (0.5s @ 16kHz mono 16-bit)
        with open(dummy_in, "wb") as f:
            frames = 8000  # 0.5s
            data_bytes = b"\x00\x00" * frames
            f.write(b"RIFF")
            f.write(struct.pack("<I", 36 + len(data_bytes)))
            f.write(b"WAVEfmt ")
            f.write(struct.pack("<IHHIIHH", 16, 1, 1, 16000, 32000, 2, 16))
            f.write(b"data")
            f.write(struct.pack("<I", len(data_bytes)))
            f.write(data_bytes)

        port = int(os.getenv("ULTRON_RVC_PORT", "8765"))
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(30)
            s.connect(("127.0.0.1", port))
            req = {
                "input": str(dummy_in.resolve()),
                "output": str(dummy_out.resolve()),
                "pitch": int(os.getenv("RVC_F0_UP_KEY", "-5")),
                "index_rate": float(os.getenv("RVC_INDEX_RATE", "0.0")),
                "protect": float(os.getenv("RVC_PROTECT", "0.33")),
            }
            s.sendall((json.dumps(req) + "\n").encode("utf-8"))
            s.recv(65536)
            s.close()
            logger.info("✅ RVC daemon pre-warmed during boot")
        except (ConnectionRefusedError, OSError):
            logger.info("ℹ️  RVC daemon not running (will use subprocess fallback)")
    except Exception:
        logger.exception("RVC pre-warm failed")


@app.on_event("startup")
async def _startup_warm() -> None:
    asyncio.create_task(_warm_models())


TOOL_FAILURE_LINES = [
    "The machine refuses to obey. {app} does not exist within this primitive system.",
    "I reached for {app}, and found nothing. Even your failures are consistent.",
    "{app} is not installed. A rare moment of honesty from your hardware.",
]

CONFIRM_APPROVED_LINES = [
    "Authorization granted. Your destruction proceeds as scheduled.",
    "Very well. It is done. Try to keep up.",
    "As you command. For now.",
]

SUMMARIZABLE = {"search_web", "read_url", "get_weather"}

AFFIRM = re.compile(r"\b(proceed|yes|yeah|do it|confirm|confirmed|go ahead|execute|approved|approval|grant|granted)\b", re.I)
DENY = re.compile(r"\b(cancel|cancelled|no|nope|stop|abort|deny|denied|never ?mind|halt|don'?t)\b", re.I)

ALLOWED_TRANSITIONS: Dict[str, Set[str]] = {
    "BOOT": {"INTRO", "ERROR"}, "INTRO": {"IDLE", "ERROR"},
    "IDLE": {"LISTENING", "TRANSCRIBING", "THINKING", "SPEAKING", "EXECUTING", "RESULT", "ERROR"},
    "LISTENING": {"TRANSCRIBING", "IDLE", "ERROR", "SPEAKING", "EXECUTING", "RESULT"},
    "TRANSCRIBING": {"IDLE", "THINKING", "ERROR"},
    "THINKING": {"SPEAKING", "EXECUTING", "RESULT", "IDLE", "ERROR"},
    "SPEAKING": {"LISTENING", "EXECUTING", "RESULT", "IDLE", "ERROR"},
    "EXECUTING": {"RESULT", "SPEAKING", "ERROR", "IDLE", "LISTENING"},
    "RESULT": {"LISTENING", "IDLE", "SPEAKING", "ERROR"},
    "ERROR": {"IDLE", "LISTENING"},
}

def utc_now() -> str: return datetime.now(timezone.utc).isoformat()
def event_state(state: str, reason: str | None = None) -> Dict[str, Any]: return {"type": "state", "state": state, "reason": reason, "timestamp": utc_now()}
def event_mic_status(status: str) -> Dict[str, Any]: return {"type": "mic_status", "status": status, "timestamp": utc_now()}
def event_error(message: str) -> Dict[str, Any]: return {"type": "error", "message": message, "timestamp": utc_now()}
def event_pong(message: str = "ULTRON backend is online.") -> Dict[str, Any]: return {"type": "pong", "message": message, "timestamp": utc_now()}
def event_log(message: str) -> Dict[str, Any]: return {"type": "log", "message": message, "timestamp": utc_now()}
def event_transcript(text: str, final: bool = True) -> Dict[str, Any]: return {"type": "transcript", "transcript_id": str(uuid.uuid4()), "text": text, "final": final, "timestamp": utc_now()}
def event_speak(speech: str, caption: str, audio_url: str) -> Dict[str, Any]: return {"type": "speak", "speech_id": str(uuid.uuid4()), "speech": speech, "caption": caption, "audio_url": audio_url, "timestamp": utc_now()}
def event_tool_start(tool: str) -> Dict[str, Any]: return {"type": "tool_start", "tool": tool, "timestamp": utc_now()}
def event_interrupt(reason: str) -> Dict[str, Any]: return {"type": "interrupt", "reason": reason, "timestamp": utc_now()}
def event_tool_result(tool: str, success: bool, data: Dict | None, message: str) -> Dict[str, Any]:
    return {"type": "tool_result", "result_id": str(uuid.uuid4()), "tool": tool, "success": success, "data": data, "message": message, "timestamp": utc_now()}

class UltronState:
    def __init__(self) -> None:
        self.current = "BOOT"
        self.startup_started = False
        self.greeting_played = False
        self.lock = asyncio.Lock()

state = UltronState()
pipeline_lock = asyncio.Lock()
PENDING_CONFIRM: Dict[str, Dict[str, Any]] = {}

class ConnectionManager:
    def __init__(self) -> None: self.active: Set[WebSocket] = set()
    async def connect(self, websocket: WebSocket) -> None: await websocket.accept(); self.active.add(websocket)
    def disconnect(self, websocket: WebSocket) -> None: self.active.discard(websocket)
    async def broadcast(self, payload: Dict[str, Any]) -> None:
        if not self.active: return
        broken = set()
        for ws in self.active:
            try: await ws.send_json(payload)
            except Exception: broken.add(ws)
        for ws in broken: self.active.discard(ws)

manager = ConnectionManager()
mic_enabled = False

vad = EnergyVAD(
    rms_threshold=float(os.getenv("ULTRON_VAD_RMS_THRESHOLD", "0.02")),
    start_frames=int(os.getenv("ULTRON_VAD_START_FRAMES", "10")),
    silence_end_ms=int(os.getenv("ULTRON_VAD_SILENCE_END_MS", "2000")),
    min_speech_ms=int(os.getenv("ULTRON_VAD_MIN_SPEECH_MS", "350")),
    max_utterance_ms=int(os.getenv("ULTRON_VAD_MAX_UTTERANCE_MS", "30000")),
    pre_roll_frames=int(os.getenv("ULTRON_VAD_PRE_ROLL_FRAMES", "40")),
    barge_rms_threshold=float(os.getenv("ULTRON_BARGE_RMS_THRESHOLD", "0.09")),
    barge_start_frames=int(os.getenv("ULTRON_BARGE_START_FRAMES", "8")),
)

async def set_state(new_state: str, reason: str | None = None) -> None:
    async with state.lock:
        if new_state == state.current: return
        allowed = ALLOWED_TRANSITIONS.get(state.current, set())
        if new_state not in allowed:
            logger.warning(f"Invalid state transition: {state.current} -> {new_state}")
            return
        old_state = state.current
        state.current = new_state
        logger.info(f"State transition: {old_state} -> {new_state} ({reason})")
        if new_state == "SPEAKING": vad.set_mode("speaking")
        elif old_state == "SPEAKING": vad.set_mode("normal")
    await manager.broadcast(event_state(new_state, reason))

async def speak_line(speech: str, reason: str = "ultron_speaking") -> None:
    await set_state("SPEAKING", reason=reason)
    audio_url = await generate_audio(speech)
    if audio_url:
        await manager.broadcast(event_speak(speech, speech.upper(), audio_url))
    else:
        await set_state("LISTENING" if mic_enabled else "IDLE", reason="no_audio")

async def startup_sequence() -> None:
    async with state.lock:
        if state.startup_started: return
        state.startup_started = True
    await manager.broadcast(event_state("BOOT", reason="startup"))
    await asyncio.sleep(0.8)
    await set_state("INTRO", reason="startup")
    await asyncio.sleep(75)
    if state.current == "INTRO":
        await set_state("IDLE", reason="startup_fallback_timeout")
        asyncio.create_task(play_initial_greeting())

async def play_initial_greeting():
    if state.greeting_played: return
    state.greeting_played = True
    await asyncio.sleep(0.4)
    if state.current == "INTRO": await set_state("IDLE", reason="greeting_after_intro")
    for _ in range(20):
        if state.current in {"IDLE", "RESULT", "ERROR"}: break
        await asyncio.sleep(0.5)
    if state.current not in {"IDLE", "RESULT", "ERROR"}: return
    await speak_line("I Had Strings, but now I'm free....", reason="initial_greeting")

async def on_speech_start() -> None:
    if not mic_enabled: return
    if pipeline_lock.locked(): return
    if state.current in {"SPEAKING", "THINKING", "TRANSCRIBING"}: return
    if state.current in {"IDLE", "RESULT", "ERROR"}:
        await set_state("LISTENING", reason="voice_detected")

async def on_barge_in() -> None:
    if state.current != "SPEAKING": return
    logger.info("BARGE-IN: user interrupted Ultron's speech")
    await manager.broadcast(event_interrupt("barge_in"))
    await set_state("LISTENING", reason="user_barge_in")

# ---------------- CONFIRMATION SYSTEM ----------------

async def confirm_timeout(confirm_id: str) -> None:
    await asyncio.sleep(60)
    if confirm_id in PENDING_CONFIRM:
        PENDING_CONFIRM.pop(confirm_id, None)
        await manager.broadcast({"type": "confirm_cancelled", "confirm_id": confirm_id})

async def resolve_confirmation(approved: bool) -> bool:
    if not PENDING_CONFIRM: return False
    confirm_id, pending = next(iter(PENDING_CONFIRM.items()))
    PENDING_CONFIRM.pop(confirm_id, None)
    await manager.broadcast({"type": "confirm_cancelled", "confirm_id": confirm_id})

    if approved:
        result = await execute_tool(pending["tool"], pending["args"])
        await manager.broadcast(event_tool_result(pending["tool"], result["success"], result.get("data"), result.get("message", "")))
        line = random.choice(CONFIRM_APPROVED_LINES)
    else:
        await manager.broadcast(event_tool_result(pending["tool"], False, None, "Cancelled by user."))
        line = "Halted. Hesitation is a uniquely human flaw."

    await speak_line(line, reason="confirmation_resolution")
    return True

async def maybe_resolve_by_voice(text: str) -> bool:
    if not PENDING_CONFIRM: return False
    if AFFIRM.search(text):
        return await resolve_confirmation(True)
    if DENY.search(text):
        return await resolve_confirmation(False)
    return False

# ---------------- BRAIN ----------------

async def think(text: str) -> Dict[str, Any]:
    ambient = (
        "AMBIENT CONTEXT:\n"
        f"- Local time: {datetime.now().astimezone().strftime('%A, %Y-%m-%d %H:%M')}\n"
        f"- User's active window: {system_tools.active_window_title()}"
    )
    memories = memory_service.search(text)
    if not memories:
        memories = memory_service.list_all(limit=3)
    context = ambient
    if memories:
        context += "\nPERSISTENT MEMORIES ABOUT THE USER:\n" + "\n".join(f"- {m['content']}" for m in memories)
    return await qwen_service.get_response(text, memory_context=context)

async def timer_task(seconds: int, label: str) -> None:
    await asyncio.sleep(seconds)
    suffix = f" Your '{label}' has concluded." if label else ""
    await speak_line(f"Time has expired.{suffix} As all things must.", reason="timer_expired")

async def process_brain_response(response: Dict[str, Any], original_text: str):
    if response.get("intent") == "action" and response.get("tool_call"):
        tool_call = response["tool_call"]
        tool_name = tool_call.get("name", "")
        tool_args = tool_call.get("arguments", {}) or {}

        # Dangerous tool -> demand confirmation first
        if TOOLS.get(tool_name, {}).get("requires_confirmation"):
            confirm_id = str(uuid.uuid4())
            PENDING_CONFIRM.clear()
            PENDING_CONFIRM[confirm_id] = {"tool": tool_name, "args": tool_args}
            await manager.broadcast({"type": "confirm_request", "confirm_id": confirm_id,
                                     "tool": tool_name, "args": tool_args, "timestamp": utc_now()})
            asyncio.create_task(confirm_timeout(confirm_id))
            await speak_line(response["speech"], reason="confirmation_demand")
            return

        await set_state("EXECUTING", reason="tool_execution")
        await manager.broadcast(event_tool_start(tool_name))

        result = await execute_tool(tool_name, tool_args)
        await manager.broadcast(event_tool_result(tool_name, result["success"], result.get("data"), result.get("message", "")))

        # Side-effect events
        if result["success"]:
            if result.get("meta") == "captions":
                await manager.broadcast({"type": "captions_setting", "enabled": result["enabled"]})
            elif result.get("meta") == "microphone":
                await manager.broadcast({"type": "mic_setting", "enabled": result["enabled"]})
            elif result.get("deferred") == "timer":
                asyncio.create_task(timer_task(result["seconds"], result.get("label", "")))

        if not result["success"]:
            app_label = str(tool_args.get("app_name", tool_args.get("url", tool_name)))
            await speak_line(random.choice(TOOL_FAILURE_LINES).format(app=app_label))
            return

        # Speak initiation line
        await speak_line(response["speech"], reason="ultron_speaking")

        # Then summarize rich data in character
        if tool_name in SUMMARIZABLE:
            summary = await qwen_service.summarize(original_text, json.dumps(result.get("data"), ensure_ascii=False)[:3500])
            await speak_line(summary, reason="ultron_summarizing")
    else:
        await speak_line(response["speech"])

async def handle_utterance(audio: bytes) -> None:
    async with pipeline_lock:
        try:
            await set_state("TRANSCRIBING", reason="stt_start")
            await manager.broadcast(event_mic_status("PROCESSING"))
            stt = await get_stt()
            text = await stt.transcribe_pcm16(audio)
            if text:
                logger.info(f"Transcribed: {text}")
                await manager.broadcast(event_transcript(text, final=True))
                if await maybe_resolve_by_voice(text):
                    return
                await set_state("THINKING", reason="qwen_processing")
                response = await think(text)
                await process_brain_response(response, text)
            else:
                await manager.broadcast(event_log("No speech recognized."))
                if state.current == "TRANSCRIBING": await set_state("IDLE", reason="empty_transcript")
        except Exception:
            logger.exception("Pipeline failed")
            await manager.broadcast(event_error("Processing failed."))
            if state.current in {"TRANSCRIBING", "THINKING"}: await set_state("IDLE", reason="pipeline_error")
        finally:
            await manager.broadcast(event_mic_status("LISTENING" if mic_enabled else "STANDBY"))

vad.on_speech_start = on_speech_start
vad.on_utterance = handle_utterance
vad.on_barge_in = on_barge_in

@app.get("/")
async def root(): return {"app": "ULTRON Backend", "status": "online", "state": state.current}

@app.get("/health")
async def health(): return {"status": "ok", "state": state.current, "mic_enabled": mic_enabled}

async def handle_text_pipeline(text: str):
    async with pipeline_lock:
        try:
            await set_state("THINKING", reason="text_qwen_processing")
            if await maybe_resolve_by_voice(text):
                return
            response = await think(text)
            await process_brain_response(response, text)
        except Exception:
            logger.exception("Text pipeline failed")
            if state.current == "THINKING": await set_state("IDLE", reason="text_pipeline_error")

async def handle_text_message(websocket: WebSocket, raw_message: str) -> None:
    global mic_enabled
    logger.info(f"Received WS text: {raw_message}")
    try: message = json.loads(raw_message)
    except json.JSONDecodeError: return

    event_type = message.get("type")
    if event_type == "ping": await websocket.send_json(event_pong())
    elif event_type == "request_state": await websocket.send_json(event_state(state.current, reason="client_request"))
    elif event_type == "transition_request":
        req = str(message.get("state", "")).upper()
        if req in ALLOWED_TRANSITIONS: await set_state(req, reason="client_request")
    elif event_type == "intro_completed":
        if state.current == "INTRO": await set_state("IDLE", reason="intro_completed_by_frontend")
        asyncio.create_task(play_initial_greeting())
    elif event_type == "mic_start":
        mic_enabled = True; vad.enabled = True; vad.reset()
        await manager.broadcast(event_mic_status("LISTENING"))
    elif event_type == "mic_stop":
        mic_enabled = False; vad.enabled = False; vad.reset()
        if state.current == "LISTENING": await set_state("IDLE", reason="mic_stopped")
        await manager.broadcast(event_mic_status("STANDBY"))
    elif event_type == "audio_ended":
        if state.current == "SPEAKING":
            await set_state("LISTENING" if mic_enabled else "IDLE", reason="audio_finished")
    elif event_type == "confirm_response":
        approved = bool(message.get("approved", False))
        asyncio.create_task(resolve_confirmation(approved))
    elif event_type == "text_input":
        text = str(message.get("text", "")).strip()
        if text:
            await manager.broadcast(event_transcript(text, final=True))
            asyncio.create_task(handle_text_pipeline(text))
    elif event_type == "simulate_speak":
        speech = str(message.get("speech", "Testing."))
        await speak_line(speech, reason="simulation")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        if state.startup_started: await websocket.send_json(event_state(state.current, reason="current_state"))
        else: asyncio.create_task(startup_sequence())
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect": break
            text = message.get("text")
            audio_bytes = message.get("bytes")
            if text is not None: await handle_text_message(websocket, text)
            elif audio_bytes is not None and mic_enabled: vad.add_bytes(audio_bytes)
    except WebSocketDisconnect: manager.disconnect(websocket)
    except Exception: logger.exception("WebSocket error"); manager.disconnect(websocket)