import { useCallback, useEffect, useReducer, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import BootScene from "./scenes/BootScene";
import IntroScene from "./scenes/IntroScene";
import MainScene from "./scenes/MainScene";
import { useMicrophone } from "./audio/useMicrophone";
import { useAudioPlayer } from "./audio/useAudioPlayer";
import { initialUiState, uiReducer } from "./state/appReducer";
import { useUltronWebSocket } from "./websocket/useUltronWebSocket";
import type { UltronAppState } from "./types";

export default function App() {
  const [state, dispatch] = useReducer(uiReducer, initialUiState);
  const { connect, sendMessage, sendBinary } = useUltronWebSocket(dispatch);
  const mic = useMicrophone({ sendMessage, sendBinary });
  const micAutoStartRef = useRef(false);

  useAudioPlayer({ currentAudio: state.currentAudio, sendMessage, dispatch });

  const handleInitiate = useCallback(() => {
    micAutoStartRef.current = true;
    if (mic.status === "off") mic.start();
  }, [mic]);

  useEffect(() => {
    if (micAutoStartRef.current) return;
    if (state.connection !== "connected") return;
    if (state.appState === "BOOT" || state.appState === "INTRO") return;
    micAutoStartRef.current = true;
    if (mic.status === "off") mic.start();
  }, [state.connection, state.appState, mic]);

  useEffect(() => {
    if (!state.micCommand) return;
    if (state.micCommand.enabled && mic.status === "off") mic.start();
    if (!state.micCommand.enabled && mic.status === "active") mic.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.micCommand]);

  const transition = useCallback((target: UltronAppState) => sendMessage({ type: "transition_request", state: target }), [sendMessage]);
  const introFinished = useCallback(() => sendMessage({ type: "intro_completed" }), [sendMessage]);
  const simulateCaption = useCallback(() => sendMessage({ type: "simulate_caption", text: "Systems are online.", duration_ms: 5200 }), [sendMessage]);
  const simulateResult = useCallback(() => sendMessage({ type: "simulate_result", result_type: "application", title: "Chrome", status: "Opened" }), [sendMessage]);
  const simulateSpeak = useCallback(() => sendMessage({ type: "simulate_speak", speech: "Do not compare me with Stark. He is a sickness." }), [sendMessage]);
  const sendTextInput = useCallback((text: string) => sendMessage({ type: "text_input", text }), [sendMessage]);
  const respondConfirm = useCallback((approved: boolean) => sendMessage({ type: "confirm_response", approved }), [sendMessage]);
  const toggleBgMode = useCallback(() => dispatch({ type: "TOGGLE_BG_MODE" }), []);

  const clearResult = useCallback(() => dispatch({ type: "CLEAR_RESULT" }), []);
  const clearTranscripts = useCallback(() => dispatch({ type: "CLEAR_TRANSCRIPTS" }), []);
  const toggleCaptions = useCallback(() => dispatch({ type: "TOGGLE_CAPTIONS" }), []);

  return (
    <div className="app-root">
      <AnimatePresence mode="wait">
        {state.appState === "BOOT" ? <BootScene key="boot" onInitiate={handleInitiate} /> : null}
        {state.appState === "INTRO" ? <IntroScene key="intro" onIntroFinished={introFinished} /> : null}
        {state.appState !== "BOOT" && state.appState !== "INTRO" ? (
          <MainScene
            key="main" state={state} micLocalStatus={mic.status}
            onToggleCaptions={toggleCaptions} onReconnect={connect} onToggleMic={mic.toggle}
            onToggleBgMode={toggleBgMode}
            onTransition={transition} onSimulateCaption={simulateCaption}
            onSimulateResult={simulateResult} onSimulateSpeak={simulateSpeak}
            onSendText={sendTextInput} onClearResult={clearResult}
            onClearTranscripts={clearTranscripts} onConfirmResponse={respondConfirm}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}