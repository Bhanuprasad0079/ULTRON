import { useState } from "react";
import type { FormEvent } from "react";

interface TextInputBarProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export default function TextInputBar({ onSend, disabled }: TextInputBarProps) {
  const [text, setText] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText("");
  };

  return (
    <form className="hud-cmd" onSubmit={submit}>
      <span className="hud-cmd-prompt">&gt;_</span>
      <input
        className="hud-cmd-input"
        value={text}
        placeholder="ENTER COMMAND..."
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
      />
      <button className="hud-cmd-send" type="submit" disabled={disabled || !text.trim()}>
        TRANSMIT
      </button>
    </form>
  );
}