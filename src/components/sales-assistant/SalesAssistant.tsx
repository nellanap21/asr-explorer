// components/sales-assistant/SalesAssistant.tsx

"use client";

import { useCallback } from "react";

import { useAudioRecorder } from "@/hooks/useAudioRecorder";

import { AudioPreview } from "./AudioPreview";
import { RecordingControls } from "./RecordingControls";

export function SalesAssistant() {
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

  const downloadRecording = () => {
    if (!audioUrl) {
      return;
    }

    const link = document.createElement("a");
    link.href = audioUrl;
    link.download = `conversation-${Date.now()}.webm`;
    link.click();
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <RecordingControls
        status={status}
        isRecording={isRecording}
        canDownload={Boolean(audioUrl)}
        onStart={() => void startRecording()}
        onStop={stopRecording}
        onDownload={downloadRecording}
        onReset={resetRecording}
      />

      <div className="mt-6 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Status:{" "}
          <span className="font-medium text-zinc-950 dark:text-zinc-50">
            {formatStatus(status)}
          </span>
        </p>

        {error ? <p className="text-red-600">{error}</p> : null}

        {!error && status === "idle" ? (
          <p>Allow microphone access when prompted to begin.</p>
        ) : null}
      </div>

      <div className="mt-8">
        <AudioPreview audioUrl={audioUrl} />
      </div>
    </section>
  );
}

function formatStatus(status: string): string {
  return status.replaceAll("-", " ");
}