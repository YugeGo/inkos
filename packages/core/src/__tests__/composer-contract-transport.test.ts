import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ComposerAgent,
  composeGovernedChapter,
  CREATIVE_CONTRACT_CONTEXT_SOURCE,
  extractCreativeContractFromContextPackage,
  isTransportOnlyContextSource,
  normalizePlannerContract,
  type PlannerCreativeContractDraft,
  type PlanningEvidenceBundle,
  type ChapterCreativeContract,
  type PlanChapterOutput,
  type BookConfig,
  type ContextBudget,
  type ContextPackage,
} from "../index.js";
import { WriterAgent } from "../agents/writer.js";
import { createInitialRuntimeState } from "../state/runtime-state-store.js";
import type { AgentContext } from "../agents/base.js";

describe("Phase 3: Composer Contract Transport (Lossless & Protected)", () => {
  let tempDir: string;
  let bookDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "inkos-composer-transport-"));
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

  const sampleBundle: PlanningEvidenceBundle = {
    canonFacts: [
      {
        ref: "canon:old_mine_closed",
        text: "老矿井在三年前因渗水事故关闭",
        authority: "canon",
      },
    ],
    runtimeState: [
      {
        ref: "state:current_state.json#lantern.oil",
        text: "马灯仅剩半罐煤油",
        authority: "runtime_state",
      },
    ],
    activeHooks: [
      {
        ref: "hook:hk_mysterious_letter",
        text: "匿名信件指示在午夜前往钟楼",
        authority: "runtime_state",
      },
    ],
    outlineIntentions: [],
    authorInstructions: [],
    bookRules: [],
    characterIds: ["arthur", "clara"],
  };

  const sampleDraft: PlannerCreativeContractDraft = {
    whyThisChapterExists: {
      statement: "Arthur 必须亲自下潜至井底，打破对官方调查报告的盲目信任。",
    },
    humanCore: {
      statement: "一个习惯遵循安全规程的人，在黑暗中意识到规程正是陷阱。",
      anchoredInCharacters: ["Arthur"],
    },
    hardConstraints: [
      {
        statement: "老矿井的铁索道必须处于断裂状态，无法乘坐缆车直达。",
        source: "canon",
        sourceRef: "canon:old_mine_closed",
        priority: "absolute",
      },
      {
        statement: "随身携带的马灯煤油不得中途神秘补满。",
        source: "world",
        sourceRef: "state:current_state.json#lantern.oil",
      },
    ],
    characterConstraints: [
      {
        characterId: "Arthur",
        mustNotKnow: ["破坏铁索的人正是上一任领班"],
        beliefsThatMustPersist: ["只要顺着通风井就能安全返回地面"],
        beliefsAtStart: ["官方调查组没有理由篡改现场"],
      },
    ],
    readerTransition: {
      desiredAfter: {
        knows: ["通风管壁上有新鲜的人工凿击凹坑"],
        believes: [{ proposition: "当年的渗水并非自然地质灾害", strength: "moderate" }],
        suspects: [{ proposition: "管理层有人故意制造了事故", strength: "weak" }],
        expects: [{ proposition: "下一步将遇到人为布置的绊线陷阱", strength: "moderate" }],
        questions: [{ question: "谁能在三年前预先封死第二逃生口？", salience: "high" }],
        emotionalPosition: ["窒息感中的疑虑加剧"],
      },
      mustRemainUnknown: [
        {
          semanticKey: "mastermind_motivation",
          topic: "幕后黑手的真实动机",
          boundaryRule: "本章内不得出现任何指涉幕后主使真实动机的对话或日志",
        },
      ],
    },
    plannedAuthorIntent: {
      readerEffects: ["让读者随着 Arthur 的视线在黑暗中逐步发现细节疑点"],
      informationStrategy: {
        reveal: [{ semanticKey: "pipe_markings", description: "通风管道内侧有防潮防腐刻痕" }],
        withhold: [{ semanticKey: "insurance_policy", description: "当年矿长办公室抽屉里的保险单" }],
      },
      attentionStrategy: ["聚焦在环境的细微反常细节上，避免宏观宣讲"],
      emotionalTrajectory: ["戒备谨慎 -> 发现疑点 -> 脊背发凉的怀疑"],
    },
    forbiddenShortcuts: [
      {
        description: "禁止直接由旁白宣称‘Arthur 感到十分恐惧’",
        reason: "必须通过粗重呼吸、指尖发颤和步伐迟疑来具象化恐惧",
      },
    ],
    freedomZone: {
      mayInvent: ["废弃矿道的支线岔路走向", "洞穴滴水声的节奏与风道气流温差"],
      mayVary: ["Arthur 独白时的自言自语用词"],
      mustRemainUnderspecified: ["远处黑暗深处传来的轻微摩擦声来源"],
      surpriseAllowed: true,
    },
  };

  const sampleContract: ChapterCreativeContract = normalizePlannerContract(sampleDraft, sampleBundle);

  const v3PlanWithContract: PlanChapterOutput = {
    intent: { chapter: 1, goal: "调查矿井深处" },
    memo: {
      chapter: 1,
      goal: "调查矿井深处",
      body: "Arthur 带领小队进入矿道，在排水口附近搜寻父亲遗留的仪器包。",
      threadRefs: ["hook_mine_01"],
    },
    intentMarkdown: "投影内容",
    plannerInputs: ["author_intent.md"],
    runtimePath: "runtime/chapter-0001.intent.md",
    creativeContract: sampleContract,
  };

  const v2NativePlan: PlanChapterOutput = {
    intent: { chapter: 1, goal: "调查矿井深处" },
    memo: {
      chapter: 1,
      goal: "调查矿井深处",
      body: "Arthur 带领小队进入矿道，在排水口附近搜寻父亲遗留的仪器包。",
      threadRefs: ["hook_mine_01"],
    },
    intentMarkdown: "原生投影内容",
    plannerInputs: ["author_intent.md"],
    runtimePath: "runtime/chapter-0001.intent.md",
    // No creativeContract (Native V2)
  };

  it("AuthorMind V3: Composer produces exactly one protected contract entry with transport consumption", async () => {
    const composed = await composeGovernedChapter({
      book,
      bookDir,
      chapterNumber: 1,
      plan: v3PlanWithContract,
    });

    const contractEntries = composed.contextPackage.selectedContext.filter(
      (entry) => entry.source === CREATIVE_CONTRACT_CONTEXT_SOURCE,
    );

    // 1. Exactly one contract entry produced
    expect(contractEntries).toHaveLength(1);

    const contractEntry = contractEntries[0];
    // 2. Must be protected tier
    expect(contractEntry.protection).toBe("protected");
    expect(contractEntry.consumption).toBe("transport");
    expect(isTransportOnlyContextSource(contractEntry)).toBe(true);
    expect(contractEntry.reason).toBe("Authoritative creative contract governing chapter writing.");
    expect(contractEntry.excerpt).toBeDefined();
  });

  it("Native V2: Composer produces no contract entry and preserves original context", async () => {
    const composed = await composeGovernedChapter({
      book,
      bookDir,
      chapterNumber: 1,
      plan: v2NativePlan,
    });

    const contractEntries = composed.contextPackage.selectedContext.filter(
      (entry) => entry.source === CREATIVE_CONTRACT_CONTEXT_SOURCE,
    );

    // Must produce zero contract entries
    expect(contractEntries).toHaveLength(0);

    // Memo entry still exists as expected
    const memoEntries = composed.contextPackage.selectedContext.filter(
      (entry) => entry.source === "runtime/chapter_memo",
    );
    expect(memoEntries).toHaveLength(1);
    expect(memoEntries[0].protection).toBe("protected");
  });

  it("Lossless Transport: canonical JSON transports into ContextPackage and parses back into equivalent contract", async () => {
    const composed = await composeGovernedChapter({
      book,
      bookDir,
      chapterNumber: 1,
      plan: v3PlanWithContract,
    });

    // Extract and parse using canonical schema
    const extractedContract = extractCreativeContractFromContextPackage(composed.contextPackage);
    expect(extractedContract).toBeDefined();

    // Must be deep equal to original canonical contract without literary summarization
    expect(extractedContract).toEqual(sampleContract);
    expect(extractedContract?.whyThisChapterExists.statement).toBe(sampleContract.whyThisChapterExists.statement);
    expect(extractedContract?.humanCore.anchoredInCharacters).toEqual(["arthur"]);
    expect(extractedContract?.hardConstraints[0].statement).toBe(sampleContract.hardConstraints[0].statement);
    expect(extractedContract?.readerTransition.mustRemainUnknown[0].topic).toBe(sampleContract.readerTransition.mustRemainUnknown[0].topic);
    expect(extractedContract?.freedomZone.mustRemainUnderspecified).toEqual(sampleContract.freedomZone.mustRemainUnderspecified);
  });

  it("Trace and Context Artifact: verifies contract source appears in trace and is persisted to disk", async () => {
    const composed = await composeGovernedChapter({
      book,
      bookDir,
      chapterNumber: 1,
      plan: v3PlanWithContract,
    });

    // 1. In-memory trace verification
    expect(composed.trace.selectedSources).toContain(CREATIVE_CONTRACT_CONTEXT_SOURCE);
    expect(composed.trace.contextTiers.protectedSources).toContain(CREATIVE_CONTRACT_CONTEXT_SOURCE);
    expect(composed.trace.contextTiers.compressibleSources).not.toContain(CREATIVE_CONTRACT_CONTEXT_SOURCE);

    // 2. Persisted artifact verification
    const persistedContextContent = await readFile(composed.contextPath, "utf-8");
    const persistedContextJson = JSON.parse(persistedContextContent);
    const persistedContractEntry = persistedContextJson.selectedContext.find(
      (e: any) => e.source === CREATIVE_CONTRACT_CONTEXT_SOURCE,
    );
    expect(persistedContractEntry).toBeDefined();
    expect(persistedContractEntry.protection).toBe("protected");
    expect(persistedContractEntry.consumption).toBe("transport");

    const persistedTraceContent = await readFile(composed.tracePath, "utf-8");
    const persistedTraceJson = JSON.parse(persistedTraceContent);
    expect(persistedTraceJson.selectedSources).toContain(CREATIVE_CONTRACT_CONTEXT_SOURCE);
    expect(persistedTraceJson.contextTiers.protectedSources).toContain(CREATIVE_CONTRACT_CONTEXT_SOURCE);
  });

  it("Context Budget: oversized protected contract/context fails closed without truncating contract", async () => {
    // Set a tiny context window where protected context (including contract) exceeds budget
    const tinyBudget: ContextBudget = {
      contextWindowTokens: 50, // Far too small for contract + memo + state
      reservedOutputTokens: 10,
    };

    let compressionError: any = null;
    await expect(
      composeGovernedChapter({
        book,
        bookDir,
        chapterNumber: 1,
        plan: v3PlanWithContract,
        contextBudget: tinyBudget,
        onContextCompression: (event) => {
          if (event.phase === "error") {
            compressionError = event;
          }
        },
      }),
    ).rejects.toThrow(/Protected context exceeds available input budget/);

    expect(compressionError).toBeDefined();
    expect(compressionError.sources).toContain(CREATIVE_CONTRACT_CONTEXT_SOURCE);
  });

  it("Compression Protection: contract entry is never passed to compressible context compiler", async () => {
    // Create a scenario where total tokens exceed budget, but protected tokens fit
    let compilerReceivedSources: string[] = [];
    const mockCompiler = vi.fn(async (req: any) => {
      compilerReceivedSources = req.compressibleEntries.map((e: any) => e.source);
      return "Compressed summary of background lore";
    });

    const budget: ContextBudget = {
      contextWindowTokens: 2500,
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
            excerpt: "Long background lore content in the mine... ".repeat(200),
            protection: "compressible",
          },
        ],
        notes: [],
      }),
      compressibleContextCompiler: mockCompiler,
    });

    // Verified that compression actually occurred!
    expect(mockCompiler).toHaveBeenCalledTimes(1);

    // 1. Contract was NEVER sent to the compressible compiler
    expect(compilerReceivedSources).not.toContain(CREATIVE_CONTRACT_CONTEXT_SOURCE);
    expect(compilerReceivedSources).toContain("references/background_lore.md");

    // 2. Composed contextPackage still contains the uncompressed contract entry!
    const contractEntry = composed.contextPackage.selectedContext.find(
      (e) => e.source === CREATIVE_CONTRACT_CONTEXT_SOURCE,
    );
    expect(contractEntry).toBeDefined();
    expect(contractEntry?.protection).toBe("protected");
    expect(contractEntry?.consumption).toBe("transport");
    expect(contractEntry?.excerpt).toBe(JSON.stringify(sampleContract));
  });

  it("Transport Invariant: extractCreativeContractFromContextPackage throws on duplicate contract entries", () => {
    const corruptedPackage: ContextPackage = {
      chapter: 1,
      selectedContext: [
        {
          source: CREATIVE_CONTRACT_CONTEXT_SOURCE,
          reason: "First contract",
          excerpt: JSON.stringify(sampleContract),
          protection: "protected",
          consumption: "transport",
        },
        {
          source: CREATIVE_CONTRACT_CONTEXT_SOURCE,
          reason: "Duplicate contract",
          excerpt: JSON.stringify(sampleContract),
          protection: "protected",
          consumption: "transport",
        },
      ],
    };

    expect(() => extractCreativeContractFromContextPackage(corruptedPackage)).toThrow(
      /ContextPackage invariant violation: expected at most 1 creative contract entry, found 2/,
    );
  });

  it("Transport Consumption Isolation: WriterAgent user prompt does NOT render raw contract or contract schema", async () => {
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
    } as AgentContext);

    const userPrompt = (mockWriter as any).buildGovernedUserPrompt({
      chapterNumber: 1,
      chapterMemo: v3PlanWithContract.memo,
      chapterIntentData: v3PlanWithContract.intent,
      contextPackage: composed.contextPackage,
      lengthSpec: { target: 3000, countingMode: "zh_chars" },
      language: "zh",
    });

    // Contract transport entry MUST be isolated from raw prompt rendering (no raw JSON contract leak)
    expect(userPrompt).not.toContain(CREATIVE_CONTRACT_CONTEXT_SOURCE);
    expect(userPrompt).not.toContain('"schemaVersion"');
    expect(userPrompt).not.toContain('"forbiddenShortcuts"');
    expect(userPrompt).not.toContain('"whyThisChapterExists"');

    // Standard memo and goal MUST still be present
    expect(userPrompt).toContain("Arthur 带领小队进入矿道");
    expect(userPrompt).toContain("调查矿井深处");
  });

  it("Transport Consumption Isolation: Settler control block does NOT leak raw contract or planning intent", async () => {
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
    } as AgentContext);

    const settlerControlBlock = (mockWriter as any).buildSettlerGovernedControlBlock(
      "调查矿井深处",
      composed.contextPackage,
      "zh",
    );

    // Contract transport entry MUST NOT contaminate state settlement
    expect(settlerControlBlock).not.toContain(CREATIVE_CONTRACT_CONTEXT_SOURCE);
    expect(settlerControlBlock).not.toContain("whyThisChapterExists");
    expect(settlerControlBlock).not.toContain("schemaVersion");
    expect(settlerControlBlock).not.toContain("desiredAfter");
    expect(settlerControlBlock).not.toContain("mastermind_motivation");
    expect(settlerControlBlock).not.toContain("forbiddenShortcuts");
  });

  it("ComposerAgent integration: composer.composeChapter transports contract end-to-end", async () => {
    const mockAgentCtx = {
      client: {
        defaults: { maxTokens: 4096 },
        _piModel: { contextWindow: 64000 },
      } as any,
      model: "test-model",
      projectRoot: tempDir,
    } as AgentContext;

    const composer = new ComposerAgent(mockAgentCtx);
    const composed = await composer.composeChapter({
      book,
      bookDir,
      chapterNumber: 1,
      plan: v3PlanWithContract,
    });

    expect(composed.contextPackage.selectedContext.some((e) => e.source === CREATIVE_CONTRACT_CONTEXT_SOURCE)).toBe(true);
    const extracted = extractCreativeContractFromContextPackage(composed.contextPackage);
    expect(extracted).toEqual(sampleContract);
    expect(composed.trace.contextTiers.protectedSources).toContain(CREATIVE_CONTRACT_CONTEXT_SOURCE);
  });
});
