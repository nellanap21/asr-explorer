/// <reference lib="webworker" />

import { pipeline } from "@huggingface/transformers";

const MODEL_ID = "onnx-community/whisper-tiny.en";

type WorkerRequest = {
  type: "load";
} | {
  type: "transcribe";
  audio: Float32Array;
};

type TranscriptionResult = {
  text: string;
};

let transcriberPromise: ReturnType<typeof createTranscriber> | null = null;

async function createTranscriber() {
  return pipeline("automatic-speech-recognition", MODEL_ID, {
    // The q8 decoder currently fails session creation in ONNX Runtime Web
    // because its MatMulNBits graph is missing a required scale tensor.
    // Force the standard weights instead of the WASM backend's q8 default.
    dtype: "fp32",
    progress_callback: (progress) => {
      self.postMessage({ type: "progress", progress });
    },
  });
}

async function loadTranscriber() {
  if (!transcriberPromise) {
    self.postMessage({ type: "loading" });
    transcriberPromise = createTranscriber();
  }

  try {
    const transcriber = await transcriberPromise;
    self.postMessage({ type: "ready" });
    return transcriber;
  } catch (cause) {
    transcriberPromise = null;
    throw cause;
  }
}

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  try {
    const transcriber = await loadTranscriber();

    if (event.data.type === "load") {
      return;
    }

    self.postMessage({ type: "transcribing" });

    const output = await transcriber(event.data.audio, {
      chunk_length_s: 20,
      stride_length_s: 4,
    });

    const result = Array.isArray(output) ? output[0] : output;
    self.postMessage({
      type: "result",
      text: (result as TranscriptionResult).text.trim(),
    });
  } catch (cause) {
    transcriberPromise = null;
    self.postMessage({
      type: "error",
      message: cause instanceof Error ? cause.message : "Transcription failed.",
    });
  }
});

export {};
