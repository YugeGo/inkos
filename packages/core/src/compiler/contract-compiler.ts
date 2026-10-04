import type { ChapterCreativeContract } from "../models/creative-contract.js";
import type {
  CompiledCreativeDirectives,
  CompiledDirective,
  CompiledNegativeSpaceItem,
  CompiledSoftGuidance,
  CompiledFreedomZone,
} from "../models/compiled-directives.js";
import { CompiledCreativeDirectivesSchema } from "../models/compiled-directives.js";
import type { ContextPackage } from "../models/input-governance.js";

export const COMPILED_DIRECTIVES_CONTEXT_SOURCE = "runtime/chapter_creative_directives";

export interface CompileCreativeContractOptions {
  readonly language?: "zh" | "en";
  readonly chapterNumber?: number;
}

/**
 * Deterministic Host Contract Compiler (zero LLM calls).
 * Compiles canonical ChapterCreativeContract into a structured CompiledCreativeDirectives
 * hierarchy organized by rule precedence:
 * - L0 ABSOLUTE: Absolute hardConstraints, readerTransition.mustRemainUnknown (information boundaries),
 *   characterConstraints.mustNotKnow (cognitive boundaries), forbiddenShortcuts.
 * - L1 STRONG: Strong hardConstraints, behavioralLimits, beliefsThatMustPersist, beliefsAtStart.
 * - L2 SOFT: whyThisChapterExists, humanCore, readerTransition.desiredAfter, plannedAuthorIntent.
 * - L3 FREEDOM: mayInvent, mayVary, mustRemainUnderspecified (with negative-space protection), surpriseAllowed.
 */
