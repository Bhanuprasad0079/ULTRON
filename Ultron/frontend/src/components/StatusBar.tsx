import type { UiState } from "../state/appReducer";
import type { MicLocalStatus } from "../types";

interface StatusBarProps {
  state: UiState;
  micLocalStatus: MicLocalStatus;
  onToggleCaptions: () => void;
  onReconnect: () => void;
  onToggleMic: () => void;
  onToggleBgMode: () => void;
}

const ReconnectIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <polyline points="21 3 21 9 15 9" />
  </svg>
);

export default function StatusBar({
  state, micLocalStatus, onToggleCaptions, onReconnect, onToggleMic, onToggleBgMode,
}: StatusBarProps) {
  const wsOk = state.connection === "connected";
  const micActive = micLocalStatus === "active";
  const micLabel = micActive ? "LISTENING" : micLocalStatus === "error" ? "ERROR" : state.micStatus;
  const appTone = ["THINKING", "SPEAKING", "EXECUTING", "TRANSCRIBING", "LISTENING"].includes(state.appState)
    ? "bright"
    : state.appState === "ERROR" ? "red" : "dim";

  return (
    <>
      {/* ---- top-left: logo + diagnostic readout ---- */}
      <div className="hud-tl">
        <div className="hud-title">U L T R O N</div>
        <div className="hud-line">APP // <span className={`hud-val ${appTone}`}>{state.appState}</span></div>
        <div className="hud-line">WS&nbsp; // <span className={`hud-val ${wsOk ? "bright" : "red"}`}>{state.connection.toUpperCase()}</span></div>
        <div className="hud-line">MIC // <span className={`hud-val ${micActive ? "bright" : micLocalStatus === "error" ? "red" : "dim"}`}>{String(micLabel).toUpperCase()}</span></div>
        <div className="hud-dash" />
        <div className={`hud-online ${wsOk ? "on" : "off"}`}>{wsOk ? "ONLINE" : "OFFLINE"}</div>
        <button className="hud-reconnect" onClick={onReconnect} title="Reconnect to backend">
          <ReconnectIcon /><span>RECONNECT</span>
        </button>
      </div>

      {/* ---- right edge: labeled controls, new design language ---- */}
      <div className="hud-controls">
        <button className={`hud-btn ${micActive ? "on" : ""}`} onClick={onToggleMic}>
          {micActive ? "DISABLE MIC" : "ENABLE MIC"}
        </button>
        <button className="hud-btn" onClick={onToggleBgMode}>
          BG: {(state.bgMode ?? "neural").toUpperCase()}
        </button>
        <button className={`hud-btn ${state.captionsEnabled ? "on" : ""}`} onClick={onToggleCaptions}>
          CC: {state.captionsEnabled ? "ON" : "OFF"}
        </button>
      </div>
    </>
  );
}