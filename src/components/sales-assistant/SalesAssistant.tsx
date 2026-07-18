// components/sales-assistant/SalesAssistant.tsx

"use client";

// React hooks used to coordinate recording and replay sessions.
import { useCallback, useState, type ReactNode } from "react";

// Custom hook that encapsulates all microphone recording logic.
// It manages MediaRecorder, recording state, and audio generation.
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useAudioReplay } from "@/hooks/useAudioReplay";
import { useLiveTranscription } from "@/hooks/useLiveTranscription";
import type { AudioSegmentMetadata } from "@/types/audio";

// UI components used by the sales assistant.
import { AudioPreview } from "./AudioPreview";
import { RecordingControls } from "./RecordingControls";
import { LiveTranscript } from "./LiveTranscript";
import { ReplayControls } from "./ReplayControls";
import { BenchmarkPanel } from "./BenchmarkPanel";

type InputMode = "microphone" | "replay";

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
  const [inputMode, setInputMode] = useState<InputMode>("microphone");

  // Initialize the live transcription hook.
  // This hook loads Whisper, accepts audio chunks from the recorder,
  // and continuously updates the transcript.  
  const {
    transcript,
    status: transcriptionStatus,
    modelProgress,
    error: transcriptionError,
    latency,
    benchmarkSamples,
    benchmarkSummary,
    addAudioSegment,
    resetTranscript,
  } = useLiveTranscription();

  // Queue each self-contained recorder segment for Whisper. Each segment is
  // transcribed once and its text is appended permanently.
  const handleAudioSegment = useCallback(
    (segment: Blob, metadata: AudioSegmentMetadata) => {
      addAudioSegment(segment, metadata);
    },
    [addAudioSegment],
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
    onAudioSegment: handleAudioSegment,
  });

  const {
    file: replayFile,
    status: replayStatus,
    error: replayError,
    emittedSegments,
    totalSegments,
    preparationMs,
    isReplaying,
    setFile: setReplayFile,
    startReplay,
    stopReplay,
    resetReplay,
  } = useAudioReplay({
    onAudioSegment: handleAudioSegment,
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
    resetReplay();
    resetTranscript();
  };

  // Before starting a new recording, clear any previous transcript.
  // The "void" keyword intentionally ignores the Promise returned by
  // startRecording() because the UI doesn't need to await it.
  const start = () => {
    resetReplay();
    resetTranscript();
    void startRecording();
  };

  const startAudioReplay = () => {
    resetRecording();
    resetTranscript();
    void startReplay();
  };

  const changeReplayFile = (file: File | null) => {
    setReplayFile(file);
    resetTranscript();
  };

  const latestBenchmarkSample =
    benchmarkSamples[benchmarkSamples.length - 1] ?? null;
  const hasActiveInput = isRecording || isReplaying;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-6 flex w-fit rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
        <ModeButton
          active={inputMode === "microphone"}
          disabled={hasActiveInput}
          onClick={() => setInputMode("microphone")}
        >
          Microphone
        </ModeButton>
        <ModeButton
          active={inputMode === "replay"}
          disabled={hasActiveInput}
          onClick={() => setInputMode("replay")}
        >
          Replay Mode
        </ModeButton>
      </div>

      {inputMode === "microphone" ? (
        <>
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
        </>
      ) : (
        <ReplayControls
          file={replayFile}
          status={replayStatus}
          error={replayError}
          emittedSegments={emittedSegments}
          totalSegments={totalSegments}
          preparationMs={preparationMs}
          canStart={transcriptionStatus === "ready"}
          onFileChange={changeReplayFile}
          onStart={startAudioReplay}
          onStop={stopReplay}
          onReset={reset}
        />
      )}

      {/* Continuously display Whisper's transcript while recording. */}      
      <LiveTranscript
        transcript={transcript}
        status={transcriptionStatus}
        modelProgress={modelProgress}
        error={transcriptionError}
        latency={latency}
      />

      <BenchmarkPanel
        latest={latestBenchmarkSample}
        summary={benchmarkSummary}
        expectedSegments={inputMode === "replay" ? totalSegments : undefined}
      />
      
      {/* Audio player shown after recording has completed */}
      {inputMode === "microphone" ? (
        <div className="mt-8">
          <AudioPreview audioUrl={audioUrl} />
        </div>
      ) : null}
    </section>
  );
}

type ModeButtonProps = {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
};

function ModeButton({ active, disabled, onClick, children }: ModeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${
        active
          ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-700 dark:text-white"
          : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

// Convert internal status strings (e.g. "requesting-permission")
// into a more readable format for display in the UI.
function formatStatus(status: string): string {
  return status.replaceAll("-", " ");
}
