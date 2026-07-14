"use client";

// import react hooks
import { useEffect, useRef, useState } from "react";

export default function Home() {
  // State variables used to control the UI
  const [isRecording, setIsRecording] = useState(false);          // Is recording currently active?
  const [audioUrl, setAudioUrl] = useState<string | null>(null);  // URL of the finished recording
  const [error, setError] = useState<string | null>(null);        // Error message (if any)
  const [status, setStatus] = useState("idle");                   // Recording status shown to the user
  
  // References persist across renders without causing rerenders
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);    // MediaRecorder instance
  const streamRef = useRef<MediaStream | null>(null);             // Microphone stream
  const chunksRef = useRef<BlobPart[]>([]);                       // Stores recorded audio chunks

  // Cleanup function that runs when the component is removed.
  // Stops the microphone so it isn't left active.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Recording workflow:
  //
  // 1. Request microphone permission from the user.
  // 2. Create a MediaRecorder attached to the microphone stream.
  // 3. Collect audio data as it is recorded.
  // 4. When recording stops, combine the chunks into a Blob.
  // 5. Generate a temporary URL for playback and download.
  // 6. Release the microphone.

  // Request microphone access and begin recording
  const startRecording = async () => {
    setError(null);

    // Check that the browser supports microphone recording
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support microphone recording.");
      return;
    }

    try {
      // Ask the user for permission to use their microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Save the microphone stream
      streamRef.current = stream;

      // Use WebM if supported by the browser
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : undefined;

      // Create a MediaRecorder for capturing microphone audio
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      // Clear any previous recording
      chunksRef.current = [];

      // Whenever recorded data becomes available,
      // store it in our array of chunks.
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // When recording finishes...
      recorder.onstop = () => {

        // Combine all recorded chunks into one audio file
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        // Create a temporary URL that can be played or downloaded
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setStatus("stopped");
        setIsRecording(false);

        // Release the microphone
        streamRef.current?.getTracks().forEach((track) => track.stop());
      };

      // Begin recording
      recorder.start();

      // Save recorder reference for later
      mediaRecorderRef.current = recorder;

      // Update UI
      setStatus("recording");
      setIsRecording(true);

      // Remove any previous recording
      setAudioUrl(null);
    } catch (err) {
      // Usually triggered if the user denies microphone permission
      setError(
        err instanceof Error ? err.message : "Microphone access was denied.",
      );
    }
  };

  // Stop recording if it is currently active
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setStatus("stopping");
    }
  };

  // Download the recorded audio file
  const downloadRecording = () => {
    if (!audioUrl) {
      return;
    }

    // Create a temporary invisible download link
    const link = document.createElement("a");
    link.href = audioUrl;
    link.download = `conversation-${Date.now()}.webm`;

    // Simulate clicking the link    
    link.click();
  };

  // Render the user interface
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10 font-sans dark:bg-black">
      <main className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        
        {/* Page title and instructions */}
        <div className="space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
            Audio recorder
          </p>
          <h1 className="text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
            Record a conversation and save it as an audio file.
          </h1>
          <p className="max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
            Use this basic microphone flow in the browser to capture speech, stop the recording, and download the saved audio clip.
          </p>
        </div>

        {/* Recording controls */}
        <div className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900">
          
          {/* Start/Stop and Download buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`rounded-full px-5 py-3 text-sm font-semibold text-white transition ${
                isRecording
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-zinc-950 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
              }`}
            >
              {isRecording ? "Stop recording" : "Start recording"}
            </button>
            <button
              type="button"
              onClick={downloadRecording}
              disabled={!audioUrl}
              className="rounded-full border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Download audio
            </button>
          </div>

          {/* Status and error messages */}
          <div className="mt-6 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            <p>
              Status: <span className="font-medium text-zinc-950 dark:text-zinc-50">{status}</span>
            </p>
            {error ? <p className="text-red-600">{error}</p> : null}
            {!error && !isRecording && status === "idle" ? (
              <p>Allow microphone access when prompted to begin recording.</p>
            ) : null}
          </div>

          {/* Audio player shown after recording finishes */}
          {audioUrl ? (
            <div className="mt-6 space-y-3">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Preview your saved recording:
              </p>
              <audio controls src={audioUrl} className="w-full" />
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
