import {
  BENCHMARK_METRICS,
  type BenchmarkMetric,
  type TranscriptionBenchmarkSample,
  type TranscriptionBenchmarkSummary,
} from "@/lib/transcriptionBenchmark";

type BenchmarkPanelProps = {
  latest: TranscriptionBenchmarkSample | null;
  summary: TranscriptionBenchmarkSummary | null;
  expectedSegments?: number;
};

const METRIC_LABELS: Record<BenchmarkMetric, string> = {
  totalMs: "End-to-screen total",
  enqueueMs: "Segment ready → queued",
  queueMs: "Queue wait",
  decodeMs: "Decode + resample",
  workerWaitMs: "Worker dispatch",
  inferenceMs: "Whisper inference",
  deliveryMs: "Result delivery",
  renderMs: "React + paint",
};

export function BenchmarkPanel({
  latest,
  summary,
  expectedSegments,
}: BenchmarkPanelProps) {
  if (!latest || !summary) {
    return null;
  }

  const completionLabel = expectedSegments
    ? `${summary.sampleCount}/${expectedSegments} completed segments`
    : `${summary.sampleCount} completed ${summary.sampleCount === 1 ? "segment" : "segments"}`;

  return (
    <section className="mt-8 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-50 px-5 py-4 dark:bg-zinc-900/50">
        <div>
          <h2 className="font-semibold text-zinc-950 dark:text-zinc-50">
            Latency benchmark
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            {completionLabel} · {formatDuration(summary.sourceDurationMs)} of audio
          </p>
        </div>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Latest: {formatMilliseconds(latest.totalMs)}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-xl text-left text-sm">
          <thead className="border-y border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
            <tr>
              <th className="px-5 py-3 font-medium">Stage</th>
              <th className="px-3 py-3 font-medium">Min</th>
              <th className="px-3 py-3 font-medium">Average</th>
              <th className="px-3 py-3 font-medium">P50</th>
              <th className="px-3 py-3 font-medium">P95</th>
              <th className="px-5 py-3 font-medium">Max</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {BENCHMARK_METRICS.map((metric) => {
              const statistics = summary.metrics[metric];
              return (
                <tr key={metric}>
                  <th className="px-5 py-3 font-medium text-zinc-800 dark:text-zinc-200">
                    {METRIC_LABELS[metric]}
                  </th>
                  <td className="px-3 py-3 text-zinc-600 dark:text-zinc-400">
                    {formatMilliseconds(statistics.min)}
                  </td>
                  <td className="px-3 py-3 text-zinc-600 dark:text-zinc-400">
                    {formatMilliseconds(statistics.average)}
                  </td>
                  <td className="px-3 py-3 text-zinc-600 dark:text-zinc-400">
                    {formatMilliseconds(statistics.p50)}
                  </td>
                  <td className="px-3 py-3 text-zinc-600 dark:text-zinc-400">
                    {formatMilliseconds(statistics.p95)}
                  </td>
                  <td className="px-5 py-3 text-zinc-600 dark:text-zinc-400">
                    {formatMilliseconds(statistics.max)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-zinc-200 px-5 py-3 text-xs leading-5 text-zinc-500 dark:border-zinc-800">
        Total latency starts when a three-second source segment is ready and ends
        after the transcript has had a browser paint opportunity. Percentiles
        update as each segment finishes.
      </p>
    </section>
  );
}

function formatMilliseconds(milliseconds: number) {
  return `${Math.round(milliseconds).toLocaleString()} ms`;
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.round(milliseconds / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
