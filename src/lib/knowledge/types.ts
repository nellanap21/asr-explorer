export type KnowledgeEntryType =
  | "competitor"
  | "objection"
  | "case-study"
  | "product"
  | "discovery-question"
  | "security";

export type KnowledgeEntry = {
  id: string;
  title: string;
  type: KnowledgeEntryType;
  keywords: string[];
  content: string;
};

export type KnowledgeMatch = {
  entry: KnowledgeEntry;
  score: number;
  matchedKeywords: string[];
};
