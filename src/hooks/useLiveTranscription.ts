"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioSegmentMetadata } from "./useAudioRecorder";

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
  jobId?: number;
  inferenceMs?: number;
  progress?: {
    status?: string;
    file?: string;
    progress?: number;
  };
};

export type TranscriptionLatency = {
  totalMs: number;
  queueAndDecodeMs: number;
  inferenceMs: number;
  renderMs: number;
  measuredAt: number;
};

type QueuedSegment = {
  id: number;
  blob: Blob;
  completedAtMs: number;
  sessionId: number;
};

type TranscriptionJob = {
  completedAtMs: number;
  workerSentAtMs: number;
  sessionId: number;
};

const WHISPER_SAMPLE_RATE = 16_000;

export function useLiveTranscription() {
  const [transcriptSegments, setTranscriptSegments] = useState<string[]>([]);
  const [status, setStatus] = useState<TranscriptionStatus>("loading-model");
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<TranscriptionLatency | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const segmentQueueRef = useRef<QueuedSegment[]>([]);
  const nextSegmentIdRef = useRef(1);
  const sessionIdRef = useRef(1);
  const jobsRef = useRef(new Map<number, TranscriptionJob>());
  const paintFrameRef = useRef<number | null>(null);
  const isBusyRef = useRef(false);
  const isModelReadyRef = useRef(false);

  const transcript = transcriptSegments.join(" ");

  const processNextSegment = useCallback(async () => {
    if (!workerRef.current || isBusyRef.current) {
      return;
    }

    // A decode failure should discard only that segment, not permanently block
    // every later segment in the queue.
    while (segmentQueueRef.current.length > 0) {
      const segment = segmentQueueRef.current.shift();
      if (!segment || segment.sessionId !== sessionIdRef.current) {
        continue;
      }

      isBusyRef.current = true;

      try {
        const audio = await decodeAudio(segment.blob);

        // The user may have reset while decodeAudio was in progress.
        if (segment.sessionId !== sessionIdRef.current) {
          isBusyRef.current = false;
          continue;
        }

        const workerSentAtMs = performance.now();
        jobsRef.current.set(segment.id, {
          completedAtMs: segment.completedAtMs,
          workerSentAtMs,
          sessionId: segment.sessionId,
        });
        setError(null);

        workerRef.current.postMessage(
          { type: "transcribe", audio, jobId: segment.id },
          { transfer: [audio.buffer] },
        );
        return;
      } catch (cause) {
        jobsRef.current.delete(segment.id);
        isBusyRef.current = false;

        if (segment.sessionId === sessionIdRef.current) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to decode the audio segment.",
          );
          setStatus("error");
        }
      }
    }
  }, []);

  useEffect(() => {
    const jobs = jobsRef.current;
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
        const jobId = message.jobId;
        const job = jobId === undefined ? undefined : jobs.get(jobId);

        if (jobId !== undefined) {
          jobs.delete(jobId);
        }
        isBusyRef.current = false;
        setStatus("ready");

        // Ignore a late result from a recording that has since been reset.
        if (job && job.sessionId === sessionIdRef.current) {
          const segmentText = message.text?.trim();
          if (segmentText) {
            setTranscriptSegments((current) => [...current, segmentText]);
          }

          const resultReceivedAtMs = performance.now();

          paintFrameRef.current = requestAnimationFrame(() => {
            const paintedAtMs = performance.now();
            const measurement = {
              totalMs: paintedAtMs - job.completedAtMs,
              queueAndDecodeMs: job.workerSentAtMs - job.completedAtMs,
              inferenceMs:
                message.inferenceMs ?? resultReceivedAtMs - job.workerSentAtMs,
              renderMs: paintedAtMs - resultReceivedAtMs,
              measuredAt: Date.now(),
            };

            setLatency(measurement);
            console.table({
              "transcription latency (ms)": {
                total: Math.round(measurement.totalMs),
                queueAndDecode: Math.round(measurement.queueAndDecodeMs),
                inference: Math.round(measurement.inferenceMs),
                render: Math.round(measurement.renderMs),
              },
            });
          });
        }

        void processNextSegment();
      } else if (message.type === "error") {
        const job =
          message.jobId === undefined ? undefined : jobs.get(message.jobId);

        if (message.jobId !== undefined) {
          jobs.delete(message.jobId);
        }
        isModelReadyRef.current = false;
        isBusyRef.current = false;

        if (!job || job.sessionId === sessionIdRef.current) {
          setError(message.message ?? "Transcription failed.");
          setStatus("error");
        } else {
          // A reset invalidated this job, so silently restore the model for the
          // current session instead of surfacing the old recording's error.
          worker.postMessage({ type: "load" });
        }

        void processNextSegment();
      }
    };

    worker.onerror = () => {
      isModelReadyRef.current = false;
      isBusyRef.current = false;
      setError("The Whisper transcription worker stopped unexpectedly.");
      setStatus("error");
    };

    worker.postMessage({ type: "load" });

    return () => {
      worker.terminate();
      workerRef.current = null;
      segmentQueueRef.current = [];
      jobs.clear();

      if (paintFrameRef.current !== null) {
        cancelAnimationFrame(paintFrameRef.current);
      }
    };
  }, [processNextSegment]);

  const addAudioSegment = useCallback(
    (segment: Blob, metadata: AudioSegmentMetadata) => {
      segmentQueueRef.current.push({
        id: nextSegmentIdRef.current,
        blob: segment,
        completedAtMs: metadata.completedAtMs,
        sessionId: sessionIdRef.current,
      });
      nextSegmentIdRef.current += 1;

      void processNextSegment();
    },
    [processNextSegment],
  );

  const resetTranscript = useCallback(() => {
    sessionIdRef.current += 1;
    segmentQueueRef.current = [];

    if (paintFrameRef.current !== null) {
      cancelAnimationFrame(paintFrameRef.current);
      paintFrameRef.current = null;
    }

    setTranscriptSegments([]);
    setLatency(null);
    setStatus(isModelReadyRef.current ? "ready" : "loading-model");
    setModelProgress(null);
    setError(null);
  }, []);

  return {
    transcript,
    status,
    modelProgress,
    error,
    latency,
    addAudioSegment,
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
