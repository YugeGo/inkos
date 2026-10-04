import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { BookConfig } from "../models/book.js";
import {
  ChapterCreativeContractSchema,
  type ChapterCreativeContract,
  type ContextPackage,
} from "../models/input-governance.js";
import {
  compileCreativeContract,
  renderCompiledDirectivesAsNarrativeExcerpt,
  createCompiledDirectivesContextEntry,
  COMPILED_DIRECTIVES_CONTEXT_SOURCE,
  extractCompiledDirectivesFromContextPackage,
} from "../compiler/contract-compiler.js";
import {
  composeGovernedChapter,
  CREATIVE_CONTRACT_CONTEXT_SOURCE,
  extractCreativeContractFromContextPackage,
  type ContextBudget,
} from "../agents/composer.js";
import { WriterAgent } from "../agents/writer.js";
import { createInitialRuntimeState } from "../state/runtime-state-store.js";
import type { PlanChapterOutput } from "../agents/planner.js";

describe("Phase 3.5: Dynamic Contract Compiler & Directive Governance", () => {
  let tempDir: string;
  let bookDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "inkos-compiler-test-"));
    bookDir = join(tempDir, "works", "test-book");
    await mkdir(bookDir, { recursive: true });
    await createInitialRuntimeState({ bookDir, language: "zh" });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const book: BookConfig = {
    id: "test-book",
    title: "深井暗流",
    genre: "mystery",
    platform: "other",
    status: "active",
    targetChapters: 10,
    chapterWordCount: 3000,
    language: "zh",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleContract: ChapterCreativeContract = ChapterCreativeContractSchema.parse({
    schemaVersion: 1,
    whyThisChapterExists: {
      statement: "Arthur 必须亲自下潜至井底，打破对官方调查报告的盲目信任。",
    },
    chapterFunction: {
      primary: "揭开矿井深层污染真相并动摇主角核心信念",
      secondary: ["展现底层矿工极端生存状态"],
      plotProgress: "medium",
    },
    humanCore: {
      statement: "一个习惯遵循安全规程的技术人员，在黑暗中意识到规程本身正是杀人陷阱。",
      anchoredInCharacters: ["arthur", "clara"],
    },
    hardConstraints: [
      {
        id: "hc_cable_broken",
        statement: "老矿井的铁索道必须处于断裂状态，无法乘坐缆车直达。",
        source: "canon",
        sourceRef: "canon:old_mine_closed",
        priority: "absolute",
      },
      {
        id: "hc_lantern_oil",
        statement: "随身携带的马灯煤油在到达第三平台前不得神秘补满。",
        source: "world",
        sourceRef: "state:current_state.json#lantern.oil",
        priority: "strong",
      },
    ],
    characterConstraints: [
      {
        characterId: "arthur",
        mustNotKnow: ["破坏铁索的人正是上一任领班"],
        beliefsThatMustPersist: ["只要顺着通风井管道就能安全返回地面"],
        beliefsAtStart: ["官方调查组没有理由篡改通风图纸"],
        behavioralLimits: ["绝不在没有系好安全绳的情况下跃过裂隙"],
      },
    ],
    readerTransition: {
      inputState: {
        knows: ["老矿井三年前被封锁"],
        believes: [{ proposition: "矿井事故纯属天灾", strength: "strong" }],
        suspects: [],
        expects: [],
        questions: [{ question: "为什么救援队当年没有深入底层？", salience: "high" }],
        emotionalPosition: ["谨慎怀疑"],
      },
      desiredAfter: {
        knows: ["老矿井的封锁是为了掩盖地下水银泄漏"],
        believes: [{ proposition: "官方调查报告存在系统性伪造", strength: "strong" }],
        suspects: [{ proposition: "领班并非失踪而是被灭口", strength: "moderate" }],
        expects: [{ proposition: "地下暗河存在未被标记的泄压阀", strength: "weak" }],
        questions: [{ question: "谁在地下持续维护水银蒸馏管道？", salience: "high" }],
        emotionalPosition: ["背脊发凉的惊悚感与不可遏制的求真冲动"],
      },
      mustRemainUnknown: [
        {
          id: "sec_saboteur_identity",
          topic: "真凶身份",
          boundaryRule: "不得在本章通过任何旁白、遗留笔记或对话明确暗示破坏者为上一任领班。",
        },
      ],
    },
    plannedAuthorIntent: {
      readerEffects: ["营造密闭空间的压迫感与逐渐窒息的心理悬疑"],
      informationStrategy: {
        reveal: [
          {
            id: "target_mercury_leak",
            description: "井底积水中漂浮的银白色金属光泽与反常温度",
          },
        ],
        withhold: [
          {
            id: "target_saboteur_motive",
            description: "上一任领班与矿业财团签订的私下协议",
          },
        ],
      },
      attentionStrategy: ["将读者的注意力锁定在马灯摇曳的火光和水滴声上"],
      emotionalTrajectory: ["平稳探查 -> 遭遇断裂 -> 发现水银时的悚然一惊"],
    },
    forbiddenShortcuts: [
      {
        code: "no_magic_radio",
        description: "禁止在深井底部出现便携式无线电超自然联通地面信号。",
        reason: "必须维持主角孤立无援的物理极限情境，迫使其依赖自身专业技能求生。",
      },
    ],
    freedomZone: {
      mayInvent: ["井壁残留的废弃工具种类", "通风井管道的具体锈蚀形态与气味"],
      mayVary: ["主角攀爬岩壁的具体落脚点选择"],
      mustRemainUnderspecified: [
        "水银蒸馏管道具体由谁在出资运行",
        "矿井深处隐约传来的金属敲击声来源",
      ],
      surpriseAllowed: true,
    },
  });

  const v3PlanWithContract: PlanChapterOutput = {
    intent: {
      chapter: 1,
      goal: "Arthur 潜入老矿井调查真相",
    },
    memo: {
      chapter: 1,
      goal: "Arthur 潜入老矿井调查真相",
      body: "重点描绘井底环境与心理压迫。",
      threadRefs: ["thread_mine_investigation"],
    },
    intentMarkdown: "Arthur 潜入老矿井调查真相",
    plannerInputs: ["current_focus.md", "book_rules.json"],
    runtimePath: "runtime/chapter-0001.intent.md",
    creativeContract: sampleContract,
  };

  const v2NativePlan: PlanChapterOutput = {
    intent: {
      chapter: 1,
      goal: "Arthur 潜入老矿井调查真相",
    },
    memo: {
      chapter: 1,
      goal: "Arthur 潜入老矿井调查真相",
      body: "常规调查剧情",
      threadRefs: ["thread_mine_investigation"],
    },
    intentMarkdown: "Arthur 潜入老矿井调查真相",
    plannerInputs: ["current_focus.md"],
    runtimePath: "runtime/chapter-0001.intent.md",
  };

  // 1. Pure Deterministic Compiler Tests
  describe("Deterministic Host Contract Compiler", () => {
    it("Compiles deterministically: identical inputs produce identical output without LLM calls", () => {
      const run1 = compileCreativeContract(sampleContract, { language: "zh", chapterNumber: 1 });
      const run2 = compileCreativeContract(sampleContract, { language: "zh", chapterNumber: 1 });

      expect(run1).toEqual(run2);
      expect(run1.schemaVersion).toBe(1);
      expect(run1.chapterNumber).toBe(1);
    });

    it("Correctly partitions L0 Absolute Directives with complete provenance", () => {
      const compiled = compileCreativeContract(sampleContract, { language: "zh" });

      // L0 items:
      // 1. Absolute hard constraint (hc_cable_broken)
      // 2. Information boundary (sec_saboteur_identity)
      // 3. Character cognitive boundary (arthur-mustNotKnow-1)
      // 4. Forbidden shortcut (no_magic_radio)
      expect(compiled.absoluteDirectives).toHaveLength(4);

      const hc = compiled.absoluteDirectives.find((d) => d.id === "hc_cable_broken");
      expect(hc).toBeDefined();
      expect(hc?.authorityLevel).toBe("L0_ABSOLUTE");
      expect(hc?.category).toBe("hard_constraint");
      expect(hc?.sourceContractField).toBe("hardConstraints");
      expect(hc?.sourceRef).toBe("canon:old_mine_closed");

      const infoBoundary = compiled.absoluteDirectives.find((d) => d.id === "sec_saboteur_identity");
      expect(infoBoundary).toBeDefined();
      expect(infoBoundary?.authorityLevel).toBe("L0_ABSOLUTE");
      expect(infoBoundary?.category).toBe("information_boundary");
      expect(infoBoundary?.sourceContractField).toBe("readerTransition.mustRemainUnknown");

      const charCognitive = compiled.absoluteDirectives.find((d) => d.id === "arthur-mustNotKnow-1");
      expect(charCognitive).toBeDefined();
      expect(charCognitive?.authorityLevel).toBe("L0_ABSOLUTE");
      expect(charCognitive?.category).toBe("character_cognitive");
      expect(charCognitive?.characterId).toBe("arthur");
      expect(charCognitive?.statement).toContain("破坏铁索的人正是上一任领班");

      const forbidden = compiled.absoluteDirectives.find((d) => d.id === "no_magic_radio");
      expect(forbidden).toBeDefined();
      expect(forbidden?.authorityLevel).toBe("L0_ABSOLUTE");
      expect(forbidden?.category).toBe("forbidden_shortcut");
      expect(forbidden?.statement).toContain("必须维持主角孤立无援的物理极限情境");
    });

    it("Correctly partitions L1 Strong Directives with complete provenance", () => {
      const compiled = compileCreativeContract(sampleContract, { language: "zh" });

      // L1 items:
      // 1. Strong hard constraint (hc_lantern_oil)
      // 2. Character behavioral limit (arthur-behavioralLimit-1)
      // 3. Character persistent belief (arthur-persistBelief-1)
      // 4. Character start belief (arthur-startBelief-1)
      expect(compiled.strongDirectives).toHaveLength(4);

      const hcStrong = compiled.strongDirectives.find((d) => d.id === "hc_lantern_oil");
      expect(hcStrong).toBeDefined();
      expect(hcStrong?.authorityLevel).toBe("L1_STRONG");
      expect(hcStrong?.category).toBe("hard_constraint");
      expect(hcStrong?.sourceRef).toBe("state:current_state.json#lantern.oil");

      const behavior = compiled.strongDirectives.find((d) => d.id === "arthur-behavioralLimit-1");
      expect(behavior).toBeDefined();
      expect(behavior?.authorityLevel).toBe("L1_STRONG");
      expect(behavior?.category).toBe("character_behavior");
      expect(behavior?.characterId).toBe("arthur");

      const persist = compiled.strongDirectives.find((d) => d.id === "arthur-persistBelief-1");
      expect(persist).toBeDefined();
      expect(persist?.authorityLevel).toBe("L1_STRONG");
      expect(persist?.category).toBe("character_belief");
      expect(persist?.characterId).toBe("arthur");

      const start = compiled.strongDirectives.find((d) => d.id === "arthur-startBelief-1");
      expect(start).toBeDefined();
      expect(start?.authorityLevel).toBe("L1_STRONG");
      expect(start?.category).toBe("character_belief");
      expect(start?.characterId).toBe("arthur");
    });

    it("Correctly structures L2 Soft Guidance (Purpose, Human Core, Transitions, Strategy)", () => {
      const compiled = compileCreativeContract(sampleContract, { language: "zh" });

      expect(compiled.softGuidance.whyThisChapterExists).toBe(sampleContract.whyThisChapterExists.statement);
      expect(compiled.softGuidance.humanCore.statement).toBe(sampleContract.humanCore.statement);
      expect(compiled.softGuidance.humanCore.anchoredInCharacters).toEqual(["arthur", "clara"]);
      expect(compiled.softGuidance.chapterFunction?.primary).toBe("揭开矿井深层污染真相并动摇主角核心信念");

      expect(compiled.softGuidance.readerTransition.desiredKnows).toEqual([
        "老矿井的封锁是为了掩盖地下水银泄漏",
      ]);
      expect(compiled.softGuidance.readerTransition.desiredBeliefs[0].proposition).toBe(
        "官方调查报告存在系统性伪造",
      );
      expect(compiled.softGuidance.readerTransition.desiredQuestions[0].question).toBe(
        "谁在地下持续维护水银蒸馏管道？",
      );

      expect(compiled.softGuidance.plannedAuthorIntent.revealTargets[0].id).toBe("target_mercury_leak");
      expect(compiled.softGuidance.plannedAuthorIntent.withholdTargets[0].id).toBe("target_saboteur_motive");
      expect(compiled.softGuidance.plannedAuthorIntent.attentionStrategy).toEqual([
        "将读者的注意力锁定在马灯摇曳的火光和水滴声上",
      ]);
    });

    it("Correctly compiles L3 Freedom Zone with explicit Negative-Space Protection", () => {
      const compiled = compileCreativeContract(sampleContract, { language: "zh" });

      expect(compiled.freedomZone.mayInvent).toEqual(sampleContract.freedomZone.mayInvent);
      expect(compiled.freedomZone.mayVary).toEqual(sampleContract.freedomZone.mayVary);
      expect(compiled.freedomZone.surpriseAllowed).toBe(true);

      // Negative-Space Protection verification:
      // mustRemainUnderspecified items must be transformed into negativeSpaceGuarantees
      expect(compiled.freedomZone.negativeSpaceGuarantees).toHaveLength(2);
      const item1 = compiled.freedomZone.negativeSpaceGuarantees[0];
      expect(item1.topic).toBe("水银蒸馏管道具体由谁在出资运行");
      expect(item1.directive).toContain("留白保护");
      expect(item1.directive).toContain("严禁坐实或过度解释");
      expect(item1.sourceContractField).toBe("freedomZone.mustRemainUnderspecified");
    });
  });

  // 2. Rendering Tests
  describe("Narrative Excerpt Rendering", () => {
    it("Renders rich Markdown in Chinese with clear precedence and negative space warnings", () => {
      const compiled = compileCreativeContract(sampleContract, { language: "zh" });
      const rendered = renderCompiledDirectivesAsNarrativeExcerpt(compiled, "zh");

      // Verify sections
      expect(rendered).toContain("# 本章创作合约指令 (Governing Creative Directives)");
      expect(rendered).toContain("## L0 绝对边界 (绝对铁律 — 严禁违背，违反应立即重写)");
      expect(rendered).toContain("## L1 强力约束 (高优先级 — 仅在与L0直接冲突时可权衡)");
      expect(rendered).toContain("## L2 核心意图与读者体验目标 (软性意图引导)");
      expect(rendered).toContain("## L3 创作自由区与留白保护 (Artistic Freedom & Negative Space)");

      // Verify L0 items
      expect(rendered).toContain("[hc_cable_broken]");
      expect(rendered).toContain("canon:old_mine_closed");
      expect(rendered).toContain("【信息边界：真凶身份】");
      expect(rendered).toContain("【严禁捷径：no_magic_radio】");

      // Verify negative space warning & lock icon
      expect(rendered).toContain("### 留白保护区 (严禁过度解释或过早坐实)");
      expect(rendered).toContain("🔒");
      expect(rendered).toContain("水银蒸馏管道具体由谁在出资运行");
    });

    it("Renders rich Markdown in English with clear precedence and negative space warnings", () => {
      const compiled = compileCreativeContract(sampleContract, { language: "en" });
      const rendered = renderCompiledDirectivesAsNarrativeExcerpt(compiled, "en");

      expect(rendered).toContain("# Chapter Creative Directives (Governing Directives)");
      expect(rendered).toContain("## L0 Absolute Boundaries (Mandatory — Zero Breach Tolerance)");
      expect(rendered).toContain("## L1 Strong Constraints (High Priority — Overridden Only by Direct L0 Conflict)");
      expect(rendered).toContain("## L2 Creative Intent & Target Reader Experience (Soft Guidance)");
      expect(rendered).toContain("## L3 Artistic Freedom & Negative-Space Protection");

      expect(rendered).toContain("[hc_cable_broken]");
      expect(rendered).toContain("[Information Boundary: 真凶身份]");
      expect(rendered).toContain("### Negative-Space Protection (Strict Guardrails Against Over-Explaining)");
      expect(rendered).toContain("🔒");
    });
  });

  // 3. Composer Integration Tests
  describe("Composer Integration: Transport vs. Directive Context Entries", () => {
    it("V3 Plan: Composer produces BOTH raw contract (transport) AND compiled directives (narrative)", async () => {
      const composed = await composeGovernedChapter({
        book,
        bookDir,
        chapterNumber: 1,
        plan: v3PlanWithContract,
      });

      // 1. Raw transport entry exists and is marked as transport
      const contractEntry = composed.contextPackage.selectedContext.find(
        (e) => e.source === CREATIVE_CONTRACT_CONTEXT_SOURCE,
      );
      expect(contractEntry).toBeDefined();
      expect(contractEntry?.protection).toBe("protected");
      expect(contractEntry?.consumption).toBe("transport");

      // 2. Compiled directives entry exists and is marked as narrative
      const directivesEntry = composed.contextPackage.selectedContext.find(
        (e) => e.source === COMPILED_DIRECTIVES_CONTEXT_SOURCE,
      );
      expect(directivesEntry).toBeDefined();
      expect(directivesEntry?.protection).toBe("protected");
      expect(directivesEntry?.consumption).toBe("narrative");
      expect(directivesEntry?.excerpt).toContain("# 本章创作合约指令");

      // 3. Both are in trace protectedSources
      expect(composed.trace.contextTiers.protectedSources).toContain(CREATIVE_CONTRACT_CONTEXT_SOURCE);
      expect(composed.trace.contextTiers.protectedSources).toContain(COMPILED_DIRECTIVES_CONTEXT_SOURCE);

      // 4. Helper extraction works
      const extractedDirectives = extractCompiledDirectivesFromContextPackage(composed.contextPackage);
      expect(extractedDirectives).toBeDefined();
      expect(extractedDirectives?.source).toBe(COMPILED_DIRECTIVES_CONTEXT_SOURCE);
    });

    it("Native V2 Plan: Composer produces NEITHER contract nor directives entries", async () => {
      const composed = await composeGovernedChapter({
        book,
        bookDir,
        chapterNumber: 1,
        plan: v2NativePlan,
      });

      const contractEntries = composed.contextPackage.selectedContext.filter(
        (e) => e.source === CREATIVE_CONTRACT_CONTEXT_SOURCE,
      );
      expect(contractEntries).toHaveLength(0);

      const directivesEntries = composed.contextPackage.selectedContext.filter(
        (e) => e.source === COMPILED_DIRECTIVES_CONTEXT_SOURCE,
      );
      expect(directivesEntries).toHaveLength(0);

      expect(extractCreativeContractFromContextPackage(composed.contextPackage)).toBeUndefined();
      expect(extractCompiledDirectivesFromContextPackage(composed.contextPackage)).toBeUndefined();
    });

    it("Context Budget: compiled directives are protected from compression or dropping", async () => {
      let compilerReceivedSources: string[] = [];
      const mockCompiler = vi.fn(async (req: any) => {
        compilerReceivedSources = req.compressibleEntries.map((e: any) => e.source);
        return "Compressed summary";
      });

      const budget: ContextBudget = {
        contextWindowTokens: 3500,
        reservedOutputTokens: 500,
      };

      const composed = await composeGovernedChapter({
        book,
        bookDir,
        chapterNumber: 1,
        plan: v3PlanWithContract,
        contextBudget: budget,
        referenceContextProvider: async () => ({
          entries: [
            {
              source: "references/background_lore.md",
              reason: "General background lore",
              excerpt: "Long background lore content... ".repeat(150),
              protection: "compressible",
            },
          ],
          notes: [],
        }),
        compressibleContextCompiler: mockCompiler,
      });

      // 1. Directives was NEVER passed to compressible compiler
      expect(compilerReceivedSources).not.toContain(COMPILED_DIRECTIVES_CONTEXT_SOURCE);
      expect(compilerReceivedSources).not.toContain(CREATIVE_CONTRACT_CONTEXT_SOURCE);

      // 2. Both entries remain in final composed contextPackage
      expect(
        composed.contextPackage.selectedContext.some((e) => e.source === COMPILED_DIRECTIVES_CONTEXT_SOURCE),
      ).toBe(true);
      expect(
        composed.contextPackage.selectedContext.some((e) => e.source === CREATIVE_CONTRACT_CONTEXT_SOURCE),
      ).toBe(true);
    });
  });

  // 4. Writer vs. Settler Isolation Tests
  describe("Writer vs. Settler Prompt Isolation", () => {
    it("Writer sees compiled directives in narrative context, but does NOT see raw contract transport JSON", async () => {
      const composed = await composeGovernedChapter({
        book,
        bookDir,
        chapterNumber: 1,
        plan: v3PlanWithContract,
      });

      const mockWriter = new WriterAgent({
        client: { defaults: { maxTokens: 4096 } } as any,
        model: "test-writer",
        projectRoot: tempDir,
      } as any);

      const userPrompt = (mockWriter as any).buildGovernedUserPrompt({
        chapterNumber: 1,
        chapterMemo: v3PlanWithContract.memo,
        chapterIntentData: v3PlanWithContract.intent,
        contextPackage: composed.contextPackage,
        lengthSpec: { target: 3000, countingMode: "zh_chars" },
        language: "zh",
      });

      // 1. Writer prompt MUST contain compiled directives
      expect(userPrompt).toContain("本章创作指令");
      expect(userPrompt).toContain("本章创作合约指令");
      expect(userPrompt).toContain("L0 绝对边界");
      expect(userPrompt).toContain("留白保护区");
      expect(userPrompt).toContain("hc_cable_broken");

      // 2. Writer prompt MUST NOT contain raw contract JSON transport
      expect(userPrompt).not.toContain(CREATIVE_CONTRACT_CONTEXT_SOURCE);
      expect(userPrompt).not.toContain('"schemaVersion":1');
    });

    it("Settler is 100% isolated: receives NEITHER raw contract NOR compiled directives", async () => {
      const composed = await composeGovernedChapter({
        book,
        bookDir,
        chapterNumber: 1,
        plan: v3PlanWithContract,
      });

      const mockWriter = new WriterAgent({
        client: { defaults: { maxTokens: 4096 } } as any,
        model: "test-writer",
        projectRoot: tempDir,
      } as any);

      const settlerControlBlock = (mockWriter as any).buildSettlerGovernedControlBlock(
        "Arthur 潜入老矿井调查真相",
        composed.contextPackage,
        "zh",
      );

      // 1. Settler MUST NOT contain raw contract context
      expect(settlerControlBlock).not.toContain(CREATIVE_CONTRACT_CONTEXT_SOURCE);
      expect(settlerControlBlock).not.toContain('"schemaVersion":1');

      // 2. Settler MUST NOT contain compiled directives (planning intent must not pollute state delta!)
      expect(settlerControlBlock).not.toContain(COMPILED_DIRECTIVES_CONTEXT_SOURCE);
      expect(settlerControlBlock).not.toContain("本章创作合约指令");
      expect(settlerControlBlock).not.toContain("L0 绝对边界");
    });
  });

  // 5. Invariant Hardening Tests
  describe("Invariant Hardening for ContextPackage Extraction", () => {
    it("extractCreativeContractFromContextPackage throws if excerpt is empty or whitespace-only", () => {
      const corruptedPackage: ContextPackage = {
        chapter: 1,
        selectedContext: [
          {
            source: CREATIVE_CONTRACT_CONTEXT_SOURCE,
            reason: "Corrupted contract",
            excerpt: "   ",
            protection: "protected",
            consumption: "transport",
          },
        ],
      };

      expect(() => extractCreativeContractFromContextPackage(corruptedPackage)).toThrow(
        /ContextPackage invariant violation: creative contract entry is present but excerpt is empty or missing/,
      );
    });

    it("extractCompiledDirectivesFromContextPackage throws if duplicate entries exist", () => {
      const duplicatedPackage: ContextPackage = {
        chapter: 1,
        selectedContext: [
          {
            source: COMPILED_DIRECTIVES_CONTEXT_SOURCE,
            reason: "First",
            excerpt: "Directives 1",
            protection: "protected",
            consumption: "narrative",
          },
          {
            source: COMPILED_DIRECTIVES_CONTEXT_SOURCE,
            reason: "Second",
            excerpt: "Directives 2",
            protection: "protected",
            consumption: "narrative",
          },
        ],
      };

      expect(() => extractCompiledDirectivesFromContextPackage(duplicatedPackage)).toThrow(
        /ContextPackage invariant violation: expected at most 1 compiled creative directives entry, found 2/,
      );
    });

    it("extractCompiledDirectivesFromContextPackage throws if excerpt is empty", () => {
      const corruptedPackage: ContextPackage = {
        chapter: 1,
        selectedContext: [
          {
            source: COMPILED_DIRECTIVES_CONTEXT_SOURCE,
            reason: "Empty directives",
            excerpt: "",
            protection: "protected",
            consumption: "narrative",
          },
        ],
      };

      expect(() => extractCompiledDirectivesFromContextPackage(corruptedPackage)).toThrow(
        /ContextPackage invariant violation: compiled creative directives entry is present but excerpt is empty or missing/,
      );
    });
  });
});
