import { z } from "zod";

/**
 * Authority classification for planning evidence.
 * Prevents future outline materials from being misidentified as canon facts.
 */
export const EvidenceAuthoritySchema = z.enum([
  "canon",             // Established world history or past chapter facts
  "runtime_state",      // Current story state (inventory, location, statuses)
  "book_rule",         // Fundamental physical/magical/setting rules
  "outline",           // Future outline intentions; NOT established reality
  "author_instruction", // User/author explicit intent for current chapter
]);
export type EvidenceAuthority = z.infer<typeof EvidenceAuthoritySchema>;

/**
 * A single piece of evidence provided to the planner with explicit authority level.
 */
export const EvidenceItemSchema = z.object({
  ref: z.string().min(1).max(256),
  text: z.string().min(1).max(1000),
  authority: EvidenceAuthoritySchema,
}).strict();
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

/**
 * Categorized evidence bundle provided to the Planner before contract generation.
 * Enforces clear separation between reality (canon) and aspirations (outline).
 */
export const PlanningEvidenceBundleSchema = z.object({
  canonFacts: z.array(EvidenceItemSchema).max(50),
  runtimeState: z.array(EvidenceItemSchema).max(50),
  bookRules: z.array(EvidenceItemSchema).max(30),
  activeHooks: z.array(EvidenceItemSchema).max(30),
  outlineIntentions: z.array(EvidenceItemSchema).max(30),
  characterIds: z.array(z.string().min(1).max(64)).max(50),
}).strict();
export type PlanningEvidenceBundle = z.infer<typeof PlanningEvidenceBundleSchema>;

/**
 * Helper to check if an authority classification represents verified canon reality.
 */
export function isCanonAuthority(authority: EvidenceAuthority): boolean {
  return authority === "canon" || authority === "runtime_state" || authority === "book_rule";
}

/**
 * Lookup evidence item by reference across all categories in the bundle.
 */
export function lookupEvidenceRef(bundle: PlanningEvidenceBundle, ref: string): EvidenceItem | undefined {
  for (const item of bundle.canonFacts) {
    if (item.ref === ref) return item;
  }
  for (const item of bundle.runtimeState) {
    if (item.ref === ref) return item;
  }
  for (const item of bundle.bookRules) {
    if (item.ref === ref) return item;
  }
  for (const item of bundle.activeHooks) {
    if (item.ref === ref) return item;
  }
  for (const item of bundle.outlineIntentions) {
    if (item.ref === ref) return item;
  }
  return undefined;
}
