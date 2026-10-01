export type ConnectionState = "disconnected" | "connecting" | "connected";
export type UltronAppState = "BOOT" | "INTRO" | "IDLE" | "LISTENING" | "TRANSCRIBING" | "THINKING" | "SPEAKING" | "EXECUTING" | "RESULT" | "ERROR";
export type MicStatus = "OFF" | "STANDBY" | "LISTENING" | "PROCESSING" | "BLOCKED";
export type MicLocalStatus = "off" | "starting" | "active" | "error";
export type ResultType = "application" | "weather" | "system" | "search" | "generic" | "tool";

export interface StateEvent { type: "state"; state: UltronAppState; reason?: string; timestamp?: string; }
export interface CaptionEvent { type: "caption"; caption_id: string; text: string; duration_ms?: number; timestamp?: string; }
export interface ResultEvent { type: "tool_result"; result_id: string; tool: string; success: boolean; data?: Record<string, unknown>; message?: string; timestamp?: string; result_type?: ResultType; title?: string; status?: string; }
export interface MicStatusEvent { type: "mic_status"; status: MicStatus; timestamp?: string; }
export interface TranscriptEvent { type: "transcript"; transcript_id: string; text: string; final?: boolean; source?: string; timestamp?: string; }
export interface SpeakEvent { type: "speak"; speech_id: string; speech: string; caption: string; audio_url: string; timestamp?: string; }
export interface ErrorEvent { type: "error"; message: string; timestamp?: string; }
export interface PongEvent { type: "pong"; message: string; timestamp?: string; }
export interface LogEvent { type: "log"; message: string; timestamp?: string; }
export interface ToolStartEvent { type: "tool_start"; tool: string; timestamp?: string; }