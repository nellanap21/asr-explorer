// Define the properties required by the AudioPreview component.
// audioUrl is a temporary browser URL pointing to the recorded audio.
// It is null until a recording has been completed.
type AudioPreviewProps = {
  audioUrl: string | null;
};

// Displays an audio player for the completed recording.
//
// This component is purely presentational—it does not know anything
// about how the audio was recorded. It simply receives an audio URL
// and renders a player if one exists.
export function AudioPreview({ audioUrl }: AudioPreviewProps) {
  // If no recording has been made yet, render nothing.  
  if (!audioUrl) {
    return null;
  }

  return (
    <section className="space-y-3">
      {/* Section heading */}      
      <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
        Conversation recording
      </h2>
      {/* Browser audio player for previewing the recorded conversation */}
      <audio controls src={audioUrl} className="w-full" />
    </section>
  );
}