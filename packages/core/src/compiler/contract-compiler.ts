import { createHash } from "node:crypto";
import type { ChapterCreativeContract, ReaderState } from "../models/creative-contract.js";
import type {
  CompiledCreativeDirectives,
  CompiledDirective,
  CompiledSoftGuidance,
  CompiledFreedomZone,
  CompiledReaderState,
} from "../models/compiled-directives.js";
import { CompiledCreativeDirectivesSchema } from "../models/compiled-directives.js";
import type { ContextPackage } from "../models/input-governance.js";

export const COMPILED_DIRECTIVES_CONTEXT_SOURCE = "runtime/chapter_creative_directives";

export interface CompileCreativeContractOptions {
  readonly language?: "zh" | "en";
  readonly chapterNumber?: number;
}

function shortHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 6);
}

function compileReaderState(state: ReaderState): CompiledReaderState {
  return {
    knows: [...state.knows],
    believes: state.believes.map((b) => ({ proposition: b.proposition, strength: b.strength })),
    suspects: state.suspects.map((s) => ({ proposition: s.proposition, strength: s.strength })),
    expects: state.expects.map((e) => ({ proposition: e.proposition, strength: e.strength })),
    questions: state.questions.map((q) => ({
      question: q.question,
      ...(q.salience ? { salience: q.salience } : {}),
    })),
    emotionalPosition: [...state.emotionalPosition],
  };
}

/**
 * Deterministic Host Contract Compiler (zero LLM calls).
 * Compiles canonical ChapterCreativeContract into a structured CompiledCreativeDirectives
 * hierarchy organized by rule precedence:
 * - L0 ABSOLUTE: Absolute hardConstraints, readerTransition.mustRemainUnknown (information boundaries),
 *   characterConstraints.mustNotKnow (cognitive boundaries), forbiddenShortcuts,
 *   AND freedomZone.mustRemainUnderspecified (negative-space fence guardrails).
 * - L1 STRONG: Strong hardConstraints, behavioralLimits, beliefsThatMustPersist, beliefsAtStart.
 * - L2 SOFT: whyThisChapterExists, humanCore, readerTransition (Before -> After complete cognitive model),
 *   plannedAuthorIntent.
 * - L3 FREEDOM: mayInvent, mayVary, surpriseAllowed (unscripted local creativity without twist bias).
 */
