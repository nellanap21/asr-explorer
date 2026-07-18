"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  summarizeBenchmark,
  type TranscriptionBenchmarkSample,
} from "@/lib/transcriptionBenchmark";
import type { AudioSegmentMetadata } from "@/types/audio";

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
  enqueueMs: number;
  queueMs: number;
  decodeMs: number;
  workerWaitMs: number;
  inferenceMs: number;
  deliveryMs: number;
  renderMs: number;
  measuredAt: number;
};

type QueuedSegment = {
  id: number;
  blob: Blob;
  metadata: AudioSegmentMetadata;
  enqueuedAtMs: number;
  sessionId: number;
};

type TranscriptionJob = {
  metadata: AudioSegmentMetadata;
  enqueuedAtMs: number;
  decodeStartedAtMs: number;
  decodeCompletedAtMs: number;
  workerSentAtMs: number;
  workerStartedAtMs?: number;
  sessionId: number;
};

const WHISPER_SAMPLE_RATE = 16_000;

export function useLiveTranscription() {
  const [transcriptSegments, setTranscriptSegments] = useState<string[]>([]);
  const [status, setStatus] = useState<TranscriptionStatus>("loading-model");
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<TranscriptionLatency | null>(null);
  const [benchmarkSamples, setBenchmarkSamples] = useState<
    TranscriptionBenchmarkSample[]
  >([]);

  const workerRef = useRef<Worker | null>(null);
  const segmentQueueRef = useRef<QueuedSegment[]>([]);
  const nextSegmentIdRef = useRef(1);
  const sessionIdRef = useRef(1);
  const jobsRef = useRef(new Map<number, TranscriptionJob>());
  const paintFrameRef = useRef<number | null>(null);
  const isBusyRef = useRef(false);
  const isModelReadyRef = useRef(false);

  const transcript = transcriptSegments.join(" ");
  const benchmarkSummary = useMemo(
    () => summarizeBenchmark(benchmarkSamples),
    [benchmarkSamples],
  );

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
        const decodeStartedAtMs = performance.now();
        const audio = await decodeAudio(segment.blob);
        const decodeCompletedAtMs = performance.now();

        // The user may have reset while decodeAudio was in progress.
        if (segment.sessionId !== sessionIdRef.current) {
          isBusyRef.current = false;
          continue;
        }

        const workerSentAtMs = performance.now();
        jobsRef.current.set(segment.id, {
          metadata: segment.metadata,
          enqueuedAtMs: segment.enqueuedAtMs,
          decodeStartedAtMs,
          decodeCompletedAtMs,
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
        if (message.jobId !== undefined) {
          const job = jobs.get(message.jobId);
          if (job) {
            job.workerStartedAtMs = performance.now();
          }
        }
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
            paintFrameRef.current = requestAnimationFrame(() => {
                const renderedAtMs = performance.now();
                const workerStartedAtMs =
                  job.workerStartedAtMs ?? job.workerSentAtMs;
                const inferenceMs =
                  message.inferenceMs ?? resultReceivedAtMs - workerStartedAtMs;
                const sample: TranscriptionBenchmarkSample = {
                  segmentNumber: job.metadata.segmentNumber,
                  source: job.metadata.source,
                  measuredAt: Date.now(),
                  timestamps: {
                    sourceStartedAtMs: job.metadata.startedAtMs,
                    sourceCompletedAtMs: job.metadata.completedAtMs,
                    enqueuedAtMs: job.enqueuedAtMs,
                    decodeStartedAtMs: job.decodeStartedAtMs,
                    decodeCompletedAtMs: job.decodeCompletedAtMs,
                    workerSentAtMs: job.workerSentAtMs,
                    workerStartedAtMs,
                    resultReceivedAtMs,
                    renderedAtMs,
                  },
                  sourceDurationMs:
                    job.metadata.completedAtMs - job.metadata.startedAtMs,
                  totalMs: renderedAtMs - job.metadata.completedAtMs,
                  enqueueMs: Math.max(
                    0,
                    job.enqueuedAtMs - job.metadata.completedAtMs,
                  ),
                  queueMs: Math.max(
                    0,
                    job.decodeStartedAtMs - job.enqueuedAtMs,
                  ),
                  decodeMs:
                    job.decodeCompletedAtMs - job.decodeStartedAtMs,
                  workerWaitMs: Math.max(
                    0,
                    workerStartedAtMs - job.workerSentAtMs,
                  ),
                  inferenceMs,
                  deliveryMs: Math.max(
                    0,
                    resultReceivedAtMs - workerStartedAtMs - inferenceMs,
                  ),
                  renderMs: renderedAtMs - resultReceivedAtMs,
                };
                const measurement: TranscriptionLatency = {
                  totalMs: sample.totalMs,
                  enqueueMs: sample.enqueueMs,
                  queueMs: sample.queueMs,
                  decodeMs: sample.decodeMs,
                  workerWaitMs: sample.workerWaitMs,
                  inferenceMs: sample.inferenceMs,
                  deliveryMs: sample.deliveryMs,
                  renderMs: sample.renderMs,
                  measuredAt: sample.measuredAt,
                };

                paintFrameRef.current = null;
                setLatency(measurement);
                setBenchmarkSamples((current) => [...current, sample]);
                console.table({
                  [`segment ${sample.segmentNumber} latency (ms)`]: {
                    total: Math.round(sample.totalMs),
                    enqueue: Math.round(sample.enqueueMs),
                    queue: Math.round(sample.queueMs),
                    decode: Math.round(sample.decodeMs),
                    workerWait: Math.round(sample.workerWaitMs),
                    inference: Math.round(sample.inferenceMs),
                    delivery: Math.round(sample.deliveryMs),
                    render: Math.round(sample.renderMs),
                  },
                });
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
      const enqueuedAtMs = performance.now();
      segmentQueueRef.current.push({
        id: nextSegmentIdRef.current,
        blob: segment,
        metadata,
        enqueuedAtMs,
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
    setBenchmarkSamples([]);
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
    benchmarkSamples,
    benchmarkSummary,
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
