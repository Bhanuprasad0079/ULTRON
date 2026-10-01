import { useCallback, useEffect, useRef } from "react";
import type { Dispatch } from "react";
import type { UiAction } from "../state/appReducer";
import type {
  ConnectionState,
  MicStatus,
  ResultType,
  UltronAppState,
} from "../types";

const WS_URL = "ws://127.0.0.1:8000/ws";
function createFallbackId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useUltronWebSocket(dispatch: Dispatch<UiAction>) {
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    )
      return;
    dispatch({ type: "SET_CONNECTION", connection: "connecting" });
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () =>
      dispatch({ type: "SET_CONNECTION", connection: "connected" });
    ws.onerror = () => dispatch({ type: "LOG", text: "WebSocket error" });
    ws.onclose = () => {
      dispatch({ type: "SET_CONNECTION", connection: "disconnected" });
      wsRef.current = null;
    };

    ws.onmessage = (event) => {
      try {
        const p = JSON.parse(event.data) as { type?: string } & Record<
          string,
          unknown
        >;
        switch (p.type) {
          case "state":
            dispatch({
              type: "SET_APP_STATE",
              state: String(p.state ?? "IDLE") as UltronAppState,
            });
            break;
          case "caption":
            dispatch({
              type: "SHOW_CAPTION",
              caption: {
                type: "caption",
                caption_id: String(p.caption_id ?? createFallbackId()),
                text: String(p.text ?? ""),
                duration_ms:
                  typeof p.duration_ms === "number" ? p.duration_ms : undefined,
              },
            });
            break;
          case "tool_result":
            dispatch({
              type: "SHOW_RESULT",
              result: {
                type: "tool_result",
                result_id: String(p.result_id ?? createFallbackId()),
                tool: String(p.tool ?? "unknown"),
                success: Boolean(p.success),
                data: p.data as Record<string, unknown> | undefined,
                message: String(p.message ?? ""),
              },
            });
            break;
          case "mic_status":
            dispatch({
              type: "SET_MIC_STATUS",
              status: String(p.status ?? "STANDBY") as MicStatus,
            });
            break;
          case "transcript":
            dispatch({
              type: "ADD_TRANSCRIPT",
              transcript: {
                type: "transcript",
                transcript_id: String(p.transcript_id ?? createFallbackId()),
                text: String(p.text ?? ""),
                final: typeof p.final === "boolean" ? p.final : true,
              },
            });
            break;
          case "speak":
            dispatch({
              type: "PLAY_AUDIO",
              audio: {
                type: "speak",
                speech_id: String(p.speech_id ?? createFallbackId()),
                speech: String(p.speech ?? ""),
                caption: String(p.caption ?? ""),
                audio_url: String(p.audio_url ?? ""),
              },
            });
            break;
          case "tool_start":
            dispatch({ type: "SET_ACTIVE_TOOL", tool: String(p.tool ?? "") });
            break;
          case "interrupt":
            dispatch({ type: "INTERRUPT_AUDIO" });
            dispatch({ type: "LOG", text: "Barge-in: Ultron was interrupted" });
            break;
          case "log":
            dispatch({ type: "LOG", text: String(p.message ?? "") });
            break;
          case "error":
            dispatch({
              type: "LOG",
              text: `Backend error: ${String(p.message ?? "Unknown")}`,
            });
            break;
        }
      } catch {
        dispatch({ type: "LOG", text: "Failed to parse backend event" });
      }
    };
  }, [dispatch]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const sendMessage = useCallback((payload: Record<string, unknown>) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify(payload));
  }, []);

  const sendBinary = useCallback((data: ArrayBuffer) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(data);
  }, []);

  return { connect, sendMessage, sendBinary };
}
