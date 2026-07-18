/*
This Web Worker runs Whisper on a background thread.

Running inference inside a worker keeps the React UI responsive
because loading the model and transcribing audio are computationally
expensive operations.

Communication with the main thread happens by passing messages:

Main thread  --->  Worker
  "load"
  "transcribe"

Worker  --->  Main thread
  "loading"
  "progress"
  "ready"
  "transcribing"
  "result"
  "error"
*/

/// <reference lib="webworker" />

// Import the Hugging Face Transformers.js pipeline helper.
// This creates a Whisper automatic speech recognition pipeline
// that runs entirely inside the browser.
import { pipeline } from "@huggingface/transformers";

// Whisper model that will be downloaded and cached by the browser.
//
// The "tiny.en" model is the smallest English-only Whisper model,
// making it fast enough for real-time browser transcription.
const MODEL_ID = "onnx-community/whisper-tiny.en";

// Messages that the main thread can send to this worker.
type WorkerRequest = {
  // Load the Whisper model without transcribing anything.  
  type: "load";
} | {
  // Transcribe a block of PCM audio samples.  
  type: "transcribe";
  audio: Float32Array;
  jobId: number;
};

// Portion of the Transformers.js response that we care about.
type TranscriptionResult = {
  text: string;
};

// Stores the Promise for the Whisper pipeline.
//
// Using a Promise instead of the completed pipeline prevents multiple
// simultaneous model downloads if several requests arrive while the
// model is still loading.
let transcriberPromise: ReturnType<typeof createTranscriber> | null = null;

// Create the Whisper transcription pipeline.
async function createTranscriber() {
  return pipeline("automatic-speech-recognition", MODEL_ID, {
    // The q8 decoder currently fails session creation in ONNX Runtime Web
    // because its MatMulNBits graph is missing a required scale tensor.
    // Force the standard weights instead of the WASM backend's q8 default.
    dtype: "fp32",

    // Forward model download progress back to the React application
    // so it can display a loading indicator.    
    progress_callback: (progress) => {
      self.postMessage({ type: "progress", progress });
    },
  });
}

// Load the Whisper model if it has not already been loaded.
async function loadTranscriber() {
  // Start loading only once.
  //
  // Future calls reuse the same Promise instead of downloading
  // the model again.  
  if (!transcriberPromise) {
    self.postMessage({ type: "loading" });
    transcriberPromise = createTranscriber();
  }

  try {
    // Wait until the pipeline is fully initialized.    
    const transcriber = await transcriberPromise;
    // Notify the UI that transcription is now available.    
    self.postMessage({ type: "ready" });
    return transcriber;
  } catch (cause) {
    // If loading fails, clear the cached Promise so a future
    // attempt can retry loading the model.    
    transcriberPromise = null;
    throw cause;
  }
}

// Listen for requests from the main browser thread.
self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  try {
    // Ensure Whisper is loaded before processing any request.    
    const transcriber = await loadTranscriber();

    // A "load" request only warms up the model.
    // No transcription is required.
    if (event.data.type === "load") {
      return;
    }
    // Inform the UI that Whisper has begun inference.
    self.postMessage({ type: "transcribing", jobId: event.data.jobId });

    const inferenceStartedAt = performance.now();


    // Run Whisper on the provided audio samples.
    //
    // chunk_length_s determines how much audio Whisper processes
    // at one time, while stride_length_s provides overlap between
    // chunks to improve continuity across boundaries.
    const output = await transcriber(event.data.audio, {
      chunk_length_s: 20,
      stride_length_s: 4,
    });

    // Transformers.js may return either a single object or an array,
    // so normalize the result into a single transcription.
    const result = Array.isArray(output) ? output[0] : output;

    const inferenceMs = performance.now() - inferenceStartedAt;

    // Send the completed transcript back to the React application.    
    self.postMessage({
      type: "result",
      text: (result as TranscriptionResult).text.trim(),
      jobId: event.data.jobId,
      inferenceMs,
    });
  } catch (cause) {
    // Allow future transcription attempts to recreate the pipeline.    
    transcriberPromise = null;
    // Report the error back to the main thread.    
    self.postMessage({
      type: "error",
      message: cause instanceof Error ? cause.message : "Transcription failed.",
      jobId: event.data.type === "transcribe" ? event.data.jobId : undefined,
    });
  }
});
// Makes this file an ES module.
export {};
