import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  PlannerAgent,
  normalizePlannerContract,
  buildPlanningEvidenceBundle,
  type PlannerCreativeContractDraft,
  type PlanningEvidenceBundle,
} from "../index.js";
import { createInitialRuntimeState } from "../state/runtime-state-store.js";
import type { AgentContext } from "../agents/base.js";


describe("Phase 2: Planner Integration & Contract Governance", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "inkos-planner-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

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
    bookRules: [
      {
        ref: "rule:shadow_sensitivity",
        text: "暗影生物对直射强光具有灼伤反应",
        authority: "book_rule",
      },
    ],
    activeHooks: [
      {
        ref: "hook:hk_mysterious_letter",
        text: "匿名信件指示在午夜前往钟楼",
        authority: "runtime_state",
      },
    ],
    outlineIntentions: [
      {
        ref: "outline:ch15_mine_collapse",
        text: "第15章矿井将再次坍塌（未来大纲，非既定事实）",
        authority: "outline",
      },
    ],
    authorInstructions: [
      {
        ref: "instruction:user_current",
        text: "本章重点展现主角的孤立无援",
        authority: "author_instruction",
      },
    ],
    characterIds: ["arthur", "clara"],
  };

  const sampleDraft: PlannerCreativeContractDraft = {
    whyThisChapterExists: {
      statement: "Arthur 必须亲自下潜至井底，打破对官方调查报告的盲目信任。",
    },
    humanCore: {
      statement: "一个习惯遵循安全规程的人，在黑暗中意识到规程正是陷阱。",
      anchoredInCharacters: ["Arthur"], // Mixed case, will be normalized to "arthur"
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
          topic: "幕后黑手的真实动机",
          boundaryRule: "本章内不得出现任何指涉幕后主使真实动机的对话或日志",
        },
      ],
    },
    plannedAuthorIntent: {
      readerEffects: ["让读者随着 Arthur 的视线在黑暗中逐步发现细节疑点"],
      informationStrategy: {
        reveal: [{ description: "通风管道内侧有防潮防腐刻痕" }],
        withhold: [{ description: "当年矿长办公室抽屉里的保险单" }],
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

  it("normalizes a draft into a canonical ChapterCreativeContract with stable IDs and lowercase character names", () => {
    const canonical = normalizePlannerContract(sampleDraft, sampleBundle);

    expect(canonical.schemaVersion).toBe(1);
    expect(canonical.humanCore.anchoredInCharacters).toEqual(["arthur"]);
    expect(canonical.characterConstraints[0].characterId).toBe("arthur");

    // Check generated IDs
    expect(canonical.hardConstraints[0].id).toBe("hc_01");
    expect(canonical.hardConstraints[1].id).toBe("hc_02");
    expect(canonical.readerTransition.mustRemainUnknown[0].id).toBe("ib_01");
    expect(canonical.plannedAuthorIntent.informationStrategy.reveal[0].id).toBe("info_rev_01");
    expect(canonical.plannedAuthorIntent.informationStrategy.withhold[0].id).toBe("info_wth_01");
    expect(canonical.forbiddenShortcuts[0].code).toBe("fs_01");

    // Check priority default
    expect(canonical.hardConstraints[1].priority).toBe("absolute");
  });

  it("builds a bounded PlanningEvidenceBundle from story directory files", async () => {
    const storyDir = join(tempDir, "story");
    const stateDir = join(storyDir, "state");
    const outlineDir = join(storyDir, "outline");
    await mkdir(stateDir, { recursive: true });
    await mkdir(outlineDir, { recursive: true });

    await writeFile(
      join(storyDir, "book_rules.md"),
      "- 核心规则1: 魔法不可无中生有\n- 核心规则2: 铅封破坏需手动认证",
      "utf-8",
    );
    await writeFile(
      join(stateDir, "current_state.json"),
      JSON.stringify({ "console.power": "offline", "door.locked": true }),
      "utf-8",
    );
    await writeFile(
      join(stateDir, "characters.json"),
      JSON.stringify(["Arthur", { id: "clara" }]),
      "utf-8",
    );
    await writeFile(
      join(stateDir, "threads.json"),
      JSON.stringify([{ id: "hk_01", title: "失踪的领班" }]),
      "utf-8",
    );
    await writeFile(
      join(outlineDir, "story_frame.md"),
      "- 第10章大纲设想: 城堡攻坚战（大纲规划，非既定事实）",
      "utf-8",
    );

    const bundle = await buildPlanningEvidenceBundle({
      bookDir: tempDir,
      chapterNumber: 1,
      currentInstruction: "用户当前指令: 展现紧迫感",
    });

    expect(bundle.bookRules).toHaveLength(2);
    expect(bundle.bookRules[0].authority).toBe("book_rule");
    expect(bundle.runtimeState).toHaveLength(2);
    expect(bundle.runtimeState[0].authority).toBe("runtime_state");
    expect(bundle.characterIds).toContain("arthur");
    expect(bundle.characterIds).toContain("clara");
    expect(bundle.activeHooks[0].ref).toBe("hook:hk_01");
    expect(bundle.outlineIntentions[0].authority).toBe("outline");
    expect(bundle.authorInstructions[0].authority).toBe("author_instruction");
  });

  it("executes two-attempt validation/repair state machine in planGovernedContract and fails closed on repeated failure", async () => {
    // Construct mock agent context
    const mockClient = {
      defaults: { maxTokens: 4096 },
    };

    let callCount = 0;
    const mockAgent = new (class extends PlannerAgent {
      protected override async submitStructured(
        _messages: any,
        _tool: any,
        _options: any,
      ): Promise<any> {
        callCount++;
        // Attempt 1: Return a contract with a semantic flaw (reveal ∩ withhold collision)
        if (callCount === 1) {
          return {
            result: {
              goal: "检查泵房",
              body: "分场 Markdown 规划...",
              threadRefs: ["hook_1"],
              contractDraft: {
                ...sampleDraft,
                plannedAuthorIntent: {
                  ...sampleDraft.plannedAuthorIntent,
                  informationStrategy: {
                    reveal: [{ id: "fact_same", description: "关于真相" }],
                    withhold: [{ id: "fact_same", description: "关于真相" }], // Collides!
                  },
                },
              },
            },
            usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
          };
        }

        // Attempt 2: Still broken
        return {
          result: {
            goal: "检查泵房",
            body: "分场 Markdown 规划...",
            threadRefs: ["hook_1"],
            contractDraft: {
              ...sampleDraft,
              plannedAuthorIntent: {
                ...sampleDraft.plannedAuthorIntent,
                informationStrategy: {
                  reveal: [{ id: "fact_same_2", description: "关于真相2" }],
                  withhold: [{ id: "fact_same_2", description: "关于真相2" }],
                },
              },
            },
          },
          usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        };
      }
    })({
      client: mockClient as any,
      model: "test-model",
      projectRoot: tempDir,
    } as AgentContext);

    // Must fail closed with error after exactly 2 attempts
    await expect(
      mockAgent.planGovernedContract({
        chapterNumber: 1,
        contextPackage: { chapter: 1, selectedContext: [] },
        evidenceBundle: sampleBundle,
        lengthSpec: { target: 3000, countingMode: "zh_chars" } as any,
      }),

    ).rejects.toThrow(/Planner contract (structural|semantic|validation).*Fail-Closed/);


    expect(callCount).toBe(2);
  });

  it("successfully repairs contract on attempt 2 and returns validated plan", async () => {
    let callCount = 0;
    const mockAgent = new (class extends PlannerAgent {
      protected override async submitStructured(
        _messages: any,
        _tool: any,
        _options: any,
      ): Promise<any> {
        callCount++;
        if (callCount === 1) {
          // Attempt 1: Has an outline treated as canon
          return {
            result: {
              goal: "调查矿井",
              body: "正文计划",
              threadRefs: [],
              contractDraft: {
                ...sampleDraft,
                hardConstraints: [
                  {
                    statement: "矿井必将再次坍塌",
                    source: "canon",
                    sourceRef: "outline:ch15_mine_collapse", // Outline error!
                  },
                ],
              },
            },
            usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
          };
        }

        // Attempt 2: Repaired!
        return {
          result: {
            goal: "调查矿井",
            body: "正文计划",
            threadRefs: [],
            contractDraft: sampleDraft,
          },
          usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        };
      }
    })({
      client: { defaults: { maxTokens: 4096 } } as any,
      model: "test-model",
      projectRoot: tempDir,
    } as AgentContext);

    const outcome = await mockAgent.planGovernedContract({
      chapterNumber: 1,
      contextPackage: { chapter: 1, selectedContext: [] },
      evidenceBundle: sampleBundle,
      lengthSpec: { target: 3000, countingMode: "zh_chars" } as any,
    });


    expect(callCount).toBe(2);
    expect(outcome.memo.goal).toBe("调查矿井");
    expect(outcome.creativeContract.schemaVersion).toBe(1);
    expect(outcome.creativeContract.hardConstraints[0].id).toBe("hc_01");
  });

  it("planChapter persists contract.md projection alongside intent.md and attaches planningProfile", async () => {
    await createInitialRuntimeState({ bookDir: tempDir, language: "zh" });
    const storyDir = join(tempDir, "story");
    const runtimeDir = join(storyDir, "runtime");
    await mkdir(runtimeDir, { recursive: true });


    const mockAgent = new (class extends PlannerAgent {
      override async planGovernedContract(): Promise<any> {
        return {
          memo: {
            chapter: 1,
            goal: sampleDraft.whyThisChapterExists.statement,
            body: "分场正文规划细节...",
            threadRefs: ["hook_1"],
          },
          creativeContract: normalizePlannerContract(sampleDraft, sampleBundle),
        };
      }
    })({
      client: { defaults: { maxTokens: 4096 } } as any,
      model: "test-planner-model",
      projectRoot: tempDir,
    } as AgentContext);

    const output = await mockAgent.planChapter({
      book: { chapterWordCount: 3000, language: "zh" } as any,
      bookDir: tempDir,
      chapterNumber: 1,
      authorMindEnabled: true,
    });

    expect(output.creativeContract).toBeDefined();
    expect(output.planningProfile).toBeDefined();
    expect(output.planningProfile?.authorMindEnabled).toBe(true);
    expect(output.planningProfile?.plannerModel).toBe("test-planner-model");
    expect(output.planningProfile?.plannerConfigHash).toBeTruthy();

    // Verify contract.md projection file exists and has content
    const contractMd = await readFile(join(runtimeDir, "chapter-0001.contract.md"), "utf-8");
    expect(contractMd).toContain("# Chapter 1 Creative Contract (Projection)");
    expect(contractMd).toContain("Arthur 必须亲自下潜至井底");
    expect(contractMd).toContain("## 3. Hard Constraints");
  });
});
