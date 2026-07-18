import type { ChangeEvent } from "react";
import type { ReplayStatus } from "@/hooks/useAudioReplay";

type ReplayControlsProps = {
  file: File | null;
  status: ReplayStatus;
  error: string | null;
  emittedSegments: number;
  totalSegments: number;
  preparationMs: number | null;
  canStart: boolean;
  onFileChange: (file: File | null) => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
};

export function ReplayControls({
  file,
  status,
  error,
  emittedSegments,
  totalSegments,
  preparationMs,
  canStart,
  onFileChange,
  onStart,
  onStop,
  onReset,
}: ReplayControlsProps) {
  const isActive = status === "preparing" || status === "replaying";

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    onFileChange(event.target.files?.[0] ?? null);
  };

  return (
    <section className="space-y-4">
      <div>
        <label
          htmlFor="replay-audio"
          className="mb-2 block text-sm font-medium text-zinc-800 dark:text-zinc-200"
        >
          Test audio file
        </label>
        <input
          id="replay-audio"
          type="file"
          accept="audio/*,.wav,.mp3,.m4a,.mp4,.webm,.ogg,.flac"
          onChange={handleFileChange}
          disabled={isActive}
          className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 file:mr-4 file:rounded-full file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:font-medium file:text-zinc-800 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:file:bg-zinc-800 dark:file:text-zinc-200"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={isActive ? onStop : onStart}
          disabled={!isActive && (!file || !canStart)}
          className={`rounded-full px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
            isActive
              ? "bg-red-600 hover:bg-red-700"
              : "bg-zinc-950 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
          }`}
        >
          {getReplayButtonLabel(status, canStart)}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={isActive || (status === "idle" && emittedSegments === 0)}
          className="rounded-full px-5 py-3 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Reset results
        </button>
      </div>

      <div className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Replay status: <span className="font-medium">{formatStatus(status)}</span>
          {totalSegments > 0
            ? ` · ${emittedSegments}/${totalSegments} segments injected`
            : ""}
        </p>
        {file ? (
          <p>
            {file.name} · {formatFileSize(file.size)}
            {preparationMs === null
              ? ""
              : ` · prepared in ${formatMilliseconds(preparationMs)}`}
          </p>
        ) : (
          <p>
            Select a prerecorded call. It will play at normal speed and emit the
            same three-second chunks used by the microphone.
          </p>
        )}
        {error ? <p className="text-red-600">{error}</p> : null}
      </div>
    </section>
  );
}

function getReplayButtonLabel(status: ReplayStatus, canStart: boolean) {
  if (!canStart && status === "idle") {
    return "Preparing Whisper...";
  }
  if (status === "preparing") {
    return "Preparing audio...";
  }
  if (status === "replaying") {
    return "Stop replay";
  }
  if (status === "completed") {
    return "Replay again";
  }
  return "Start replay";
}

function formatStatus(status: ReplayStatus) {
  return status.replaceAll("-", " ");
}

function formatFileSize(bytes: number) {
  if (bytes < 1_024 * 1_024) {
    return `${Math.max(1, Math.round(bytes / 1_024))} KB`;
  }
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}

function formatMilliseconds(milliseconds: number) {
  return `${Math.round(milliseconds).toLocaleString()} ms`;
}
