import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
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
import { renderNarrativeSelectedContext } from "../utils/narrative-control.js";
import { createInitialRuntimeState } from "../state/runtime-state-store.js";
import type { PlanChapterOutput } from "../agents/planner.js";

describe("Phase 3.5.1: Dynamic Contract Compiler & Semantic Closure", () => {
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
        suspects: [{ proposition: "官方调查组掩盖了伤亡数字", strength: "moderate" }],
        expects: [{ proposition: "进入矿井后能顺利找到排水口", strength: "strong" }],
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

    it("Correctly partitions L0 Absolute Directives with negative-space guardrails and content-hashed IDs", () => {
      const compiled = compileCreativeContract(sampleContract, { language: "zh" });

      // L0 items:
      // 1. Absolute hard constraint (hc_cable_broken)
      // 2. Information boundary (sec_saboteur_identity)
      // 3. Character cognitive boundary (char_arthur_mustnot_...)
      // 4. Forbidden shortcut (no_magic_radio)
      // 5-6. Negative-space boundaries (mustRemainUnderspecified x 2)
      expect(compiled.absoluteDirectives).toHaveLength(6);

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

      const charCognitive = compiled.absoluteDirectives.find((d) => d.category === "character_cognitive");
      expect(charCognitive).toBeDefined();
      expect(charCognitive?.id).toMatch(/^char_arthur_mustnot_/);
      expect(charCognitive?.authorityLevel).toBe("L0_ABSOLUTE");
      expect(charCognitive?.characterId).toBe("arthur");
      expect(charCognitive?.statement).toContain("破坏铁索的人正是上一任领班");

      const forbidden = compiled.absoluteDirectives.find((d) => d.id === "no_magic_radio");
      expect(forbidden).toBeDefined();
      expect(forbidden?.authorityLevel).toBe("L0_ABSOLUTE");
      expect(forbidden?.category).toBe("forbidden_shortcut");
      expect(forbidden?.statement).toContain("必须维持主角孤立无援的物理极限情境");

      // Verify Negative-Space Boundaries are in L0 ABSOLUTE
      const negSpace = compiled.absoluteDirectives.filter((d) => d.category === "negative_space");
      expect(negSpace).toHaveLength(2);
      expect(negSpace[0].authorityLevel).toBe("L0_ABSOLUTE");
      expect(negSpace[0].sourceContractField).toBe("freedomZone.mustRemainUnderspecified");
      expect(negSpace[0].id).toMatch(/^neg_space_/);
      expect(negSpace[0].statement).toContain("【留白边界】严禁坐实、过早揭秘或过度解释");
      expect(negSpace[0].statement).toContain("水银蒸馏管道具体由谁在出资运行");
    });

    it("Correctly partitions L1 Strong Directives with content-derived stable IDs", () => {
      const compiled = compileCreativeContract(sampleContract, { language: "zh" });

      // L1 items:
      // 1. Strong hard constraint (hc_lantern_oil)
      // 2. Character behavioral limit (char_arthur_limit_...)
      // 3. Character persistent belief (char_arthur_persist_...)
      // 4. Character start belief (char_arthur_start_...)
      expect(compiled.strongDirectives).toHaveLength(4);

      const hcStrong = compiled.strongDirectives.find((d) => d.id === "hc_lantern_oil");
      expect(hcStrong).toBeDefined();
      expect(hcStrong?.authorityLevel).toBe("L1_STRONG");
      expect(hcStrong?.category).toBe("hard_constraint");
      expect(hcStrong?.sourceRef).toBe("state:current_state.json#lantern.oil");

      const behavior = compiled.strongDirectives.find((d) => d.category === "character_behavior");
      expect(behavior).toBeDefined();
      expect(behavior?.id).toMatch(/^char_arthur_limit_/);
      expect(behavior?.authorityLevel).toBe("L1_STRONG");
      expect(behavior?.characterId).toBe("arthur");

      const persist = compiled.strongDirectives.find((d) => d.sourceContractField === "characterConstraints.beliefsThatMustPersist");
      expect(persist).toBeDefined();
      expect(persist?.id).toMatch(/^char_arthur_persist_/);
      expect(persist?.authorityLevel).toBe("L1_STRONG");
      expect(persist?.characterId).toBe("arthur");

      const start = compiled.strongDirectives.find((d) => d.sourceContractField === "characterConstraints.beliefsAtStart");
      expect(start).toBeDefined();
      expect(start?.id).toMatch(/^char_arthur_start_/);
      expect(start?.authorityLevel).toBe("L1_STRONG");
      expect(start?.characterId).toBe("arthur");
    });

    it("Correctly structures L2 Soft Guidance preserving complete ReaderState Before -> After (including suspects and expects)", () => {
      const compiled = compileCreativeContract(sampleContract, { language: "zh" });

      expect(compiled.softGuidance.whyThisChapterExists).toBe(sampleContract.whyThisChapterExists.statement);
      expect(compiled.softGuidance.humanCore.statement).toBe(sampleContract.humanCore.statement);
      expect(compiled.softGuidance.humanCore.anchoredInCharacters).toEqual(["arthur", "clara"]);
      expect(compiled.softGuidance.chapterFunction?.primary).toBe("揭开矿井深层污染真相并动摇主角核心信念");

      // 1. Verify complete inputState (Before)
      expect(compiled.softGuidance.readerTransition.inputState).toBeDefined();
      expect(compiled.softGuidance.readerTransition.inputState?.knows).toEqual(["老矿井三年前被封锁"]);
      expect(compiled.softGuidance.readerTransition.inputState?.believes[0].proposition).toBe("矿井事故纯属天灾");
      expect(compiled.softGuidance.readerTransition.inputState?.suspects[0].proposition).toBe("官方调查组掩盖了伤亡数字");
      expect(compiled.softGuidance.readerTransition.inputState?.expects[0].proposition).toBe("进入矿井后能顺利找到排水口");
      expect(compiled.softGuidance.readerTransition.inputState?.questions[0].question).toBe("为什么救援队当年没有深入底层？");
      expect(compiled.softGuidance.readerTransition.inputState?.emotionalPosition).toEqual(["谨慎怀疑"]);

      // 2. Verify complete desiredAfter (After with suspects and expects)
      expect(compiled.softGuidance.readerTransition.desiredAfter.knows).toEqual([
        "老矿井的封锁是为了掩盖地下水银泄漏",
      ]);
      expect(compiled.softGuidance.readerTransition.desiredAfter.believes[0].proposition).toBe(
        "官方调查报告存在系统性伪造",
      );
      expect(compiled.softGuidance.readerTransition.desiredAfter.suspects[0].proposition).toBe(
        "领班并非失踪而是被灭口",
      );
      expect(compiled.softGuidance.readerTransition.desiredAfter.expects[0].proposition).toBe(
        "地下暗河存在未被标记的泄压阀",
      );
      expect(compiled.softGuidance.readerTransition.desiredAfter.questions[0].question).toBe(
        "谁在地下持续维护水银蒸馏管道？",
      );
      expect(compiled.softGuidance.readerTransition.desiredAfter.emotionalPosition).toEqual([
        "背脊发凉的惊悚感与不可遏制的求真冲动",
      ]);

      expect(compiled.softGuidance.plannedAuthorIntent.revealTargets[0].id).toBe("target_mercury_leak");
      expect(compiled.softGuidance.plannedAuthorIntent.withholdTargets[0].id).toBe("target_saboteur_motive");
      expect(compiled.softGuidance.plannedAuthorIntent.attentionStrategy).toEqual([
        "将读者的注意力锁定在马灯摇曳的火光和水滴声上",
      ]);
    });

    it("Correctly compiles L3 Freedom Zone without railroad bias", () => {
      const compiled = compileCreativeContract(sampleContract, { language: "zh" });

      expect(compiled.freedomZone.mayInvent).toEqual(sampleContract.freedomZone.mayInvent);
      expect(compiled.freedomZone.mayVary).toEqual(sampleContract.freedomZone.mayVary);
      expect(compiled.freedomZone.surpriseAllowed).toBe(true);
      expect(compiled.freedomZone.underspecifiedTopics).toEqual(sampleContract.freedomZone.mustRemainUnderspecified);
    });
  });

  // 2. Rendering Tests
  describe("Narrative Excerpt Rendering", () => {
    it("Renders rich Markdown in Chinese with L0 negative space and Before->After cognitive transition", () => {
      const compiled = compileCreativeContract(sampleContract, { language: "zh" });
      const rendered = renderCompiledDirectivesAsNarrativeExcerpt(compiled, "zh");

      // Verify sections
      expect(rendered).toContain("# 本章创作合约指令 (Governing Creative Directives)");
      expect(rendered).toContain("## L0 绝对边界 (绝对铁律 — 严禁违背，违反应立即重写)");
      expect(rendered).toContain("## L1 强力约束 (高优先级 — 仅在与L0直接冲突时可权衡)");
      expect(rendered).toContain("## L2 核心意图与读者体验目标 (软性意图引导)");
      expect(rendered).toContain("## L3 创作自由区 (Artistic Freedom)");

      // Verify L0 items including negative space
      expect(rendered).toContain("[hc_cable_broken]");
      expect(rendered).toContain("canon:old_mine_closed");
      expect(rendered).toContain("【信息边界：真凶身份】");
      expect(rendered).toContain("【严禁捷径：no_magic_radio】");
      expect(rendered).toContain("🔒");
      expect(rendered).toContain("【留白边界】严禁坐实、过早揭秘或过度解释：“水银蒸馏管道具体由谁在出资运行”");

      // Verify Before -> After cognitive transition with suspects and expects
      expect(rendered).toContain("开章前读者既有状态 (Reader State Before)");
      expect(rendered).toContain("本章后期望读者状态 (Desired Reader State After)");
      expect(rendered).toContain("怀疑猜想 (Suspects)");
      expect(rendered).toContain("领班并非失踪而是被灭口");
      expect(rendered).toContain("剧情预期 (Expects)");
      expect(rendered).toContain("地下暗河存在未被标记的泄压阀");

      // Verify rewritten surpriseAllowed wording
      expect(rendered).toContain("允许在既有边界内产生未预先指定的局部创意；这不是制造反转、冲突或悬念的要求。");
    });

    it("Renders rich Markdown in English with L0 negative space and Before->After cognitive transition", () => {
      const compiled = compileCreativeContract(sampleContract, { language: "en" });
      const rendered = renderCompiledDirectivesAsNarrativeExcerpt(compiled, "en");

      expect(rendered).toContain("# Chapter Creative Directives (Governing Directives)");
      expect(rendered).toContain("## L0 Absolute Boundaries (Mandatory — Zero Breach Tolerance)");
      expect(rendered).toContain("## L1 Strong Constraints (High Priority — Overridden Only by Direct L0 Conflict)");
      expect(rendered).toContain("## L2 Creative Intent & Target Reader Experience (Soft Guidance)");
      expect(rendered).toContain("## L3 Artistic Freedom");

      expect(rendered).toContain("[hc_cable_broken]");
      expect(rendered).toContain("[Information Boundary: 真凶身份]");
      expect(rendered).toContain("🔒");
      expect(rendered).toContain("[Negative-Space Boundary]");

      expect(rendered).toContain("Reader State Before Chapter (Input State)");
      expect(rendered).toContain("Desired Reader State After Chapter (Target State)");
      expect(rendered).toContain("Suspicions (Suspects)");
      expect(rendered).toContain("Expectations (Expects)");

      expect(rendered).toContain("Permitted to introduce unscripted local creative elements within boundaries; this is not a directive to manufacture twists or shocks.");
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

      // 1. Raw transport entry exists and is marked as transport with audience: []
      const contractEntry = composed.contextPackage.selectedContext.find(
        (e) => e.source === CREATIVE_CONTRACT_CONTEXT_SOURCE,
      );
      expect(contractEntry).toBeDefined();
      expect(contractEntry?.protection).toBe("protected");
      expect(contractEntry?.consumption).toBe("transport");
      expect(contractEntry?.audience).toEqual([]);

      // 2. Compiled directives entry exists and is marked as narrative with audience: ["writer"]
      const directivesEntry = composed.contextPackage.selectedContext.find(
        (e) => e.source === COMPILED_DIRECTIVES_CONTEXT_SOURCE,
      );
      expect(directivesEntry).toBeDefined();
      expect(directivesEntry?.protection).toBe("protected");
      expect(directivesEntry?.consumption).toBe("narrative");
      expect(directivesEntry?.audience).toEqual(["writer"]);
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

  // 4. Consumer Audience Isolation Tests
  describe("Consumer Audience Isolation: Writer vs. Reviser vs. Auditor vs. Settler", () => {
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
      expect(userPrompt).toContain("hc_cable_broken");

      // 2. Writer prompt MUST NOT contain raw contract JSON transport
      expect(userPrompt).not.toContain(CREATIVE_CONTRACT_CONTEXT_SOURCE);
      expect(userPrompt).not.toContain('"schemaVersion":1');
    });

    it("Reviser is isolated: does NOT receive raw contract NOR compiled directives", async () => {
      const composed = await composeGovernedChapter({
        book,
        bookDir,
        chapterNumber: 1,
        plan: v3PlanWithContract,
      });

      const reviserContext = renderNarrativeSelectedContext(
        composed.contextPackage.selectedContext,
        "zh",
        "reviser",
      );

      // Reviser MUST NOT contain raw contract or compiled directives
      expect(reviserContext).not.toContain(CREATIVE_CONTRACT_CONTEXT_SOURCE);
      expect(reviserContext).not.toContain(COMPILED_DIRECTIVES_CONTEXT_SOURCE);
      expect(reviserContext).not.toContain("本章创作合约指令");
      expect(reviserContext).not.toContain("L0 绝对边界");
    });

    it("Continuity Auditor is isolated: does NOT receive raw contract NOR compiled directives", async () => {
      const composed = await composeGovernedChapter({
        book,
        bookDir,
        chapterNumber: 1,
        plan: v3PlanWithContract,
      });

      const auditorContext = renderNarrativeSelectedContext(
        composed.contextPackage.selectedContext,
        "zh",
        "auditor",
      );

      // Auditor MUST NOT contain raw contract or compiled directives
      expect(auditorContext).not.toContain(CREATIVE_CONTRACT_CONTEXT_SOURCE);
      expect(auditorContext).not.toContain(COMPILED_DIRECTIVES_CONTEXT_SOURCE);
      expect(auditorContext).not.toContain("本章创作合约指令");
      expect(auditorContext).not.toContain("L0 绝对边界");
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
            audience: ["writer"],
          },
          {
            source: COMPILED_DIRECTIVES_CONTEXT_SOURCE,
            reason: "Second",
            excerpt: "Directives 2",
            protection: "protected",
            consumption: "narrative",
            audience: ["writer"],
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
            audience: ["writer"],
          },
        ],
      };

      expect(() => extractCompiledDirectivesFromContextPackage(corruptedPackage)).toThrow(
        /ContextPackage invariant violation: compiled creative directives entry is present but excerpt is empty or missing/,
      );
    });
  });
});
