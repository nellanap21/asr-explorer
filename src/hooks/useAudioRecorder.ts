// hooks/useAudioRecorder.ts

"use client";

// React hooks used to manage recorder state, persistent browser objects,
// reusable callback functions, and cleanup when the component unmounts.
import { useCallback, useEffect, useRef, useState } from "react";

// All valid states in the recording lifecycle.
//
// Using a fixed union type prevents arbitrary status strings and makes
// it easier for UI components to respond to each recording state.
export type RecordingStatus =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "stopping"
  | "stopped"
  | "error";

// Optional configuration accepted by the hook.
type UseAudioRecorderOptions = {
  /**
   * Called whenever MediaRecorder produces an audio chunk.
   *
   * This will become important for live transcription because each chunk can
   * be sent to your transcription service before the recording has ended.
   */
  onAudioChunk?: (chunk: Blob) => void;
};

// Defines the values and functions returned by the hook.
//
// Components using this hook can read the current recording state,
// access the completed audio, and control the recording process.
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

// Ask MediaRecorder to produce an audio chunk approximately once per second.
const AUDIO_CHUNK_INTERVAL_MS = 1_000;

// Find the first audio format supported by the current browser.
//
// Browser support differs, so we try the preferred formats in order
// and fall back to the browser’s default format if none are supported.
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

// Custom hook that manages microphone access and browser audio recording.
//
// It hides the MediaRecorder implementation details from the UI and
// exposes a simpler API for starting, stopping, resetting, and reading
// the completed recording.
export function useAudioRecorder({
  onAudioChunk,
}: UseAudioRecorderOptions = {}): UseAudioRecorderReturn {

  // React state used to update the user interface.
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // References store mutable browser objects across renders without
  // causing React to rerender whenever they change.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Stop every microphone track and remove the saved stream reference.
  //
  // This releases the microphone so the browser does not continue showing
  // it as active after recording has stopped.
  const releaseMicrophone = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Remove the temporary browser URL created for the completed recording.
  //
  // Object URLs hold browser memory, so they should be revoked when they
  // are replaced or no longer needed.  
  const clearAudioUrl = useCallback(() => {
    setAudioUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }

      return null;
    });
  }, []);

  // Clear the current recording and return the hook to its initial state.
  const resetRecording = useCallback(() => {
    clearAudioUrl();
    setAudioBlob(null);
    setError(null);
    setStatus("idle");
    chunksRef.current = [];
  }, [clearAudioUrl]);

  // Request microphone access and begin a new recording.
  const startRecording = useCallback(async () => {
    // Remove any error from a previous recording attempt.
    setError(null);

    // Confirm that the browser supports requesting microphone access.
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support microphone recording.");
      setStatus("error");
      return;
    }

    // Confirm that the browser supports the MediaRecorder API.
    if (typeof MediaRecorder === "undefined") {
      setError("This browser does not support the MediaRecorder API.");
      setStatus("error");
      return;
    }

    try {
      // Let the UI know that the browser may be showing a permission prompt.
      setStatus("requesting-permission");

      // Request an audio-only microphone stream.
      //
      // These browser processing options can improve speech clarity,
      // although exact behavior varies by browser and device.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      
      // Store the stream so it can be stopped later. 
      streamRef.current = stream;

      // Select the best recording format supported by this browser.
      const mimeType = getSupportedMimeType();

      // Create a recorder connected to the microphone stream.
      //
      // If no preferred MIME type is supported, allow the browser to
      // choose its default recording format.
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      // Save the recorder instance and clear chunks from older recordings.
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      // Remove any previous recording before beginning a new one.
      clearAudioUrl();
      setAudioBlob(null);

      // MediaRecorder calls this handler whenever another audio chunk
      // becomes available.
      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) {
          return;
        }

        // Save the chunk so the complete recording can be assembled later.
        chunksRef.current.push(event.data);
        // Also pass the chunk to the optional consumer.
        // This is the integration point for live transcription.          
        onAudioChunk?.(event.data);
      };

      // Handle errors raised by the MediaRecorder after it has started.    
      recorder.onerror = () => {
        setError("An error occurred while recording audio.");
        setStatus("error");
        releaseMicrophone();
      };
      // Run after recorder.stop() has finished processing the recording.      
      recorder.onstop = () => {
        // Combine every recorded chunk into one complete audio Blob.        
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        // Create a temporary browser URL that can be used by an
        // <audio> element or a download link.
        const url = URL.createObjectURL(blob);
        // Save the finished recording and update the UI state.
        setAudioBlob(blob);
        setAudioUrl(url);
        setStatus("stopped");
        // Clear the recorder reference and release the microphone.
        mediaRecorderRef.current = null;
        releaseMicrophone();
      };

      /*
       * Passing a timeslice causes ondataavailable to run approximately once
       * per second instead of only when recording stops.
       */
      recorder.start(AUDIO_CHUNK_INTERVAL_MS);
      // Recording has successfully begun.
      setStatus("recording");
    } catch (cause) {
      // Provide a clearer message when the user explicitly denies access.
      // Otherwise, use the browser's error message when one is available.      
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
  // Stop the active recorder.
  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    // Do nothing if there is no recorder or it has already stopped.
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    // Show an intermediate state while MediaRecorder finishes processing
    // the remaining audio and runs its onstop handler.
    setStatus("stopping");
    recorder.stop();
  }, []);

  // Clean up browser resources when the component using this hook unmounts
  // or when the current audio URL changes.
  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      // Stop an active recording before the component disappears.
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      // Always release microphone access.
      releaseMicrophone();
      // Release memory used by the temporary playback URL.
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl, releaseMicrophone]);
  // Expose recording state and control functions to the component
  // that called this hook.
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