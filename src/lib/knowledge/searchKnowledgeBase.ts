import type { KnowledgeEntry, KnowledgeMatch } from "./types";

export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}.\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsKeyword(text: string, keyword: string): boolean {
  const normalizedText = normalizeText(text);
  const normalizedKeyword = normalizeText(keyword);

  if (!normalizedText || !normalizedKeyword) {
    return false;
  }

  const pattern = new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escapeRegExp(normalizedKeyword)}(?:$|[^\\p{L}\\p{N}])`,
    "iu",
  );

  return pattern.test(normalizedText);
}

export function searchKnowledgeBase(
  transcript: string,
  entries: readonly KnowledgeEntry[],
): KnowledgeMatch[] {
  const normalizedTranscript = normalizeText(transcript);

  if (!normalizedTranscript) {
    return [];
  }

  return entries
    .map((entry) => rankEntry(normalizedTranscript, entry))
    .filter((match): match is KnowledgeMatch => match !== null)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.entry.title.localeCompare(right.entry.title),
    );
}

function rankEntry(
  normalizedTranscript: string,
  entry: KnowledgeEntry,
): KnowledgeMatch | null {
  const title = normalizeText(entry.title);
  const matchedKeywords = entry.keywords.filter((keyword) =>
    containsKeyword(normalizedTranscript, keyword),
  );

  if (matchedKeywords.length === 0) {
    return null;
  }

  const score = matchedKeywords.reduce((total, keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    const wordCount = normalizedKeyword.split(" ").length;
    const titleBonus = normalizedKeyword === title ? 100 : 0;
    const specificity = Math.min(normalizedKeyword.length, 30);

    return total + 25 + wordCount * 10 + specificity + titleBonus;
  }, 0);

  return { entry, score, matchedKeywords };
}
