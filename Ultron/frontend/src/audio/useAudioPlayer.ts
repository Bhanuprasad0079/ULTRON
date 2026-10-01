import { useEffect, useRef } from "react";
import type { Dispatch } from "react";
import type { UiAction, AudioUi } from "../state/appReducer";
import { setAudioElement } from "./audioClock";

interface UseAudioPlayerOptions {
  currentAudio: AudioUi | null;
  sendMessage: (payload: Record<string, unknown>) => void;
  dispatch: Dispatch<UiAction>;
}

export function useAudioPlayer({ currentAudio, sendMessage, dispatch }: UseAudioPlayerOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    console.log("[AUDIO] useAudioPlayer effect fired, currentAudio:", currentAudio);

    if (!currentAudio) {
      console.log("[AUDIO] No currentAudio, cleaning up");
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setAudioElement(null);
      return;
    }

    if (audioRef.current && audioRef.current.src.endsWith(currentAudio.url)) {
      console.log("[AUDIO] Same clip already playing, skipping");
      return;
    }

    if (audioRef.current) {
      console.log("[AUDIO] Pausing previous audio");
      audioRef.current.pause();
    }

    const url = `http://127.0.0.1:8000${currentAudio.url}`;
    console.log("[AUDIO] Creating new Audio element for:", url);
    
    const audio = new Audio(url);
    audioRef.current = audio;
    setAudioElement(audio);

    audio.onloadeddata = () => {
      console.log("[AUDIO] Audio loaded, duration:", audio.duration);
    };

    audio.onerror = (e) => {
      console.error("[AUDIO] Audio error:", e);
      setAudioElement(null);
      dispatch({ type: "STOP_AUDIO", key: currentAudio.key });
      sendMessage({ type: "audio_ended", speech_id: currentAudio.key });
    };

    audio.onended = () => {
      console.log("[AUDIO] Audio ended naturally");
      setAudioElement(null);
      dispatch({ type: "STOP_AUDIO", key: currentAudio.key });
      sendMessage({ type: "audio_ended", speech_id: currentAudio.key });
    };

    console.log("[AUDIO] Calling audio.play()...");
    audio.play()
      .then(() => console.log("[AUDIO] ✅ Audio.play() succeeded"))
      .catch((err) => {
        console.error("[AUDIO] ❌ Audio.play() failed:", err);
        setAudioElement(null);
        dispatch({ type: "STOP_AUDIO", key: currentAudio.key });
        sendMessage({ type: "audio_ended", speech_id: currentAudio.key });
      });
  }, [currentAudio, sendMessage, dispatch]);
}