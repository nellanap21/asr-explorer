// hooks/useAudioRecorder.ts

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecordingStatus =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "stopping"
  | "stopped"
  | "error";

type UseAudioRecorderOptions = {
  /**
   * Called whenever MediaRecorder produces an audio chunk.
   *
   * This will become important for live transcription because each chunk can
   * be sent to your transcription service before the recording has ended.
   */
  onAudioChunk?: (chunk: Blob) => void;
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

const AUDIO_CHUNK_INTERVAL_MS = 1_000;

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

export function useAudioRecorder({
  onAudioChunk,
}: UseAudioRecorderOptions = {}): UseAudioRecorderReturn {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const releaseMicrophone = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearAudioUrl = useCallback(() => {
    setAudioUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }

      return null;
    });
  }, []);

  const resetRecording = useCallback(() => {
    clearAudioUrl();
    setAudioBlob(null);
    setError(null);
    setStatus("idle");
    chunksRef.current = [];
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

    try {
      setStatus("requesting-permission");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      const mimeType = getSupportedMimeType();

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      clearAudioUrl();
      setAudioBlob(null);

      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) {
          return;
        }

        chunksRef.current.push(event.data);
        onAudioChunk?.(event.data);
      };

      recorder.onerror = () => {
        setError("An error occurred while recording audio.");
        setStatus("error");
        releaseMicrophone();
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        const url = URL.createObjectURL(blob);

        setAudioBlob(blob);
        setAudioUrl(url);
        setStatus("stopped");

        mediaRecorderRef.current = null;
        releaseMicrophone();
      };

      /*
       * Passing a timeslice causes ondataavailable to run approximately once
       * per second instead of only when recording stops.
       */
      recorder.start(AUDIO_CHUNK_INTERVAL_MS);

      setStatus("recording");
    } catch (cause) {
      const message =
        cause instanceof DOMException && cause.name === "NotAllowedError"
          ? "Microphone permission was denied."
          : cause instanceof Error
            ? cause.message
            : "Unable to start microphone recording.";

      setError(message);
      setStatus("error");
      releaseMicrophone();
    }
  }, [clearAudioUrl, onAudioChunk, releaseMicrophone]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state === "inactive") {
      return;
    }

    setStatus("stopping");
    recorder.stop();
  }, []);

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;

      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }

      releaseMicrophone();

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl, releaseMicrophone]);

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