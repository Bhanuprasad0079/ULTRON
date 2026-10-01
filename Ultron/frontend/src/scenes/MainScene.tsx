import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import CaptionsLayer from "../components/CaptionsLayer";
import ConfirmationModal from "../components/ConfirmationModal";
import DebugControls from "../components/DebugControls";
import MediaBackground from "../components/MediaBackground";
import NeuralCore from "../components/NeuralCore";
import ResultPanel from "../components/ResultPanel";
import StatusBar from "../components/StatusBar";
import TextInputBar from "../components/TextInputBar";
import TranscriptPanel from "../components/TranscriptPanel";
import { appendHistory } from "../state/history";
import type { UiState } from "../state/appReducer";
import type { MicLocalStatus, ResultEvent, UltronAppState } from "../types";

interface MainSceneProps {
  state: UiState;
  micLocalStatus: MicLocalStatus;
  onToggleCaptions: () => void;
  onReconnect: () => void;
  onToggleMic: () => void;
  onToggleBgMode: () => void;
  onTransition: (state: UltronAppState) => void;
  onSimulateCaption: () => void;
  onSimulateResult: () => void;
  onSimulateSpeak: () => void;
  onSendText: (text: string) => void;
  onClearResult: () => void;
  onClearTranscripts: () => void;
  onConfirmResponse: (approved: boolean) => void;
}

export default function MainScene({
  state,
  micLocalStatus,
  onToggleCaptions,
  onReconnect,
  onToggleMic,
  onToggleBgMode,
  onTransition,
  onSimulateCaption,
  onSimulateResult,
  onSimulateSpeak,
  onSendText,
  onClearResult,
  onClearTranscripts,
  onConfirmResponse,
}: MainSceneProps) {
  const idleSrc = `${import.meta.env.BASE_URL}assets/video/idle.mp4`;
  const bgMode = state.bgMode ?? "neural";
  const isProcessing = ["TRANSCRIBING", "THINKING", "SPEAKING"].includes(
    state.appState,
  );

  // ---- persistent history recording ----
  const lastTranscript = useRef<string | null>(null);
  useEffect(() => {
    const t = state.transcripts[0];
    if (t && t.id !== lastTranscript.current) {
      lastTranscript.current = t.id;
      appendHistory({ kind: "command", text: t.text });
    }
  }, [state.transcripts]);

  const lastAudio = useRef<string | null>(null);
  useEffect(() => {
    const a = state.currentAudio;
    if (a && a.key !== lastAudio.current) {
      lastAudio.current = a.key;
      appendHistory({ kind: "response", text: a.caption });
    }
  }, [state.currentAudio]);

  const lastResult = useRef<ResultEvent | null>(null);
  useEffect(() => {
    const r = state.result;
    if (r && r !== lastResult.current) {
      lastResult.current = r;
      appendHistory({
        kind: "tool",
        ok: r.success,
        text: `${r.title} — ${r.status}${r.message ? ` — ${r.message}` : ""}`,
      });
    }
  }, [state.result]);

  return (
    <motion.div
      className="scene main"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.55 }}
    >
      {bgMode === "neural" ? (
        <NeuralCore appState={state.appState} />
      ) : (
        <MediaBackground
          src={idleSrc}
          mode="loop"
          fallbackLabel="ULTRON ENVIRONMENT"
        />
      )}

      <div className="overlay" />

      <StatusBar
        state={state}
        micLocalStatus={micLocalStatus}
        onToggleCaptions={onToggleCaptions}
        onReconnect={onReconnect}
        onToggleMic={onToggleMic}
        onToggleBgMode={onToggleBgMode}
      />

      <TranscriptPanel
        transcripts={state.transcripts}
        onClear={onClearTranscripts}
      />
      <ResultPanel result={state.result} onClear={onClearResult} />
      <CaptionsLayer
        caption={state.caption}
        enabled={state.captionsEnabled}
        audioUrl={state.currentAudio?.url ?? null}
      />

      {micLocalStatus !== "active" && (
        <TextInputBar onSend={onSendText} disabled={isProcessing} />
      )}

      {state.appState === "ERROR" ? (
        <div className="error-banner">SYSTEM ERROR</div>
      ) : null}

      <ConfirmationModal
        pending={state.pendingConfirm}
        onRespond={onConfirmResponse}
      />

      <DebugControls
        appState={state.appState}
        onTransition={onTransition}
        onSimulateCaption={onSimulateCaption}
        onSimulateResult={onSimulateResult}
        onSimulateSpeak={onSimulateSpeak}
      />
    </motion.div>
  );
}