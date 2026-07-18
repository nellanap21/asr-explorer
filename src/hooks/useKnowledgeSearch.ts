"use client";

import { useMemo } from "react";

import { searchKnowledgeBase } from "@/lib/knowledge/searchKnowledgeBase";
import type {
  KnowledgeEntry,
  KnowledgeMatch,
} from "@/lib/knowledge/types";

type UseKnowledgeSearchOptions = {
  finalizedSegments: readonly string[];
  entries: readonly KnowledgeEntry[];
  rollingWindowSize?: number;
};

const DEFAULT_ROLLING_WINDOW_SIZE = 4;
const RECENT_MATCH_LIMIT = 4;

export function useKnowledgeSearch({
  finalizedSegments,
  entries,
  rollingWindowSize = DEFAULT_ROLLING_WINDOW_SIZE,
}: UseKnowledgeSearchOptions) {
  const relevantMatch = useMemo(() => {
    const rollingTranscript = finalizedSegments
      .slice(-rollingWindowSize)
      .join(" ");

    return searchKnowledgeBase(rollingTranscript, entries)[0] ?? null;
  }, [entries, finalizedSegments, rollingWindowSize]);

  const recentMatches = useMemo(
    () => collectRecentMatches(finalizedSegments, entries),
    [entries, finalizedSegments],
  );

  return {
    relevantEntry: relevantMatch?.entry ?? null,
    relevantMatch,
    recentMatches,
  };
}

function collectRecentMatches(
  segments: readonly string[],
  entries: readonly KnowledgeEntry[],
): KnowledgeMatch[] {
  return segments.reduce<KnowledgeMatch[]>((recent, segment) => {
    const segmentMatches = searchKnowledgeBase(segment, entries);

    for (const match of segmentMatches.slice().reverse()) {
      const existingIndex = recent.findIndex(
        (recentMatch) => recentMatch.entry.id === match.entry.id,
      );

      if (existingIndex !== -1) {
        recent.splice(existingIndex, 1);
      }

      recent.unshift(match);
    }

    return recent.slice(0, RECENT_MATCH_LIMIT);
  }, []);
}
