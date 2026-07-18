"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecordingStatus =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "stopping"
  | "stopped"
  | "error";

export type AudioSegmentMetadata = {
  segmentNumber: number;
  startedAtMs: number;
  completedAtMs: number;
};

type UseAudioRecorderOptions = {
  onAudioSegment?: (
    segment: Blob,
    metadata: AudioSegmentMetadata,
  ) => void;
};

type UseAudioRecorderReturn = {
  status: RecordingStatus;
  isRecording: boolean;
  audioBlob: Blob | null;
  audioUrl: string | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  resetRecording: () => void;
};

// Each transcription segment is its own container, so every Blob includes the
// WebM/MP4 initialization data required by the browser audio decoder.
const AUDIO_SEGMENT_DURATION_MS = 3_000;

function getSupportedMimeType(): string | undefined {
  const preferredMimeTypes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];

  return preferredMimeTypes.find((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType),
  );
}

function createMediaRecorder(
  stream: MediaStream,
  mimeType: string | undefined,
): MediaRecorder {
  return mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);
}

export function useAudioRecorder({
  onAudioSegment,
}: UseAudioRecorderOptions = {}): UseAudioRecorderReturn {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // One recorder captures the complete conversation. A second recorder is
  // restarted every three seconds to produce independently decodable segments.
  const archiveRecorderRef = useRef<MediaRecorder | null>(null);
  const segmentRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const archiveChunksRef = useRef<Blob[]>([]);
  const segmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef(0);
  const audioUrlRef = useRef<string | null>(null);

  const releaseMicrophone = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearSegmentTimer = useCallback(() => {
    if (segmentTimerRef.current) {
      clearTimeout(segmentTimerRef.current);
      segmentTimerRef.current = null;
    }
  }, []);

  const clearAudioUrl = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setAudioUrl(null);
  }, []);

  const resetRecording = useCallback(() => {
    clearAudioUrl();
    setAudioBlob(null);
    setError(null);
    setStatus("idle");
    archiveChunksRef.current = [];
  }, [clearAudioUrl]);

  const startRecording = useCallback(async () => {
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support microphone recording.");
      setStatus("error");
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      setError("This browser does not support the MediaRecorder API.");
      setStatus("error");
      return;
    }

    const sessionId = sessionIdRef.current + 1;
    sessionIdRef.current = sessionId;

    try {
      setStatus("requesting-permission");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Permission prompts can outlive the component or be superseded by a
      // newer start request. Do not activate a stale microphone stream.
      if (sessionIdRef.current !== sessionId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const mimeType = getSupportedMimeType();
      streamRef.current = stream;
      archiveChunksRef.current = [];

      clearAudioUrl();
      setAudioBlob(null);

      const archiveRecorder = createMediaRecorder(stream, mimeType);
      archiveRecorderRef.current = archiveRecorder;

      archiveRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          archiveChunksRef.current.push(event.data);
        }
      };

      archiveRecorder.onerror = () => {
        setError("An error occurred while recording audio.");
        setStatus("error");
        clearSegmentTimer();

        const segmentRecorder = segmentRecorderRef.current;
        if (segmentRecorder?.state === "recording") {
          segmentRecorder.stop();
        }
        if (archiveRecorder.state === "recording") {
          archiveRecorder.stop();
        }
      };

      archiveRecorder.onstop = () => {
        if (sessionIdRef.current !== sessionId) {
          return;
        }

        const blob = new Blob(archiveChunksRef.current, {
          type: archiveRecorder.mimeType || "audio/webm",
        });
        const url = URL.createObjectURL(blob);

        audioUrlRef.current = url;
        setAudioBlob(blob);
        setAudioUrl(url);
        setStatus((currentStatus) =>
          currentStatus === "error" ? "error" : "stopped",
        );
        archiveRecorderRef.current = null;

        if (!segmentRecorderRef.current) {
          releaseMicrophone();
        }
      };

      const startSegment = (segmentNumber: number) => {
        if (
          sessionIdRef.current !== sessionId ||
          archiveRecorderRef.current?.state !== "recording"
        ) {
          return;
        }

        const segmentRecorder = createMediaRecorder(stream, mimeType);
        const chunks: Blob[] = [];
        const startedAtMs = performance.now();
        segmentRecorderRef.current = segmentRecorder;

        segmentRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        segmentRecorder.onerror = () => {
          setError("An error occurred while recording a transcription segment.");
          setStatus("error");
          clearSegmentTimer();

          if (archiveRecorderRef.current?.state === "recording") {
            archiveRecorderRef.current.stop();
          }
          if (segmentRecorder.state === "recording") {
            segmentRecorder.stop();
          }
        };

        segmentRecorder.onstop = () => {
          clearSegmentTimer();

          if (segmentRecorderRef.current === segmentRecorder) {
            segmentRecorderRef.current = null;
          }

          if (sessionIdRef.current !== sessionId) {
            return;
          }

          const completedAtMs = performance.now();
          const segment = new Blob(chunks, {
            type: segmentRecorder.mimeType || "audio/webm",
          });

          if (segment.size > 0) {
            onAudioSegment?.(segment, {
              segmentNumber,
              startedAtMs,
              completedAtMs,
            });
          }

          if (archiveRecorderRef.current?.state === "recording") {
            startSegment(segmentNumber + 1);
          } else if (!archiveRecorderRef.current) {
            releaseMicrophone();
          }
        };

        segmentRecorder.start();
        segmentTimerRef.current = setTimeout(() => {
          if (segmentRecorder.state === "recording") {
            segmentRecorder.stop();
          }
        }, AUDIO_SEGMENT_DURATION_MS);
      };

      archiveRecorder.start();
      startSegment(1);
      setStatus("recording");
    } catch (cause) {
      if (sessionIdRef.current !== sessionId) {
        return;
      }

      const message =
        cause instanceof DOMException && cause.name === "NotAllowedError"
          ? "Microphone permission was denied."
          : cause instanceof Error
            ? cause.message
            : "Unable to start microphone recording.";

      setError(message);
      setStatus("error");
      clearSegmentTimer();

      if (segmentRecorderRef.current?.state === "recording") {
        segmentRecorderRef.current.stop();
      }
      if (archiveRecorderRef.current?.state === "recording") {
        archiveRecorderRef.current.stop();
      }

      releaseMicrophone();
    }
  }, [clearAudioUrl, clearSegmentTimer, onAudioSegment, releaseMicrophone]);

  const stopRecording = useCallback(() => {
    const archiveRecorder = archiveRecorderRef.current;
    const segmentRecorder = segmentRecorderRef.current;

    if (!archiveRecorder || archiveRecorder.state === "inactive") {
      return;
    }

    setStatus("stopping");
    clearSegmentTimer();

    // Stop the archive first. Its state changes synchronously, preventing the
    // segment onstop handler from starting another segment.
    archiveRecorder.stop();
    if (segmentRecorder?.state === "recording") {
      segmentRecorder.stop();
    }
  }, [clearSegmentTimer]);

  useEffect(() => {
    return () => {
      sessionIdRef.current += 1;
      clearSegmentTimer();

      if (segmentRecorderRef.current?.state === "recording") {
        segmentRecorderRef.current.stop();
      }
      if (archiveRecorderRef.current?.state === "recording") {
        archiveRecorderRef.current.stop();
      }

      releaseMicrophone();
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, [clearSegmentTimer, releaseMicrophone]);

  return {
    status,
    isRecording: status === "recording",
    audioBlob,
    audioUrl,
    error,
    startRecording,
    stopRecording,
    resetRecording,
  };
}
