import { Fragment, useEffect, useMemo, useState } from "react";
import { getHistory, subscribeHistory, clearHistory, SESSION_ID } from "../state/history";

interface TranscriptPanelProps {
  transcripts?: unknown[];
  onClear?: () => void;
}

export default function TranscriptPanel(_props: TranscriptPanelProps) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"session" | "all">("session");
  const [version, setVersion] = useState(0);

  useEffect(() => subscribeHistory(() => setVersion((n) => n + 1)), []);

  const entries = useMemo(() => {
    const all = getHistory();
    return scope === "all" ? all : all.filter((e) => e.session === SESSION_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, version]);

  return (
    <>
      <button
        className={`hud-btn hud-history-toggle ${open ? "on" : ""}`}
        onClick={() => setOpen((o) => !o)}
        title="Toggle session log"
      >
        {open ? "CLOSE LOG" : "SESSION LOG"}
      </button>

      {open && (
        <div className="hud-log">
          <div className="hud-log-head">
            <span className="hud-log-title">
              LOG // {scope === "session" ? "CURRENT SESSION" : "ALL SESSIONS"}
            </span>
            <div className="hud-log-actions">
              <button
                className={`hud-log-scope ${scope === "session" ? "on" : ""}`}
                onClick={() => setScope("session")}
              >
                SESSION
              </button>
              <button
                className={`hud-log-scope ${scope === "all" ? "on" : ""}`}
                onClick={() => setScope("all")}
              >
                ALL
              </button>
              <button className="hud-log-scope danger" onClick={() => clearHistory()}>
                WIPE
              </button>
              <button className="hud-log-close" onClick={() => setOpen(false)} title="Close">
                ×
              </button>
            </div>
          </div>

          <div className="hud-log-body">
            {entries.length === 0 && (
              <div className="hud-log-empty">NO RECORDS IN THIS SCOPE.</div>
            )}
            {entries.map((e, i) => (
              <Fragment key={e.id}>
                {scope === "all" && (i === 0 || entries[i - 1].session !== e.session) && (
                  <div className="hud-log-session">SESSION // {e.session}</div>
                )}
                <div className={`hud-log-entry ${e.kind}`}>
                  <span className="hud-log-time">{e.time}</span>
                  {e.kind === "command" && <span className="hud-log-prompt">&gt;</span>}
                  <span className="hud-log-text">
                    {e.kind === "command"
                      ? e.text
                      : e.kind === "response"
                      ? `ULTRON // ${e.text}`
                      : `TASK // ${e.text}`}
                  </span>
                  {e.kind === "tool" && typeof e.ok === "boolean" && (
                    <span className={`hud-log-ok ${e.ok ? "ok" : "fail"}`}>
                      {e.ok ? "■" : "▲"}
                    </span>
                  )}
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </>
  );
}