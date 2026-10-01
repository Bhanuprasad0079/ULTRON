import { useCallback, useEffect, useRef, useState } from "react";
import type { MicLocalStatus } from "../types";

interface UseMicrophoneOptions {
  sendBinary: (data: ArrayBuffer) => void;
  sendMessage: (payload: Record<string, unknown>) => void;
}

const TARGET_SAMPLE_RATE = 16000;

function downsample(
  buffer: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Float32Array {
  if (inputSampleRate === outputSampleRate) {
    return buffer;
  }

  const ratio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < newLength) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);

    let accum = 0;
    let count = 0;

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }

    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function floatTo16(buffer: Float32Array): ArrayBuffer {
  const length = buffer.length;
  const output = new Int16Array(length);

  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, buffer[i]));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return output.buffer;
}

export function useMicrophone({
  sendBinary,
  sendMessage,
}: UseMicrophoneOptions) {
  const [status, setStatus] = useState<MicLocalStatus>("off");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const cleanupRefs = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;

      try {
        processorRef.current.disconnect();
      } catch {
        // Ignore.
      }

      processorRef.current = null;
    }

    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // Ignore.
      }

      sourceRef.current = null;
    }

    if (gainRef.current) {
      try {
        gainRef.current.disconnect();
      } catch {
        // Ignore.
      }

      gainRef.current = null;
    }

    if (
      audioContextRef.current &&
      audioContextRef.current.state !== "closed"
    ) {
      audioContextRef.current.close().catch(() => {
        // Ignore.
      });
    }

    audioContextRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    cleanupRefs();

    sendMessage({
      type: "mic_stop",
    });

    setStatus("off");
    setErrorMessage(null);
  }, [cleanupRefs, sendMessage]);

  const start = useCallback(async () => {
    if (status === "active" || status === "starting") {
      return;
    }

    setStatus("starting");
    setErrorMessage(null);

    let localStream: MediaStream | null = null;

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

    

      const AudioContextCtor =
        window.AudioContext ||
        (
          window as unknown as {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (!AudioContextCtor) {
        throw new Error("AudioContext is not supported in this environment.");
      }

      let audioContext: AudioContext;

      try {
        audioContext = new AudioContextCtor({
          sampleRate: TARGET_SAMPLE_RATE,
        } as AudioContextOptions);
      } catch {
        audioContext = new AudioContextCtor();
      }

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(localStream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const silentGain = audioContext.createGain();

      silentGain.gain.value = 0;

      sendMessage({
        type: "mic_start",
        sample_rate: TARGET_SAMPLE_RATE,
        encoding: "pcm_s16le",
        channels: 1,
      });

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const downsampled = downsample(
          input,
          audioContext.sampleRate,
          TARGET_SAMPLE_RATE
        );

        const pcm = floatTo16(downsampled);

        if (pcm.byteLength > 0) {
          sendBinary(pcm);
        }
      };

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      streamRef.current = localStream;
      sourceRef.current = source;
      processorRef.current = processor;
      gainRef.current = silentGain;

      setStatus("active");
    } catch (error) {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }

      cleanupRefs();

      const message =
        error instanceof Error
          ? error.message
          : "Microphone initialization failed.";

      console.error(error);
      setErrorMessage(message);
      setStatus("error");
    }
  }, [cleanupRefs, sendBinary, sendMessage, status]);

  const toggle = useCallback(() => {
    if (status === "active") {
      stop();
    } else {
      void start();
    }
  }, [start, status, stop]);

  useEffect(() => {
    return () => {
      cleanupRefs();
    };
  }, [cleanupRefs]);

  return {
    status,
    errorMessage,
    start,
    stop,
    toggle,
  };
}