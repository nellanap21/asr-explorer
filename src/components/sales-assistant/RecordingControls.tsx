// components/sales-assistant/RecordingControls.tsx

"use client";

import type { RecordingStatus } from "@/hooks/useAudioRecorder";

type RecordingControlsProps = {
  status: RecordingStatus;
  isRecording: boolean;
  canDownload: boolean;
  onStart: () => void;
  onStop: () => void;
  onDownload: () => void;
  onReset: () => void;
};

export function RecordingControls({
  status,
  isRecording,
  canDownload,
  onStart,
  onStop,
  onDownload,
  onReset,
}: RecordingControlsProps) {
  const isStarting = status === "requesting-permission";
  const isStopping = status === "stopping";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={isRecording ? onStop : onStart}
        disabled={isStarting || isStopping}
        className={`rounded-full px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
          isRecording
            ? "bg-red-600 hover:bg-red-700"
            : "bg-zinc-950 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
        }`}
      >
        {getPrimaryButtonLabel(status)}
      </button>

      <button
        type="button"
        onClick={onDownload}
        disabled={!canDownload}
        className="rounded-full border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Download audio
      </button>

      <button
        type="button"
        onClick={onReset}
        disabled={isRecording || status === "idle"}
        className="rounded-full px-5 py-3 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Reset
      </button>
    </div>
  );
}

function getPrimaryButtonLabel(status: RecordingStatus): string {
  switch (status) {
    case "requesting-permission":
      return "Requesting access...";
    case "recording":
      return "Stop recording";
    case "stopping":
      return "Stopping...";
    default:
      return "Start recording";
  }
}