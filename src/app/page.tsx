// app/page.tsx

import { SalesAssistant } from "@/components/sales-assistant/SalesAssistant";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10 dark:bg-black">
      <main className="mx-auto w-full max-w-5xl">
        <header className="mb-8 space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
            Live sales assistant
          </p>

          <h1 className="text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
            Get real-time help during your sales calls.
          </h1>

          <p className="max-w-2xl leading-7 text-zinc-600 dark:text-zinc-400">
            Capture a conversation, generate a live transcript, and receive
            relevant questions, objection responses, and sales guidance.
          </p>
        </header>

        <SalesAssistant />
      </main>
    </div>
  );
}