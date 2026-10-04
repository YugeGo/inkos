import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  EvidenceItem,
  PlanningEvidenceBundle,
} from "../models/evidence-bundle.js";

async function readJsonOrDefault<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function readTextOrDefault(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Builds a categorized, authority-classified PlanningEvidenceBundle for the Planner.
 * Strictly separates established reality (canon, runtime_state, book_rules)
 * from future narrative aspirations (outlineIntentions).
 */
export async function buildPlanningEvidenceBundle(params: {
  readonly bookDir: string;
  readonly chapterNumber: number;
  readonly currentInstruction?: string;
}): Promise<PlanningEvidenceBundle> {
  const storyDir = join(params.bookDir, "story");
  const stateDir = join(storyDir, "state");
  const outlineDir = join(storyDir, "outline");

  const canonFacts: EvidenceItem[] = [];
  const runtimeState: EvidenceItem[] = [];
  const bookRules: EvidenceItem[] = [];
  const activeHooks: EvidenceItem[] = [];
  const outlineIntentions: EvidenceItem[] = [];
  const authorInstructions: EvidenceItem[] = [];
  const characterIdsSet = new Set<string>();

  // 1. Load book rules
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

  // 2. Load runtime state
  const stateJson = await readJsonOrDefault<Record<string, any>>(join(stateDir, "current_state.json"), {});
  if (stateJson && typeof stateJson === "object") {
    let stateIdx = 0;
    for (const [key, val] of Object.entries(stateJson)) {
      if (stateIdx >= 20) break;
      const text = typeof val === "string" ? val : JSON.stringify(val);
      runtimeState.push({
        ref: `state:current_state.json#${key}`,
        text: `${key}: ${text}`.slice(0, 500),
        authority: "runtime_state",
      });
      stateIdx++;
    }
  }

  // 3. Load characters
  const charactersJson = await readJsonOrDefault<any>(join(stateDir, "characters.json"), []);
  if (Array.isArray(charactersJson)) {
    for (const c of charactersJson) {
      if (typeof c === "string") {
        characterIdsSet.add(c.toLowerCase());
      } else if (c && typeof c === "object" && c.id) {
        characterIdsSet.add(String(c.id).toLowerCase());
      }
    }
  }

  // 4. Load threads/hooks
  const threadsJson = await readJsonOrDefault<any>(join(stateDir, "threads.json"), []);
  if (Array.isArray(threadsJson)) {
    threadsJson.slice(0, 15).forEach((t, idx) => {
      const ref = t.id ? `hook:${t.id}` : `hook:hk_${String(idx + 1).padStart(2, "0")}`;
      const desc = t.description || t.title || JSON.stringify(t);
      activeHooks.push({
        ref,
        text: String(desc).slice(0, 500),
        authority: "runtime_state",
      });
    });
  }

  // 5. Load outline (strictly classified as "outline")
  const outlineText = await readTextOrDefault(join(outlineDir, "story_frame.md"));
  if (outlineText.trim()) {
    const lines = outlineText.split("\n").filter((l) => l.trim().startsWith("-") || l.trim().startsWith("#") || l.trim().startsWith("*"));
    lines.slice(0, 15).forEach((line, idx) => {
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

  // 6. User instruction (classified as "author_instruction")
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
