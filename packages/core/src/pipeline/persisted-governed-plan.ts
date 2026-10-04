import { readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import type { PlanChapterOutput } from "../agents/planner.js";
import { createHash } from "node:crypto";
import {
  ChapterCreativeContractSchema,
  ChapterIntentSchema,
  ChapterMemoSchema,
  type ChapterCreativeContract,
  type ChapterIntent,
} from "../models/input-governance.js";

/**
 * Computes deterministic fingerprint hash for planning configuration
 * to ensure cache invalidation when model/prompt/schema changes.
 */
export function computePlannerConfigHash(params: {
  readonly provider?: string;
  readonly model?: string;
  readonly promptVersion?: string;
  readonly toolVersion?: number;
  readonly contractSchemaVersion?: number;
  readonly authorMindEnabled: boolean;
}): string {
  const payload = JSON.stringify({
    provider: params.provider ?? "",
    model: params.model ?? "",
    promptVersion: params.promptVersion ?? "",
    toolVersion: params.toolVersion ?? 0,
    contractSchemaVersion: params.contractSchemaVersion ?? 0,
    authorMindEnabled: params.authorMindEnabled,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/**
 * Planning profile tracking feature flags, model identifiers, and contract schema version
 * for plan cache fingerprinting.
 */
export const PlanningProfileSchema = z.object({
  authorMindEnabled: z.boolean(),
  contractSchemaVersion: z.number().int().positive().optional(),
  plannerPromptVersion: z.string().min(1).optional(),
  plannerToolVersion: z.number().int().positive().optional(),
  plannerProvider: z.string().min(1).optional(),
  plannerModel: z.string().min(1).optional(),
  plannerConfigHash: z.string().min(1).optional(),
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
    readonly plannerProvider?: string;
    readonly plannerModel?: string;
    readonly downgradePlan?: boolean;
  },
): Promise<void> {
  const authorMindEnabled = options?.authorMindEnabled ?? (plan.planningProfile?.authorMindEnabled ?? Boolean(plan.creativeContract));
  
  // Non-destructive preservation: An existing contract in V3 is preserved even if authorMind is disabled,
  // unless caller explicitly passes downgradePlan: true.
  const shouldSaveV3 = !options?.downgradePlan && (Boolean(plan.creativeContract) || authorMindEnabled);

  let value: PersistedPlan;
  if (shouldSaveV3) {
    const contractSchemaVersion = plan.creativeContract ? plan.creativeContract.schemaVersion : plan.planningProfile?.contractSchemaVersion;
    const promptVersion = options?.plannerPromptVersion ?? plan.planningProfile?.plannerPromptVersion;
    const toolVersion = options?.plannerToolVersion ?? plan.planningProfile?.plannerToolVersion;
    const provider = options?.plannerProvider ?? plan.planningProfile?.plannerProvider;
    const model = options?.plannerModel ?? plan.planningProfile?.plannerModel;
    const configHash = computePlannerConfigHash({
      provider,
      model,
      promptVersion,
      toolVersion,
      contractSchemaVersion,
      authorMindEnabled,
    });

    value = PersistedPlanV3Schema.parse({
      version: 3,
      intent: plan.intent,
      memo: plan.memo,
      ...(plan.creativeContract ? { creativeContract: plan.creativeContract } : {}),
      planningProfile: {
        authorMindEnabled,
        ...(contractSchemaVersion ? { contractSchemaVersion } : {}),
        ...(promptVersion ? { plannerPromptVersion: promptVersion } : {}),
        ...(toolVersion ? { plannerToolVersion: toolVersion } : {}),
        ...(provider ? { plannerProvider: provider } : {}),
        ...(model ? { plannerModel: model } : {}),
        plannerConfigHash: configHash,
      },
      plannerInputs: plan.plannerInputs,
    });
  } else {
    value = PersistedPlanV2Schema.parse({
      version: 2,
      intent: plan.intent,
      memo: plan.memo,
      plannerInputs: plan.plannerInputs,
    });
  }
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
