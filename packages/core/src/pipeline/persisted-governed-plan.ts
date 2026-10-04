import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import type { PlanChapterOutput } from "../agents/planner.js";
import type { PlanningEvidenceBundle } from "../models/evidence-bundle.js";
import type { BookConfig } from "../models/book.js";
import { type AgentContext, resolveWorkerSkillActivations } from "../agents/base.js";
import type { ActivatedSkillGuidance } from "../agent/skill-tool.js";
import type { LengthSpec } from "../models/length-governance.js";
import { buildLengthSpec } from "../utils/length-metrics.js";
import { loadPlanningSeedMaterials, type PlanningSeedMaterials } from "../utils/planning-materials.js";
import { buildPlanningEvidenceBundle } from "../agents/planner-evidence.js";
import { getAuthorMindPlannerSystemPrompt } from "../agents/planner-prompts.js";
import { GovernedPlanContractToolSchema } from "../agents/planner-tool.js";
import { commitAtomicFileSet } from "../utils/atomic-file-set.js";
import { createHash } from "node:crypto";
import {
  ChapterCreativeContractSchema,
  ChapterIntentSchema,
  ChapterMemoSchema,
  type ChapterCreativeContract,
  type ChapterIntent,
} from "../models/input-governance.js";

export const PLANNER_PROMPT_VERSION = "author-mind-planner-v2.2.1";
export const PLANNER_TOOL_VERSION = 2;

/**
 * Computes deterministic protocol fingerprint from actual prompt, tool schema,
 * activated skills, and contract schema version to ensure any prompt/tool/skill edit
 * immediately invalidates cache.
 */
