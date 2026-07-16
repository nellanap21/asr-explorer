import type { TranscriptionStatus } from "@/hooks/useLiveTranscription";

type LiveTranscriptProps = {
  transcript: string;
  status: TranscriptionStatus;
  modelProgress: number | null;
  error: string | null;
};

export function LiveTranscript({
  transcript,
  status,
  modelProgress,
  error,
}: LiveTranscriptProps) {
  return (
    <section className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-semibold text-zinc-950 dark:text-zinc-50">
          Live transcript
        </h2>
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {formatTranscriptionStatus(status, modelProgress)}
        </span>
      </div>

      {status === "loading-model" ? (
        <p className="mt-3 text-sm text-zinc-500">
          Whisper is loading before recording begins. The model is downloaded
          once and cached by your browser.
        </p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <p
        className="mt-4 min-h-28 whitespace-pre-wrap text-base leading-7 text-zinc-800 dark:text-zinc-200"
        aria-live="polite"
      >
        {transcript || "Your words will appear here a few seconds after you start speaking."}
      </p>
    </section>
  );
}

function formatTranscriptionStatus(
  status: TranscriptionStatus,
  progress: number | null,
): string {
  if (status === "loading-model") {
    return progress === null ? "Loading model" : `Loading model ${progress}%`;
  }
  if (status === "transcribing") {
    return "Listening";
  }
  return status;
}
