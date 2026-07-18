"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioSegmentMetadata } from "@/types/audio";

export type ReplayStatus =
  | "idle"
  | "preparing"
  | "replaying"
  | "stopped"
  | "completed"
  | "error";

type UseAudioReplayOptions = {
  onAudioSegment?: (segment: Blob, metadata: AudioSegmentMetadata) => void;
};

const AUDIO_SEGMENT_DURATION_SECONDS = 3;

export function useAudioReplay({
  onAudioSegment,
}: UseAudioReplayOptions = {}) {
  const [file, setFileState] = useState<File | null>(null);
  const [status, setStatus] = useState<ReplayStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [emittedSegments, setEmittedSegments] = useState(0);
  const [totalSegments, setTotalSegments] = useState(0);
  const [preparationMs, setPreparationMs] = useState<number | null>(null);

  const sessionIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);

  const clearPlayback = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        // The source may already have ended naturally.
      }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== "closed") {
      void context.close();
    }
  }, []);

  const stopReplay = useCallback(() => {
    if (status !== "preparing" && status !== "replaying") {
      return;
    }

    sessionIdRef.current += 1;
    clearPlayback();
    setStatus("stopped");
  }, [clearPlayback, status]);

  const setFile = useCallback(
    (nextFile: File | null) => {
      sessionIdRef.current += 1;
      clearPlayback();
      setFileState(nextFile);
      setStatus("idle");
      setError(null);
      setEmittedSegments(0);
      setTotalSegments(0);
      setPreparationMs(null);
    },
    [clearPlayback],
  );

  const resetReplay = useCallback(() => {
    sessionIdRef.current += 1;
    clearPlayback();
    setStatus("idle");
    setError(null);
    setEmittedSegments(0);
    setTotalSegments(0);
    setPreparationMs(null);
  }, [clearPlayback]);

  const startReplay = useCallback(async () => {
    if (!file || status === "preparing" || status === "replaying") {
      return;
    }

    const sessionId = sessionIdRef.current + 1;
    sessionIdRef.current = sessionId;
    clearPlayback();
    setError(null);
    setEmittedSegments(0);
    setTotalSegments(0);
    setPreparationMs(null);
    setStatus("preparing");

    const preparationStartedAtMs = performance.now();

    try {
      const context = new AudioContext();
      contextRef.current = context;
      // Resume while the start button's user activation is still current so
      // browsers with strict autoplay policies allow audible replay.
      await context.resume();
      const decodedAudio = await context.decodeAudioData(await file.arrayBuffer());

      if (sessionIdRef.current !== sessionId) {
        await context.close();
        return;
      }

      const monoAudio = mixToMono(decodedAudio);
      const segmentCount = Math.ceil(
        decodedAudio.duration / AUDIO_SEGMENT_DURATION_SECONDS,
      );

      if (segmentCount === 0) {
        throw new Error("The selected audio file is empty.");
      }

      const source = context.createBufferSource();
      source.buffer = decodedAudio;
      source.connect(context.destination);
      sourceRef.current = source;

      if (sessionIdRef.current !== sessionId) {
        await context.close();
        return;
      }

      const replayStartedAtMs = performance.now();
      setPreparationMs(replayStartedAtMs - preparationStartedAtMs);
      setTotalSegments(segmentCount);
      setStatus("replaying");
      source.start();

      const emitSegment = (segmentIndex: number) => {
        if (sessionIdRef.current !== sessionId) {
          return;
        }

        const startSeconds = segmentIndex * AUDIO_SEGMENT_DURATION_SECONDS;
        const endSeconds = Math.min(
          startSeconds + AUDIO_SEGMENT_DURATION_SECONDS,
          decodedAudio.duration,
        );
        const startSample = Math.round(startSeconds * decodedAudio.sampleRate);
        const endSample = Math.min(
          Math.round(endSeconds * decodedAudio.sampleRate),
          monoAudio.length,
        );
        const segment = encodeWav(
          monoAudio.subarray(startSample, endSample),
          decodedAudio.sampleRate,
        );

        onAudioSegment?.(segment, {
          segmentNumber: segmentIndex + 1,
          source: "replay",
          startedAtMs: replayStartedAtMs + startSeconds * 1_000,
          completedAtMs: replayStartedAtMs + endSeconds * 1_000,
        });

        const emittedCount = segmentIndex + 1;
        setEmittedSegments(emittedCount);

        if (emittedCount === segmentCount) {
          timerRef.current = null;
          clearPlayback();
          setStatus("completed");
          return;
        }

        scheduleSegment(segmentIndex + 1);
      };

      const scheduleSegment = (segmentIndex: number) => {
        const segmentEndSeconds = Math.min(
          (segmentIndex + 1) * AUDIO_SEGMENT_DURATION_SECONDS,
          decodedAudio.duration,
        );
        const delayMs = Math.max(
          0,
          replayStartedAtMs + segmentEndSeconds * 1_000 - performance.now(),
        );

        timerRef.current = setTimeout(() => emitSegment(segmentIndex), delayMs);
      };

      scheduleSegment(0);
    } catch (cause) {
      if (sessionIdRef.current !== sessionId) {
        return;
      }

      clearPlayback();
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to decode the selected audio file.",
      );
      setStatus("error");
    }
  }, [clearPlayback, file, onAudioSegment, status]);

  useEffect(() => {
    return () => {
      sessionIdRef.current += 1;
      clearPlayback();
    };
  }, [clearPlayback]);

  return {
    file,
    status,
    error,
    emittedSegments,
    totalSegments,
    preparationMs,
    isReplaying: status === "preparing" || status === "replaying",
    setFile,
    startReplay,
    stopReplay,
    resetReplay,
  };
}

function mixToMono(audio: AudioBuffer): Float32Array {
  if (audio.numberOfChannels === 1) {
    return audio.getChannelData(0).slice();
  }

  const mono = new Float32Array(audio.length);
  for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
    const samples = audio.getChannelData(channel);
    for (let index = 0; index < samples.length; index += 1) {
      mono[index] += samples[index] / audio.numberOfChannels;
    }
  }
  return mono;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataLength, true);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(
      44 + index * bytesPerSample,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    );
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
