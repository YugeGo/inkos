import { z } from "zod";

/**
 * Belief strength of the simulated reader.
 * Uses qualitative levels (weak / moderate / strong) to avoid false precision.
 */
export const BeliefStrengthSchema = z.enum(["weak", "moderate", "strong"]);
export type BeliefStrength = z.infer<typeof BeliefStrengthSchema>;

export const QuestionSalienceSchema = z.enum(["low", "medium", "high"]);
export type QuestionSalience = z.infer<typeof QuestionSalienceSchema>;

export const ConstraintSeveritySchema = z.enum(["absolute", "strong"]);
export type ConstraintSeverity = z.infer<typeof ConstraintSeveritySchema>;

export const ConstraintSourceSchema = z.enum(["canon", "world", "logic", "author"]);
export type ConstraintSource = z.infer<typeof ConstraintSourceSchema>;

export const PlotProgressLevelSchema = z.enum(["none", "low", "medium", "high"]);
export type PlotProgressLevel = z.infer<typeof PlotProgressLevelSchema>;

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

/** Hard constraint with a stable ID, source provenance, and severity for automated auditing */
export const HardConstraintSchema = z.object({
  id: z.string().min(1).max(64),
  statement: z.string().min(1).max(500),
  source: ConstraintSourceSchema,
  sourceRef: z.string().min(1).max(256).optional(),
  severity: ConstraintSeveritySchema,
}).strict();
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
 */
export const PlannedAuthorIntentSchema = z.object({
  readerEffects: z.array(z.string().min(1).max(300)).max(8),
  informationStrategy: z.object({
    reveal: z.array(z.string().min(1).max(300)).max(10),
    withhold: z.array(z.string().min(1).max(300)).max(10),
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
 * Enforces volume bounds and non-duplicate stable IDs across constraints and boundaries.
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
});

export type ChapterCreativeContract = z.infer<typeof ChapterCreativeContractSchema>;