export function computePlannerProtocolHash(params: {
  readonly systemPrompt: string;
  readonly toolSchema: unknown;
  readonly contractSchemaVersion: number;
  readonly language: string;
  readonly skillFingerprint?: string;
}): string {
  const content = [
    params.systemPrompt,
    JSON.stringify(params.toolSchema),
    String(params.contractSchemaVersion),
    params.language,
    params.skillFingerprint ?? "",
  ].join(":::");
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Computes deterministic fingerprint hash for planning configuration
 * to ensure cache invalidation when model/provider/service/prompt/schema changes.
 */
export function computePlannerConfigHash(params: {
  readonly provider?: string;
  readonly service?: string;
  readonly model?: string;
  readonly promptVersion?: string;
  readonly toolVersion?: number;
  readonly contractSchemaVersion?: number;
  readonly authorMindEnabled: boolean;
  readonly protocolHash?: string;
}): string {
  const payload = JSON.stringify({
    provider: params.provider ?? "",
    service: params.service ?? "",
    model: params.model ?? "",
    promptVersion: params.promptVersion ?? "",
    toolVersion: params.toolVersion ?? 0,
    contractSchemaVersion: params.contractSchemaVersion ?? 0,
    authorMindEnabled: params.authorMindEnabled,
    protocolHash: params.protocolHash ?? "",
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export interface PlanningInputFingerprintData {
  readonly chapterNumber?: number;
  readonly evidenceBundle: PlanningEvidenceBundle;
  readonly currentInstruction?: string;
  readonly externalContext?: string;
  readonly taskGoal?: string;
  readonly lengthBudget?: { target: number; unit: string };
  readonly previousEndingExcerpt?: string;
  readonly selectedSources?: ReadonlyArray<string>;
  readonly relevantSourceChecksums?: ReadonlyArray<{ path: string; hash: string }>;
}

/**
 * Computes deterministic fingerprint hash for planning inputs and evidence bundle
 * using canonical sorting to detect changes that invalidate cached plans.
 */
export function computePlanningInputHash(
  input: PlanningEvidenceBundle | PlanningInputFingerprintData,
): string {
  const isBundle = "canonFacts" in input;
  const bundle: PlanningEvidenceBundle = isBundle
    ? (input as PlanningEvidenceBundle)
    : (input as PlanningInputFingerprintData).evidenceBundle;
  const data: Partial<PlanningInputFingerprintData> = isBundle
    ? {}
    : (input as PlanningInputFingerprintData);

  const lines: string[] = [];

  // 1. Task & Context metadata
  if (data.chapterNumber !== undefined) {
    lines.push(`meta|chapter|${data.chapterNumber}`);
  }
  if (data.currentInstruction) {
    lines.push(`meta|instruction|${data.currentInstruction.trim()}`);
  }
  if (data.externalContext) {
    lines.push(`meta|externalContext|${data.externalContext.trim()}`);
  }
  if (data.taskGoal) {
    lines.push(`meta|taskGoal|${data.taskGoal.trim()}`);
  }
  if (data.lengthBudget) {
    lines.push(`meta|lengthBudget|${data.lengthBudget.target}:${data.lengthBudget.unit}`);
  }
  if (data.previousEndingExcerpt) {
    lines.push(`meta|prevEnding|${data.previousEndingExcerpt.trim()}`);
  }
  if (data.selectedSources) {
    const sortedSources = [...data.selectedSources].sort();
    for (const src of sortedSources) {
      lines.push(`meta|source|${src}`);
    }
  }
  if (data.relevantSourceChecksums) {
    const sortedChecksums = [...data.relevantSourceChecksums].sort((a, b) => a.path.localeCompare(b.path));
    for (const item of sortedChecksums) {
      lines.push(`sourceChecksum|${item.path}|${item.hash}`);
    }
  }

  // 2. Canonically sorted Evidence Bundle
  const categories = [
    "bookRules",
    "canonFacts",
    "runtimeState",
    "activeHooks",
    "outlineIntentions",
    "authorInstructions",
  ] as const;

  for (const cat of categories) {
    const items = [...(bundle[cat] ?? [])];
    items.sort((a, b) => a.ref.localeCompare(b.ref));
    for (const item of items) {
      lines.push(`${cat}|${item.ref}|${item.authority}|${item.text}`);
    }
  }

  const sortedChars = [...(bundle.characterIds ?? [])].sort();
  for (const charId of sortedChars) {
    lines.push(`characterId|${charId}`);
  }

  return createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16);
}

async function collectRoleFileRelativePaths(storyDir: string): Promise<string[]> {
  const rolesDir = join(storyDir, "roles");
  const results: string[] = [];
  async function walk(dir: string, relPrefix: string) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await walk(join(dir, entry.name), rel);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          results.push(`roles/${rel}`);
        }
      }
    } catch (err: any) {
      if (err?.code !== "ENOENT") throw err;
    }
  }
  await walk(rolesDir, "");
  return results;
}

/**
 * Computes deterministic content checksums for story seed and context candidate files
 * to invalidate cached plan if user/author directly edits outline, style, roles, or state files.
 */
export async function computeRelevantSourcesChecksum(
  bookDir: string,
): Promise<ReadonlyArray<{ path: string; hash: string }>> {
  const storyDir = join(bookDir, "story");
  const staticTargets = [
    "author_intent.md",
    "current_focus.md",
    "brief.md",
    "book_rules.json",
    "book_rules.md",
    "style_guide.md",
    "parent_canon.md",
    "fanfic_canon.md",
    "volume_summaries.md",
    "outline/story_frame.md",
    "outline/volume_map.md",
    "state/manifest.json",
    "state/current_state.json",
    "state/hooks.json",
    "state/chapter_summaries.json",
  ];

  const roleTargets = await collectRoleFileRelativePaths(storyDir);
  const allTargets = Array.from(new Set([...staticTargets, ...roleTargets])).sort((a, b) => a.localeCompare(b));

  const results: Array<{ path: string; hash: string }> = [];
  for (const relPath of allTargets) {
    const fullPath = join(storyDir, relPath);
    try {
      const content = await readFile(fullPath, "utf-8");
      const hash = createHash("sha256").update(content).digest("hex").slice(0, 16);
      results.push({ path: relPath, hash });
    } catch (err: any) {
      if (err?.code !== "ENOENT") throw err;
    }
  }
  return results;
}

