export const BENCHMARK_METRICS = [
  "totalMs",
  "enqueueMs",
  "queueMs",
  "decodeMs",
  "workerWaitMs",
  "inferenceMs",
  "deliveryMs",
  "renderMs",
] as const;

export type BenchmarkMetric = (typeof BENCHMARK_METRICS)[number];

export type BenchmarkStageTimestamps = {
  sourceStartedAtMs: number;
  sourceCompletedAtMs: number;
  enqueuedAtMs: number;
  decodeStartedAtMs: number;
  decodeCompletedAtMs: number;
  workerSentAtMs: number;
  workerStartedAtMs: number;
  resultReceivedAtMs: number;
  renderedAtMs: number;
};

export type TranscriptionBenchmarkSample = {
  segmentNumber: number;
  source: "microphone" | "replay";
  measuredAt: number;
  timestamps: BenchmarkStageTimestamps;
  sourceDurationMs: number;
  totalMs: number;
  enqueueMs: number;
  queueMs: number;
  decodeMs: number;
  workerWaitMs: number;
  inferenceMs: number;
  deliveryMs: number;
  renderMs: number;
};

export type BenchmarkMetricSummary = {
  min: number;
  average: number;
  p50: number;
  p95: number;
  max: number;
};

export type TranscriptionBenchmarkSummary = {
  sampleCount: number;
  sourceDurationMs: number;
  metrics: Record<BenchmarkMetric, BenchmarkMetricSummary>;
};

export function summarizeBenchmark(
  samples: TranscriptionBenchmarkSample[],
): TranscriptionBenchmarkSummary | null {
  if (samples.length === 0) {
    return null;
  }

  return {
    sampleCount: samples.length,
    sourceDurationMs: samples.reduce(
      (total, sample) => total + sample.sourceDurationMs,
      0,
    ),
    metrics: Object.fromEntries(
      BENCHMARK_METRICS.map((metric) => [
        metric,
        summarizeValues(samples.map((sample) => sample[metric])),
      ]),
    ) as Record<BenchmarkMetric, BenchmarkMetricSummary>,
  };
}

function summarizeValues(values: number[]): BenchmarkMetricSummary {
  const sorted = [...values].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);

  return {
    min: sorted[0],
    average: total / sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1],
  };
}

function percentile(sortedValues: number[], percentileValue: number): number {
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const position = (sortedValues.length - 1) * percentileValue;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const weight = position - lowerIndex;

  return (
    sortedValues[lowerIndex] * (1 - weight) +
    sortedValues[upperIndex] * weight
  );
}
