import {
  ChapterCreativeContractSchema,
  type ChapterCreativeContract,
} from "../models/creative-contract.js";
import type { PlanningEvidenceBundle } from "../models/evidence-bundle.js";
import type { PlannerCreativeContractDraft } from "./planner-draft-schema.js";

function sanitizeId(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

/**
 * Normalizes an LLM-submitted Creative Contract Draft into a canonical ChapterCreativeContract.
 * Maps draft semanticKey into stable machine IDs, normalizes character identifiers against
 * registered roles, and injects schemaVersion.
 */
export function normalizePlannerContract(
  draft: PlannerCreativeContractDraft,
  bundle?: PlanningEvidenceBundle,
): ChapterCreativeContract {
  const charIdMap = new Map<string, string>();
  if (bundle) {
    for (const id of bundle.characterIds) {
      charIdMap.set(id.toLowerCase(), id);
    }
  }

  const normalizeCharId = (id: string): string => {
    const trimmed = id.trim();
    return charIdMap.get(trimmed.toLowerCase()) ?? trimmed;
  };

  // 1. Normalize Hard Constraints
  const hardConstraints = draft.hardConstraints.map((hc, idx) => {
    const rawKey = hc.semanticKey || (hc as any).id;
    const id = rawKey ? `hc_${sanitizeId(rawKey)}` : `hc_${String(idx + 1).padStart(2, "0")}`;
    return {
      id,
      statement: hc.statement.trim(),
      source: hc.source,
      ...(hc.sourceRef?.trim() ? { sourceRef: hc.sourceRef.trim() } : {}),
      priority: hc.priority ?? "absolute",
    };
  });

  // 2. Normalize Character Constraints
  const characterConstraints = draft.characterConstraints.map((cc) => ({
    characterId: normalizeCharId(cc.characterId),
    ...(cc.mustNotKnow ? { mustNotKnow: cc.mustNotKnow.map((s) => s.trim()).filter(Boolean) } : {}),
    ...(cc.beliefsThatMustPersist ? { beliefsThatMustPersist: cc.beliefsThatMustPersist.map((s) => s.trim()).filter(Boolean) } : {}),
    ...(cc.beliefsAtStart ? { beliefsAtStart: cc.beliefsAtStart.map((s) => s.trim()).filter(Boolean) } : {}),
    ...(cc.behavioralLimits ? { behavioralLimits: cc.behavioralLimits.map((s) => s.trim()).filter(Boolean) } : {}),
  }));

  // 3. Normalize Reader Transition & Information Boundaries
  const mustRemainUnknown = draft.readerTransition.mustRemainUnknown.map((ib, idx) => {
    const rawKey = ib.semanticKey || (ib as any).id;
    // If semanticKey is provided, align prefix with information target prefix for deterministic intersection detection
    const id = rawKey ? `info_${sanitizeId(rawKey)}` : `ib_${String(idx + 1).padStart(2, "0")}`;
    return {
      id,
      topic: ib.topic.trim(),
      boundaryRule: ib.boundaryRule.trim(),
    };
  });

  const desiredAfter = {
    knows: draft.readerTransition.desiredAfter.knows.map((s) => s.trim()).filter(Boolean),
    believes: draft.readerTransition.desiredAfter.believes.map((b) => ({
      proposition: b.proposition.trim(),
      strength: b.strength,
    })),
    suspects: draft.readerTransition.desiredAfter.suspects.map((b) => ({
      proposition: b.proposition.trim(),
      strength: b.strength,
    })),
    expects: draft.readerTransition.desiredAfter.expects.map((b) => ({
      proposition: b.proposition.trim(),
      strength: b.strength,
    })),
    questions: draft.readerTransition.desiredAfter.questions.map((q) => ({
      question: q.question.trim(),
      ...(q.salience ? { salience: q.salience } : {}),
    })),
    emotionalPosition: draft.readerTransition.desiredAfter.emotionalPosition.map((s) => s.trim()).filter(Boolean),
  };

  // 4. Normalize Information Targets in Planned Author Intent
  const reveal = draft.plannedAuthorIntent.informationStrategy.reveal.map((target, idx) => {
    const rawKey = target.semanticKey || (target as any).id;
    const id = rawKey ? `info_${sanitizeId(rawKey)}` : `info_rev_${String(idx + 1).padStart(2, "0")}`;
    return {
      id,
      description: target.description.trim(),
    };
  });

  const withhold = draft.plannedAuthorIntent.informationStrategy.withhold.map((target, idx) => {
    const rawKey = target.semanticKey || (target as any).id;
    const id = rawKey ? `info_${sanitizeId(rawKey)}` : `info_wth_${String(idx + 1).padStart(2, "0")}`;
    return {
      id,
      description: target.description.trim(),
    };
  });

  // 5. Normalize Forbidden Shortcuts
  const forbiddenShortcuts = draft.forbiddenShortcuts.map((fs, idx) => {
    const code = fs.code?.trim() || `fs_${String(idx + 1).padStart(2, "0")}`;
    return {
      code,
      description: fs.description.trim(),
      reason: fs.reason.trim(),
    };
  });

  const canonical: ChapterCreativeContract = ChapterCreativeContractSchema.parse({
    schemaVersion: 1,
    whyThisChapterExists: {
      statement: draft.whyThisChapterExists.statement.trim(),
    },
    ...(draft.chapterFunction ? {
      chapterFunction: {
        primary: draft.chapterFunction.primary.trim(),
        ...(draft.chapterFunction.secondary ? { secondary: draft.chapterFunction.secondary.map((s) => s.trim()).filter(Boolean) } : {}),
        ...(draft.chapterFunction.plotProgress ? { plotProgress: draft.chapterFunction.plotProgress } : {}),
      },
    } : {}),
    humanCore: {
      statement: draft.humanCore.statement.trim(),
      anchoredInCharacters: draft.humanCore.anchoredInCharacters.map(normalizeCharId),
    },
    hardConstraints,
    characterConstraints,
    readerTransition: {
      desiredAfter,
      mustRemainUnknown,
    },
    plannedAuthorIntent: {
      readerEffects: draft.plannedAuthorIntent.readerEffects.map((s) => s.trim()).filter(Boolean),
      informationStrategy: {
        reveal,
        withhold,
      },
      attentionStrategy: draft.plannedAuthorIntent.attentionStrategy.map((s) => s.trim()).filter(Boolean),
      emotionalTrajectory: draft.plannedAuthorIntent.emotionalTrajectory.map((s) => s.trim()).filter(Boolean),
    },
    forbiddenShortcuts,
    freedomZone: {
      mayInvent: draft.freedomZone.mayInvent.map((s) => s.trim()).filter(Boolean),
      mayVary: draft.freedomZone.mayVary.map((s) => s.trim()).filter(Boolean),
      mustRemainUnderspecified: draft.freedomZone.mustRemainUnderspecified.map((s) => s.trim()).filter(Boolean),
      surpriseAllowed: draft.freedomZone.surpriseAllowed,
    },
  });

  return canonical;
}
