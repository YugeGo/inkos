import { z } from "zod";
import {
  type PlanningEvidenceBundle,
  lookupEvidenceRef,
  lookupEvidenceRecord,
} from "./evidence-bundle.js";

/**
 * Belief strength of the simulated reader.
 * Uses qualitative levels (weak / moderate / strong) to avoid false precision.
 */
export const BeliefStrengthSchema = z.enum(["weak", "moderate", "strong"]);
export type BeliefStrength = z.infer<typeof BeliefStrengthSchema>;

export const QuestionSalienceSchema = z.enum(["low", "medium", "high"]);
export type QuestionSalience = z.infer<typeof QuestionSalienceSchema>;

/**
 * Constraint priority in conflict resolution (Precedence):
 * - absolute: Non-negotiable hard boundary (compiled to top of Writer rule stack).
 * - strong: High-priority constraint; breachable only if in direct conflict with an absolute rule.
 */
export const ConstraintPrioritySchema = z.enum(["absolute", "strong"]);
export type ConstraintPriority = z.infer<typeof ConstraintPrioritySchema>;

/** Backwards-compatible alias */
export const ConstraintSeveritySchema = ConstraintPrioritySchema;
export type ConstraintSeverity = ConstraintPriority;

export const ConstraintSourceSchema = z.enum(["canon", "world", "logic", "author"]);
export type ConstraintSource = z.infer<typeof ConstraintSourceSchema>;

export const PlotProgressLevelSchema = z.enum(["none", "low", "medium", "high"]);
export type PlotProgressLevel = z.infer<typeof PlotProgressLevelSchema>;

/**
 * Information target with a stable semantic ID and descriptive text.
 * Used for precise, computable information boundary control (reveal / withhold / mustRemainUnknown).
 */
export const InformationTargetSchema = z.object({
  id: z.string().min(1).max(64),
  description: z.string().min(1).max(300),
}).strict();
export type InformationTarget = z.infer<typeof InformationTargetSchema>;

/** Reader belief regarding a specific story fact or mystery */
export const ReaderBeliefSchema = z.object({
  proposition: z.string().min(1).max(300),
  strength: BeliefStrengthSchema,
}).strict();
export type ReaderBelief = z.infer<typeof ReaderBeliefSchema>;

/** Questions active in the reader's mind */
export const ReaderQuestionSchema = z.object({
  question: z.string().min(1).max(300),
  salience: QuestionSalienceSchema.optional(),
}).strict();
export type ReaderQuestion = z.infer<typeof ReaderQuestionSchema>;

/**
 * Reader State: First-class representation of reader knowledge and expectations.
 * Strictly decoupled from World Truth. Bound by volume limits.
 */
export const ReaderStateSchema = z.object({
  knows: z.array(z.string().min(1).max(300)).max(15),
  believes: z.array(ReaderBeliefSchema).max(10),
  suspects: z.array(ReaderBeliefSchema).max(10),
  expects: z.array(ReaderBeliefSchema).max(10),
  questions: z.array(ReaderQuestionSchema).max(8),
  emotionalPosition: z.array(z.string().min(1).max(200)).max(8),
}).strict();
export type ReaderState = z.infer<typeof ReaderStateSchema>;

/**
 * Hard constraint with a stable ID, source provenance, and priority for automated auditing.
 * Preprocesses legacy 'severity' into canonical 'priority', strictly ensuring no duplicate
 * or conflicting priority/severity fields exist in the canonical contract.
 */
export const HardConstraintSchema = z.preprocess(
  (val: unknown) => {
    if (val && typeof val === "object") {
      const record = val as Record<string, unknown>;
      if ("severity" in record && !("priority" in record)) {
        const { severity, ...rest } = record;
        return {
          ...rest,
          priority: severity,
        };
      }
      if ("severity" in record && "priority" in record) {
        const { severity: _, ...rest } = record;
        return rest;
      }
    }
    return val;
  },
  z.object({
    id: z.string().min(1).max(64),
    statement: z.string().min(1).max(500),
    source: ConstraintSourceSchema,
    sourceRef: z.string().min(1).max(256).optional(),
    priority: ConstraintPrioritySchema.default("absolute"),
  }).strict(),
);
export type HardConstraint = z.infer<typeof HardConstraintSchema>;


