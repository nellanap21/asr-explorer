// components/sales-assistant/AudioPreview.tsx

type AudioPreviewProps = {
  audioUrl: string | null;
};

export function AudioPreview({ audioUrl }: AudioPreviewProps) {
  if (!audioUrl) {
    return null;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
        Conversation recording
      </h2>

      <audio controls src={audioUrl} className="w-full" />
    </section>
  );
}