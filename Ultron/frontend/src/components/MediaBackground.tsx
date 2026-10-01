import { useCallback, useEffect, useRef, useState } from "react";

interface MediaBackgroundProps {
  src?: string;
  mode?: "loop" | "oneshot";
  muted?: boolean;
  volume?: number;
  onEnded?: () => void;
  fallbackLabel?: string;
}

export default function MediaBackground({
  src,
  mode = "loop",
  muted = true,
  volume = 1,
  onEnded,
  fallbackLabel,
}: MediaBackgroundProps) {
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const endedRef = useRef(false);

  useEffect(() => {
    setFailed(false);
    endedRef.current = false;
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.muted = muted;
    video.volume = volume;
  }, [muted, volume, failed, src]);

  const finish = useCallback(() => {
    if (endedRef.current) {
      return;
    }

    endedRef.current = true;
    onEnded?.();
  }, [onEnded]);

  useEffect(() => {
    if (mode !== "oneshot") {
      return;
    }

    // If no video file exists, or the video fails to load,
    // use a timed fallback so the intro can continue.
    if (!src || failed) {
      const timeout = window.setTimeout(() => {
        finish();
      }, 4200);

      return () => {
        window.clearTimeout(timeout);
      };
    }
  }, [mode, src, failed, finish]);

  const tryPlay = useCallback(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.muted = muted;
    video.volume = volume;

    video.play().catch(() => {
      // Autoplay may be blocked in a normal browser tab.
      // Inside Electron, the autoplay flag should allow this.
    });
  }, [muted, volume]);

  if (!src || failed) {
    return (
      <div className="media-background fallback">
        <div className="fallback-grid" />
        <div className="fallback-glow" />
        {fallbackLabel ? (
          <div className="fallback-label">{fallbackLabel}</div>
        ) : null}
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      className="media-background video"
      src={src}
      autoPlay
      preload="auto"
      muted={muted}
      playsInline
      loop={mode === "loop"}
      onError={() => setFailed(true)}
      onLoadedData={tryPlay}
      onCanPlay={tryPlay}
      onEnded={mode === "oneshot" ? finish : undefined}
    />
  );
}