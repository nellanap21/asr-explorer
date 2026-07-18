export type AudioSegmentSource = "microphone" | "replay";

export type AudioSegmentMetadata = {
  segmentNumber: number;
  source: AudioSegmentSource;
  startedAtMs: number;
  completedAtMs: number;
};
