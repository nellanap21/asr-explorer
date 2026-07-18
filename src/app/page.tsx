// Import the main interactive client component.
// This component contains the microphone, transcription,
// and AI coaching functionality.
import { SalesAssistant } from "@/components/sales-assistant/SalesAssistant";
import { loadKnowledgeBase } from "@/lib/knowledge/loadKnowledgeBase";

const knowledgeEntries = loadKnowledgeBase();

// Home page for the application.
//
// This file is intentionally kept as a Server Component.
// It is responsible for the overall page layout and static content,
// while the interactive functionality lives inside the
// SalesAssistant client component.

export default function HomePage() {
  return (
    // Full-page container with background color and padding
    <div className="min-h-screen bg-zinc-50 px-4 py-10 dark:bg-black">
      {/* Center the page content and limit its maximum width */}      
      <main className="mx-auto w-full max-w-6xl">
        {/* Page heading and application description */}        
        <header className="mb-8 space-y-4">
          {/* Small label shown above the main heading */}          
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
            Live sales assistant
          </p>
          {/* Main application title */}
          <h1 className="text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
            Get real-time help during your sales calls.
          </h1>
          {/* Brief explanation of what the application does */}
          <p className="max-w-2xl leading-7 text-zinc-600 dark:text-zinc-400">
            Capture a conversation, generate a live transcript, and receive
            relevant questions, objection responses, and sales guidance.
          </p>
        </header>
        {/* Interactive client-side application */}
        <SalesAssistant knowledgeEntries={knowledgeEntries} />
      </main>
    </div>
  );
}
