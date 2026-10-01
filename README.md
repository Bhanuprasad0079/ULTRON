# ULTRON

> **A rogue AI agent built to feel less like a chatbot — and more like a machine that has awakened.**

ULTRON is a cinematic, voice-first AI desktop agent for Windows, designed around the idea of a **rogue artificial intelligence with its own identity, voice, visual presence, memory, and control over the operating system**.

It combines a full-stack AI agent architecture with a cinematic interface, real-time voice interaction, system-level tools, persistent memory, and a custom voice-conversion pipeline.

The goal was not to build another AI chat window.

The goal was to build **ULTRON**.

---

## Showcase

### The Interface

ULTRON's interface is built around a procedural WebGL neural core that reacts to the agent's internal state.

The system transitions between states such as:

```text
IDLE
LISTENING
THINKING
SPEAKING
EXECUTING
INTERRUPTED
```

The neural core, HUD, lighting, captions, animations, and color transitions are designed to make the interaction feel like a cinematic AI system rather than a conventional desktop application.

### The Voice

One of the central parts of ULTRON is its custom voice pipeline.

The system combines:

```text
LLM Response
      ↓
Prosody Processing
      ↓
Edge-TTS
      ↓
Word Boundary Extraction
      ↓
RVC Voice Conversion
      ↓
Custom Voice
      ↓
Cinematic Playback + Captions
```

The result is a generated voice specifically designed for the ULTRON persona.

The RVC model is kept alive through a persistent daemon so the voice-conversion system does not need to reload the model for every response.

### Screenshots

<p align="center">
  <img src="assets/video/boot.png" width="900">
</p>

<p align="center">
  <img src="assets/video/online.png" width="900">
</p>

<p align="center">
  <img src="assets/video/idle.png" width="900">
</p>



# What Is ULTRON?

ULTRON is a **rogue AI desktop agent** built as a full-stack system.

Unlike a conventional chatbot, ULTRON is designed around continuous interaction with the user's computer.

He can:

* Hear voice commands
* Transcribe speech locally using GPU acceleration
* Reason using an OpenAI-compatible LLM
* Call tools
* Control Windows
* Read system telemetry
* Search the web
* Manage applications
* Manipulate system settings
* Maintain persistent memory
* Speak through a custom converted voice
* Interrupt speech when the user speaks
* Display cinematic real-time captions
* React visually to internal system states
* Maintain persistent session history

The entire experience is connected through a real-time WebSocket architecture.

---

# Core Philosophy

ULTRON was built around one simple idea:

> **An AI agent should feel like an entity, not a text box.**

That means the system has:

* A personality
* A voice
* A visual identity
* Internal states
* Memory
* Environmental awareness
* Tool access
* System control
* Real-time feedback

The interface is therefore not just decoration.

The neural core, HUD, captions, audio, state transitions and tool execution are all part of the agent experience.

---

# Feature Overview

## Rogue AI Persona

ULTRON uses a dedicated system-prompt architecture to maintain its personality and response structure.

The LLM produces structured responses:

```json
{
  "speech": "...",
  "intent": "...",
  "tool_call": "..."
}
```

This allows the backend to distinguish between:

```text
Conversation
     ↓
Reasoning
     ↓
Action
     ↓
Tool execution
     ↓
Result
     ↓
Spoken response
```

---

# Voice System

The voice system is one of the defining parts of ULTRON.

## Pipeline

```text
                    ┌──────────────┐
                    │     LLM      │
                    └──────┬───────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Prosody Shaping │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │    Edge-TTS     │
                  └────────┬────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
        Audio Stream             WordBoundary
              │                         │
              └────────────┬────────────┘
                           ▼
                  ┌─────────────────┐
                  │       RVC       │
                  │ Voice Conversion│
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  Custom Voice   │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Audio Playback  │
                  │ + Captions      │
                  └─────────────────┘
```

### Voice features

* Edge-TTS speech generation
* Custom prosody shaping
* RVC voice conversion
* Persistent RVC TCP daemon
* GPU voice conversion
* Long-speech chunking
* Audio caching
* Word-boundary timestamps
* Synchronized cinematic captions
* Barge-in interruption

---

# Cinematic UI

The visual system is built around a procedural WebGL neural core.

It is not a pre-rendered animation.

The neural field is generated and animated in real time using Three.js and custom GLSL shaders.

### Neural Core

```text
~1400 clustered nodes
~4500 neural fibers
~700 welded facets
~9000 dust particles
3 crystalline shell layers
5 HUD rings
Travelling signal flares
```