/**
 * Character cognitive and psychological boundaries.
 * Distinguishes between beliefs that must persist throughout the chapter
 * vs beliefs present at the start of the chapter.
 */
export const CharacterConstraintSchema = z.object({
  characterId: z.string().min(1).max(64),
  mustNotKnow: z.array(z.string().min(1).max(400)).max(10).optional(),
  beliefsThatMustPersist: z.array(z.string().min(1).max(400)).max(10).optional(),
  beliefsAtStart: z.array(z.string().min(1).max(400)).max(10).optional(),
  behavioralLimits: z.array(z.string().min(1).max(400)).max(10).optional(),
}).strict();
export type CharacterConstraint = z.infer<typeof CharacterConstraintSchema>;

/** Information boundary that must remain hidden from the reader */
export const InformationBoundarySchema = z.object({
  id: z.string().min(1).max(64),
  topic: z.string().min(1).max(200),
  boundaryRule: z.string().min(1).max(400),
}).strict();
export type InformationBoundary = z.infer<typeof InformationBoundarySchema>;

/** Reader cognitive transition across this chapter */
export const ReaderTransitionSchema = z.object({
  inputState: ReaderStateSchema.optional(),
  desiredAfter: ReaderStateSchema,
  mustRemainUnknown: z.array(InformationBoundarySchema).max(10),
}).strict();
export type ReaderTransition = z.infer<typeof ReaderTransitionSchema>;

/**
 * Planned Author Intent: Forward-looking creative strategy for our own novel generation.
 * (Contrast with InferredAuthorIntentHypothesis used in reverse-engineering external books).
 * Information strategy uses stable InformationTarget IDs for deterministic conflict computation.
 */
export const PlannedAuthorIntentSchema = z.object({
  readerEffects: z.array(z.string().min(1).max(300)).max(8),
  informationStrategy: z.object({
    reveal: z.array(InformationTargetSchema).max(10),
    withhold: z.array(InformationTargetSchema).max(10),
  }).strict(),
  attentionStrategy: z.array(z.string().min(1).max(300)).max(8),
  emotionalTrajectory: z.array(z.string().min(1).max(300)).max(8),
}).strict();
export type PlannedAuthorIntent = z.infer<typeof PlannedAuthorIntentSchema>;

/**
 * Inferred Author Intent Hypothesis: Used for reverse engineering external benchmark works.
 */
export const InferredAuthorIntentHypothesisSchema = z.object({
  hypothesis: z.string().min(1).max(500),
  confidence: BeliefStrengthSchema,
  basis: z.array(z.string().min(1).max(300)).max(10),
  evidence: z.array(z.string().min(1).max(500)).max(10).optional(),
}).strict();
export type InferredAuthorIntentHypothesis = z.infer<typeof InferredAuthorIntentHypothesisSchema>;

/** Forbidden shortcuts with mandatory reason explanation */
export const ForbiddenShortcutSchema = z.object({
  code: z.string().min(1).max(64),
  description: z.string().min(1).max(400),
  reason: z.string().min(1).max(400),
}).strict();
export type ForbiddenShortcut = z.infer<typeof ForbiddenShortcutSchema>;

/**
 * Freedom Zone: Explicit boundary delineating what the model is empowered to create,
 * including deliberate ambiguities and negative space (mustRemainUnderspecified).
 */
export const FreedomZoneSchema = z.object({
  mayInvent: z.array(z.string().min(1).max(300)).max(15),
  mayVary: z.array(z.string().min(1).max(300)).max(15),
  mustRemainUnderspecified: z.array(z.string().min(1).max(400)).max(10),
  surpriseAllowed: z.boolean(),
}).strict();
export type FreedomZone = z.infer<typeof FreedomZoneSchema>;

/** Human core anchored in concrete characters, preventing abstract clichés */
export const HumanCoreSchema = z.object({
  statement: z.string().min(1).max(600),
  anchoredInCharacters: z.array(z.string().min(1).max(64)).min(1).max(6),
}).strict();
export type HumanCore = z.infer<typeof HumanCoreSchema>;

/** Optional chapter function metadata */
export const ChapterFunctionSchema = z.object({
  primary: z.string().min(1).max(100),
  secondary: z.array(z.string().min(1).max(100)).max(6).optional(),
  plotProgress: PlotProgressLevelSchema.optional(),
}).strict();
export type ChapterFunction = z.infer<typeof ChapterFunctionSchema>;

