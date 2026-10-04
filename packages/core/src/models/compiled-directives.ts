import { z } from "zod";

/**
 * Directive authority level in hierarchy of precedence:
 * - L0_ABSOLUTE: Non-negotiable hard boundaries, secrets, forbidden shortcuts, and negative-space guardrails.
 * - L1_STRONG: High-priority behavioral boundaries and persistence constraints.
 * - L2_SOFT: Chapter purpose, human core, reader transition (before -> after), and narrative information strategy.
 * - L3_FREEDOM: Artistic freedom permissions (invent, vary, local creative allowance).
 */
export const DirectiveAuthorityLevelSchema = z.enum([
  "L0_ABSOLUTE",
  "L1_STRONG",
  "L2_SOFT",
  "L3_FREEDOM",
]);
export type DirectiveAuthorityLevel = z.infer<typeof DirectiveAuthorityLevelSchema>;

export const CompiledDirectiveCategorySchema = z.enum([
  "hard_constraint",
  "information_boundary",
  "character_cognitive",
  "character_behavior",
  "character_belief",
  "forbidden_shortcut",
  "negative_space",
  "chapter_purpose",
  "human_core",
  "target_reader_state",
  "author_intent_strategy",
  "freedom_allowance",
]);
export type CompiledDirectiveCategory = z.infer<typeof CompiledDirectiveCategorySchema>;

/**
 * Compiled creative directive with explicit authority level and complete provenance.
 */
export const CompiledDirectiveSchema = z.object({
  id: z.string().min(1).max(64),
  statement: z.string().min(1),
  authorityLevel: DirectiveAuthorityLevelSchema,
  category: CompiledDirectiveCategorySchema,
  sourceContractField: z.string().min(1),
  sourceId: z.string().min(1).optional(),
  sourceRef: z.string().min(1).optional(),
  characterId: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
}).strict();
export type CompiledDirective = z.infer<typeof CompiledDirectiveSchema>;

/**
 * Reader belief representation in compiled directives.
 */
export const CompiledReaderBeliefSchema = z.object({
  proposition: z.string().min(1),
  strength: z.string().min(1),
}).strict();
export type CompiledReaderBelief = z.infer<typeof CompiledReaderBeliefSchema>;

/**
 * Reader question representation in compiled directives.
 */
export const CompiledReaderQuestionSchema = z.object({
  question: z.string().min(1),
  salience: z.string().optional(),
}).strict();
export type CompiledReaderQuestion = z.infer<typeof CompiledReaderQuestionSchema>;

/**
 * Complete reader cognitive state preserving all 6 dimensions:
 * knows, believes, suspects, expects, questions, emotionalPosition.
 */
export const CompiledReaderStateSchema = z.object({
  knows: z.array(z.string()),
  believes: z.array(CompiledReaderBeliefSchema),
  suspects: z.array(CompiledReaderBeliefSchema),
  expects: z.array(CompiledReaderBeliefSchema),
  questions: z.array(CompiledReaderQuestionSchema),
  emotionalPosition: z.array(z.string()),
}).strict();
export type CompiledReaderState = z.infer<typeof CompiledReaderStateSchema>;

/**
 * Full reader transition model preserving input baseline state (Before)
 * and target state (After).
 */
export const CompiledReaderTransitionSchema = z.object({
  inputState: CompiledReaderStateSchema.optional(),
  desiredAfter: CompiledReaderStateSchema,
}).strict();
export type CompiledReaderTransition = z.infer<typeof CompiledReaderTransitionSchema>;

/**
 * L3 Artistic Freedom Zone: What the author explicitly empowers the model to create.
 */
export const CompiledFreedomZoneSchema = z.object({
  mayInvent: z.array(z.string().min(1)),
  mayVary: z.array(z.string().min(1)),
  surpriseAllowed: z.boolean(),
  underspecifiedTopics: z.array(z.string().min(1)),
}).strict();
export type CompiledFreedomZone = z.infer<typeof CompiledFreedomZoneSchema>;

/**
 * L2 Soft Guidance: Chapter purpose, human core, reader transition (Before -> After), and author strategy.
 */
export const CompiledSoftGuidanceSchema = z.object({
  whyThisChapterExists: z.string().min(1),
  humanCore: z.object({
    statement: z.string().min(1),
    anchoredInCharacters: z.array(z.string().min(1)).min(1),
  }).strict(),
  chapterFunction: z.object({
    primary: z.string().min(1),
    secondary: z.array(z.string().min(1)).optional(),
    plotProgress: z.string().min(1).optional(),
  }).strict().optional(),
  readerTransition: CompiledReaderTransitionSchema,
  plannedAuthorIntent: z.object({
    readerEffects: z.array(z.string()),
    revealTargets: z.array(z.object({
      id: z.string(),
      description: z.string(),
    }).strict()),
    withholdTargets: z.array(z.object({
      id: z.string(),
      description: z.string(),
    }).strict()),
    attentionStrategy: z.array(z.string()),
    emotionalTrajectory: z.array(z.string()),
  }).strict(),
}).strict();
export type CompiledSoftGuidance = z.infer<typeof CompiledSoftGuidanceSchema>;

/**
 * Canonical compiled creative directives container.
 */
export const CompiledCreativeDirectivesSchema = z.object({
  schemaVersion: z.literal(1),
  chapterNumber: z.number().int().positive().optional(),
  absoluteDirectives: z.array(CompiledDirectiveSchema), // L0
  strongDirectives: z.array(CompiledDirectiveSchema),   // L1
  softGuidance: CompiledSoftGuidanceSchema,            // L2
  freedomZone: CompiledFreedomZoneSchema,              // L3
  summary: z.object({
    totalL0: z.number().int().nonnegative(),
    totalL1: z.number().int().nonnegative(),
    totalL2: z.number().int().nonnegative(),
    totalL3: z.number().int().nonnegative(),
  }).strict(),
}).strict();
export type CompiledCreativeDirectives = z.infer<typeof CompiledCreativeDirectivesSchema>;