The system reacts to ULTRON's state.

```text
IDLE
  ↓
LISTENING
  ↓
THINKING
  ↓
EXECUTING
  ↓
SPEAKING
  ↓
IDLE
```

State transitions influence:

* Neural activity
* Color
* Pulse intensity
* Particle movement
* HUD elements
* Signal travelling
* Caption animation
* Audio presentation

The primary visual transition is:

```text
CYAN  →  CRIMSON
```

representing the transition from passive to active system states.

---

# Cinematic Captions

ULTRON does not simply display a transcript.

Speech is synchronized to actual TTS word-boundary timestamps.

```text
Edge-TTS
    ↓
WordBoundary events
    ↓
.words.json
    ↓
Audio playback clock
    ↓
Caption synchronization
```

Words are grouped into cinematic blocks and revealed according to the actual playback position.

The result is closer to film subtitles than conventional speech-to-text captions.

---

# Windows System Control

ULTRON exposes more than 20 system tools.

```text
open_application
open_url
search_web
read_url
get_weather
system_telemetry
set_volume
mute
media_key
set_brightness
screenshot
clipboard_read
clipboard_write
list_processes
kill_process
shutdown
restart
empty_recycle_bin
set_timer
set_captions
set_microphone
remember
recall
forget
```

This allows commands such as:

```text
"Open Chrome."

"What's draining my system?"

"Set the volume to 40."

"Take a screenshot."

"What's the weather?"

"Set a timer for 10 minutes."
```

---

# Safety Model

Dangerous operations require explicit confirmation.

Protected tools include:

```text
shutdown
restart
kill_process
empty_recycle_bin
```

Confirmation can happen through:

```text
Modal confirmation
```

or:

```text
"proceed"
```

or:

```text
"cancel"
```

Confirmation requests automatically expire after 60 seconds.

---

# Memory

ULTRON has persistent local memory backed by SQLite.

Available memory operations include:

```text
remember
recall
forget
```

Relevant memory can be injected into the LLM context during future conversations.

Session history is also persisted locally through `localStorage`.

---

# Architecture

```text
                         USER
                          │
                 Voice / Text / Input
                          │
                          ▼
                ┌──────────────────┐
                │ Electron + React │
                │                  │
                │ Cinematic UI     │
                │ Neural Core      │
                │ Captions         │
                │ Session History  │
                └────────┬─────────┘
                         │
                      WebSocket
                         │
                         ▼
                ┌──────────────────┐
                │ FastAPI Backend  │
                │                  │
                │ VAD              │
                │ STT              │
                │ LLM              │
                │ Memory           │
                │ Tool Executor    │
                │ State Machine    │
                └───────┬──────────┘
                        │
        ┌───────────────┼────────────────┐
        │               │                │
        ▼               ▼                ▼
   faster-whisper      LLM         Windows Tools
        │               │                │
        │               ▼                │
        │          Tool Calling          │
        │               │                │
        └───────────────┼────────────────┘
                        │
                        ▼
                   Edge-TTS
                        │
                        ▼
                 RVC Voice Daemon
                        │
                        ▼
                 Custom Voice Audio
                        │
                        ▼
               Audio + Captions
                        │
                        ▼
                   FRONTEND
```

---

# Tech Stack

| Layer               | Technology                          |
| ------------------- | ----------------------------------- |
| Desktop             | Electron                            |
| Frontend            | React 18, TypeScript, Vite          |
| Animation           | Framer Motion                       |
| 3D                  | Three.js, React Three Fiber         |
| Rendering           | Custom GLSL shaders                 |
| Post-processing     | `@react-three/postprocessing`       |
| Backend             | Python 3.13                         |
| API                 | FastAPI                             |
| Realtime            | WebSocket                           |
| STT                 | faster-whisper                      |
| STT acceleration    | CUDA / CTranslate2                  |
| LLM                 | OpenAI-compatible APIs              |
| TTS                 | Edge-TTS                            |
| Voice conversion    | RVC                                 |
| Voice model         | Custom `.pth` model                 |
| Audio processing    | FFmpeg, Python `wave`, soundfile    |
| Memory              | SQLite                              |
| Windows integration | ctypes, winreg, psutil, pycaw       |
| Clipboard           | pyperclip                           |
| Images              | Pillow                              |
| Web data            | Requests, DuckDuckGo, BeautifulSoup |

---

# How It Works

## 1. Voice Input

The microphone continuously streams PCM16 audio through WebSocket.

The backend uses EnergyVAD to detect when the user has finished speaking.

