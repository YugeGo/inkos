import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ChapterCreativeContractSchema,
  HardConstraintSchema,
  type ChapterCreativeContract,
  PersistedPlanSchema,

  savePersistedPlan,
  loadPersistedPlan,
  InferredAuthorIntentHypothesisSchema,
  type PlanningEvidenceBundle,
  validateCreativeContractSemantics,
  estimateContractTokens,
  computeConstraintPressure,
  computePlannerConfigHash,
} from "../index.js";
import type { PlanChapterOutput } from "../agents/planner.js";

describe("ChapterCreativeContract Schema & PersistedPlan V2/V3 Compatibility", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "inkos-contract-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const validContract: ChapterCreativeContract = {
    schemaVersion: 1,
    whyThisChapterExists: {
      statement: "Arthur 对规则体系的绝对信任第一次产生裂缝。",
    },
    chapterFunction: {
      primary: "character deepening",
      secondary: ["setup", "recovery"],
      plotProgress: "low",
    },
    humanCore: {
      statement: "一个依赖规则获得安全感的人，第一次发现程序可能并未告知全部真相。",
      anchoredInCharacters: ["arthur"],
    },
    hardConstraints: [
      {
        id: "hc_console_inactive",
        statement: "主控台必须保持离线无响应状态，禁止自行通电恢复。",
        source: "world",
        sourceRef: "state:current_state.json#console.status",
        priority: "absolute",
      },
    ],

    characterConstraints: [
      {
        characterId: "arthur",
        mustNotKnow: ["破坏者并非外部入侵，而是上一任主管"],
        beliefsThatMustPersist: ["这只是普通的机械过载故障"],
        beliefsAtStart: ["只要遵守手册就能保障生命安全"],
        behavioralLimits: ["在未取得授权前，不会破坏密封铅封"],
      },
    ],
    readerTransition: {
      desiredAfter: {
        knows: ["泵房曾被手动重置过"],
        believes: [
          {
            proposition: "设备故障是由人为干预导致的",
            strength: "moderate",
          },
        ],
        suspects: [
          {
            proposition: "副官隐瞒了部分日志",
            strength: "weak",
          },
        ],
        expects: [
          {
            proposition: "下一次巡检会遇到直接阻力",
            strength: "moderate",
          },
        ],
        questions: [
          {
            question: "是谁拔掉了第三号备用阀门？",
            salience: "high",
          },
        ],
        emotionalPosition: ["压抑中的疑虑"],
      },
      mustRemainUnknown: [
        {
          id: "ib_saboteur_identity",
          topic: "真正破坏者的身份",
          boundaryRule: "本章内任何人不得直接或间接指认嫌疑人姓名",
        },
      ],
    },
    plannedAuthorIntent: {
      readerEffects: ["引导读者从‘接受意外’转向‘怀疑内部’"],
      informationStrategy: {
        reveal: [
          {
            id: "fact_valve_oil",
            description: "泵房阀门有新擦拭过的润滑油痕迹",
          },
        ],
        withhold: [
          {
            id: "fact_resignation_letter",
            description: "主管抽屉里的离职信",
          },
        ],
      },
      attentionStrategy: ["聚焦在机械细节的微小异常上，而非宏观阴谋"],
      emotionalTrajectory: ["平静按部就班 -> 发现细节 -> 沉默与不动声色的动摇"],
    },
    forbiddenShortcuts: [
      {
        code: "explicit_emotion_label",
        description: "禁止直接对 Arthur 贴上‘恐惧’或‘恐慌’标签",
        reason: "必须通过动作迟疑、视线停顿和注意力转移来传达心理压力",
      },
    ],
    freedomZone: {
      mayInvent: ["巡检时的工具名称与型号", "环境中的次要管线走向与滴水声"],
      mayVary: ["Arthur 与门卫交谈的具体句式"],
      mustRemainUnderspecified: ["门外敲门声的真实意图与具体来历"],
      surpriseAllowed: true,
    },
  };

  const sampleEvidenceBundle: PlanningEvidenceBundle = {
    canonFacts: [
      {
        ref: "canon:pump_room_built",
        text: "下层泵房建于七年前",
        authority: "canon",
      },
    ],
    runtimeState: [
      {
        ref: "state:current_state.json#console.status",
        text: "主控台离线无响应",
        authority: "runtime_state",
      },
    ],
    bookRules: [
      {
        ref: "rule:airlock_seal",
        text: "铅封破坏后需双人手动认证复原",
        authority: "book_rule",
      },
    ],
    activeHooks: [
      {
        ref: "hook:hk_subordinate_secret",
        text: "副官口袋里揣着被揉皱的维修单",
        authority: "runtime_state",
      },
    ],
    outlineIntentions: [
      {
        ref: "outline:ch30_arthur_leaves",
        text: "第30章 Arthur 将彻底脱离安全部（未来大纲，非既定事实）",
        authority: "outline",
      },
    ],
    authorInstructions: [
      {
        ref: "instruction:focus_on_details",
        text: "重点描写泵房仪表的机械指针与微小漏油",
        authority: "author_instruction",
      },
    ],
    characterIds: ["arthur", "clara", "deputy"],
  };


  it("validates a fully formed ChapterCreativeContract with InformationTarget and priority", () => {
    const parsed = ChapterCreativeContractSchema.parse(validContract);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.humanCore.anchoredInCharacters).toContain("arthur");
    expect(parsed.hardConstraints[0].priority).toBe("absolute");
    expect(parsed.hardConstraints[0].sourceRef).toBe("state:current_state.json#console.status");
    expect(parsed.characterConstraints[0].beliefsThatMustPersist).toContain("这只是普通的机械过载故障");
    expect(parsed.plannedAuthorIntent.informationStrategy.reveal[0].id).toBe("fact_valve_oil");
    expect(parsed.freedomZone.mustRemainUnderspecified).toHaveLength(1);
    expect(parsed.forbiddenShortcuts[0].reason).toBeTruthy();
  });

  it("rejects duplicate IDs in hardConstraints", () => {
    const invalid = {
      ...validContract,
      hardConstraints: [
        {
          id: "hc_duplicate",
          statement: "第一条约束",
          source: "canon",
          priority: "absolute",
        },
        {
          id: "hc_duplicate", // Duplicate ID
          statement: "第二条约束",
          source: "world",
          priority: "strong",
        },
      ],
    };
    expect(() => ChapterCreativeContractSchema.parse(invalid)).toThrow(/Duplicate hardConstraint id/);
  });

  it("rejects ID collision between hardConstraints and mustRemainUnknown", () => {
    const invalid = {
      ...validContract,
      hardConstraints: [
        {
          id: "shared_id",
          statement: "硬约束",
          source: "canon",
          priority: "absolute",
        },
      ],
      readerTransition: {
        ...validContract.readerTransition,
        mustRemainUnknown: [
          {
            id: "shared_id", // Collides with hardConstraint
            topic: "秘密",
            boundaryRule: "不可言说",
          },
        ],
      },
    };
    expect(() => ChapterCreativeContractSchema.parse(invalid)).toThrow(/collides with an existing hardConstraint id/);
  });

  it("rejects informationTarget ID conflict between reveal and withhold (reveal ∩ withhold = ∅)", () => {
    const invalid = {
      ...validContract,
      plannedAuthorIntent: {
        ...validContract.plannedAuthorIntent,
        informationStrategy: {
          reveal: [
            {
              id: "fact_same_target",
              description: "既要揭示",
            },
          ],
          withhold: [
            {
              id: "fact_same_target", // Conflict!
              description: "又要隐瞒",
            },
          ],
        },
      },
    };
    expect(() => ChapterCreativeContractSchema.parse(invalid)).toThrow(/cannot be in both reveal and withhold strategies/);
  });

  it("rejects informationTarget ID conflict between reveal and mustRemainUnknown (reveal ∩ mustRemainUnknown = ∅)", () => {
    const invalid = {
      ...validContract,
      readerTransition: {
        ...validContract.readerTransition,
        mustRemainUnknown: [
          {
            id: "fact_top_secret",
            topic: "最高机密",
            boundaryRule: "读者不得知晓",
          },
        ],
      },
      plannedAuthorIntent: {
        ...validContract.plannedAuthorIntent,
        informationStrategy: {
          reveal: [
            {
              id: "fact_top_secret", // Conflict with mustRemainUnknown!
              description: "却计划在本章揭示",
            },
          ],
          withhold: [],
        },
      },
    };
    expect(() => ChapterCreativeContractSchema.parse(invalid)).toThrow(/marked for reveal but also listed in mustRemainUnknown/);
  });

  it("enforces volume bounds: rejects hardConstraints exceeding maximum of 12", () => {
    const tooManyHardConstraints = Array.from({ length: 13 }, (_, i) => ({
      id: `hc_${i}`,
      statement: `约束陈述 ${i}`,
      source: "canon" as const,
      priority: "absolute" as const,
    }));
    const invalid = {
      ...validContract,
      hardConstraints: tooManyHardConstraints,
    };
    expect(() => ChapterCreativeContractSchema.parse(invalid)).toThrow();
  });

  it("enforces volume bounds: rejects reader knows exceeding maximum of 15", () => {
    const tooManyKnows = Array.from({ length: 16 }, (_, i) => `已知事实 ${i}`);
    const invalid = {
      ...validContract,
      readerTransition: {
        ...validContract.readerTransition,
        desiredAfter: {
          ...validContract.readerTransition.desiredAfter,
          knows: tooManyKnows,
        },
      },
    };
    expect(() => ChapterCreativeContractSchema.parse(invalid)).toThrow();
  });

  it("calculates contract token budget and constraint pressure", () => {
    const tokens = estimateContractTokens(validContract);
    expect(tokens).toBeGreaterThan(100);
    expect(tokens).toBeLessThan(3000);

    const pressure = computeConstraintPressure(validContract);
    expect(pressure.score).toBeGreaterThanOrEqual(0);
    expect(pressure.score).toBeLessThanOrEqual(100);
    expect(["low", "medium", "high"]).toContain(pressure.level);
    expect(pressure.details).toBeTruthy();
  });

  it("semantic validator catches outline intention mislabeled as canon", () => {
    const contractWithOutlineAsCanon: ChapterCreativeContract = {
      ...validContract,
      hardConstraints: [
        {
          id: "hc_future_spoiler",
          statement: "Arthur 必定离开安全部",
          source: "canon",
          sourceRef: "outline:ch30_arthur_leaves", // This is an outline item, NOT canon!
          priority: "absolute",
        },
      ],
    };

    const result = validateCreativeContractSemantics(contractWithOutlineAsCanon, sampleEvidenceBundle);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "OUTLINE_CANON_CONFUSION")).toBe(true);
  });

  it("semantic validator catches lazy copy between memo.goal, why, and humanCore", () => {
    const lazyContract: ChapterCreativeContract = {
      ...validContract,
      whyThisChapterExists: { statement: "相同的文本" },
      humanCore: {
        statement: "相同的文本", // Lazy copy of why
        anchoredInCharacters: ["arthur"],
      },
    };

    const result = validateCreativeContractSemantics(lazyContract, sampleEvidenceBundle, {
      memoGoal: "相同的文本", // Lazy copy of memo
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "LAZY_COPY_MEMO_GOAL")).toBe(true);
    expect(result.errors.some((e) => e.code === "LAZY_COPY_HUMAN_CORE")).toBe(true);
  });

  it("semantic validator produces warning when freedomZone is empty", () => {
    const restrictedContract: ChapterCreativeContract = {
      ...validContract,
      freedomZone: {
        mayInvent: [],
        mayVary: [],
        mustRemainUnderspecified: [],
        surpriseAllowed: false,
      },
    };

    const result = validateCreativeContractSemantics(restrictedContract, sampleEvidenceBundle);
    expect(result.warnings.some((w) => w.code === "EMPTY_FREEDOM_ZONE")).toBe(true);
  });

  it("handles backward compatibility: reads legacy PersistedPlan V2 and normalizes creativeContract to undefined", async () => {
    const v2Plan = {
      version: 2,
      intent: {
        chapter: 1,
        goal: "Arthur 检查泵房",
      },
      memo: {
        chapter: 1,
        goal: "Arthur 检查泵房",
        body: "Arthur 走向下层泵房并记录仪表数据。",
        threadRefs: ["hook_1"],
      },
      plannerInputs: ["story/outline/story_frame.md"],
    };

    const parsed = PersistedPlanSchema.parse(v2Plan);
    expect(parsed.version).toBe(2);
    expect((parsed as any).creativeContract).toBeUndefined();

    const runtimeDir = join(tempDir, "story", "runtime");
    await mkdir(runtimeDir, { recursive: true });
    await writeFile(
      join(runtimeDir, "chapter-0001.plan.json"),
      JSON.stringify(v2Plan, null, 2),
      "utf-8",
    );
    await writeFile(
      join(runtimeDir, "chapter-0001.intent.md"),
      v2Plan.memo.body,
      "utf-8",
    );

    const loaded = await loadPersistedPlan(tempDir, 1);
    expect(loaded).not.toBeNull();
    expect(loaded!.intent.chapter).toBe(1);
    expect(loaded!.creativeContract).toBeUndefined();
    expect(loaded!.planningProfile).toBeUndefined();
  });

  it("handles PersistedPlan V3: round-trips creativeContract and planningProfile with provider/model/hash", async () => {
    const planWithContract: PlanChapterOutput = {
      intent: { chapter: 2, goal: validContract.whyThisChapterExists.statement },
      memo: {
        chapter: 2,
        goal: validContract.whyThisChapterExists.statement,
        body: "分场规划细节...",
        threadRefs: ["hook_console"],
      },
      intentMarkdown: "投影 Markdown",
      plannerInputs: ["story/book_rules.md"],
      runtimePath: join(tempDir, "story", "runtime", "chapter-0002.intent.md"),
      creativeContract: validContract,
    };

    const runtimeDir = join(tempDir, "story", "runtime");
    await mkdir(runtimeDir, { recursive: true });

    await savePersistedPlan(tempDir, planWithContract, {
      authorMindEnabled: true,
      plannerPromptVersion: "author-mind-planner-v1",
      plannerToolVersion: 1,
      plannerProvider: "anthropic",
      plannerModel: "claude-3-7-sonnet",
    });

    const loaded = await loadPersistedPlan(tempDir, 2);
    expect(loaded).not.toBeNull();
    expect(loaded!.creativeContract).toBeDefined();
    expect(loaded!.creativeContract?.schemaVersion).toBe(1);
    expect(loaded!.creativeContract?.hardConstraints[0].priority).toBe("absolute");
    expect(loaded!.creativeContract?.plannedAuthorIntent.informationStrategy.reveal[0].id).toBe("fact_valve_oil");

    expect(loaded!.planningProfile).toBeDefined();
    expect(loaded!.planningProfile?.authorMindEnabled).toBe(true);
    expect(loaded!.planningProfile?.plannerProvider).toBe("anthropic");
    expect(loaded!.planningProfile?.plannerModel).toBe("claude-3-7-sonnet");
    expect(loaded!.planningProfile?.plannerConfigHash).toBeTruthy();
  });

  it("migrates legacy severity: 'strong' into priority: 'strong' and strictly eliminates severity from canonical contract", () => {
    const legacyHardConstraint = {
      id: "hc_legacy",
      statement: "旧版约束定义",
      source: "canon",
      severity: "strong", // Legacy field
    };

    const parsed = HardConstraintSchema.parse(legacyHardConstraint);
    expect(parsed.priority).toBe("strong");
    expect("severity" in (parsed as any)).toBe(false);

    const contractWithLegacy = {
      ...validContract,
      hardConstraints: [legacyHardConstraint as any],
    };
    const parsedContract = ChapterCreativeContractSchema.parse(contractWithLegacy);
    expect(parsedContract.hardConstraints[0].priority).toBe("strong");
    expect("severity" in (parsedContract.hardConstraints[0] as any)).toBe(false);
  });

  it("validates authorInstructions evidence and rejects invalid authority references", () => {
    const validAuthorConstraint: ChapterCreativeContract = {
      ...validContract,
      hardConstraints: [
        {
          id: "hc_author_rule",
          statement: "重点描写泵房细节",
          source: "author",
          sourceRef: "instruction:focus_on_details",
          priority: "strong",
        },
      ],
    };

    const validResult = validateCreativeContractSemantics(validAuthorConstraint, sampleEvidenceBundle);
    expect(validResult.ok).toBe(true);

    const invalidAuthorConstraint: ChapterCreativeContract = {
      ...validContract,
      hardConstraints: [
        {
          id: "hc_author_rule_invalid",
          statement: "尝试用已发生既定事实作为作者即时指令",
          source: "author",
          sourceRef: "canon:pump_room_built", // Canon is NOT author_instruction!
          priority: "strong",
        },
      ],
    };

    const invalidResult = validateCreativeContractSemantics(invalidAuthorConstraint, sampleEvidenceBundle);
    expect(invalidResult.ok).toBe(false);
    expect(invalidResult.errors.some((e) => e.code === "INVALID_AUTHOR_INSTRUCTION_AUTHORITY")).toBe(true);
  });

  it("non-destructively preserves existing V3 contract and maintains immutable generation provenance even under runtime authorMindEnabled: false", async () => {
    const planWithContract: PlanChapterOutput = {
      intent: { chapter: 3, goal: "已有 V3 计划" },
      memo: {
        chapter: 3,
        goal: "已有 V3 计划",
        body: "正文...",
        threadRefs: [],
      },
      intentMarkdown: "投影",
      plannerInputs: [],
      runtimePath: join(tempDir, "story", "runtime", "chapter-0003.intent.md"),
      creativeContract: validContract,
      planningProfile: {
        authorMindEnabled: true,
        plannerProvider: "anthropic",
        plannerModel: "claude-3-7-sonnet",
        plannerConfigHash: "immutable_hash_1",
      },
    };

    const runtimeDir = join(tempDir, "story", "runtime");
    await mkdir(runtimeDir, { recursive: true });

    // Normal save with authorMindEnabled: false (runtime consumption disabled)
    await savePersistedPlan(tempDir, planWithContract, { authorMindEnabled: false });

    // Should NOT destroy the contract; stays V3
    const savedNormally = await loadPersistedPlan(tempDir, 3);
    expect(savedNormally!.creativeContract).toBeDefined();
    // Generation provenance remains immutable (true, not mutated to false)
    expect(savedNormally!.planningProfile?.authorMindEnabled).toBe(true);
    expect(savedNormally!.planningProfile?.plannerProvider).toBe("anthropic");
    expect(savedNormally!.planningProfile?.plannerConfigHash).toBe("immutable_hash_1");

    // Explicit downgrade destroys the contract and reverts to V2
    await savePersistedPlan(tempDir, planWithContract, { downgradePlan: true });
    const downgraded = await loadPersistedPlan(tempDir, 3);
    expect(downgraded!.creativeContract).toBeUndefined();
    expect(downgraded!.planningProfile).toBeUndefined();
  });
});

