import type { KnowledgeEntry, KnowledgeEntryType } from "./types";

const SUPPORTED_TYPES = new Set<KnowledgeEntryType>([
  "competitor",
  "objection",
  "case-study",
  "product",
  "discovery-question",
  "security",
]);

const ENTRY_HEADING = /^##\s+(.+)$/gm;
const METADATA_COMMENT = /<!--([\s\S]*?)-->/;

export function parseKnowledgeBase(markdown: string): KnowledgeEntry[] {
  const headings = [...markdown.matchAll(ENTRY_HEADING)];

  return headings.map((heading, index) => {
    const title = heading[1].trim();
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? markdown.length;
    const section = markdown.slice(start, end).trim();
    const metadataMatch = section.match(METADATA_COMMENT);

    if (!metadataMatch) {
      throw new Error(`Knowledge entry "${title}" is missing a metadata comment.`);
    }

    const metadata = parseMetadata(metadataMatch[1]);
    const id = metadata.id?.trim();
    const type = metadata.type?.trim() as KnowledgeEntryType | undefined;
    const keywords = metadata.keywords
      ?.split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean);

    if (!id) {
      throw new Error(`Knowledge entry "${title}" is missing an id.`);
    }

    if (!type || !SUPPORTED_TYPES.has(type)) {
      throw new Error(
        `Knowledge entry "${title}" has an unsupported type: ${metadata.type ?? "missing"}.`,
      );
    }

    if (!keywords?.length) {
      throw new Error(`Knowledge entry "${title}" needs at least one keyword.`);
    }

    const content = section
      .replace(metadataMatch[0], "")
      .replace(/\n?---\s*$/, "")
      .trim();

    return { id, title, type, keywords, content };
  });
}

function parseMetadata(comment: string): Record<string, string> {
  return Object.fromEntries(
    comment
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(":");
        if (separator === -1) {
          return [line, ""];
        }

        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
}