/**
 * Computes deterministic content fingerprint across activated skills,
 * including skill body, resource paths, offsets, and resource content hashes.
 */
export function computeSkillsFingerprint(
  skills?: ReadonlyArray<ActivatedSkillGuidance | { name: string; guidance?: string }>,
): string {
  if (!skills || skills.length === 0) return "";
  const lines: string[] = [];
  for (const item of skills) {
    if ("skill" in item) {
      const skillId = item.skill.id;
      const skillName = item.skill.name;
      const skillBody = item.skill.body?.trim() || item.skill.description || "";
      const skillBodyHash = createHash("sha256").update(skillBody).digest("hex").slice(0, 16);

      const resourceLines: string[] = [];
      const resources = [...(item.resources ?? [])].sort((a, b) => {
        const pathCmp = a.path.localeCompare(b.path);
        if (pathCmp !== 0) return pathCmp;
        return a.charStart - b.charStart;
      });

      for (const res of resources) {
        const resBodyHash = createHash("sha256").update(res.body ?? "").digest("hex").slice(0, 16);
        resourceLines.push(`${res.path}:${res.charStart}:${res.charEnd}:${resBodyHash}`);
      }

      lines.push(`skill|${skillId}|${skillName}|${skillBodyHash}|${resourceLines.join(";")}`);
    } else {
      const name = item.name;
      const guidanceHash = createHash("sha256").update(item.guidance ?? "").digest("hex").slice(0, 16);
      lines.push(`customSkill|${name}|${guidanceHash}`);
    }
  }
  lines.sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16);
}

export interface PreparedPlanningFingerprint {
  readonly evidenceBundle: PlanningEvidenceBundle;
  readonly seedMaterials: PlanningSeedMaterials;
  readonly lengthSpec: LengthSpec;
  readonly taskGoal: string;
  readonly configHash: string;
  readonly inputHash: string;
  readonly protocolHash: string;
}

/**
 * Single authoritative planner fingerprint builder used symmetrically by Planner and Runner.
 * Eliminates fingerprint drift between planning generation and cache verification.
 */