/**
 * Base schema definition before cross-field duplicate validation.
 */
const BaseChapterCreativeContractSchema = z.object({
  schemaVersion: z.literal(1),
  whyThisChapterExists: z.object({
    statement: z.string().min(1).max(600),
  }).strict(),
  chapterFunction: ChapterFunctionSchema.optional(),
  humanCore: HumanCoreSchema,
  hardConstraints: z.array(HardConstraintSchema).max(12),
  characterConstraints: z.array(CharacterConstraintSchema).max(8),
  readerTransition: ReaderTransitionSchema,
  plannedAuthorIntent: PlannedAuthorIntentSchema,
  forbiddenShortcuts: z.array(ForbiddenShortcutSchema).max(10),
  freedomZone: FreedomZoneSchema,
}).strict();

/**
 * The Master Creative Contract Schema (Version 1).
 * "Chapter Contract is a fence, not a railroad."
 * Enforces volume bounds, non-duplicate stable IDs, and ID-based information conflict prevention.
 */
export const ChapterCreativeContractSchema = BaseChapterCreativeContractSchema.superRefine((data, ctx) => {
  const hardConstraintIds = new Set<string>();
  for (let i = 0; i < data.hardConstraints.length; i++) {
    const id = data.hardConstraints[i].id;
    if (hardConstraintIds.has(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate hardConstraint id "${id}" found at index ${i}`,
        path: ["hardConstraints", i, "id"],
      });
    }
    hardConstraintIds.add(id);
  }

  const boundaryIds = new Set<string>();
  for (let i = 0; i < data.readerTransition.mustRemainUnknown.length; i++) {
    const id = data.readerTransition.mustRemainUnknown[i].id;
    if (boundaryIds.has(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate mustRemainUnknown boundary id "${id}" found at index ${i}`,
        path: ["readerTransition", "mustRemainUnknown", i, "id"],
      });
    }
    if (hardConstraintIds.has(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `ID collision: boundary id "${id}" collides with an existing hardConstraint id`,
        path: ["readerTransition", "mustRemainUnknown", i, "id"],
      });
    }
    boundaryIds.add(id);
  }

  const shortcutCodes = new Set<string>();
  for (let i = 0; i < data.forbiddenShortcuts.length; i++) {
    const code = data.forbiddenShortcuts[i].code;
    if (shortcutCodes.has(code)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate forbiddenShortcut code "${code}" found at index ${i}`,
        path: ["forbiddenShortcuts", i, "code"],
      });
    }
    shortcutCodes.add(code);
  }

  // ID-based Information Target Validation
  const revealIds = new Set<string>();
  for (let i = 0; i < data.plannedAuthorIntent.informationStrategy.reveal.length; i++) {
    const target = data.plannedAuthorIntent.informationStrategy.reveal[i];
    if (revealIds.has(target.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate informationTarget id "${target.id}" in reveal at index ${i}`,
        path: ["plannedAuthorIntent", "informationStrategy", "reveal", i, "id"],
      });
    }
    revealIds.add(target.id);

    // reveal ∩ mustRemainUnknown = ∅
    if (boundaryIds.has(target.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Information target "${target.id}" is marked for reveal but also listed in mustRemainUnknown`,
        path: ["plannedAuthorIntent", "informationStrategy", "reveal", i, "id"],
      });
    }
  }

  const withholdIds = new Set<string>();
  for (let i = 0; i < data.plannedAuthorIntent.informationStrategy.withhold.length; i++) {
    const target = data.plannedAuthorIntent.informationStrategy.withhold[i];
    if (withholdIds.has(target.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate informationTarget id "${target.id}" in withhold at index ${i}`,
        path: ["plannedAuthorIntent", "informationStrategy", "withhold", i, "id"],
      });
    }
    withholdIds.add(target.id);

    // reveal ∩ withhold = ∅
    if (revealIds.has(target.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Information target "${target.id}" cannot be in both reveal and withhold strategies`,
        path: ["plannedAuthorIntent", "informationStrategy", "withhold", i, "id"],
      });
    }
  }
});

export type ChapterCreativeContract = z.infer<typeof ChapterCreativeContractSchema>;

/** Default maximum token budget for the entire Creative Contract (transport guard) */
export const DEFAULT_MAX_CONTRACT_TOKENS = 4000;

/**
 * Heuristic estimation of tokens consumed by the contract payload.
 * CJK characters count ~1.3 tokens each; ASCII/code syntax ~0.35 tokens per char.
 */
export function estimateContractTokens(contract: ChapterCreativeContract): number {
  const json = JSON.stringify(contract);
  let cjkCount = 0;
  let nonCjkCount = 0;
  for (let i = 0; i < json.length; i++) {
    const code = json.charCodeAt(i);
    if (code >= 0x4e00 && code <= 0x9fff) {
      cjkCount++;
    } else {
      nonCjkCount++;
    }
  }
  return Math.ceil(cjkCount * 1.3 + nonCjkCount * 0.35);
}

export type ConstraintPressureLevel = "low" | "medium" | "high";

export interface ConstraintPressure {
  readonly score: number; // 0 to 100
  readonly level: ConstraintPressureLevel;
  readonly breakdown: {
    readonly hardConstraintsCount: number;
    readonly characterLocksCount: number;
    readonly unknownBoundariesCount: number;
    readonly forbiddenShortcutsCount: number;
    readonly freedomCount: number;
  };
  readonly details: string;
}

/**
 * Computes constraint pressure score (0 to 100) indicating how heavily constrained the Writer is.
 * Used for diagnostic telemetry and alerting when the contract is becoming a "railroad" rather than a "fence".
 */
export function computeConstraintPressure(contract: ChapterCreativeContract): ConstraintPressure {
  const hardConstraintsCount = contract.hardConstraints.length;
  let characterLocksCount = 0;
  for (const cc of contract.characterConstraints) {
    characterLocksCount += (cc.mustNotKnow?.length ?? 0) + (cc.beliefsThatMustPersist?.length ?? 0) + (cc.behavioralLimits?.length ?? 0);
  }
  const unknownBoundariesCount = contract.readerTransition.mustRemainUnknown.length;
  const forbiddenShortcutsCount = contract.forbiddenShortcuts.length;
  const freedomCount = contract.freedomZone.mayInvent.length + contract.freedomZone.mayVary.length + contract.freedomZone.mustRemainUnderspecified.length;

  // Pressure adds points; freedom relieves points
  const rawScore = (hardConstraintsCount * 4) + (characterLocksCount * 2.5) + (unknownBoundariesCount * 3) + (forbiddenShortcutsCount * 3.5) - (freedomCount * 2);
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  const level: ConstraintPressureLevel = score >= 50 ? "high" : score >= 25 ? "medium" : "low";
  const details = `Pressure score ${score}/100 (${level}): ${hardConstraintsCount} hard rules, ${characterLocksCount} character locks, ${forbiddenShortcutsCount} shortcuts, ${freedomCount} freedom allowances`;

  return {
    score,
    level,
    breakdown: {
      hardConstraintsCount,
      characterLocksCount,
      unknownBoundariesCount,
      forbiddenShortcutsCount,
      freedomCount,
    },
    details,
  };
}

export interface ContractIssue {
  readonly path: string;
  readonly message: string;
  readonly code: string;
}

export interface ContractValidationResult {
  readonly ok: boolean;
  readonly errors: ReadonlyArray<ContractIssue>;
  readonly warnings: ReadonlyArray<ContractIssue>;
  readonly constraintPressure: ConstraintPressure;
  readonly estimatedTokens: number;
}

/**
 * Validates contract semantics, provenance boundaries, token budget, and produces constraint pressure metrics.
 */
export function validateCreativeContractSemantics(
  contract: ChapterCreativeContract,
  bundle?: PlanningEvidenceBundle,
  options?: {
    readonly maxTokens?: number;
    readonly memoGoal?: string;
  },
): ContractValidationResult {
  const errors: ContractIssue[] = [];
  const warnings: ContractIssue[] = [];

  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_CONTRACT_TOKENS;
  const estimatedTokens = estimateContractTokens(contract);

  // 1. Token Budget Check
  if (estimatedTokens > maxTokens) {
    errors.push({
      path: "global.tokens",
      message: `Contract estimated token count (${estimatedTokens}) exceeds maximum budget (${maxTokens})`,
      code: "CONTRACT_TOKEN_BUDGET_EXCEEDED",
    });
  }

  // 2. Constraint Pressure & Freedom Balance
  const constraintPressure = computeConstraintPressure(contract);
  if (constraintPressure.level === "high") {
    warnings.push({
      path: "global.pressure",
      message: `High constraint pressure (${constraintPressure.score}/100). The contract may excessively restrict writer creative latitude.`,
      code: "HIGH_CONSTRAINT_PRESSURE",
    });
  }

  if (contract.hardConstraints.length >= 10) {
    warnings.push({
      path: "hardConstraints",
      message: `Hard constraints count is near maximum (${contract.hardConstraints.length}/12).`,
      code: "HARD_CONSTRAINTS_NEAR_CAPACITY",
    });
  }

  if (contract.freedomZone.mayInvent.length === 0 && contract.freedomZone.mayVary.length === 0) {
    warnings.push({
      path: "freedomZone",
      message: "Freedom zone provides no explicit invent or vary allowances; writer creative agency is constrained.",
      code: "EMPTY_FREEDOM_ZONE",
    });
  }

  // 3. Cheap Structural Heuristic for Intent Laziness
  if (options?.memoGoal) {
    const trimmedMemoGoal = options.memoGoal.trim();
    const trimmedWhy = contract.whyThisChapterExists.statement.trim();
    const trimmedHumanCore = contract.humanCore.statement.trim();

    if (trimmedMemoGoal === trimmedWhy) {
      errors.push({
        path: "whyThisChapterExists.statement",
        message: "whyThisChapterExists must not be an identical copy of memo.goal (cheap structural heuristic).",
        code: "LAZY_COPY_MEMO_GOAL",
      });
    }
    if (trimmedWhy === trimmedHumanCore) {
      errors.push({
        path: "humanCore.statement",
        message: "humanCore must not be an identical copy of whyThisChapterExists (cheap structural heuristic).",
        code: "LAZY_COPY_HUMAN_CORE",
      });
    }
  }

  // 4. Evidence Provenance & Canon Boundaries
  if (bundle) {
    // Validate hard constraints sourceRef and canon authority
    for (let i = 0; i < contract.hardConstraints.length; i++) {
      const hc = contract.hardConstraints[i];
      if (hc.source === "canon") {
        if (!hc.sourceRef) {
          errors.push({
            path: `hardConstraints[${i}].sourceRef`,
            message: `Hard constraint "${hc.id}" claims source "canon" but provides no sourceRef provenance.`,
            code: "MISSING_CANON_SOURCEREF",
          });
        } else {
          const rec = lookupEvidenceRecord(bundle, hc.sourceRef);
          if (!rec) {
            errors.push({
              path: `hardConstraints[${i}].sourceRef`,
              message: `Hard constraint "${hc.id}" references unverified evidence "${hc.sourceRef}" not in PlanningEvidenceBundle.`,
              code: "UNVERIFIED_EVIDENCE_REFERENCE",
            });
          } else if (rec.item.temporalScope === "historical") {
            errors.push({
              path: `hardConstraints[${i}].sourceRef`,
              message: `Hard constraint "${hc.id}" claims source "canon" but references expired historical fact "${hc.sourceRef}". Historical facts cannot be active canon constraints.`,
              code: "HISTORICAL_CANON_CONFUSION",
            });
          } else if (rec.category !== "canonFacts" || rec.item.authority !== "canon") {
            // Strict Canon boundary check!
            errors.push({
              path: `hardConstraints[${i}].sourceRef`,
              message: `Hard constraint "${hc.id}" claims source "canon" but references evidence "${hc.sourceRef}" with authority "${rec.item.authority}". Only verified canon facts are valid for canon constraints.`,
              code: rec.item.authority === "outline" ? "OUTLINE_CANON_CONFUSION" : "INVALID_CANON_AUTHORITY",
            });
          }
        }
      } else if (hc.source === "world") {
        if (!hc.sourceRef) {
          errors.push({
            path: `hardConstraints[${i}].sourceRef`,
            message: `Hard constraint "${hc.id}" claims source "world" but provides no sourceRef provenance. World rules must cite runtimeState or bookRules evidence.`,
            code: "MISSING_WORLD_SOURCEREF",
          });
        } else {
          const rec = lookupEvidenceRecord(bundle, hc.sourceRef);
          if (!rec) {
            errors.push({
              path: `hardConstraints[${i}].sourceRef`,
              message: `Hard constraint "${hc.id}" references unverified evidence "${hc.sourceRef}" not in PlanningEvidenceBundle.`,
              code: "UNVERIFIED_EVIDENCE_REFERENCE",
            });
          } else if (rec.category === "activeHooks") {
            errors.push({
              path: `hardConstraints[${i}].sourceRef`,
              message: `Hard constraint "${hc.id}" attempts to treat active hook "${hc.sourceRef}" as established world truth. Hooks are dramatic intentions, not world facts.`,
              code: "HOOK_AS_WORLD_REALITY",
            });
          } else if (rec.item.authority === "outline" || rec.category === "outlineIntentions") {
            errors.push({
              path: `hardConstraints[${i}].sourceRef`,
              message: `Hard constraint "${hc.id}" attempts to treat outline intention "${hc.sourceRef}" as world reality.`,
              code: "OUTLINE_CANON_CONFUSION",
            });
          } else if (rec.category !== "runtimeState" && rec.category !== "bookRules") {
            errors.push({
              path: `hardConstraints[${i}].sourceRef`,
              message: `Hard constraint "${hc.id}" claims source "world" but references evidence "${hc.sourceRef}" in category "${rec.category}". World rules must cite runtimeState or bookRules.`,
              code: "INVALID_WORLD_AUTHORITY",
            });
          }
        }
      } else if (hc.source === "author") {
        if (!hc.sourceRef) {
          errors.push({
            path: `hardConstraints[${i}].sourceRef`,
            message: `Hard constraint "${hc.id}" claims source "author" but provides no sourceRef provenance. Author constraints must cite explicit author instructions.`,
            code: "MISSING_AUTHOR_SOURCEREF",
          });
        } else {
          const rec = lookupEvidenceRecord(bundle, hc.sourceRef);
          if (!rec) {
            errors.push({
              path: `hardConstraints[${i}].sourceRef`,
              message: `Hard constraint "${hc.id}" references unverified author instruction "${hc.sourceRef}".`,
              code: "UNVERIFIED_EVIDENCE_REFERENCE",
            });
          } else if (rec.category !== "authorInstructions" || rec.item.authority !== "author_instruction") {
            errors.push({
              path: `hardConstraints[${i}].sourceRef`,
              message: `Hard constraint "${hc.id}" claims source "author" but references evidence "${hc.sourceRef}" with authority "${rec.item.authority}".`,
              code: "INVALID_AUTHOR_INSTRUCTION_AUTHORITY",
            });
          }
        }
      } else if (hc.source === "logic") {
        if (hc.sourceRef) {
          const rec = lookupEvidenceRecord(bundle, hc.sourceRef);
          if (!rec) {
            errors.push({
              path: `hardConstraints[${i}].sourceRef`,
              message: `Hard constraint "${hc.id}" references unverified evidence "${hc.sourceRef}".`,
              code: "UNVERIFIED_EVIDENCE_REFERENCE",
            });
          }
        }
      }
    }


    // Validate characters belong to known characterIds
    const knownChars = new Set(bundle.characterIds);
    for (let i = 0; i < contract.humanCore.anchoredInCharacters.length; i++) {
      const char = contract.humanCore.anchoredInCharacters[i];
      if (!knownChars.has(char)) {
        errors.push({
          path: `humanCore.anchoredInCharacters[${i}]`,
          message: `Anchored character "${char}" is not registered in PlanningEvidenceBundle characterIds.`,
          code: "UNKNOWN_CHARACTER_ID",
        });
      }
    }

    for (let i = 0; i < contract.characterConstraints.length; i++) {
      const cc = contract.characterConstraints[i];
      if (!knownChars.has(cc.characterId)) {
        errors.push({
          path: `characterConstraints[${i}].characterId`,
          message: `Constrained character "${cc.characterId}" is not registered in PlanningEvidenceBundle characterIds.`,
          code: "UNKNOWN_CHARACTER_ID",
        });
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    constraintPressure,
    estimatedTokens,
  };
}
