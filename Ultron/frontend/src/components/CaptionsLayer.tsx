import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CaptionUi } from "../state/appReducer";
import { getAudioElement } from "../audio/audioClock";

interface WordTiming { w: string; start: number; end: number; }

interface CaptionsLayerProps {
  caption: CaptionUi | null;
  enabled: boolean;
  audioUrl?: string | null;
}

const BACKEND = "http://127.0.0.1:8000";

function buildBlocks(words: string[]): string[][] {
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const w of words) {
    cur.push(w);
    const ends = /[.!?…:]$/.test(w);
    if (cur.length >= 8 || (ends && cur.length >= 2)) {
      blocks.push(cur);
      cur = [];
    }
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

export default function CaptionsLayer({ caption, enabled, audioUrl }: CaptionsLayerProps) {
  const words = useMemo(
    () => (caption ? caption.text.split(/\s+/).filter(Boolean) : []),
    [caption]
  );
  const blocks = useMemo(() => buildBlocks(words), [words]);

  const blockRanges = useMemo(() => {
    const ranges: { start: number; end: number }[] = [];
    let idx = 0;
    for (const b of blocks) {
      ranges.push({ start: idx, end: idx + b.length });
      idx += b.length;
    }
    return ranges;
  }, [blocks]);

  const wordFracs = useMemo(() => {
    const weights = words.map((w) => w.length + 1.5 + (/[.,!?…:]$/.test(w) ? 2.5 : 0));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    return weights.map((w) => {
      const s = acc / total;
      acc += w;
      return s;
    });
  }, [words]);

  const [timings, setTimings] = useState<WordTiming[] | null>(null);
  const [now, setNow] = useState(0);
  const rafRef = useRef(0);
  const startRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setTimings(null);
    if (!audioUrl) return;
    const jsonUrl = audioUrl.replace(/\.(wav|mp3)$/i, ".words.json");
    fetch(`${BACKEND}${jsonUrl}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data) && data.length) setTimings(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [audioUrl, caption?.key]);

  useEffect(() => {
    setNow(0);
    startRef.current = performance.now();
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const audio = getAudioElement();
      if (audio) setNow(audio.currentTime);
      else setNow((performance.now() - startRef.current) / 1000);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { stopped = true; cancelAnimationFrame(rafRef.current); };
  }, [caption?.key]);

  const audio = getAudioElement();
  const total = audio && isFinite(audio.duration) && audio.duration > 0
    ? audio.duration
    : Math.max(1.2, words.length * 0.3);

  const useTimings = !!(timings && timings.length > 0 && timings.length === words.length);

  const wordStart = (i: number): number => {
    if (useTimings && timings && i >= 0 && i < timings.length) {
      return Math.max(0, timings[i].start - 0.05);
    }
    if (i >= 0 && i < wordFracs.length) return wordFracs[i] * total;
    return 0;
  };

  const lastEnd: number = useTimings && timings && timings.length > 0
    ? timings[timings.length - 1].end
    : total;

  const blockStart = (bi: number): number => (blockRanges[bi] ? wordStart(blockRanges[bi].start) : 0);
  const blockEnd = (bi: number): number => {
    if (!blockRanges[bi]) return total;
    return blockRanges[bi].end < words.length ? wordStart(blockRanges[bi].end) : lastEnd + 0.6;
  };

  let active: number | null = null;
  for (let i = 0; i < blockRanges.length; i++) {
    if (now >= blockStart(i) && now < blockEnd(i)) { active = i; break; }
  }
  if (active === null && blockRanges.length > 0 && now >= blockStart(blockRanges.length - 1)) {
    active = blockRanges.length - 1;
  }

  if (!caption || !enabled || !blocks.length || active === null) return null;

  return (
    <div className="edit-captions-root">
      <AnimatePresence mode="wait">
        <motion.div
          key={`${caption.key}-${active}`}
          className="edit-caption"
          initial={{ opacity: 0, filter: "blur(5px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={{
            opacity: 0,
            filter: "blur(6px)",
            transition: { duration: 0.16, ease: "easeIn" },
          }}
          transition={{ duration: 0.12, ease: "easeOut" }}
        >
          {blocks[active].map((w, localI) => {
            const globalI = blockRanges[active].start + localI;
            const shown = now >= wordStart(globalI);
            return (
              <span key={localI} className={shown ? "cap-word shown" : "cap-word"}>
                {w}
              </span>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}