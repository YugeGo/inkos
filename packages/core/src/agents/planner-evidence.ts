import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  EvidenceItem,
  PlanningEvidenceBundle,
} from "../models/evidence-bundle.js";
import { loadRuntimeStateSnapshot } from "../state/runtime-state-store.js";
import type { RuntimeStateSnapshot } from "../state/state-reducer.js";
import { BookRulesSchema } from "../models/book-rules.js";

async function readTextOrDefault(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}

async function readJsonOrDefault<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Builds a categorized, authority-classified PlanningEvidenceBundle for the Planner,
 * strictly reading from InkOS's authoritative RuntimeStateStore, role-cards, and book rules.
 */
export async function buildPlanningEvidenceBundle(params: {
  readonly bookDir: string;
  readonly chapterNumber: number;
  readonly currentInstruction?: string;
}): Promise<PlanningEvidenceBundle> {
  const storyDir = join(params.bookDir, "story");
  const outlineDir = join(storyDir, "outline");

  const canonFacts: EvidenceItem[] = [];
  const runtimeState: EvidenceItem[] = [];
  const bookRules: EvidenceItem[] = [];
  const activeHooks: EvidenceItem[] = [];
  const outlineIntentions: EvidenceItem[] = [];
  const authorInstructions: EvidenceItem[] = [];
  const characterIdsSet = new Set<string>();

  // 1. Authoritative Runtime State & Historical Canon Facts via RuntimeStateStore
  let snapshot: RuntimeStateSnapshot | null = null;
  try {
    snapshot = await loadRuntimeStateSnapshot(params.bookDir);
  } catch (error: any) {
    const isEnoent = error?.code === "ENOENT" || (typeof error?.message === "string" && error.message.includes("ENOENT"));
    if (isEnoent) {
      // Inception state before runtime state store initialization
      snapshot = null;
    } else {
      // Authoritative runtime state exists but is corrupted or schema-invalid: Fail-Closed!
      throw new Error(`Authoritative runtime state is invalid or corrupted (Fail-Closed): ${error.message}`);
    }
  }

  if (snapshot) {
    // 1.1 Facts: determine active runtime state at target chapter vs past expired facts
    const facts = Array.isArray(snapshot.currentState?.facts) ? snapshot.currentState.facts : [];
    for (const fact of facts) {
      const factId = (fact as any).id ?? `${fact.subject}.${fact.predicate}`;
      const factText = `${fact.subject} ${fact.predicate}: ${fact.object}`;

      // A fact is currently valid if it originated at or before target chapter, and has not yet expired
      const isActiveAtChapter =
        fact.validFromChapter <= params.chapterNumber &&
        (fact.validUntilChapter === null || fact.validUntilChapter >= params.chapterNumber);

      if (isActiveAtChapter) {
        if (runtimeState.length < 30) {
          runtimeState.push({
            ref: `state:fact#${factId}`,
            text: factText.slice(0, 500),
            authority: "runtime_state",
          });
        }
      } else if (fact.validUntilChapter !== null && fact.validUntilChapter < params.chapterNumber) {
        // Expired fact: past historical reference, never confused with current active truth
        if (canonFacts.length < 30) {
          canonFacts.push({
            ref: `canon:expired#${factId}`,
            text: `(历史事实，在第${fact.validUntilChapter}章失效) ${factText}`.slice(0, 500),
            authority: "canon",
          });
        }
      }
    }

    // 1.2 Chapter Summaries from past chapters count as canon facts
    const rows = Array.isArray(snapshot.chapterSummaries?.rows) ? snapshot.chapterSummaries.rows : [];
    for (const row of rows) {
      if (row.chapter < params.chapterNumber && canonFacts.length < 50) {
        const summaryText = (row as any).summary ?? `${row.title}: ${row.events}`;
        canonFacts.push({
          ref: `canon:chapter#${row.chapter}`,
          text: `第${row.chapter}章既定梗概: ${summaryText}`.slice(0, 500),
          authority: "canon",
        });
      }
    }

    // 1.3 Active & In-Progress Hooks
    const hooksList = Array.isArray(snapshot.hooks?.hooks) ? snapshot.hooks.hooks : [];
    for (const hook of hooksList) {
      const isHookActive = hook.status === "open" || hook.status === "progressing";
      if (isHookActive && activeHooks.length < 30) {
        const hookId = hook.hookId ?? (hook as any).id ?? "hk_unknown";
        const hookDesc = hook.notes || (hook as any).description || hook.expectedPayoff || "";
        activeHooks.push({
          ref: `hook:${hookId}`,
          text: `${hookId} [${hook.type}]: ${hookDesc}`.slice(0, 500),
          authority: "runtime_state",
        });
      }
    }
  }

  // 2. Load Book Rules from story/book_rules.json (Fail-Closed if exists and invalid)
  const bookRulesJsonPath = join(storyDir, "book_rules.json");
  try {
    const rawContent = await readFile(bookRulesJsonPath, "utf-8");
    // Authoritative book_rules.json exists: MUST pass BookRulesSchema (Fail-Closed)
    const rules = BookRulesSchema.parse(JSON.parse(rawContent));
    if (rules.protagonist?.name) {
      characterIdsSet.add(rules.protagonist.name.toLowerCase());
      if (rules.protagonist.behavioralConstraints?.length) {
        bookRules.push({
          ref: `rule:protagonist#behavior`,
          text: `主角行为约束: ${rules.protagonist.behavioralConstraints.join("; ")}`.slice(0, 500),
          authority: "book_rule",
        });
      }
      if (rules.protagonist.personalityLock?.length) {
        bookRules.push({
          ref: `rule:protagonist#personality`,
          text: `主角人设锁定: ${rules.protagonist.personalityLock.join("; ")}`.slice(0, 500),
          authority: "book_rule",
        });
      }
    }
    if (rules.prohibitions?.length) {
      rules.prohibitions.slice(0, 15).forEach((p, idx) => {
        bookRules.push({
          ref: `rule:prohibition#${String(idx + 1).padStart(2, "0")}`,
          text: p.slice(0, 500),
          authority: "book_rule",
        });
      });
    }
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      // Legacy fallback: parse book_rules.md if book_rules.json does not exist
      const rulesText = await readTextOrDefault(join(storyDir, "book_rules.md"));
      if (rulesText.trim()) {
        const lines = rulesText.split("\n").filter((l) => l.trim().startsWith("-") || l.trim().startsWith("*"));
        lines.slice(0, 15).forEach((line, idx) => {
          const text = line.replace(/^[-*]\s*/, "").trim();
          if (text) {
            bookRules.push({
              ref: `rule:r_${String(idx + 1).padStart(2, "0")}`,
              text: text.slice(0, 500),
              authority: "book_rule",
            });
          }
        });
      }
    } else {
      // Corrupted or schema-invalid book_rules.json: Fail-Closed!
      throw new Error(`Authoritative book_rules.json is invalid or corrupted (Fail-Closed): ${error.message}`);
    }
  }

  // Also parse book_rules.md if rules.json had no prohibition items
  if (bookRules.length === 0) {
    const rulesText = await readTextOrDefault(join(storyDir, "book_rules.md"));
    if (rulesText.trim()) {
      const lines = rulesText.split("\n").filter((l) => l.trim().startsWith("-") || l.trim().startsWith("*"));
      lines.slice(0, 15).forEach((line, idx) => {
        const text = line.replace(/^[-*]\s*/, "").trim();
        if (text) {
          bookRules.push({
            ref: `rule:r_${String(idx + 1).padStart(2, "0")}`,
            text: text.slice(0, 500),
            authority: "book_rule",
          });
        }
      });
    }
  }

  // 3. Discover Registered Roles from story/roles directories
  for (const tier of ["主要角色", "次要角色", "major", "minor"]) {
    const roleDir = join(storyDir, "roles", tier);
    try {
      const files = await readdir(roleDir);
      for (const file of files) {
        if (file.endsWith(".md")) {
          const charName = file.slice(0, -3).trim();
          if (charName) {
            characterIdsSet.add(charName.toLowerCase());
          }
        }
      }
    } catch {
      // directory does not exist, continue
    }
  }

  // 4. Load Outline (Story Frame) - strictly classified as "outline"
  const outlineText = await readTextOrDefault(join(outlineDir, "story_frame.md"));
  if (outlineText.trim()) {
    const lines = outlineText.split("\n").filter((l) => l.trim().startsWith("-") || l.trim().startsWith("#") || l.trim().startsWith("*"));
    lines.slice(0, 20).forEach((line, idx) => {
      const text = line.replace(/^[#\-*]+\s*/, "").trim();
      if (text) {
        outlineIntentions.push({
          ref: `outline:item_${String(idx + 1).padStart(2, "0")}`,
          text: text.slice(0, 500),
          authority: "outline",
        });
      }
    });
  }

  // 5. Current Author Instruction
  if (params.currentInstruction?.trim()) {
    authorInstructions.push({
      ref: `instruction:user_current`,
      text: params.currentInstruction.trim().slice(0, 500),
      authority: "author_instruction",
    });
  }

  return {
    canonFacts,
    runtimeState,
    bookRules,
    activeHooks,
    outlineIntentions,
    authorInstructions,
    characterIds: Array.from(characterIdsSet),
  };
}
