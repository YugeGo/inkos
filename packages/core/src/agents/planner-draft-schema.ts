import { Type, type Static } from "@sinclair/typebox";

/**
 * TypeBox Schema for LLM-facing Creative Contract Draft.
 * LLM uses 'semanticKey' for narrative co-reference across reveal/withhold/boundaries,
 * while the Host normalizer maps them to canonical machine IDs.
 */

export const DraftBeliefStrength = Type.Union([
  Type.Literal("weak"),
  Type.Literal("moderate"),
  Type.Literal("strong"),
]);

export const DraftQuestionSalience = Type.Union([
  Type.Literal("low"),
  Type.Literal("medium"),
  Type.Literal("high"),
]);

export const DraftConstraintPriority = Type.Union([
  Type.Literal("absolute"),
  Type.Literal("strong"),
]);

export const DraftConstraintSource = Type.Union([
  Type.Literal("canon"),
  Type.Literal("world"),
  Type.Literal("logic"),
  Type.Literal("author"),
]);

export const DraftPlotProgress = Type.Union([
  Type.Literal("none"),
  Type.Literal("low"),
  Type.Literal("medium"),
  Type.Literal("high"),
]);

/**
 * Information target draft using semanticKey for reliable cross-field co-reference.
 */
export const DraftInformationTargetSchema = Type.Object({
  semanticKey: Type.String({
    minLength: 1,
    maxLength: 64,
    description: "Semantic co-reference key (e.g. 'arthur_father_project_role') to identify identical information across reveal/withhold/mustRemainUnknown",
  }),
  description: Type.String({ minLength: 1, maxLength: 300, description: "Clear proposition description" }),
});

export const DraftReaderBeliefSchema = Type.Object({
  proposition: Type.String({ minLength: 1, maxLength: 300 }),
  strength: DraftBeliefStrength,
});

export const DraftReaderQuestionSchema = Type.Object({
  question: Type.String({ minLength: 1, maxLength: 300 }),
  salience: Type.Optional(DraftQuestionSalience),
});

export const DraftReaderStateSchema = Type.Object({
  knows: Type.Array(Type.String({ minLength: 1, maxLength: 300 }), { maxItems: 15 }),
  believes: Type.Array(DraftReaderBeliefSchema, { maxItems: 10 }),
  suspects: Type.Array(DraftReaderBeliefSchema, { maxItems: 10 }),
  expects: Type.Array(DraftReaderBeliefSchema, { maxItems: 10 }),
  questions: Type.Array(DraftReaderQuestionSchema, { maxItems: 8 }),
  emotionalPosition: Type.Array(Type.String({ minLength: 1, maxLength: 200 }), { maxItems: 8 }),
});

export const DraftHardConstraintSchema = Type.Object({
  semanticKey: Type.Optional(Type.String({ maxLength: 64, description: "Optional key for this constraint" })),
  statement: Type.String({ minLength: 1, maxLength: 500 }),
  source: DraftConstraintSource,
  sourceRef: Type.Optional(Type.String({ maxLength: 256, description: "Evidence reference from Planning Evidence (e.g. canon:fact#1, state:fact#2, rule:prohibition#1)" })),
  priority: Type.Optional(DraftConstraintPriority),
});

export const DraftCharacterConstraintSchema = Type.Object({
  characterId: Type.String({ minLength: 1, maxLength: 64, description: "Character name/id matching registered roles" }),
  mustNotKnow: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 400 }), { maxItems: 10 })),
  beliefsThatMustPersist: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 400 }), { maxItems: 10 })),
  beliefsAtStart: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 400 }), { maxItems: 10 })),
  behavioralLimits: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 400 }), { maxItems: 10 })),
});

export const DraftInformationBoundarySchema = Type.Object({
  semanticKey: Type.Optional(Type.String({ maxLength: 64, description: "Semantic key matching information targets that must remain hidden from the reader" })),
  topic: Type.String({ minLength: 1, maxLength: 200 }),
  boundaryRule: Type.String({ minLength: 1, maxLength: 400 }),
});

export const DraftForbiddenShortcutSchema = Type.Object({
  code: Type.Optional(Type.String({ maxLength: 64 })),
  description: Type.String({ minLength: 1, maxLength: 400 }),
  reason: Type.String({ minLength: 1, maxLength: 400 }),
});

export const PlannerCreativeContractDraftSchema = Type.Object({
  whyThisChapterExists: Type.Object({
    statement: Type.String({ minLength: 1, maxLength: 600, description: "Why this chapter is indispensable to the whole book" }),
  }),
  chapterFunction: Type.Optional(Type.Object({
    primary: Type.String({ minLength: 1, maxLength: 100 }),
    secondary: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { maxItems: 6 })),
    plotProgress: Type.Optional(DraftPlotProgress),
  })),
  humanCore: Type.Object({
    statement: Type.String({ minLength: 1, maxLength: 600, description: "Human core emotion/dilemma" }),
    anchoredInCharacters: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 6 }),
  }),
  hardConstraints: Type.Array(DraftHardConstraintSchema, { maxItems: 12 }),
  characterConstraints: Type.Array(DraftCharacterConstraintSchema, { maxItems: 8 }),
  readerTransition: Type.Object({
    desiredAfter: DraftReaderStateSchema,
    mustRemainUnknown: Type.Array(DraftInformationBoundarySchema, { maxItems: 10 }),
  }),
  plannedAuthorIntent: Type.Object({
    readerEffects: Type.Array(Type.String({ minLength: 1, maxLength: 300 }), { maxItems: 8 }),
    informationStrategy: Type.Object({
      reveal: Type.Array(DraftInformationTargetSchema, { maxItems: 10 }),
      withhold: Type.Array(DraftInformationTargetSchema, { maxItems: 10 }),
    }),
    attentionStrategy: Type.Array(Type.String({ minLength: 1, maxLength: 300 }), { maxItems: 8 }),
    emotionalTrajectory: Type.Array(Type.String({ minLength: 1, maxLength: 300 }), { maxItems: 8 }),
  }),
  forbiddenShortcuts: Type.Array(DraftForbiddenShortcutSchema, { maxItems: 10 }),
  freedomZone: Type.Object({
    mayInvent: Type.Array(Type.String({ minLength: 1, maxLength: 300 }), { maxItems: 15 }),
    mayVary: Type.Array(Type.String({ minLength: 1, maxLength: 300 }), { maxItems: 15 }),
    mustRemainUnderspecified: Type.Array(Type.String({ minLength: 1, maxLength: 400 }), { maxItems: 10 }),
    surpriseAllowed: Type.Boolean(),
  }),
});

export type PlannerCreativeContractDraft = Static<typeof PlannerCreativeContractDraftSchema>;
