import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseKnowledgeBase } from "./parseKnowledgeBase";

const knowledgeBasePath = join(
  process.cwd(),
  "src",
  "content",
  "knowledge-base.md",
);

export function loadKnowledgeBase() {
  return parseKnowledgeBase(readFileSync(knowledgeBasePath, "utf8"));
}
