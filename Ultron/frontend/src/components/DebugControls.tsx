import type { UltronAppState } from "../types";

interface DebugControlsProps {
  appState: UltronAppState;
  onTransition: (state: UltronAppState) => void;
  onSimulateCaption: () => void;
  onSimulateResult: () => void;
  onSimulateSpeak: () => void;
}

const STATES: UltronAppState[] = ["IDLE", "LISTENING", "TRANSCRIBING", "THINKING", "SPEAKING", "EXECUTING", "RESULT", "ERROR"];

export default function DebugControls({ appState, onTransition, onSimulateCaption, onSimulateResult, onSimulateSpeak }: DebugControlsProps) {
  return (
    <details className="debug-controls">
      <summary>DEBUG CONTROLS</summary>
      <div className="debug-current">Current state: {appState}</div>
      <div className="debug-buttons">
        {STATES.map((state) => (
          <button key={state} className="small-button" disabled={state === appState} onClick={() => onTransition(state)}>{state}</button>
        ))}
        <button className="small-button" onClick={onSimulateCaption}>Simulate Caption</button>
        <button className="small-button" onClick={onSimulateResult}>Simulate Result</button>
        <button className="small-button" onClick={onSimulateSpeak}>Simulate Speak</button>
      </div>
    </details>
  );
}