import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ResultEvent } from "../types";

interface ResultPanelProps {
  result: ResultEvent | null;
  onClear: () => void;
}

export default function ResultPanel({ result, onClear }: ResultPanelProps) {
  useEffect(() => {
    if (!result) return;
    const timeout = window.setTimeout(() => onClear(), 8000);
    return () => window.clearTimeout(timeout);
  }, [result, onClear]);

  return (
    <AnimatePresence>
      {result ? (
        <motion.div
          key={result.result_id}
          className="result-panel"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
        >
          <div className="result-header">
            <span>{result.title}</span>
            <button className="small-button" onClick={onClear}>
              Close
            </button>
          </div>

          {result.data?.image_url ? (
            <img
              className="result-image"
              src={`http://127.0.0.1:8000${String(result.data.image_url)}`}
              alt="capture"
            />
          ) : Array.isArray(result.data?.results) ? (
            <div className="result-list">
              {(result.data.results as Array<Record<string, string>>)
                .slice(0, 5)
                .map((r, i) => (
                  <div key={i} className="result-list-item">
                    <div className="result-list-title">
                      {String(i + 1).padStart(2, "0")} · {r.title}
                    </div>
                    <div className="result-list-snippet">{r.snippet}</div>
                  </div>
                ))}
            </div>
          ) : result.data ? (
            <div className="result-data-grid">
              {Object.entries(result.data).map(([key, value]) => (
                <div key={key} className="result-data-row">
                  <span className="result-data-key">{key.toUpperCase()}</span>
                  <span className="result-data-value">{String(value)}</span>
                </div>
              ))}
            </div>
          ) : (
            <pre className="result-data">{result.message}</pre>
          )}

          <div
            className={`result-status ${result.success ? "success" : "error"}`}
          >
            {result.status}
          </div>

          {result.data ? (
            <div className="result-data-grid">
              {Object.entries(result.data).map(([key, value]) => (
                <div key={key} className="result-data-row">
                  <span className="result-data-key">{key.toUpperCase()}</span>
                  <span className="result-data-value">{String(value)}</span>
                </div>
              ))}
            </div>
          ) : (
            <pre className="result-data">{result.message}</pre>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