export function compileCreativeContract(
  contract: ChapterCreativeContract,
  options?: CompileCreativeContractOptions,
): CompiledCreativeDirectives {
  const language = options?.language ?? "zh";
  const isZh = language !== "en";

  // 1. Compile L0 Absolute Directives
  const absoluteDirectives: CompiledDirective[] = [];

  // L0: Hard Constraints (priority: absolute)
  for (const hc of contract.hardConstraints) {
    if (hc.priority === "absolute") {
      absoluteDirectives.push({
        id: hc.id,
        statement: hc.statement,
        authorityLevel: "L0_ABSOLUTE",
        category: "hard_constraint",
        sourceContractField: "hardConstraints",
        sourceId: hc.id,
        ...(hc.sourceRef ? { sourceRef: hc.sourceRef } : {}),
        metadata: {
          source: hc.source,
          priority: "absolute",
        },
      });
    }
  }

  // L0: Reader Information Boundaries (mustRemainUnknown)
  for (const boundary of contract.readerTransition.mustRemainUnknown) {
    absoluteDirectives.push({
      id: boundary.id,
      statement: isZh
        ? `【信息边界：${boundary.topic}】${boundary.boundaryRule}（读者在本章内必须绝对不知情）`
        : `[Information Boundary: ${boundary.topic}] ${boundary.boundaryRule} (Must remain unknown to the reader)`,
      authorityLevel: "L0_ABSOLUTE",
      category: "information_boundary",
      sourceContractField: "readerTransition.mustRemainUnknown",
      sourceId: boundary.id,
      metadata: {
        topic: boundary.topic,
        boundaryRule: boundary.boundaryRule,
      },
    });
  }

  // L0: Character Cognitive Boundaries (mustNotKnow)
  for (const char of contract.characterConstraints) {
    const list = char.mustNotKnow ?? [];
    list.forEach((rule, idx) => {
      const id = `${char.characterId}-mustNotKnow-${idx + 1}`;
      absoluteDirectives.push({
        id,
        statement: isZh
          ? `【认知边界：${char.characterId}】角色绝对不可获知：${rule}`
          : `[Cognitive Boundary: ${char.characterId}] Must NOT know: ${rule}`,
        authorityLevel: "L0_ABSOLUTE",
        category: "character_cognitive",
        sourceContractField: "characterConstraints.mustNotKnow",
        sourceId: id,
        characterId: char.characterId,
        metadata: {
          characterId: char.characterId,
          rule,
        },
      });
    });
  }

  // L0: Forbidden Shortcuts
  for (const shortcut of contract.forbiddenShortcuts) {
    absoluteDirectives.push({
      id: shortcut.code,
      statement: isZh
        ? `【严禁捷径：${shortcut.code}】${shortcut.description}（严禁理由：${shortcut.reason}）`
        : `[Forbidden Shortcut: ${shortcut.code}] ${shortcut.description} (Reason: ${shortcut.reason})`,
      authorityLevel: "L0_ABSOLUTE",
      category: "forbidden_shortcut",
      sourceContractField: "forbiddenShortcuts",
      sourceId: shortcut.code,
      metadata: {
        code: shortcut.code,
        reason: shortcut.reason,
      },
    });
  }

  // 2. Compile L1 Strong Directives
  const strongDirectives: CompiledDirective[] = [];

  // L1: Hard Constraints (priority: strong)
  for (const hc of contract.hardConstraints) {
    if (hc.priority === "strong") {
      strongDirectives.push({
        id: hc.id,
        statement: hc.statement,
        authorityLevel: "L1_STRONG",
        category: "hard_constraint",
        sourceContractField: "hardConstraints",
        sourceId: hc.id,
        ...(hc.sourceRef ? { sourceRef: hc.sourceRef } : {}),
        metadata: {
          source: hc.source,
          priority: "strong",
        },
      });
    }
  }

  // L1: Character Behavioral Limits
  for (const char of contract.characterConstraints) {
    const list = char.behavioralLimits ?? [];
    list.forEach((rule, idx) => {
      const id = `${char.characterId}-behavioralLimit-${idx + 1}`;
      strongDirectives.push({
        id,
        statement: isZh
          ? `【行为准则：${char.characterId}】${rule}`
          : `[Behavioral Limit: ${char.characterId}] ${rule}`,
        authorityLevel: "L1_STRONG",
        category: "character_behavior",
        sourceContractField: "characterConstraints.behavioralLimits",
        sourceId: id,
        characterId: char.characterId,
        metadata: {
          characterId: char.characterId,
          rule,
        },
      });
    });
  }

  // L1: Character Persistent Beliefs (beliefsThatMustPersist)
  for (const char of contract.characterConstraints) {
    const list = char.beliefsThatMustPersist ?? [];
    list.forEach((rule, idx) => {
      const id = `${char.characterId}-persistBelief-${idx + 1}`;
      strongDirectives.push({
        id,
        statement: isZh
          ? `【持续信念：${char.characterId}】${rule}（在整章中必须持续坚信，不得轻易动摇）`
          : `[Persistent Belief: ${char.characterId}] ${rule} (Must persist throughout this chapter)`,
        authorityLevel: "L1_STRONG",
        category: "character_belief",
        sourceContractField: "characterConstraints.beliefsThatMustPersist",
        sourceId: id,
        characterId: char.characterId,
        metadata: {
          characterId: char.characterId,
          rule,
          temporalScope: "persistent",
        },
      });
    });
  }

  // L1: Character Initial Beliefs (beliefsAtStart)
  for (const char of contract.characterConstraints) {
    const list = char.beliefsAtStart ?? [];
    list.forEach((rule, idx) => {
      const id = `${char.characterId}-startBelief-${idx + 1}`;
      strongDirectives.push({
        id,
        statement: isZh
          ? `【初始信念：${char.characterId}】${rule}（开章时的既有信念）`
          : `[Initial Belief: ${char.characterId}] ${rule} (Belief held at chapter opening)`,
        authorityLevel: "L1_STRONG",
        category: "character_belief",
        sourceContractField: "characterConstraints.beliefsAtStart",
        sourceId: id,
        characterId: char.characterId,
        metadata: {
          characterId: char.characterId,
          rule,
          temporalScope: "start",
        },
      });
    });
  }

  // 3. Compile L2 Soft Guidance
  const softGuidance: CompiledSoftGuidance = {
    whyThisChapterExists: contract.whyThisChapterExists.statement,
    humanCore: {
      statement: contract.humanCore.statement,
      anchoredInCharacters: [...contract.humanCore.anchoredInCharacters],
    },
    ...(contract.chapterFunction
      ? {
          chapterFunction: {
            primary: contract.chapterFunction.primary,
            ...(contract.chapterFunction.secondary ? { secondary: [...contract.chapterFunction.secondary] } : {}),
            ...(contract.chapterFunction.plotProgress ? { plotProgress: contract.chapterFunction.plotProgress } : {}),
          },
        }
      : {}),
    readerTransition: {
      desiredKnows: [...contract.readerTransition.desiredAfter.knows],
      desiredBeliefs: contract.readerTransition.desiredAfter.believes.map((b) => ({
        proposition: b.proposition,
        strength: b.strength,
      })),
      desiredQuestions: contract.readerTransition.desiredAfter.questions.map((q) => ({
        question: q.question,
        ...(q.salience ? { salience: q.salience } : {}),
      })),
      desiredEmotions: [...contract.readerTransition.desiredAfter.emotionalPosition],
    },
    plannedAuthorIntent: {
      readerEffects: [...contract.plannedAuthorIntent.readerEffects],
      revealTargets: contract.plannedAuthorIntent.informationStrategy.reveal.map((r) => ({
        id: r.id,
        description: r.description,
      })),
      withholdTargets: contract.plannedAuthorIntent.informationStrategy.withhold.map((w) => ({
        id: w.id,
        description: w.description,
      })),
      attentionStrategy: [...contract.plannedAuthorIntent.attentionStrategy],
      emotionalTrajectory: [...contract.plannedAuthorIntent.emotionalTrajectory],
    },
  };

  // 4. Compile L3 Freedom Zone & Negative-Space Protection
  const negativeSpaceGuarantees: CompiledNegativeSpaceItem[] =
    contract.freedomZone.mustRemainUnderspecified.map((item) => ({
      topic: item,
      directive: isZh
        ? `【留白保护】严禁坐实或过度解释：“${item}”。必须保持其模糊性与未决张力，不得在正文中机械补全背景或给出定论。`
        : `[Negative-Space Protection] DO NOT explain, reveal, or resolve: "${item}". Preserve its ambiguity and unresolved tension; do not collapse this negative space.`,
      sourceContractField: "freedomZone.mustRemainUnderspecified" as const,
    }));

  const freedomZone: CompiledFreedomZone = {
    mayInvent: [...contract.freedomZone.mayInvent],
    mayVary: [...contract.freedomZone.mayVary],
    surpriseAllowed: contract.freedomZone.surpriseAllowed,
    negativeSpaceGuarantees,
  };

  const totalL0 = absoluteDirectives.length;
  const totalL1 = strongDirectives.length;
  const totalL2 =
    1 + // whyThisChapterExists
    1 + // humanCore
    (contract.chapterFunction ? 1 : 0) +
    softGuidance.readerTransition.desiredKnows.length +
    softGuidance.readerTransition.desiredBeliefs.length +
    softGuidance.readerTransition.desiredQuestions.length +
    softGuidance.readerTransition.desiredEmotions.length +
    softGuidance.plannedAuthorIntent.readerEffects.length +
    softGuidance.plannedAuthorIntent.revealTargets.length +
    softGuidance.plannedAuthorIntent.withholdTargets.length +
    softGuidance.plannedAuthorIntent.attentionStrategy.length +
    softGuidance.plannedAuthorIntent.emotionalTrajectory.length;
  const totalL3 =
    freedomZone.mayInvent.length +
    freedomZone.mayVary.length +
    freedomZone.negativeSpaceGuarantees.length +
    1; // surpriseAllowed

  return CompiledCreativeDirectivesSchema.parse({
    schemaVersion: 1,
    ...(options?.chapterNumber ? { chapterNumber: options.chapterNumber } : {}),
    absoluteDirectives,
    strongDirectives,
    softGuidance,
    freedomZone,
    summary: {
      totalL0,
      totalL1,
      totalL2,
      totalL3,
    },
  });
}

