import { Type } from "@sinclair/typebox";
import { PlannerCreativeContractDraftSchema } from "./planner-draft-schema.js";

export const ChapterMemoToolSchema = Type.Object({
  goal: Type.String({ minLength: 1, description: "One concrete goal for the chapter." }),
  body: Type.String({ minLength: 1, description: "Complete readable Markdown chapter plan." }),
  threadRefs: Type.Array(Type.String({ minLength: 1, description: "An existing thread or hook id from the supplied context." })),
});

/**
 * Combined tool schema for submitting chapter memo alongside the creative contract draft.
 */
export const GovernedPlanContractToolSchema = Type.Object({
  goal: Type.String({ minLength: 1, description: "One concrete goal for the chapter." }),
  body: Type.String({ minLength: 1, description: "Complete readable Markdown chapter plan." }),
  threadRefs: Type.Array(Type.String({ minLength: 1, description: "An existing thread or hook id from the supplied context." })),
  contractDraft: PlannerCreativeContractDraftSchema,
});
