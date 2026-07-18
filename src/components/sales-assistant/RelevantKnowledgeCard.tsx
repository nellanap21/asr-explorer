import { Fragment } from "react";

import type {
  KnowledgeEntry,
  KnowledgeMatch,
} from "@/lib/knowledge/types";

type RelevantKnowledgeCardProps = {
  entry: KnowledgeEntry | null;
  match: KnowledgeMatch | null;
  recentMatches: KnowledgeMatch[];
};

export function RelevantKnowledgeCard({
  entry,
  match,
  recentMatches,
}: RelevantKnowledgeCardProps) {
  return (
    <aside className="mt-8 rounded-xl border border-amber-200 bg-amber-50/70 p-5 dark:border-amber-950 dark:bg-amber-950/20">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-semibold text-zinc-950 dark:text-zinc-50">
          Relevant guidance
        </h2>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          Approved
        </span>
      </div>

      {entry ? (
        <div className="mt-4" aria-live="polite">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-400">
            {formatEntryType(entry.type)} detected
          </p>
          <h3 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-white">
            {entry.title}
          </h3>
          {match?.matchedKeywords.length ? (
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Matched {match.matchedKeywords.join(", ")}
            </p>
          ) : null}
          <KnowledgeContent content={entry.content} />
        </div>
      ) : (
        <div className="mt-5 min-h-56 rounded-lg border border-dashed border-amber-300 bg-white/60 p-5 dark:border-amber-900 dark:bg-zinc-950/40">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <span className="relative flex size-2.5" aria-hidden="true">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-amber-500" />
            </span>
            Listening for a match
          </div>
          <p className="mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Mention Gong, Salesforce, or a pricing concern to surface the best
            approved response from the knowledge base.
          </p>
        </div>
      )}

      {recentMatches.length > 1 ? (
        <div className="mt-5 border-t border-amber-200 pt-4 dark:border-amber-900">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Recent matches
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {recentMatches.map((recentMatch) => (
              <span
                key={recentMatch.entry.id}
                className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs text-zinc-700 dark:border-amber-900 dark:bg-zinc-900 dark:text-zinc-300"
              >
                {recentMatch.entry.title}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function KnowledgeContent({ content }: { content: string }) {
  const blocks = content.split(/\n\s*\n/);

  return (
    <div className="mt-5 space-y-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
      {blocks.map((block, blockIndex) => {
        if (block.startsWith("### ")) {
          return (
            <h4
              key={`${block}-${blockIndex}`}
              className="pt-1 text-sm font-semibold text-zinc-950 dark:text-white"
            >
              {block.slice(4)}
            </h4>
          );
        }

        if (block.startsWith("- ")) {
          return (
            <ul
              key={`${block}-${blockIndex}`}
              className="space-y-2 pl-1"
            >
              {block.split("\n").map((item, itemIndex) => (
                <li
                  key={`${item}-${itemIndex}`}
                  className="flex gap-2.5"
                >
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span>{item.replace(/^-\s+/, "")}</span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <Fragment key={`${block}-${blockIndex}`}>
            <p>{block.replace(/\n/g, " ")}</p>
          </Fragment>
        );
      })}
    </div>
  );
}

function formatEntryType(type: KnowledgeEntry["type"]): string {
  return type.replaceAll("-", " ");
}
