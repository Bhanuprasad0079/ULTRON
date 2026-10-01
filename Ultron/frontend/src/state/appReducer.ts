import type { CaptionEvent, ConnectionState, MicStatus, ResultEvent, SpeakEvent, TranscriptEvent, UltronAppState } from "../types";
import { loadCaptionsEnabled, saveCaptionsEnabled } from "./settings";

export interface CaptionUi { key: string; text: string; durationMs: number; }
export interface LogEntry { id: string; time: string; text: string; }
export interface TranscriptUi { id: string; time: string; text: string; final: boolean; }
export interface AudioUi { key: string; url: string; caption: string; }

export type BgMode = "neural" | "video";

export interface UiState {
  connection: ConnectionState;
  appState: UltronAppState;
  caption: CaptionUi | null;
  result: ResultEvent | null;
  micStatus: MicStatus;
  captionsEnabled: boolean;
  logs: LogEntry[];
  transcripts: TranscriptUi[];
  currentAudio: AudioUi | null;
  activeTool: string | null;
  pendingConfirm: { confirm_id: string; tool: string; args: Record<string, unknown> } | null;
  micCommand: { enabled: boolean; nonce: number } | null;
  bgMode: BgMode;
}

export type UiAction =
  | { type: "SET_CONNECTION"; connection: ConnectionState; }
  | { type: "SET_APP_STATE"; state: UltronAppState; }
  | { type: "SHOW_CAPTION"; caption: CaptionEvent; }
  | { type: "CLEAR_CAPTION"; key: string; }
  | { type: "SHOW_RESULT"; result: ResultEvent; }
  | { type: "CLEAR_RESULT"; }
  | { type: "SET_MIC_STATUS"; status: MicStatus; }
  | { type: "TOGGLE_CAPTIONS"; }
  | { type: "ADD_TRANSCRIPT"; transcript: TranscriptEvent; }
  | { type: "CLEAR_TRANSCRIPTS"; }
  | { type: "PLAY_AUDIO"; audio: SpeakEvent; }
  | { type: "STOP_AUDIO"; key: string; }
  | { type: "INTERRUPT_AUDIO"; }
  | { type: "SET_ACTIVE_TOOL"; tool: string | null; }
  | { type: "SET_PENDING_CONFIRM"; confirm: { confirm_id: string; tool: string; args: Record<string, unknown> }; }
  | { type: "CLEAR_PENDING_CONFIRM"; }
  | { type: "SET_CAPTIONS"; enabled: boolean; }
  | { type: "MIC_COMMAND"; enabled: boolean; }
  | { type: "TOGGLE_BG_MODE"; }
  | { type: "LOG"; text: string; };

function createId(): string { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

export const initialUiState: UiState = {
  connection: "disconnected", appState: "BOOT", caption: null, result: null,
  micStatus: "STANDBY", captionsEnabled: loadCaptionsEnabled(), logs: [], transcripts: [],
  currentAudio: null, activeTool: null, pendingConfirm: null, micCommand: null,
  bgMode: "neural",
};

export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case "SET_CONNECTION": return { ...state, connection: action.connection };
    case "SET_APP_STATE": return { ...state, appState: action.state };
    case "SHOW_CAPTION": return { ...state, caption: { key: action.caption.caption_id, text: action.caption.text, durationMs: action.caption.duration_ms ?? 5200 } };
    case "CLEAR_CAPTION": return (!state.caption || state.caption.key !== action.key) ? state : { ...state, caption: null };
    case "SHOW_RESULT": {
      const formattedResult: ResultEvent = {
        ...action.result,
        result_type: "tool",
        title: action.result.tool.replace(/_/g, " ").toUpperCase(),
        status: action.result.success ? "EXECUTED" : "FAILED",
      };
      return { ...state, result: formattedResult, activeTool: null };
    }
    case "CLEAR_RESULT": return { ...state, result: null };
    case "SET_MIC_STATUS": return { ...state, micStatus: action.status };
    case "TOGGLE_CAPTIONS": { const captionsEnabled = !state.captionsEnabled; saveCaptionsEnabled(captionsEnabled); return { ...state, captionsEnabled }; }
    case "ADD_TRANSCRIPT": return { ...state, transcripts: [{ id: action.transcript.transcript_id, time: new Date().toLocaleTimeString(), text: action.transcript.text, final: action.transcript.final ?? true }, ...state.transcripts].slice(0, 40) };
    case "CLEAR_TRANSCRIPTS": return { ...state, transcripts: [] };
    case "PLAY_AUDIO": return { ...state, currentAudio: { key: action.audio.speech_id, url: action.audio.audio_url, caption: action.audio.caption }, caption: { key: action.audio.speech_id, text: action.audio.caption, durationMs: 60000 } };
    case "STOP_AUDIO": return (state.currentAudio && state.currentAudio.key === action.key) ? { ...state, currentAudio: null, caption: null } : state;
    case "INTERRUPT_AUDIO": return { ...state, currentAudio: null, caption: null };
    case "SET_ACTIVE_TOOL": return { ...state, activeTool: action.tool };
    case "SET_PENDING_CONFIRM": return { ...state, pendingConfirm: action.confirm };
    case "CLEAR_PENDING_CONFIRM": return { ...state, pendingConfirm: null };
    case "SET_CAPTIONS": { saveCaptionsEnabled(action.enabled); return { ...state, captionsEnabled: action.enabled }; }
    case "MIC_COMMAND": return { ...state, micCommand: { enabled: action.enabled, nonce: Date.now() } };
    case "TOGGLE_BG_MODE": return { ...state, bgMode: (state.bgMode ?? "neural") === "neural" ? "video" : "neural" };
    case "LOG": return { ...state, logs: [{ id: createId(), time: new Date().toLocaleTimeString(), text: action.text }, ...state.logs].slice(0, 140) };
    default: return state;
  }
}