"use client";

/*
One comment worth emphasizing is that this implementation retranscribes 
all accumulated audio each time, rather than only the latest chunk. 
That makes the transcript easier to maintain, but transcription will 
become progressively more expensive as the recording grows.
*/

// React hooks used to manage state, lifecycle events, mutable references,
// and memoized callback functions.
import { useCallback, useEffect, useRef, useState } from "react";

// Represents the current state of the transcription system.
export type TranscriptionStatus =
  | "idle"
  | "loading-model"
  | "transcribing"
  | "ready"
  | "error";

  // Defines the messages that the Whisper Web Worker can send
// back to the main browser thread.
type WorkerMessage = {
  // Identifies the kind of message being received.  
  type: "loading" | "progress" | "ready" | "transcribing" | "result" | "error";
  // Transcribed text returned by Whisper.  
  text?: string;
  // Error message returned by the worker.  
  message?: string;
  // Information about the model download or loading progress.  
  progress?: {
    status?: string;
    file?: string;
    progress?: number;
  };
};

// Wait this long after receiving an audio chunk before requesting
// another transcription.
//
// This prevents Whisper from running after every small audio chunk.
const TRANSCRIPTION_DELAY_MS = 2_500;
// Whisper expects audio sampled at 16 kHz.
const WHISPER_SAMPLE_RATE = 16_000;