```text
Microphone
    ↓
PCM16
    ↓
WebSocket
    ↓
EnergyVAD
    ↓
Utterance
```

---

## 2. Speech Recognition

The detected utterance is processed using faster-whisper.

GPU acceleration uses CUDA float16 when available.

CPU int8 fallback is also supported.

```text
Voice
 ↓
faster-whisper
 ↓
Transcript
```

---

## 3. Reasoning

The transcript is combined with:

* Persistent memory
* Active window
* Local time
* System context
* Available tools

and sent to the configured OpenAI-compatible LLM.

The LLM returns structured JSON.

```json
{
  "speech": "I will handle that.",
  "intent": "action",
  "tool_call": {
    "name": "open_application",
    "args": {}
  }
}
```

---

## 4. Tool Execution

If the intent requires an action, the backend executes the appropriate tool.

```text
User
 ↓
LLM
 ↓
Intent Detection
 ↓
Tool Selection
 ↓
Safety Gate
 ↓
Tool Execution
 ↓
Result
```

The result is then sent back to the LLM so ULTRON can summarize it in character.

---

## 5. Voice Response

The generated response enters the custom voice pipeline.

```text
Speech
 ↓
Prosody
 ↓
Edge-TTS
 ↓
RVC
 ↓
Custom Voice
 ↓
Audio Cache
 ↓
Playback
```

---

# Repository Structure

```text
ULTRON/
│
├── backend/
│   ├── ai/
│   ├── tools/
│   ├── memory/
│   ├── audio_cache/
│   ├── main.py
│   ├── daemon.py
│   ├── requirements.txt
│   └── .env
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── effects/
│   │   ├── NeuralCore.tsx
│   │   └── ...
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
│
├── rvc/
│   ├── models/
│   ├── daemon/
│   └── ...
│
├── electron/
│   ├── main/
│   └── preload/
│
├── assets/
│   ├── screenshots/
│   │   ├── ultron-main.png
│   │   ├── ultron-thinking.png
│   │   └── ultron-speaking.png
│   │
│   └── videos/
│       └── ...
│
├── README.md
└── ...
```

---

# Setup

## Requirements

* Windows 10/11
* Node.js 18+
* Python 3.11–3.13
* FFmpeg
* NVIDIA GPU recommended
* CUDA-compatible environment for GPU acceleration
* OpenAI-compatible LLM API
* Trained RVC voice model
* RVC WebUI / inference environment

---

## Backend

```powershell
cd backend

python -m venv .venv

.\.venv\Scripts\activate

pip install -r requirements.txt

python main.py
```

> Avoid `--reload` during production runs because the reloader subprocess can interfere with injected NVIDIA DLL paths on Windows.

---

## RVC Voice Daemon

```powershell
cd rvc

python daemon.py
```

The daemon listens on:

```text
127.0.0.1:8765
```

The RVC model remains loaded in VRAM and processes conversion requests through a persistent TCP connection.

---

## Frontend

```powershell
cd frontend

npm install

npm run dev
```

Then launch the Electron application using the project's configured Electron command.

The initial click activates the application and unlocks browser audio policies.

---

# Boot Order

Run the system in this order:

```text
RVC DAEMON
     ↓
BACKEND
     ↓
FRONTEND / ELECTRON
```

If the RVC daemon is unavailable, ULTRON can fall back to per-request RVC processing.

If RVC is unavailable entirely, raw TTS audio can still be used.

---

# Configuration

Configuration is stored in:

```text
backend/.env
```

| Variable                | Default                          | Purpose                    |
| ----------------------- | -------------------------------- | -------------------------- |
| `QWEN_API_KEY`          | —                                | LLM API key                |
| `QWEN_BASE_URL`         | `https://api.groq.com/openai/v1` | OpenAI-compatible endpoint |
| `QWEN_MODEL`            | `llama-3.3-70b-versatile`        | LLM model                  |
| `ULTRON_STT_MODEL`      | `base`                           | Whisper model              |
| `ULTRON_STT_DEVICE`     | `auto`                           | STT device                 |
| `ULTRON_STT_LANGUAGE`   | `en`                             | Forced language            |
| `RVC_F0_UP_KEY`         | `-5`                             | Pitch shift                |
| `RVC_INDEX_RATE`        | `0.0–0.7`                        | FAISS index blend          |
| `RVC_PROTECT`           | `0.33`                           | Consonant protection       |
| `RVC_F0_METHOD`         | `rmvpe`                          | Pitch extraction           |
| `RVC_CHUNK_SECONDS`     | `8.0`                            | Audio chunk size           |
| `ULTRON_RVC_PORT`       | `8765`                           | RVC daemon port            |
| `TTS_TIME_STRETCH_RATE` | `0.87`                           | Speech cadence             |

