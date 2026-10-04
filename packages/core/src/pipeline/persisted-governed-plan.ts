import { readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import type { PlanChapterOutput } from "../agents/planner.js";
import {
  ChapterCreativeContractSchema,
  ChapterIntentSchema,
  ChapterMemoSchema,
  type ChapterCreativeContract,
  type ChapterIntent,
} from "../models/input-governance.js";

/**
 * Planning profile tracking feature flags and contract schema version
 * for plan cache fingerprinting.
 */
export const PlanningProfileSchema = z.object({
  authorMindEnabled: z.boolean(),
  contractSchemaVersion: z.number().int().positive().optional(),
  plannerPromptVersion: z.string().min(1).optional(),
  plannerToolVersion: z.number().int().positive().optional(),
}).strict();
export type PlanningProfile = z.infer<typeof PlanningProfileSchema>;

export const PersistedPlanV2Schema = z.object({
  version: z.literal(2),
  intent: ChapterIntentSchema,
  memo: ChapterMemoSchema,
  plannerInputs: z.array(z.string()),
}).strict();

export const PersistedPlanV3Schema = z.object({
  version: z.literal(3),
  intent: ChapterIntentSchema,
  memo: ChapterMemoSchema,
  creativeContract: ChapterCreativeContractSchema.optional(),
  planningProfile: PlanningProfileSchema.optional(),
  plannerInputs: z.array(z.string()),
}).strict();

export const PersistedPlanSchema = z.discriminatedUnion("version", [
  PersistedPlanV2Schema,
  PersistedPlanV3Schema,
]);

export type PersistedPlan = z.infer<typeof PersistedPlanSchema>;

function planPath(bookDir: string, chapterNumber: number): string {
  const runtimeDir = join(bookDir, "story", "runtime");
  const padded = String(chapterNumber).padStart(4, "0");
  return join(runtimeDir, `chapter-${padded}.plan.json`);
}

function intentPath(bookDir: string, chapterNumber: number): string {
  const runtimeDir = join(bookDir, "story", "runtime");
  const padded = String(chapterNumber).padStart(4, "0");
  return join(runtimeDir, `chapter-${padded}.intent.md`);
}

export async function savePersistedPlan(
  bookDir: string,
  plan: PlanChapterOutput,
  options?: {
    readonly authorMindEnabled?: boolean;
    readonly plannerPromptVersion?: string;
    readonly plannerToolVersion?: number;
  },
): Promise<void> {
  const authorMindEnabled = options?.authorMindEnabled ?? (plan.planningProfile?.authorMindEnabled ?? Boolean(plan.creativeContract));
  const shouldSaveV3 = Boolean(plan.creativeContract) || (authorMindEnabled && options?.authorMindEnabled !== false);

  const value: PersistedPlan = shouldSaveV3
    ? PersistedPlanV3Schema.parse({
        version: 3,
        intent: plan.intent,
        memo: plan.memo,
        ...(plan.creativeContract ? { creativeContract: plan.creativeContract } : {}),
        planningProfile: {
          authorMindEnabled,
          ...(plan.creativeContract ? { contractSchemaVersion: plan.creativeContract.schemaVersion } : plan.planningProfile?.contractSchemaVersion ? { contractSchemaVersion: plan.planningProfile.contractSchemaVersion } : {}),
          ...(options?.plannerPromptVersion ? { plannerPromptVersion: options.plannerPromptVersion } : plan.planningProfile?.plannerPromptVersion ? { plannerPromptVersion: plan.planningProfile.plannerPromptVersion } : {}),
          ...(options?.plannerToolVersion ? { plannerToolVersion: options.plannerToolVersion } : plan.planningProfile?.plannerToolVersion ? { plannerToolVersion: plan.planningProfile.plannerToolVersion } : {}),
        },
        plannerInputs: plan.plannerInputs,
      })
    : PersistedPlanV2Schema.parse({
        version: 2,
        intent: plan.intent,
        memo: plan.memo,
        plannerInputs: plan.plannerInputs,
      });
  await writeFile(planPath(bookDir, plan.memo.chapter), `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

export async function loadPersistedPlan(
  bookDir: string,
  chapterNumber: number,
): Promise<PlanChapterOutput | null> {
  let raw: string;
  try {
    raw = await readFile(planPath(bookDir, chapterNumber), "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  const persisted: PersistedPlan = PersistedPlanSchema.parse(JSON.parse(raw));
  if (persisted.memo.chapter !== chapterNumber || persisted.intent.chapter !== chapterNumber) {
    throw new Error(`Persisted plan chapter identity does not match chapter ${chapterNumber}.`);
  }

  let intentMarkdown = persisted.memo.body;
  try {
    intentMarkdown = await readFile(intentPath(bookDir, chapterNumber), "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const creativeContract = persisted.version === 3 ? persisted.creativeContract : undefined;
  const planningProfile = persisted.version === 3 ? persisted.planningProfile : undefined;

  return {
    intent: persisted.intent,
    memo: persisted.memo,
    intentMarkdown,
    plannerInputs: persisted.plannerInputs,
    runtimePath: intentPath(bookDir, chapterNumber),
    ...(creativeContract ? { creativeContract } : {}),
    ...(planningProfile ? { planningProfile } : {}),
  };
}

export function relativeToBookDir(bookDir: string, absolutePath: string): string {
  return relative(bookDir, absolutePath).replaceAll("\\", "/");
}
