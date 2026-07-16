// components/sales-assistant/RecordingControls.tsx

"use client";

// Import the RecordingStatus type so this component knows
// which recording states are possible.
import type { RecordingStatus } from "@/hooks/useAudioRecorder";

// Properties required by the RecordingControls component.
//
// Notice that this component does not contain any recording logic.
// Instead, the parent component provides the current state along
// with callback functions that should be executed when buttons
// are clicked.
type RecordingControlsProps = {
  status: RecordingStatus;
  isRecording: boolean;
  canDownload: boolean;
  canStart: boolean;
  onStart: () => void;
  onStop: () => void;
  onDownload: () => void;
  onReset: () => void;
};

// Renders the recording control buttons.
//
// This component is intentionally "dumb" (presentational). It only
// displays the UI and calls the callback functions supplied by the
// parent component. All recording logic lives inside useAudioRecorder().
export function RecordingControls({
  status,
  isRecording,
  canDownload,
  canStart,
  onStart,
  onStop,
  onDownload,
  onReset,
}: RecordingControlsProps) {

  // Convenience flags used to disable buttons while the recorder
  // is transitioning between states.  
  const isStarting = status === "requesting-permission";
  const isStopping = status === "stopping";

  return (
    <div className="flex flex-wrap items-center gap-3">

      {/* Primary recording button.
          Starts recording when idle and stops recording when active. */}      
      <button
        type="button"
        onClick={isRecording ? onStop : onStart}
        disabled={isStarting || isStopping || (!isRecording && !canStart)}
        className={`rounded-full px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
          isRecording
            ? "bg-red-600 hover:bg-red-700"
            : "bg-zinc-950 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
        }`}
      >
        {!canStart && status === "idle"
          ? "Preparing Whisper..."
          : getPrimaryButtonLabel(status)}
      </button>

      {/* Downloads the completed recording to the user's computer. */}
      <button
        type="button"
        onClick={onDownload}
        disabled={!canDownload}
        className="rounded-full border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Download audio
      </button>

      {/* Clears the current recording and returns the UI to its
          initial state. */}
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

// Returns the appropriate label for the primary recording button
// based on the current recording state.
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