// Custom React hook that coordinates live transcription.
//
// Its responsibilities include:
// 1. Creating and managing the Whisper Web Worker.
// 2. Receiving audio chunks from the microphone recorder.
// 3. Combining and decoding those chunks.
// 4. Converting the audio to mono 16 kHz PCM samples.
// 5. Sending the audio to Whisper.
// 6. Exposing transcript and status information to React components.
export function useLiveTranscription() {
  // Most recent transcript returned by Whisper.  
  const [transcript, setTranscript] = useState("");

  // Current state of the Whisper model and transcription process.
  //
  // The hook begins in "loading-model" because the worker loads
  // Whisper immediately after the component mounts.  
  const [status, setStatus] = useState<TranscriptionStatus>("loading-model");

  // Percentage progress while the Whisper model is downloading.
  // Null means progress is unavailable or the model is not loading.  
  const [modelProgress, setModelProgress] = useState<number | null>(null);

  // Error message to display if model loading, audio decoding,
  // or transcription fails.  
  const [error, setError] = useState<string | null>(null);

  // Stores the Web Worker instance.
  //
  // A ref is used because changing the worker should not cause
  // the component to re-render.  
  const workerRef = useRef<Worker | null>(null);

  // Stores every audio chunk produced during the current recording.
  //
  // The accumulated chunks are combined each time Whisper runs,
  // allowing the hook to retranscribe the conversation so far.  
  const chunksRef = useRef<Blob[]>([]);

  // Stores the pending transcription timer.
  //
  // This allows the hook to avoid scheduling multiple timers
  // when several audio chunks arrive close together.  
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tracks whether Whisper is currently processing audio.
  //
  // This prevents multiple transcription jobs from running
  // at the same time.  
  const isBusyRef = useRef(false);

  // Indicates that new audio arrived while Whisper was busy.
  //
  // When the current transcription finishes, the hook can immediately
  // start another transcription using the newly accumulated audio.  
  const hasPendingAudioRef = useRef(false);

  // Tracks whether the Whisper model has successfully loaded.
  //
  // This is used when resetting the transcript so the correct
  // status can be restored.  
  const isModelReadyRef = useRef(false);

  // Stores the MIME type reported by MediaRecorder.
  //
  // The MIME type is needed when combining recorded chunks
  // into a single Blob for decoding.  
  const mimeTypeRef = useRef("audio/webm");

  // Decode and transcribe all audio collected so far.  
  const transcribeCurrentAudio = useCallback(async () => {

    // Do nothing if the worker has not been created or no audio
    // chunks have been recorded yet.    
    if (!workerRef.current || chunksRef.current.length === 0) {
      return;
    }

    // Whisper is already working on a transcription.
    //
    // Mark the audio as pending so another transcription can begin
    // after the current request finishes.
    if (isBusyRef.current) {
      hasPendingAudioRef.current = true;
      return;
    }

    // Lock the transcription process so another request cannot
    // start at the same time.
    isBusyRef.current = true;
    hasPendingAudioRef.current = false;

    try {
      // Combine all recorded chunks into one audio Blob.      
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      
      // Decode the browser recording and convert it into the
      // mono 16 kHz Float32Array format expected by Whisper.      
      const audio = await decodeAudio(blob);

      // Send the processed audio samples to the Whisper worker.      
      workerRef.current.postMessage(
        { type: "transcribe", audio },

        // Transfer ownership of the ArrayBuffer to the worker instead
        // of copying the entire audio array.
        //
        // This is more efficient, especially for longer recordings.        
        { transfer: [audio.buffer] },
      );
    } catch (cause) {
      // Release the transcription lock if audio decoding or
      // worker communication fails.      
      isBusyRef.current = false;
      // Convert the unknown caught value into a readable error message.      
      setError(
        cause instanceof Error ? cause.message : "Unable to decode microphone audio.",
      );
      setStatus("error");
    }
  }, []);

  // Create the Whisper Web Worker when the hook first mounts.
  useEffect(() => {

    // Create a module worker that runs Whisper outside the main UI thread.
    //
    // Running Whisper in a worker prevents model loading and inference
    // from freezing the React interface.    
    const worker = new Worker(
      new URL("../workers/whisper.worker.ts", import.meta.url),
      { type: "module" },
    );
    // Save the worker so other hook functions can send messages to it.    
    workerRef.current = worker;

    // Handle messages sent from the Whisper worker.
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;

      if (message.type === "loading") {
        // The worker has started loading the Whisper model.        
        setStatus("loading-model");
      } else if (message.type === "progress") {
        // Update the displayed model-loading percentage.        
        const progress = message.progress?.progress;
        if (typeof progress === "number") {
          setModelProgress(Math.round(progress));
        }
      } else if (message.type === "ready") {
        // The model is fully loaded and can accept audio.        
        isModelReadyRef.current = true;
        setModelProgress(null);
        setStatus("ready");
      } else if (message.type === "transcribing") {
        // Whisper has begun processing the submitted audio.        
        setModelProgress(null);
        setStatus("transcribing");
      } else if (message.type === "result") {
        // Replace the displayed transcript with Whisper's latest result.        
        setTranscript(message.text ?? "");
        setStatus("ready");
        // Allow another transcription request to begin.        
        isBusyRef.current = false;

        // If new audio arrived while Whisper was working,
        // immediately transcribe the updated audio buffer.
        if (hasPendingAudioRef.current) {
          void transcribeCurrentAudio();
        }
      } else if (message.type === "error") {
        // The worker reported a model-loading or transcription error.        
        isModelReadyRef.current = false;
        setError(message.message ?? "Transcription failed.");
        setStatus("error");
        isBusyRef.current = false;
      }
    };

    // Handle uncaught errors that cause the worker itself to fail.
    worker.onerror = () => {
      isModelReadyRef.current = false;
      setError("The Whisper transcription worker stopped unexpectedly.");
      setStatus("error");
      isBusyRef.current = false;
    };

    // Ask the worker to begin loading the Whisper model.
    worker.postMessage({ type: "load" });
    // Clean up when the component using this hook unmounts.
    return () => {

      // Stop the worker and release its resources.      
      worker.terminate();
      workerRef.current = null;

      // Cancel any transcription that has been scheduled
      // but has not started yet.      
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [transcribeCurrentAudio]);

  // Receive a new audio chunk from MediaRecorder.
  const addAudioChunk = useCallback(
    (chunk: Blob) => {
      // Add the new chunk to the current recording.      
      chunksRef.current.push(chunk);
      // Use the MIME type reported by MediaRecorder.
      //
      // If the chunk does not include one, keep the previous value.      
      mimeTypeRef.current = chunk.type || mimeTypeRef.current;

      // Indicate that audio exists that has not yet been included
      // in a completed transcription result.      
      hasPendingAudioRef.current = true;

      // Schedule a transcription only if one is not already scheduled.
      //
      // Additional chunks received during the delay are added to the
      // same transcription batch.
      if (!timerRef.current) {
        timerRef.current = setTimeout(() => {
          // Clear the ref so future chunks can schedule another request.          
          timerRef.current = null;
          // Start transcription without waiting for the Promise here.          
          void transcribeCurrentAudio();
        }, TRANSCRIPTION_DELAY_MS);
      }
    },
    [transcribeCurrentAudio],
  );

  // Clear all transcript and audio state for a new recording session.
  const resetTranscript = useCallback(() => {
    // Cancel a scheduled transcription that has not started.    
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Remove all previously recorded audio chunks.    
    chunksRef.current = [];
    // There is no longer any unprocessed audio waiting.    
    hasPendingAudioRef.current = false;
    // Clear the displayed transcript.    
    setTranscript("");

    // Return to "ready" if Whisper is already loaded.
    // Otherwise, continue showing "loading-model".    
    setStatus(isModelReadyRef.current ? "ready" : "loading-model");
    // Clear loading progress and previous errors.    
    setModelProgress(null);
    setError(null);
  }, []);

  // Expose transcription state and control functions
  // to the component using this hook.  
  return {
    transcript,
    status,
    modelProgress,
    error,
    addAudioChunk,
    resetTranscript,
  };
}

// Decode a browser-recorded Blob and convert it into the
// audio format expected by Whisper.
async function decodeAudio(blob: Blob): Promise<Float32Array> {
  // AudioContext provides the browser's built-in audio decoder.  
  const context = new AudioContext();

  try {
    // Convert the Blob into an ArrayBuffer and decode compressed
    // formats such as WebM/Opus into raw PCM audio samples.    
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    // Combine all channels into one mono signal.    
    const mono = mixToMono(decoded);
    // Convert the browser's sample rate to Whisper's required 16 kHz.    
    return resample(mono, decoded.sampleRate, WHISPER_SAMPLE_RATE);
  } finally {
    // Always close the AudioContext, even if decoding fails.    
    await context.close();
  }
}
// Convert an AudioBuffer with one or more channels into mono audio.
function mixToMono(audio: AudioBuffer): Float32Array {
  // For mono recordings, return a copy of the existing channel data.
  //
  // slice() is used because getChannelData() returns a view into
  // the AudioBuffer's internal memory.  
  if (audio.numberOfChannels === 1) {
    return audio.getChannelData(0).slice();
  }
  // Create an empty mono output array with one sample per audio frame.
  const mono = new Float32Array(audio.length);
  // Average corresponding samples from every channel.
  //
  // For stereo audio, this is approximately:
  // mono = (left + right) / 2  
  for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
    const samples = audio.getChannelData(channel);
    for (let index = 0; index < samples.length; index += 1) {
      mono[index] += samples[index] / audio.numberOfChannels;
    }
  }
  return mono;
}

// Convert audio from its original sample rate to another sample rate
// using linear interpolation.
function resample(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  // No conversion is necessary if the sample rates already match.  
  if (inputRate === outputRate) {
    return input;
  }

  // Calculate how many samples the resampled signal should contain.
  //
  // For example, converting 48 kHz audio to 16 kHz produces
  // approximately one-third as many samples.
  const outputLength = Math.round((input.length * outputRate) / inputRate);
  const output = new Float32Array(outputLength);

  // Determines how far to move through the input signal
  // for each output sample.  
  const ratio = inputRate / outputRate;

  for (let index = 0; index < outputLength; index += 1) {

    // Find the corresponding fractional position
    // in the original input signal.    
    const position = index * ratio;
    // Find the samples immediately before and after that position.    
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);

    // Calculate how far the desired position lies
    // between the left and right samples.    
    const weight = position - left;

    // Estimate the output value by linearly blending
    // the neighboring input samples.    
    output[index] = input[left] * (1 - weight) + input[right] * weight;
  }
  return output;
}