/**
 * Renders CompiledCreativeDirectives into human-readable and narrative-consumable Markdown.
 */
export function renderCompiledDirectivesAsNarrativeExcerpt(
  compiled: CompiledCreativeDirectives,
  language: "zh" | "en" = "zh",
): string {
  const isZh = language !== "en";
  const lines: string[] = [];

  if (isZh) {
    lines.push("# 本章创作合约指令 (Governing Creative Directives)");
    lines.push("");
    lines.push("> 本指令由作者心智合约确定性编译生成。");
    lines.push("> 规则优先级：L0绝对铁律 > L1强力约束 > L2创作意图 > L3自由发挥与留白保护。");
    lines.push("");

    // L0
    lines.push("## L0 绝对边界 (绝对铁律 — 严禁违背，违反应立即重写)");
    if (compiled.absoluteDirectives.length === 0) {
      lines.push("- （无）");
    } else {
      for (const dir of compiled.absoluteDirectives) {
        const refPart = dir.sourceRef ? ` | 引用: ${dir.sourceRef}` : "";
        lines.push(`- [${dir.id}] ${dir.statement} *(来源: ${dir.sourceContractField}${refPart})*`);
      }
    }
    lines.push("");

    // L1
    lines.push("## L1 强力约束 (高优先级 — 仅在与L0直接冲突时可权衡)");
    if (compiled.strongDirectives.length === 0) {
      lines.push("- （无）");
    } else {
      for (const dir of compiled.strongDirectives) {
        const refPart = dir.sourceRef ? ` | 引用: ${dir.sourceRef}` : "";
        lines.push(`- [${dir.id}] ${dir.statement} *(来源: ${dir.sourceContractField}${refPart})*`);
      }
    }
    lines.push("");

    // L2
    lines.push("## L2 核心意图与读者体验目标 (软性意图引导)");
    lines.push(`- **章节存在理由**：${compiled.softGuidance.whyThisChapterExists}`);
    lines.push(
      `- **人性核心**：${compiled.softGuidance.humanCore.statement} *（锚定角色: ${compiled.softGuidance.humanCore.anchoredInCharacters.join(", ")}）*`,
    );
    if (compiled.softGuidance.chapterFunction) {
      const func = compiled.softGuidance.chapterFunction;
      const sec = func.secondary?.length ? ` | 次要: ${func.secondary.join(", ")}` : "";
      const prog = func.plotProgress ? ` | 主线推进: ${func.plotProgress}` : "";
      lines.push(`- **功能定位**：主要: ${func.primary}${sec}${prog}`);
    }

    lines.push("");
    lines.push("### 读者认知体验目标 (Target Reader State)");
    if (compiled.softGuidance.readerTransition.desiredKnows.length > 0) {
      lines.push(`- **期望获知**：${compiled.softGuidance.readerTransition.desiredKnows.join("；")}`);
    }
    if (compiled.softGuidance.readerTransition.desiredBeliefs.length > 0) {
      const beliefs = compiled.softGuidance.readerTransition.desiredBeliefs
        .map((b) => `${b.proposition} [强度: ${b.strength}]`)
        .join("；");
      lines.push(`- **期望坚信**：${beliefs}`);
    }
    if (compiled.softGuidance.readerTransition.desiredQuestions.length > 0) {
      const questions = compiled.softGuidance.readerTransition.desiredQuestions
        .map((q) => `${q.question}${q.salience ? ` [显著度: ${q.salience}]` : ""}`)
        .join("；");
      lines.push(`- **激活疑问**：${questions}`);
    }
    if (compiled.softGuidance.readerTransition.desiredEmotions.length > 0) {
      lines.push(`- **情感落点**：${compiled.softGuidance.readerTransition.desiredEmotions.join("；")}`);
    }

    lines.push("");
    lines.push("### 叙事信息与注意力策略 (Narrative Strategy)");
    if (compiled.softGuidance.plannedAuthorIntent.revealTargets.length > 0) {
      const reveals = compiled.softGuidance.plannedAuthorIntent.revealTargets
        .map((r) => `[${r.id}] ${r.description}`)
        .join("；");
      lines.push(`- **本章揭示目标**：${reveals}`);
    }
    if (compiled.softGuidance.plannedAuthorIntent.withholdTargets.length > 0) {
      const withholds = compiled.softGuidance.plannedAuthorIntent.withholdTargets
        .map((w) => `[${w.id}] ${w.description}`)
        .join("；");
      lines.push(`- **本章保留隐匿**：${withholds}`);
    }
    if (compiled.softGuidance.plannedAuthorIntent.readerEffects.length > 0) {
      lines.push(`- **预期读者效果**：${compiled.softGuidance.plannedAuthorIntent.readerEffects.join("；")}`);
    }
    if (compiled.softGuidance.plannedAuthorIntent.attentionStrategy.length > 0) {
      lines.push(`- **注意力焦点**：${compiled.softGuidance.plannedAuthorIntent.attentionStrategy.join("；")}`);
    }
    if (compiled.softGuidance.plannedAuthorIntent.emotionalTrajectory.length > 0) {
      lines.push(`- **情感轨迹**：${compiled.softGuidance.plannedAuthorIntent.emotionalTrajectory.join(" -> ")}`);
    }

    lines.push("");

    // L3
    lines.push("## L3 创作自由区与留白保护 (Artistic Freedom & Negative Space)");
    if (compiled.freedomZone.mayInvent.length > 0) {
      lines.push(`- **允许自由发挥**：${compiled.freedomZone.mayInvent.join("；")}`);
    }
    if (compiled.freedomZone.mayVary.length > 0) {
      lines.push(`- **允许弹性变体**：${compiled.freedomZone.mayVary.join("；")}`);
    }
    lines.push(
      `- **允许意外惊喜**：${compiled.freedomZone.surpriseAllowed ? "是 (允许合理的意外转折)" : "否 (严格按计划展开)"}`,
    );

    lines.push("");
    lines.push("### 留白保护区 (严禁过度解释或过早坐实)");
    lines.push(
      "> 警告：以下元素属于受保护的负空间（留白）。叙事模型必须保持其未解之谜与悬念状态，严禁在正文中将其坐实、揭秘、或者机械补全背景！",
    );
    if (compiled.freedomZone.negativeSpaceGuarantees.length === 0) {
      lines.push("- （本章无特殊留白保护项）");
    } else {
      for (const item of compiled.freedomZone.negativeSpaceGuarantees) {
        lines.push(`- 🔒 ${item.directive}`);
      }
    }
  } else {
    // English
    lines.push("# Chapter Creative Directives (Governing Directives)");
    lines.push("");
    lines.push("> Compiled deterministically from canonical Author-Mind creative contract.");
    lines.push(
      "> Rule Precedence: L0 Absolute > L1 Strong > L2 Soft Intent > L3 Artistic Freedom & Negative-Space Protection.",
    );
    lines.push("");

    // L0
    lines.push("## L0 Absolute Boundaries (Mandatory — Zero Breach Tolerance)");
    if (compiled.absoluteDirectives.length === 0) {
      lines.push("- (none)");
    } else {
      for (const dir of compiled.absoluteDirectives) {
        const refPart = dir.sourceRef ? ` | ref: ${dir.sourceRef}` : "";
        lines.push(`- [${dir.id}] ${dir.statement} *(source: ${dir.sourceContractField}${refPart})*`);
      }
    }
    lines.push("");

    // L1
    lines.push("## L1 Strong Constraints (High Priority — Overridden Only by Direct L0 Conflict)");
    if (compiled.strongDirectives.length === 0) {
      lines.push("- (none)");
    } else {
      for (const dir of compiled.strongDirectives) {
        const refPart = dir.sourceRef ? ` | ref: ${dir.sourceRef}` : "";
        lines.push(`- [${dir.id}] ${dir.statement} *(source: ${dir.sourceContractField}${refPart})*`);
      }
    }
    lines.push("");

    // L2
    lines.push("## L2 Creative Intent & Target Reader Experience (Soft Guidance)");
    lines.push(`- **Chapter Purpose**: ${compiled.softGuidance.whyThisChapterExists}`);
    lines.push(
      `- **Human Core**: ${compiled.softGuidance.humanCore.statement} *(Anchored in: ${compiled.softGuidance.humanCore.anchoredInCharacters.join(", ")})*`,
    );
    if (compiled.softGuidance.chapterFunction) {
      const func = compiled.softGuidance.chapterFunction;
      const sec = func.secondary?.length ? ` | secondary: ${func.secondary.join(", ")}` : "";
      const prog = func.plotProgress ? ` | plot progress: ${func.plotProgress}` : "";
      lines.push(`- **Chapter Function**: primary: ${func.primary}${sec}${prog}`);
    }

    lines.push("");
    lines.push("### Target Reader State (Transitions)");
    if (compiled.softGuidance.readerTransition.desiredKnows.length > 0) {
      lines.push(`- **Target Knowledge (Knows)**: ${compiled.softGuidance.readerTransition.desiredKnows.join("; ")}`);
    }
    if (compiled.softGuidance.readerTransition.desiredBeliefs.length > 0) {
      const beliefs = compiled.softGuidance.readerTransition.desiredBeliefs
        .map((b) => `${b.proposition} [strength: ${b.strength}]`)
        .join("; ");
      lines.push(`- **Target Beliefs (Believes)**: ${beliefs}`);
    }
    if (compiled.softGuidance.readerTransition.desiredQuestions.length > 0) {
      const questions = compiled.softGuidance.readerTransition.desiredQuestions
        .map((q) => `${q.question}${q.salience ? ` [salience: ${q.salience}]` : ""}`)
        .join("; ");
      lines.push(`- **Active Questions**: ${questions}`);
    }
    if (compiled.softGuidance.readerTransition.desiredEmotions.length > 0) {
      lines.push(`- **Target Emotional Stance**: ${compiled.softGuidance.readerTransition.desiredEmotions.join("; ")}`);
    }

    lines.push("");
    lines.push("### Information & Attention Strategy");
    if (compiled.softGuidance.plannedAuthorIntent.revealTargets.length > 0) {
      const reveals = compiled.softGuidance.plannedAuthorIntent.revealTargets
        .map((r) => `[${r.id}] ${r.description}`)
        .join("; ");
      lines.push(`- **Reveal Targets**: ${reveals}`);
    }
    if (compiled.softGuidance.plannedAuthorIntent.withholdTargets.length > 0) {
      const withholds = compiled.softGuidance.plannedAuthorIntent.withholdTargets
        .map((w) => `[${w.id}] ${w.description}`)
        .join("; ");
      lines.push(`- **Withhold Targets**: ${withholds}`);
    }
    if (compiled.softGuidance.plannedAuthorIntent.readerEffects.length > 0) {
      lines.push(`- **Desired Reader Effects**: ${compiled.softGuidance.plannedAuthorIntent.readerEffects.join("; ")}`);
    }
    if (compiled.softGuidance.plannedAuthorIntent.attentionStrategy.length > 0) {
      lines.push(`- **Attention Strategy**: ${compiled.softGuidance.plannedAuthorIntent.attentionStrategy.join("; ")}`);
    }
    if (compiled.softGuidance.plannedAuthorIntent.emotionalTrajectory.length > 0) {
      lines.push(
        `- **Emotional Trajectory**: ${compiled.softGuidance.plannedAuthorIntent.emotionalTrajectory.join(" -> ")}`,
      );
    }

    lines.push("");

    // L3
    lines.push("## L3 Artistic Freedom & Negative-Space Protection");
    if (compiled.freedomZone.mayInvent.length > 0) {
      lines.push(`- **May Invent**: ${compiled.freedomZone.mayInvent.join("; ")}`);
    }
    if (compiled.freedomZone.mayVary.length > 0) {
      lines.push(`- **May Vary**: ${compiled.freedomZone.mayVary.join("; ")}`);
    }
    lines.push(`- **Surprise Allowed**: ${compiled.freedomZone.surpriseAllowed ? "Yes" : "No"}`);

    lines.push("");
    lines.push("### Negative-Space Protection (Strict Guardrails Against Over-Explaining)");
    lines.push(
      "> WARNING: The following elements are deliberate negative space. The narrative writer MUST preserve their ambiguity and unresolved tension. DO NOT explain, resolve, or settle these elements in this chapter!",
    );
    if (compiled.freedomZone.negativeSpaceGuarantees.length === 0) {
      lines.push("- (No specific negative-space items in this chapter)");
    } else {
      for (const item of compiled.freedomZone.negativeSpaceGuarantees) {
        lines.push(`- 🔒 ${item.directive}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Creates a protected, narrative-consumable ContextPackage entry for compiled creative directives.
 */
export function createCompiledDirectivesContextEntry(
  compiled: CompiledCreativeDirectives,
  language: "zh" | "en" = "zh",
): ContextPackage["selectedContext"][number] {
  return {
    source: COMPILED_DIRECTIVES_CONTEXT_SOURCE,
    reason:
      language === "en"
        ? "Compiled creative directives governing chapter narrative execution."
        : "本章创作指令：由作者心智合约确定性编译生成的绝对铁律、强力约束、创作意图与留白保护。",
    excerpt: renderCompiledDirectivesAsNarrativeExcerpt(compiled, language),
    protection: "protected",
    consumption: "narrative",
  };
}

/**
 * Extracts the compiled directives entry from a ContextPackage.
 * Returns undefined if no compiled directives entry is present.
 * Throws invariant violation error if duplicate entries or empty excerpt exist.
 */
export function extractCompiledDirectivesFromContextPackage(
  contextPackage: ContextPackage,
): ContextPackage["selectedContext"][number] | undefined {
  const entries = contextPackage.selectedContext.filter(
    (e) => e.source === COMPILED_DIRECTIVES_CONTEXT_SOURCE,
  );
  if (entries.length === 0) return undefined;
  if (entries.length > 1) {
    throw new Error(
      `ContextPackage invariant violation: expected at most 1 compiled creative directives entry, found ${entries.length}.`,
    );
  }
  const entry = entries[0];
  if (!entry?.excerpt || entry.excerpt.trim().length === 0) {
    throw new Error(
      `ContextPackage invariant violation: compiled creative directives entry is present but excerpt is empty or missing.`,
    );
  }
  return entry;
}
