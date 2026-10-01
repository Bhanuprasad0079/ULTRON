export interface HistoryEntry {
  id: string;
  time: string;
  session: string;
  kind: "command" | "response" | "tool";
  text: string;
  ok?: boolean;
}

const KEY = "ultron_history_v1";
const MAX = 300;

export const SESSION_ID = `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;

let cache: HistoryEntry[] | null = null;
const listeners = new Set<() => void>();

function read(): HistoryEntry[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(entries: HistoryEntry[]) {
  cache = entries.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {}
  listeners.forEach((fn) => fn());
}

export function getHistory(): HistoryEntry[] {
  return read();
}

export function appendHistory(e: { kind: HistoryEntry["kind"]; text: string; ok?: boolean }): HistoryEntry {
  const entry: HistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    time: new Date().toLocaleTimeString(),
    session: SESSION_ID,
    kind: e.kind,
    text: e.text,
    ok: e.ok,
  };
  write([entry, ...read()]);
  return entry;
}

export function clearHistory() {
  write([]);
}

export function subscribeHistory(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}