export function compileCreativeContract(
  contract: ChapterCreativeContract,
  options?: CompileCreativeContractOptions,
): CompiledCreativeDirectives {
  const language = options?.language ?? "zh";
  const isZh = language !== "en";

  // 1. Compile L0 Absolute Directives (Hard Constraints + Secrets + Cognitive + Shortcuts + Negative Space)
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

  // L0: Character Cognitive Boundaries (mustNotKnow) - Content-derived stable IDs
  for (const char of contract.characterConstraints) {
    const list = char.mustNotKnow ?? [];
    list.forEach((rule) => {
      const id = `char_${char.characterId}_mustnot_${shortHash(rule)}`;
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

  // L0: Negative-Space Guardrails (mustRemainUnderspecified)
  // Negative space is an absolute fence guardrail: models are strictly prohibited from collapsing ambiguities.
  for (const item of contract.freedomZone.mustRemainUnderspecified) {
    const id = `neg_space_${shortHash(item)}`;
    absoluteDirectives.push({
      id,
      statement: isZh
        ? `【留白边界】严禁坐实、过早揭秘或过度解释：“${item}”。叙事正文必须保持其未决张力与模糊负空间，不得在正文中机械补全背景或给出定论。`
        : `[Negative-Space Boundary] DO NOT explain, reveal, or resolve: "${item}". Must remain underspecified and ambiguous; do not collapse this negative space.`,
      authorityLevel: "L0_ABSOLUTE",
      category: "negative_space",
      sourceContractField: "freedomZone.mustRemainUnderspecified",
      sourceId: id,
      metadata: {
        topic: item,
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

  // L1: Character Behavioral Limits - Content-derived stable IDs
  for (const char of contract.characterConstraints) {
    const list = char.behavioralLimits ?? [];
    list.forEach((rule) => {
      const id = `char_${char.characterId}_limit_${shortHash(rule)}`;
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

  // L1: Character Persistent Beliefs (beliefsThatMustPersist) - Content-derived stable IDs
  for (const char of contract.characterConstraints) {
    const list = char.beliefsThatMustPersist ?? [];
    list.forEach((rule) => {
      const id = `char_${char.characterId}_persist_${shortHash(rule)}`;
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

  // L1: Character Initial Beliefs (beliefsAtStart) - Content-derived stable IDs
  for (const char of contract.characterConstraints) {
    const list = char.beliefsAtStart ?? [];
    list.forEach((rule) => {
      const id = `char_${char.characterId}_start_${shortHash(rule)}`;
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

  // 3. Compile L2 Soft Guidance (Complete Reader Transition: Before -> After)
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
      ...(contract.readerTransition.inputState
        ? { inputState: compileReaderState(contract.readerTransition.inputState) }
        : {}),
      desiredAfter: compileReaderState(contract.readerTransition.desiredAfter),
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

  // 4. Compile L3 Freedom Zone
  const freedomZone: CompiledFreedomZone = {
    mayInvent: [...contract.freedomZone.mayInvent],
    mayVary: [...contract.freedomZone.mayVary],
    surpriseAllowed: contract.freedomZone.surpriseAllowed,
    underspecifiedTopics: [...contract.freedomZone.mustRemainUnderspecified],
  };

  const totalL0 = absoluteDirectives.length;
  const totalL1 = strongDirectives.length;
  const totalL2 =
    1 + // whyThisChapterExists
    1 + // humanCore
    (contract.chapterFunction ? 1 : 0) +
    softGuidance.readerTransition.desiredAfter.knows.length +
    softGuidance.readerTransition.desiredAfter.believes.length +
    softGuidance.readerTransition.desiredAfter.suspects.length +
    softGuidance.readerTransition.desiredAfter.expects.length +
    softGuidance.readerTransition.desiredAfter.questions.length +
    softGuidance.readerTransition.desiredAfter.emotionalPosition.length +
    softGuidance.plannedAuthorIntent.readerEffects.length +
    softGuidance.plannedAuthorIntent.revealTargets.length +
    softGuidance.plannedAuthorIntent.withholdTargets.length +
    softGuidance.plannedAuthorIntent.attentionStrategy.length +
    softGuidance.plannedAuthorIntent.emotionalTrajectory.length;
  const totalL3 =
    freedomZone.mayInvent.length +
    freedomZone.mayVary.length +
    freedomZone.underspecifiedTopics.length +
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

function renderReaderStateBlock(state: CompiledReaderState, isZh: boolean): string[] {
  const lines: string[] = [];
  if (state.knows.length > 0) {
    lines.push(`- **${isZh ? "获知事实 (Knows)" : "Known Facts (Knows)"}**：${state.knows.join(isZh ? "；" : "; ")}`);
  }
  if (state.believes.length > 0) {
    const items = state.believes.map((b) => `${b.proposition} [${isZh ? `强度: ${b.strength}` : `strength: ${b.strength}`}]`);
    lines.push(`- **${isZh ? "坚信观点 (Believes)" : "Beliefs (Believes)"}**：${items.join(isZh ? "；" : "; ")}`);
  }
  if (state.suspects.length > 0) {
    const items = state.suspects.map((s) => `${s.proposition} [${isZh ? `强度: ${s.strength}` : `strength: ${s.strength}`}]`);
    lines.push(`- **${isZh ? "怀疑猜想 (Suspects)" : "Suspicions (Suspects)"}**：${items.join(isZh ? "；" : "; ")}`);
  }
  if (state.expects.length > 0) {
    const items = state.expects.map((e) => `${e.proposition} [${isZh ? `强度: ${e.strength}` : `strength: ${e.strength}`}]`);
    lines.push(`- **${isZh ? "剧情预期 (Expects)" : "Expectations (Expects)"}**：${items.join(isZh ? "；" : "; ")}`);
  }
  if (state.questions.length > 0) {
    const items = state.questions.map((q) => `${q.question}${q.salience ? ` [${isZh ? `显著度: ${q.salience}` : `salience: ${q.salience}`}]` : ""}`);
    lines.push(`- **${isZh ? "激活疑问 (Questions)" : "Active Questions"}**：${items.join(isZh ? "；" : "; ")}`);
  }
  if (state.emotionalPosition.length > 0) {
    lines.push(`- **${isZh ? "情绪落点 (Emotions)" : "Emotional Stance"}**：${state.emotionalPosition.join(isZh ? "；" : "; ")}`);
  }
  return lines;
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

  const surpriseExplanation = isZh
    ? (compiled.freedomZone.surpriseAllowed
        ? "允许在既有边界内产生未预先指定的局部创意；这不是制造反转、冲突或悬念的要求。"
        : "不得引入改变既定叙事方向的计划外重大惊奇；未被约束的实现细节仍保持自由。")
    : (compiled.freedomZone.surpriseAllowed
        ? "Permitted to introduce unscripted local creative elements within boundaries; this is not a directive to manufacture twists or shocks."
        : "Do not introduce major unscripted surprises that derail the established trajectory; unconstrained execution details remain free.");

  if (isZh) {
    lines.push("# 本章创作合约指令 (Governing Creative Directives)");
    lines.push("");
    lines.push("> 本指令由作者心智合约确定性编译生成。");
    lines.push("> 规则优先级：L0绝对铁律 > L1强力约束 > L2创作意图 > L3自由发挥。");
    lines.push("");

    // L0
    lines.push("## L0 绝对边界 (绝对铁律 — 严禁违背，违反应立即重写)");
    if (compiled.absoluteDirectives.length === 0) {
      lines.push("- （无）");
    } else {
      for (const dir of compiled.absoluteDirectives) {
        const refPart = dir.sourceRef ? ` | 引用: ${dir.sourceRef}` : "";
        const icon = dir.category === "negative_space" ? "🔒 " : "";
        lines.push(`- ${icon}[${dir.id}] ${dir.statement} *(来源: ${dir.sourceContractField}${refPart})*`);
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
    lines.push("### 读者认知转变设计 (Reader Cognitive Transition: Before -> After)");
    if (compiled.softGuidance.readerTransition.inputState) {
      lines.push("#### 开章前读者既有状态 (Reader State Before)");
      lines.push(...renderReaderStateBlock(compiled.softGuidance.readerTransition.inputState, true));
    } else {
      lines.push("#### 开章前读者状态：*（未指定开章基线）*");
    }
    lines.push("");
    lines.push("#### 本章后期望读者状态 (Desired Reader State After)");
    lines.push(...renderReaderStateBlock(compiled.softGuidance.readerTransition.desiredAfter, true));

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
    lines.push("## L3 创作自由区 (Artistic Freedom)");
    lines.push(`- **允许自由发挥 (May Invent)**：${compiled.freedomZone.mayInvent.join("；") || "（未指定）"}`);
    lines.push(`- **允许弹性变体 (May Vary)**：${compiled.freedomZone.mayVary.join("；") || "（未指定）"}`);
    lines.push(`- **局部创意自由度 (Surprise Allowed)**：${surpriseExplanation}`);
    if (compiled.freedomZone.underspecifiedTopics.length > 0) {
      lines.push(`- **受保护留白主题**：${compiled.freedomZone.underspecifiedTopics.map((t) => `“${t}” (已作为L0绝对铁律严格受保护)`).join("；")}`);
    }
  } else {
    // English
    lines.push("# Chapter Creative Directives (Governing Directives)");
    lines.push("");
    lines.push("> Compiled deterministically from canonical Author-Mind creative contract.");
    lines.push(
      "> Rule Precedence: L0 Absolute > L1 Strong > L2 Soft Intent > L3 Artistic Freedom.",
    );
    lines.push("");

    // L0
    lines.push("## L0 Absolute Boundaries (Mandatory — Zero Breach Tolerance)");
    if (compiled.absoluteDirectives.length === 0) {
      lines.push("- (none)");
    } else {
      for (const dir of compiled.absoluteDirectives) {
        const refPart = dir.sourceRef ? ` | ref: ${dir.sourceRef}` : "";
        const icon = dir.category === "negative_space" ? "🔒 " : "";
        lines.push(`- ${icon}[${dir.id}] ${dir.statement} *(source: ${dir.sourceContractField}${refPart})*`);
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
    lines.push("### Reader Cognitive Transition (Before -> After)");
    if (compiled.softGuidance.readerTransition.inputState) {
      lines.push("#### Reader State Before Chapter (Input State)");
      lines.push(...renderReaderStateBlock(compiled.softGuidance.readerTransition.inputState, false));
    } else {
      lines.push("#### Reader State Before Chapter: *(No baseline specified)*");
    }
    lines.push("");
    lines.push("#### Desired Reader State After Chapter (Target State)");
    lines.push(...renderReaderStateBlock(compiled.softGuidance.readerTransition.desiredAfter, false));

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
    lines.push("## L3 Artistic Freedom");
    lines.push(`- **May Invent**: ${compiled.freedomZone.mayInvent.join("; ") || "(none specified)"}`);
    lines.push(`- **May Vary**: ${compiled.freedomZone.mayVary.join("; ") || "(none specified)"}`);
    lines.push(`- **Local Creative Allowance (Surprise Allowed)**: ${surpriseExplanation}`);
    if (compiled.freedomZone.underspecifiedTopics.length > 0) {
      lines.push(`- **Protected Negative-Space Topics**: ${compiled.freedomZone.underspecifiedTopics.map((t) => `"${t}" (enforced under L0 Absolute Boundaries)`).join("; ")}`);
    }
  }

  return lines.join("\n");
}

/**
 * Creates a protected, narrative-consumable ContextPackage entry for compiled creative directives.
 * Explicitly scoped to audience: ["writer"], isolating Reviser, Auditor, and Settler.
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
    audience: ["writer"],
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
