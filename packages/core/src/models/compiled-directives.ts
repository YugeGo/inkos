import { z } from "zod";

/**
 * Directive authority level in hierarchy of precedence:
 * - L0_ABSOLUTE: Non-negotiable hard boundaries, secrets, forbidden shortcuts (immediate rewrite on breach).
 * - L1_STRONG: High-priority behavioral boundaries and persistence constraints.
 * - L2_SOFT: Chapter purpose, human core, reader transition, and narrative information strategy.
 * - L3_FREEDOM: Artistic freedom permissions and protected negative space (deliberate underspecification).
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
  "chapter_purpose",
  "human_core",
  "target_reader_state",
  "author_intent_strategy",
  "negative_space",
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
 * Negative-space protection item for elements that must remain ambiguous.
 * Prevents the narrative model from over-explaining or collapsing mysteries prematurely.
 */
export const CompiledNegativeSpaceItemSchema = z.object({
  topic: z.string().min(1),
  directive: z.string().min(1),
  sourceContractField: z.literal("freedomZone.mustRemainUnderspecified"),
}).strict();
export type CompiledNegativeSpaceItem = z.infer<typeof CompiledNegativeSpaceItemSchema>;

/**
 * L3 Artistic Freedom and Negative-Space Protection.
 */
export const CompiledFreedomZoneSchema = z.object({
  mayInvent: z.array(z.string().min(1)),
  mayVary: z.array(z.string().min(1)),
  surpriseAllowed: z.boolean(),
  negativeSpaceGuarantees: z.array(CompiledNegativeSpaceItemSchema),
}).strict();
export type CompiledFreedomZone = z.infer<typeof CompiledFreedomZoneSchema>;

/**
 * L2 Soft Guidance: Chapter purpose, human core, reader transition, and author strategy.
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
  readerTransition: z.object({
    desiredKnows: z.array(z.string()),
    desiredBeliefs: z.array(z.object({
      proposition: z.string(),
      strength: z.string(),
    }).strict()),
    desiredQuestions: z.array(z.object({
      question: z.string(),
      salience: z.string().optional(),
    }).strict()),
    desiredEmotions: z.array(z.string()),
  }).strict(),
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