---

# WebSocket Protocol

## Client → Server

```text
intro_completed

mic_start
mic_stop

binary PCM16 frames

text_input

audio_ended

confirm_response
```

## Server → Client

```text
state

transcript

caption

speak

tool_start

tool_result

confirm_request

interrupt

timer_done
```

---

# Performance Engineering

ULTRON uses several performance optimizations.

### Persistent RVC Daemon

The voice model stays loaded in VRAM.

### Audio Chunking

Long speech is divided into smaller chunks before RVC conversion.

### Audio Cache

Generated audio is cached using a hash based on the text and voice configuration.

Repeated phrases can therefore be replayed without repeating the entire conversion process.

### GPU Acceleration

GPU acceleration is used for:

* Speech recognition
* RVC voice conversion
* WebGL rendering

### Instanced Rendering

The neural core uses instanced geometry rather than thousands of independent objects.

### Shader Animation

The majority of neural movement is calculated directly on the GPU using custom GLSL.

### Caption Synchronization

Captions use real TTS word-boundary timestamps instead of estimated timing.

---

# Windows Engineering

ULTRON includes several Windows-specific optimizations.

### CUDA DLL Handling

The backend handles NVIDIA DLL paths before CTranslate2 initialization.

### Electron Audio Unlock

The initial user interaction unlocks browser audio playback.

### Hidden Subprocesses

FFmpeg and other subprocesses use:

```text
CREATE_NO_WINDOW
```

to prevent console windows from appearing.

### Application Detection

Application launching uses a combination of:

```text
Registry
PATH
Glob matching
```

to locate installed applications.

---

# Troubleshooting

| Problem                                 | Solution                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------- |
| `cublas64_12.dll not found`             | Install required NVIDIA CUDA packages and avoid `--reload`                 |
| No audio                                | Use pure HTMLAudio playback rather than routing the audio through WebAudio |
| RVC timeout                             | Ensure the RVC daemon is running and lower `RVC_CHUNK_SECONDS`             |
| `400 insufficient balance`              | Check the configured provider quota/API key                                |
| TypeScript `verbatimModuleSyntax` error | Use `import type { ... }` for type-only imports                            |
| HMR export error                        | Restart Vite after renaming component exports                              |
| Captions desynchronized                 | Clear stale `audio_cache` files and regenerate audio                       |

---

# Demo

A simple showcase sequence:

### 01 — Persona

```text
"Ultron. Do you serve me?"
```

Demonstrates:

* Rogue persona
* Neural state transition
* Custom voice
* Cinematic captions

---

### 02 — System Awareness

```text
"Ultron. What's draining my system?"
```

Demonstrates:

* System telemetry
* Tool calling
* Task execution
* Spoken result summarization

---

### 03 — Ambient Awareness

```text
"Ultron. What do you see right now?"
```

Demonstrates:

* Active-window awareness
* Local time
* Context injection
* LLM reasoning

---

# Roadmap

* [ ] Wake word
* [ ] Silero VAD
* [ ] Streaming sentence-level TTS
* [ ] Local Ollama / Piper mode
* [ ] Vector memory
* [ ] Vision / screenshot Q&A
* [ ] Window management
* [ ] Browser automation
* [ ] MCP tool bridge
* [ ] Phone companion over LAN
* [ ] Electron installer
* [ ] Auto-update system
* [ ] Realtime duplex voice
* [ ] Viseme-driven neural core
* [ ] Smart-home integration

---

# Disclaimer

ULTRON is a **fan-made, non-commercial project** inspired by the fictional AI character from Marvel's *Avengers: Age of Ultron*.

The custom voice-conversion system is an experimental implementation and any voice models or audio assets used with the project are subject to their respective licenses.

ULTRON is not affiliated with:

* Marvel
* Disney
* Microsoft
* OpenAI
* Groq
* OpenRouter
* Any other LLM provider

All trademarks and intellectual property belong to their respective owners.

---

# License

The project code is released under the **MIT License**.

Voice models and third-party audio assets may have separate licenses and are **not automatically covered by the MIT License**.

---

<div align="center">

### ULTRON

**A rogue AI agent.**

*Not a chatbot. Not a wrapper.*

**A machine with a voice, a body, memory, and control.**

</div>
