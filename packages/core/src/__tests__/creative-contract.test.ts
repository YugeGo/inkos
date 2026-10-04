import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ChapterCreativeContractSchema,
  type ChapterCreativeContract,
  PersistedPlanSchema,
  PersistedPlanV2Schema,
  PersistedPlanV3Schema,
  savePersistedPlan,
  loadPersistedPlan,
  InferredAuthorIntentHypothesisSchema,
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
        source: "canon",
        sourceRef: "state:current_state.json#console.status",
        severity: "absolute",
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
        reveal: ["泵房阀门有新擦拭过的润滑油痕迹"],
        withhold: ["主管抽屉里的离职信"],
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

  it("validates a fully formed ChapterCreativeContract", () => {
    const parsed = ChapterCreativeContractSchema.parse(validContract);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.humanCore.anchoredInCharacters).toContain("arthur");
    expect(parsed.hardConstraints[0].sourceRef).toBe("state:current_state.json#console.status");
    expect(parsed.characterConstraints[0].beliefsThatMustPersist).toContain("这只是普通的机械过载故障");
    expect(parsed.freedomZone.mustRemainUnderspecified).toHaveLength(1);
    expect(parsed.forbiddenShortcuts[0].reason).toBeTruthy();
  });

  it("rejects humanCore if anchoredInCharacters is empty", () => {
    const invalid = {
      ...validContract,
      humanCore: {
        statement: "关于信任与背叛的虚无探讨",
        anchoredInCharacters: [],
      },
    };
    expect(() => ChapterCreativeContractSchema.parse(invalid)).toThrow();
  });

  it("rejects hardConstraints with invalid severity", () => {
    const invalid = {
      ...validContract,
      hardConstraints: [
        {
          id: "hc_1",
          statement: "测试",
          source: "canon",
          severity: "optional", // Invalid enum
        },
      ],
    };
    expect(() => ChapterCreativeContractSchema.parse(invalid)).toThrow();
  });

  it("rejects forbiddenShortcuts without explanation reason", () => {
    const invalid = {
      ...validContract,
      forbiddenShortcuts: [
        {
          code: "test_code",
          description: "禁止某套路",
          // missing reason
        },
      ],
    };
    expect(() => ChapterCreativeContractSchema.parse(invalid)).toThrow();
  });

  it("rejects duplicate IDs in hardConstraints", () => {
    const invalid = {
      ...validContract,
      hardConstraints: [
        {
          id: "hc_duplicate",
          statement: "第一条约束",
          source: "canon",
          severity: "absolute",
        },
        {
          id: "hc_duplicate", // Duplicate ID
          statement: "第二条约束",
          source: "world",
          severity: "strong",
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
          severity: "absolute",
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

  it("enforces volume bounds: rejects hardConstraints exceeding maximum of 12", () => {
    const tooManyHardConstraints = Array.from({ length: 13 }, (_, i) => ({
      id: `hc_${i}`,
      statement: `约束陈述 ${i}`,
      source: "canon" as const,
      severity: "absolute" as const,
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

  it("validates InferredAuthorIntentHypothesisSchema for reverse engineering", () => {
    const hypothesis = {
      hypothesis: "作者希望通过双重视角误导读者相信嫌疑人已有不在场证明",
      confidence: "strong" as const,
      basis: ["视角切换在关键时间点发生", "未给出走廊时钟特写"],
      evidence: ["第3节：‘钟声响了两次’"],
    };
    const parsed = InferredAuthorIntentHypothesisSchema.parse(hypothesis);
    expect(parsed.confidence).toBe("strong");
    expect(parsed.basis).toHaveLength(2);
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

    // Verify through loadPersistedPlan
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
    expect(loaded!.memo.threadRefs).toEqual(["hook_1"]);
    expect(loaded!.creativeContract).toBeUndefined();
    expect(loaded!.planningProfile).toBeUndefined();
  });

  it("handles PersistedPlan V3: truly round-trips creativeContract and planningProfile with versions", async () => {
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
      planningProfile: {
        authorMindEnabled: true,
        contractSchemaVersion: 1,
        plannerPromptVersion: "author-mind-planner-v1",
        plannerToolVersion: 1,
      },
    };

    const runtimeDir = join(tempDir, "story", "runtime");
    await mkdir(runtimeDir, { recursive: true });

    // Save plan with explicit profile versions
    await savePersistedPlan(tempDir, planWithContract, {
      authorMindEnabled: true,
      plannerPromptVersion: "author-mind-planner-v1",
      plannerToolVersion: 1,
    });

    // Load plan and verify ALL round-trip fields
    const loaded = await loadPersistedPlan(tempDir, 2);
    expect(loaded).not.toBeNull();
    expect(loaded!.creativeContract).toBeDefined();
    expect(loaded!.creativeContract?.schemaVersion).toBe(1);
    expect(loaded!.creativeContract?.humanCore.anchoredInCharacters).toContain("arthur");
    expect(loaded!.creativeContract?.hardConstraints[0].id).toBe("hc_console_inactive");
    expect(loaded!.creativeContract?.hardConstraints[0].sourceRef).toBe("state:current_state.json#console.status");

    // Explicitly assert planningProfile fields
    expect(loaded!.planningProfile).toBeDefined();
    expect(loaded!.planningProfile?.authorMindEnabled).toBe(true);
    expect(loaded!.planningProfile?.contractSchemaVersion).toBe(1);
    expect(loaded!.planningProfile?.plannerPromptVersion).toBe("author-mind-planner-v1");
    expect(loaded!.planningProfile?.plannerToolVersion).toBe(1);
  });

  it("supports downgrade compatibility: saves PersistedPlan V2 when authorMindEnabled is explicitly false and no contract", async () => {
    const nativePlan: PlanChapterOutput = {
      intent: { chapter: 3, goal: "原生 InkOS 计划" },
      memo: {
        chapter: 3,
        goal: "原生 InkOS 计划",
        body: "原生计划正文...",
        threadRefs: [],
      },
      intentMarkdown: "原生 Markdown",
      plannerInputs: ["story/brief.md"],
      runtimePath: join(tempDir, "story", "runtime", "chapter-0003.intent.md"),
    };

    const runtimeDir = join(tempDir, "story", "runtime");
    await mkdir(runtimeDir, { recursive: true });

    // Save with authorMindEnabled: false
    await savePersistedPlan(tempDir, nativePlan, { authorMindEnabled: false });

    // Verify underlying file is strictly version 2
    const rawContent = await loadPersistedPlan(tempDir, 3);
    expect(rawContent).not.toBeNull();
    expect(rawContent!.creativeContract).toBeUndefined();
    expect(rawContent!.planningProfile).toBeUndefined();
  });
});
