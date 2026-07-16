// components/sales-assistant/SalesAssistant.tsx

"use client";

// React hook used to memoize callback functions.
import { useCallback } from "react";

// Custom hook that encapsulates all microphone recording logic.
// It manages MediaRecorder, recording state, and audio generation.
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useLiveTranscription } from "@/hooks/useLiveTranscription";

// UI components used by the sales assistant.
import { AudioPreview } from "./AudioPreview";
import { RecordingControls } from "./RecordingControls";
import { LiveTranscript } from "./LiveTranscript";

// Main client-side component for the Sales AI assistant.
//
// This component coordinates the recording workflow by:
// 1. Receiving recording state from the custom hook.
// 2. Passing callbacks to the UI components.
// 3. Handling future integration with live transcription.
//
// Notice that this component contains very little recording logic.
// The browser APIs live inside useAudioRecorder(), while this file
// focuses on connecting state to the user interface.
export function SalesAssistant() {

  // Initialize the live transcription hook.
  // This hook loads Whisper, accepts audio chunks from the recorder,
  // and continuously updates the transcript.  
  const {
    transcript,
    status: transcriptionStatus,
    modelProgress,
    error: transcriptionError,
    addAudioChunk,
    resetTranscript,
  } = useLiveTranscription();

  // Add each recorder chunk to the rolling audio used by Whisper.
  //
  // useCallback memoizes this function so React doesn't recreate it
  // on every render. This prevents unnecessary updates to the
  // useAudioRecorder hook.  
  const handleAudioChunk = useCallback(
    (chunk: Blob) => {
      addAudioChunk(chunk);
    },
    [addAudioChunk],
  );

  // Start the audio recorder and receive the current recording state.
  // The hook owns all browser-specific microphone logic while exposing
  // a simple API for this component to use.
  const {
    status,
    isRecording,
    audioUrl,
    error,
    startRecording,
    stopRecording,
    resetRecording,
  } = useAudioRecorder({
    // Every second, the recorder passes a new audio chunk here.
    // Those chunks are immediately forwarded to the transcription hook.    
    onAudioChunk: handleAudioChunk,
  });

  // Download the completed recording as a WebM audio file.
  const downloadRecording = () => {
    if (!audioUrl) {
      return;
    }
    // Create a temporary download link and simulate a click.
    // Since the recording already exists as a Blob URL, no server
    // request is required.    
    const link = document.createElement("a");
    link.href = audioUrl;
    link.download = `conversation-${Date.now()}.webm`;
    link.click();
  };

  // Reset both the recording and transcript so the next session
  // starts with a clean slate.  
  const reset = () => {
    resetRecording();
    resetTranscript();
  };

  // Before starting a new recording, clear any previous transcript.
  // The "void" keyword intentionally ignores the Promise returned by
  // startRecording() because the UI doesn't need to await it.
  const start = () => {
    resetTranscript();
    void startRecording();
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      {/* Recording buttons (Start, Stop, Download, Reset) */}      
      <RecordingControls
        status={status}
        isRecording={isRecording}
        canDownload={Boolean(audioUrl)}
        canStart={transcriptionStatus === "ready"}
        onStart={start}
        onStop={stopRecording}
        onDownload={downloadRecording}
        onReset={reset}
      />
      {/* Display the current recording status and any errors */}
      <div className="mt-6 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Status:{" "}
          <span className="font-medium text-zinc-950 dark:text-zinc-50">
            {formatStatus(status)}
          </span>
        </p>
        {/* Display recording errors */}
        {error ? <p className="text-red-600">{error}</p> : null}

        {/* Initial instructions shown before recording begins */}
        {!error && status === "idle" ? (
          <p>Allow microphone access when prompted to begin.</p>
        ) : null}
      </div>

      {/* Continuously display Whisper's transcript while recording. */}      
      <LiveTranscript
        transcript={transcript}
        status={transcriptionStatus}
        modelProgress={modelProgress}
        error={transcriptionError}
      />
      
      {/* Audio player shown after recording has completed */}
      <div className="mt-8">
        <AudioPreview audioUrl={audioUrl} />
      </div>
    </section>
  );
}

// Convert internal status strings (e.g. "requesting-permission")
// into a more readable format for display in the UI.
function formatStatus(status: string): string {
  return status.replaceAll("-", " ");
}