export async function preparePlanningFingerprint(params: {
  readonly book: BookConfig;
  readonly bookDir: string;
  readonly chapterNumber: number;
  readonly externalContext?: string;
  readonly plannerCtx: AgentContext;
  readonly evidenceBundle?: PlanningEvidenceBundle;
}): Promise<PreparedPlanningFingerprint> {
  const language = params.book.language ?? "zh";
  const lengthSpec = buildLengthSpec(params.book.chapterWordCount, language);

  const seedMaterials = await loadPlanningSeedMaterials({
    bookDir: params.bookDir,
    chapterNumber: params.chapterNumber,
  });

  const taskGoal = [
    params.externalContext,
    seedMaterials.currentFocus,
    seedMaterials.authorIntent,
    seedMaterials.brief,
  ].map((value) => value?.trim()).filter(Boolean).join("\n\n")
    || (language === "en"
      ? `Continue chapter ${params.chapterNumber} from the current Work state.`
      : `根据当前作品状态续写第${params.chapterNumber}章。`);

  const evidenceBundle = params.evidenceBundle ?? await buildPlanningEvidenceBundle({
    bookDir: params.bookDir,
    chapterNumber: params.chapterNumber,
    currentInstruction: params.externalContext,
  });

  const client = params.plannerCtx.client as any;
  const provider = client?.provider ?? "unknown";
  const service = client?.service ?? client?.config?.service ?? "";
  const model = params.plannerCtx.model;
  const resolvedSkills = await resolveWorkerSkillActivations(params.plannerCtx, taskGoal, true);
  const skillFingerprint = computeSkillsFingerprint(resolvedSkills);

  const protocolHash = computePlannerProtocolHash({
    systemPrompt: getAuthorMindPlannerSystemPrompt(language),
    toolSchema: GovernedPlanContractToolSchema,
    contractSchemaVersion: 1,
    language,
    skillFingerprint,
  });

  const configHash = computePlannerConfigHash({
    provider,
    service,
    model,
    promptVersion: PLANNER_PROMPT_VERSION,
    toolVersion: PLANNER_TOOL_VERSION,
    contractSchemaVersion: 1,
    authorMindEnabled: true,
    protocolHash,
  });

  const relevantSourceChecksums = await computeRelevantSourcesChecksum(params.bookDir);

  const inputHash = computePlanningInputHash({
    chapterNumber: params.chapterNumber,
    evidenceBundle,
    currentInstruction: params.externalContext,
    externalContext: params.externalContext,
    taskGoal,
    lengthBudget: {
      target: lengthSpec.target,
      unit: lengthSpec.countingMode === "en_words" ? "words" : "字",
    },
    previousEndingExcerpt: seedMaterials.previousEndingExcerpt,
    relevantSourceChecksums,
  });

  return {
    evidenceBundle,
    seedMaterials,
    lengthSpec,
    taskGoal,
    configHash,
    inputHash,
    protocolHash,
  };
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
  planningInputHash: z.string().min(1).optional(),
  plannerProtocolHash: z.string().min(1).optional(),
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
    readonly planningInputHash?: string;
    readonly plannerProtocolHash?: string;
    readonly downgradePlan?: boolean;
  },
): Promise<void> {
  const hasExistingContract = Boolean(plan.creativeContract);
  const runtimeAuthorMindEnabled = options?.authorMindEnabled ?? (plan.planningProfile?.authorMindEnabled ?? hasExistingContract);
  
  // Non-destructive preservation: An existing contract in V3 is preserved even if runtime authorMind is disabled,
  // unless caller explicitly passes downgradePlan: true.
  const shouldSaveV3 = !options?.downgradePlan && (hasExistingContract || runtimeAuthorMindEnabled);

  let value: PersistedPlan;
  if (shouldSaveV3) {
    // Planning profile represents IMMUTABLE generation provenance, not current transient consumption flags.
    // If the plan already has a planningProfile, preserve its original generation facts intact.
    const originalProfile = plan.planningProfile;
    const authorMindProvenance = originalProfile?.authorMindEnabled ?? runtimeAuthorMindEnabled;
    const contractSchemaVersion = plan.creativeContract ? plan.creativeContract.schemaVersion : originalProfile?.contractSchemaVersion;
    const promptVersion = originalProfile?.plannerPromptVersion ?? options?.plannerPromptVersion;
    const toolVersion = originalProfile?.plannerToolVersion ?? options?.plannerToolVersion;
    const provider = originalProfile?.plannerProvider ?? options?.plannerProvider;
    const model = originalProfile?.plannerModel ?? options?.plannerModel;
    const inputHash = originalProfile?.planningInputHash ?? options?.planningInputHash;
    const protocolHash = originalProfile?.plannerProtocolHash ?? options?.plannerProtocolHash;
    const configHash = originalProfile?.plannerConfigHash ?? computePlannerConfigHash({
      provider,
      model,
      promptVersion,
      toolVersion,
      contractSchemaVersion,
      authorMindEnabled: authorMindProvenance,
      protocolHash,
    });

    value = PersistedPlanV3Schema.parse({
      version: 3,
      intent: plan.intent,
      memo: plan.memo,
      ...(plan.creativeContract ? { creativeContract: plan.creativeContract } : {}),
      planningProfile: {
        authorMindEnabled: authorMindProvenance,
        ...(contractSchemaVersion ? { contractSchemaVersion } : {}),
        ...(promptVersion ? { plannerPromptVersion: promptVersion } : {}),
        ...(toolVersion ? { plannerToolVersion: toolVersion } : {}),
        ...(provider ? { plannerProvider: provider } : {}),
        ...(model ? { plannerModel: model } : {}),
        ...(inputHash ? { planningInputHash: inputHash } : {}),
        ...(protocolHash ? { plannerProtocolHash: protocolHash } : {}),
        plannerConfigHash: configHash,
      },
      plannerInputs: plan.plannerInputs,
    });
  } else {
    // Before overwriting an existing V3 plan on disk with a V2 plan, archive it safely and atomically
    const targetPath = planPath(bookDir, plan.memo.chapter);
    let existingRaw: string | undefined;
    try {
      existingRaw = await readFile(targetPath, "utf-8");
    } catch (err: any) {
      if (err?.code !== "ENOENT") throw err;
    }

    let archiveFilename: string | undefined;
    if (existingRaw) {
      let existingJson: any;
      try {
        existingJson = JSON.parse(existingRaw);
      } catch (parseErr: any) {
        throw new Error(
          `Failed to parse existing plan at ${targetPath} before downgrade: ${parseErr.message} (Fail-Closed)`
        );
      }
      if (existingJson?.version === 3 && existingJson?.creativeContract) {
        const padded = String(plan.memo.chapter).padStart(4, "0");
        archiveFilename = `chapter-${padded}.plan.author-mind.${Date.now()}.json`;
      }
    }

    value = PersistedPlanV2Schema.parse({
      version: 2,
      intent: plan.intent,
      memo: plan.memo,
      plannerInputs: plan.plannerInputs,
    });

    if (archiveFilename && existingRaw) {
      const runtimeDir = join(bookDir, "story", "runtime");
      const padded = String(plan.memo.chapter).padStart(4, "0");
      const planFilename = `chapter-${padded}.plan.json`;
      const planContent = `${JSON.stringify(value, null, 2)}\n`;

      await commitAtomicFileSet({
        rootDir: runtimeDir,
        writes: [
          { relativePath: `history/${archiveFilename}`, content: existingRaw },
          { relativePath: planFilename, content: planContent },
        ],
      });
      return;
    }
  }
  await writeFile(planPath(bookDir, plan.memo.chapter), `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

export interface PlanReusabilityCheckOptions {
  readonly expectedAuthorMindEnabled: boolean;
  readonly expectedConfigHash?: string;
  readonly expectedInputHash?: string;
}

/**
 * Validates whether a persisted plan matches current planning configuration and input state.
 * Returns reusable: false if config/input hashes mismatch or if Author-Mind requirement is unsatisfied.
 * Fails closed: missing hashes in persisted profile when expected hashes are specified will reject reuse.
 */
export function isPersistedPlanReusable(
  plan: PlanChapterOutput,
  options: PlanReusabilityCheckOptions,
): { readonly reusable: boolean; readonly reason?: string } {
  if (options.expectedAuthorMindEnabled) {
    if (!plan.creativeContract) {
      return {
        reusable: false,
        reason: "Author-Mind is enabled but the persisted plan lacks a Creative Contract.",
      };
    }
  }

  const profile = plan.planningProfile;
  if (!profile) {
    if (options.expectedAuthorMindEnabled) {
      return {
        reusable: false,
        reason: "Author-Mind is enabled but the persisted plan has no planning profile.",
      };
    }
    return { reusable: true };
  }

  if (profile.authorMindEnabled !== options.expectedAuthorMindEnabled) {
    return {
      reusable: false,
      reason: `Author-Mind state mismatch: expected ${options.expectedAuthorMindEnabled}, found ${profile.authorMindEnabled}.`,
    };
  }

  if (options.expectedConfigHash) {
    if (!profile.plannerConfigHash) {
      return {
        reusable: false,
        reason: "Planner configuration hash missing from persisted plan.",
      };
    }
    if (profile.plannerConfigHash !== options.expectedConfigHash) {
      return {
        reusable: false,
        reason: `Planner configuration hash mismatch: expected ${options.expectedConfigHash}, found ${profile.plannerConfigHash}.`,
      };
    }
  }

  if (options.expectedInputHash) {
    if (!profile.planningInputHash) {
      return {
        reusable: false,
        reason: "Planning input hash missing from persisted plan.",
      };
    }
    if (profile.planningInputHash !== options.expectedInputHash) {
      return {
        reusable: false,
        reason: `Planning input hash mismatch: expected ${options.expectedInputHash}, found ${profile.planningInputHash}.`,
      };
    }
  }

  return { reusable: true };
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
