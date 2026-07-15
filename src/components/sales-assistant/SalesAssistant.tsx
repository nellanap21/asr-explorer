// components/sales-assistant/SalesAssistant.tsx

"use client";

// React hook used to memoize callback functions.
import { useCallback } from "react";

// Custom hook that encapsulates all microphone recording logic.
// It manages MediaRecorder, recording state, and audio generation.
import { useAudioRecorder } from "@/hooks/useAudioRecorder";

// UI components used by the sales assistant.
import { AudioPreview } from "./AudioPreview";
import { RecordingControls } from "./RecordingControls";

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

  // Callback executed whenever the recorder produces another chunk
  // of audio. Currently we simply log the chunk information.
  //
  // Later this callback will stream each chunk to a transcription
  // service (OpenAI, Deepgram, AssemblyAI, etc.) for real-time
  // speech recognition.  
  const handleAudioChunk = useCallback((chunk: Blob) => {
    console.log("Audio chunk ready:", {
      size: chunk.size,
      type: chunk.type,
    });

    /*
     * Later:
     *
     * transcription.sendChunk(chunk);
     */
  }, []);

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
    onAudioChunk: handleAudioChunk,
  });

  // Download the completed recording as a WebM audio file.
  const downloadRecording = () => {
    if (!audioUrl) {
      return;
    }
    // Create a temporary download link and simulate a click.
    const link = document.createElement("a");
    link.href = audioUrl;
    link.download = `conversation-${Date.now()}.webm`;
    link.click();
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      {/* Recording buttons (Start, Stop, Download, Reset) */}      
      <RecordingControls
        status={status}
        isRecording={isRecording}
        canDownload={Boolean(audioUrl)}
        onStart={() => void startRecording()}
        onStop={stopRecording}
        onDownload={downloadRecording}
        onReset={resetRecording}
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