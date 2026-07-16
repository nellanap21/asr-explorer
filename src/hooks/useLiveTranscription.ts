"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TranscriptionStatus =
  | "idle"
  | "loading-model"
  | "transcribing"
  | "ready"
  | "error";

type WorkerMessage = {
  type: "loading" | "progress" | "ready" | "transcribing" | "result" | "error";
  text?: string;
  message?: string;
  progress?: {
    status?: string;
    file?: string;
    progress?: number;
  };
};

const TRANSCRIPTION_DELAY_MS = 2_500;
const WHISPER_SAMPLE_RATE = 16_000;

export function useLiveTranscription() {
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState<TranscriptionStatus>("loading-model");
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBusyRef = useRef(false);
  const hasPendingAudioRef = useRef(false);
  const isModelReadyRef = useRef(false);
  const mimeTypeRef = useRef("audio/webm");

  const transcribeCurrentAudio = useCallback(async () => {
    if (!workerRef.current || chunksRef.current.length === 0) {
      return;
    }

    if (isBusyRef.current) {
      hasPendingAudioRef.current = true;
      return;
    }

    isBusyRef.current = true;
    hasPendingAudioRef.current = false;

    try {
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      const audio = await decodeAudio(blob);
      workerRef.current.postMessage(
        { type: "transcribe", audio },
        { transfer: [audio.buffer] },
      );
    } catch (cause) {
      isBusyRef.current = false;
      setError(
        cause instanceof Error ? cause.message : "Unable to decode microphone audio.",
      );
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/whisper.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;

      if (message.type === "loading") {
        setStatus("loading-model");
      } else if (message.type === "progress") {
        const progress = message.progress?.progress;
        if (typeof progress === "number") {
          setModelProgress(Math.round(progress));
        }
      } else if (message.type === "ready") {
        isModelReadyRef.current = true;
        setModelProgress(null);
        setStatus("ready");
      } else if (message.type === "transcribing") {
        setModelProgress(null);
        setStatus("transcribing");
      } else if (message.type === "result") {
        setTranscript(message.text ?? "");
        setStatus("ready");
        isBusyRef.current = false;

        if (hasPendingAudioRef.current) {
          void transcribeCurrentAudio();
        }
      } else if (message.type === "error") {
        isModelReadyRef.current = false;
        setError(message.message ?? "Transcription failed.");
        setStatus("error");
        isBusyRef.current = false;
      }
    };

    worker.onerror = () => {
      isModelReadyRef.current = false;
      setError("The Whisper transcription worker stopped unexpectedly.");
      setStatus("error");
      isBusyRef.current = false;
    };

    worker.postMessage({ type: "load" });

    return () => {
      worker.terminate();
      workerRef.current = null;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [transcribeCurrentAudio]);

  const addAudioChunk = useCallback(
    (chunk: Blob) => {
      chunksRef.current.push(chunk);
      mimeTypeRef.current = chunk.type || mimeTypeRef.current;
      hasPendingAudioRef.current = true;

      if (!timerRef.current) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          void transcribeCurrentAudio();
        }, TRANSCRIPTION_DELAY_MS);
      }
    },
    [transcribeCurrentAudio],
  );

  const resetTranscript = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    chunksRef.current = [];
    hasPendingAudioRef.current = false;
    setTranscript("");
    setStatus(isModelReadyRef.current ? "ready" : "loading-model");
    setModelProgress(null);
    setError(null);
  }, []);

  return {
    transcript,
    status,
    modelProgress,
    error,
    addAudioChunk,
    resetTranscript,
  };
}

async function decodeAudio(blob: Blob): Promise<Float32Array> {
  const context = new AudioContext();

  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const mono = mixToMono(decoded);
    return resample(mono, decoded.sampleRate, WHISPER_SAMPLE_RATE);
  } finally {
    await context.close();
  }
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

function resample(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (inputRate === outputRate) {
    return input;
  }

  const outputLength = Math.round((input.length * outputRate) / inputRate);
  const output = new Float32Array(outputLength);
  const ratio = inputRate / outputRate;

  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const weight = position - left;
    output[index] = input[left] * (1 - weight) + input[right] * weight;
  }
  return output;
}
