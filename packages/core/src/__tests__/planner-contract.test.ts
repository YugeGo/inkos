import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  PlannerAgent,
  PipelineRunner,
  normalizePlannerContract,
  buildPlanningEvidenceBundle,
  validateCreativeContractSemantics,
  isPersistedPlanReusable,
  computePlannerConfigHash,
  computePlannerProtocolHash,
  computePlanningInputHash,
  computeRelevantSourcesChecksum,
  computeSkillsFingerprint,
  preparePlanningFingerprint,
  resolveAuthorMindEnabled,
  savePersistedPlan,
  loadPersistedPlan,
  type PlannerCreativeContractDraft,
  type PlanningEvidenceBundle,
  type PlanChapterOutput,
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

  it("normalizes a draft into a canonical ChapterCreativeContract with stable IDs and lowercase character names", () => {
    const canonical = normalizePlannerContract(sampleDraft, sampleBundle);

    expect(canonical.schemaVersion).toBe(1);
    expect(canonical.humanCore.anchoredInCharacters).toEqual(["arthur"]);
    expect(canonical.characterConstraints[0].characterId).toBe("arthur");

    // Check generated IDs
    expect(canonical.hardConstraints[0].id).toBe("hc_01");
    expect(canonical.hardConstraints[1].id).toBe("hc_02");
    expect(canonical.readerTransition.mustRemainUnknown[0].id).toBe("info_mastermind_motivation");
    expect(canonical.plannedAuthorIntent.informationStrategy.reveal[0].id).toBe("info_pipe_markings");
    expect(canonical.plannedAuthorIntent.informationStrategy.withhold[0].id).toBe("info_insurance_policy");
    expect(canonical.forbiddenShortcuts[0].code).toBe("fs_01");

    // Check priority default
    expect(canonical.hardConstraints[1].priority).toBe("absolute");
  });

  it("builds a bounded PlanningEvidenceBundle from authentic story directory files with active vs expired fact filtering", async () => {
    await createInitialRuntimeState({ bookDir: tempDir, language: "zh" });
    const storyDir = join(tempDir, "story");
    const stateDir = join(storyDir, "state");
    const outlineDir = join(storyDir, "outline");
    const majorRolesDir = join(storyDir, "roles", "主要角色");
    const minorRolesDir = join(storyDir, "roles", "次要角色");
    await mkdir(outlineDir, { recursive: true });
    await mkdir(majorRolesDir, { recursive: true });
    await mkdir(minorRolesDir, { recursive: true });

    // 100% schema-compliant BookRules (version: "2")
    await writeFile(
      join(storyDir, "book_rules.json"),
      JSON.stringify({
        version: "2",
        protagonist: {
          name: "Arthur",
          personalityLock: ["冷静谨慎"],
          behavioralConstraints: ["魔法不可无中生有"],
        },
        genreLock: { primary: "奇幻", forbidden: [] },
        prohibitions: ["铅封破坏需手动认证"],
        enableFullCastTracking: true,
        allowedDeviations: [],
      }),
      "utf-8",
    );

    // Update manifest to chapter 1 so state consistency check passes
    await writeFile(
      join(stateDir, "manifest.json"),
      JSON.stringify({
        schemaVersion: 2,
        language: "zh",
        lastAppliedChapter: 1,
        projectionVersion: 1,
      }),
      "utf-8",
    );

    // 100% schema-compliant CurrentStateState with active & expired facts
    await writeFile(
      join(stateDir, "current_state.json"),
      JSON.stringify({
        chapter: 1,
        facts: [
          {
            subject: "Arthur",
            predicate: "location",
            object: "Old Mine",
            validFromChapter: 1,
            validUntilChapter: null,
            sourceChapter: 1,
          },
          {
            subject: "console",
            predicate: "power",
            object: "offline",
            validFromChapter: 1,
            validUntilChapter: null,
            sourceChapter: 1,
          },
          {
            subject: "flashlight",
            predicate: "battery",
            object: "dead",
            validFromChapter: 0,
            validUntilChapter: 0, // Expired before chapter 1!
            sourceChapter: 0,
          },
        ],
      }),
      "utf-8",
    );

    // 100% schema-compliant HooksState
    await writeFile(
      join(stateDir, "hooks.json"),
      JSON.stringify({
        hooks: [
          {
            hookId: "hk_01",
            startChapter: 1,
            type: "plot",
            status: "open",
            lastAdvancedChapter: 1,
            expectedPayoff: "查明失踪原因",
            notes: "在旧矿井失踪的领班线索",
          },
        ],
      }),
      "utf-8",
    );

    await writeFile(join(majorRolesDir, "Arthur.md"), "# Arthur\n主要角色", "utf-8");
    await writeFile(join(minorRolesDir, "clara.md"), "# Clara\n次要角色", "utf-8");
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

    expect(bundle.bookRules).toHaveLength(3);
    expect(bundle.bookRules[0].authority).toBe("book_rule");
    // Only the 2 currently valid facts are placed into runtime_state
    expect(bundle.runtimeState).toHaveLength(2);
    expect(bundle.runtimeState[0].authority).toBe("runtime_state");
    // The expired fact is captured under canon facts with historical scope and chapter disambiguation
    const expiredFact = bundle.canonFacts.find((f) => f.ref.includes("flashlight.battery"));
    expect(expiredFact).toBeDefined();
    expect(expiredFact?.temporalScope).toBe("historical");
    expect(expiredFact?.ref).toBe("canon:expired#flashlight.battery@ch0");
    expect(bundle.characterIds).toContain("arthur");
    expect(bundle.characterIds).toContain("clara");
    expect(bundle.activeHooks[0].ref).toBe("hook:hk_01");
    expect(bundle.outlineIntentions[0].authority).toBe("outline");
    expect(bundle.authorInstructions[0].authority).toBe("author_instruction");
  });

  it("fails closed when authoritative runtime state is corrupted or invalid", async () => {
    await createInitialRuntimeState({ bookDir: tempDir, language: "zh" });
    const stateDir = join(tempDir, "story", "state");

    // Write corrupted JSON into current_state.json
    await writeFile(
      join(stateDir, "current_state.json"),
      JSON.stringify({ chapter: "not-a-number", facts: "invalid" }),
      "utf-8",
    );

    await expect(
      buildPlanningEvidenceBundle({
        bookDir: tempDir,
        chapterNumber: 1,
      }),
    ).rejects.toThrow(/Authoritative runtime state is invalid or corrupted \(Fail-Closed\)/);
  });

  it("fails closed when manifest.json exists but required state file (hooks.json) is missing", async () => {
    await createInitialRuntimeState({ bookDir: tempDir, language: "zh" });
    const stateDir = join(tempDir, "story", "state");
    // Delete hooks.json while manifest.json still exists
    await rm(join(stateDir, "hooks.json"), { force: true });

    await expect(
      buildPlanningEvidenceBundle({
        bookDir: tempDir,
        chapterNumber: 1,
      }),
    ).rejects.toThrow(/Authoritative runtime state is corrupted: incomplete state files/);
  });

  it("fails closed when state files are partially present even if manifest.json is also missing", async () => {
    await createInitialRuntimeState({ bookDir: tempDir, language: "zh" });
    const stateDir = join(tempDir, "story", "state");
    // Delete BOTH manifest.json AND hooks.json, leaving 2/4 files
    await rm(join(stateDir, "manifest.json"), { force: true });
    await rm(join(stateDir, "hooks.json"), { force: true });

    await expect(
      buildPlanningEvidenceBundle({
        bookDir: tempDir,
        chapterNumber: 1,
      }),
    ).rejects.toThrow(/Authoritative runtime state is corrupted: incomplete state files \(present: 2\/4, missing: manifest\.json, hooks\.json\)/);
  });

  it("fails closed when book_rules.json exists but is schema-invalid", async () => {
    await createInitialRuntimeState({ bookDir: tempDir, language: "zh" });
    const storyDir = join(tempDir, "story");

    // book_rules.json exists but missing version "2" and required fields
    await writeFile(
      join(storyDir, "book_rules.json"),
      JSON.stringify({ invalidRuleKey: 123 }),
      "utf-8",
    );

    await expect(
      buildPlanningEvidenceBundle({
        bookDir: tempDir,
        chapterNumber: 1,
      }),
    ).rejects.toThrow(/Authoritative book_rules.json is invalid or corrupted \(Fail-Closed\)/);
  });

  it("preserves book_rules.json single authority: does not fall back to book_rules.md when rules.json has empty prohibitions", async () => {
    await createInitialRuntimeState({ bookDir: tempDir, language: "zh" });
    const storyDir = join(tempDir, "story");

    // book_rules.json exists with valid version 2, but empty prohibitions and no protagonist
    await writeFile(
      join(storyDir, "book_rules.json"),
      JSON.stringify({
        version: "2",
        genreLock: { primary: "科幻", forbidden: [] },
        prohibitions: [],
        enableFullCastTracking: true,
        allowedDeviations: [],
      }),
      "utf-8",
    );

    // Legacy book_rules.md also exists with rules
    await writeFile(
      join(storyDir, "book_rules.md"),
      "- 严禁超光速通讯\n- 严禁违背因果律",
      "utf-8",
    );

    const bundle = await buildPlanningEvidenceBundle({
      bookDir: tempDir,
      chapterNumber: 1,
    });

    // Must NOT contain rules from book_rules.md because book_rules.json exists!
    expect(bundle.bookRules).toHaveLength(0);
    expect(bundle.bookRules.some((r) => r.text.includes("超光速"))).toBe(false);
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

  it("normalizes semanticKey into machine IDs and validates reveal vs withhold/mustRemainUnknown collisions", () => {
    // 1. Reveal vs Withhold semanticKey collision
    const collisionDraft: PlannerCreativeContractDraft = {
      ...sampleDraft,
      plannedAuthorIntent: {
        ...sampleDraft.plannedAuthorIntent,
        informationStrategy: {
          reveal: [{ semanticKey: "father_project_role", description: "父亲参与了旧矿井工程" }],
          withhold: [{ semanticKey: "father_project_role", description: "父亲在工程中的具体职责" }],
        },
      },
    };

    // 1. Reveal vs Withhold semanticKey collision: ChapterCreativeContractSchema fails closed
    expect(() => normalizePlannerContract(collisionDraft, sampleBundle)).toThrow(
      /cannot be in both reveal and withhold strategies/,
    );

    // 2. Reveal vs Boundary (mustRemainUnknown) semanticKey collision
    const boundaryCollisionDraft: PlannerCreativeContractDraft = {
      ...sampleDraft,
      readerTransition: {
        ...sampleDraft.readerTransition,
        mustRemainUnknown: [
          {
            semanticKey: "mastermind_identity",
            topic: "幕后黑手真实身份",
            boundaryRule: "本章不得透露幕后黑手身份",
          },
        ],
      },
      plannedAuthorIntent: {
        ...sampleDraft.plannedAuthorIntent,
        informationStrategy: {
          reveal: [{ semanticKey: "mastermind_identity", description: "公布幕后黑手就是上一任领班" }],
          withhold: [],
        },
      },
    };

    // 2. Reveal vs Boundary (mustRemainUnknown) semanticKey collision: ChapterCreativeContractSchema fails closed
    expect(() => normalizePlannerContract(boundaryCollisionDraft, sampleBundle)).toThrow(
      /is marked for reveal but also listed in mustRemainUnknown/,
    );
  });

  it("isPersistedPlanReusable rejects mismatched configHash, inputHash, or missing contract", () => {
    const canonicalContract = normalizePlannerContract(sampleDraft, sampleBundle);
    const validPlan = {
      intent: { chapter: 1, goal: "调查矿井" },
      memo: { chapter: 1, goal: "调查矿井", body: "正文规划", threadRefs: [] },
      intentMarkdown: "# Intent",
      plannerInputs: [],
      runtimePath: "/path/to/intent.md",
      creativeContract: canonicalContract,
      planningProfile: {
        authorMindEnabled: true,
        plannerConfigHash: "config_abc123",
        planningInputHash: "input_xyz789",
      },
    };

    // 1. Valid exact match
    const check1 = isPersistedPlanReusable(validPlan, {
      expectedAuthorMindEnabled: true,
      expectedConfigHash: "config_abc123",
      expectedInputHash: "input_xyz789",
    });
    expect(check1.reusable).toBe(true);

    // 2. Config hash mismatch
    const check2 = isPersistedPlanReusable(validPlan, {
      expectedAuthorMindEnabled: true,
      expectedConfigHash: "config_different",
      expectedInputHash: "input_xyz789",
    });
    expect(check2.reusable).toBe(false);
    expect(check2.reason).toContain("Planner configuration hash mismatch");

    // 3. Input hash mismatch (evidence bundle changed)
    const check3 = isPersistedPlanReusable(validPlan, {
      expectedAuthorMindEnabled: true,
      expectedConfigHash: "config_abc123",
      expectedInputHash: "input_changed",
    });
    expect(check3.reusable).toBe(false);
    expect(check3.reason).toContain("Planning input hash mismatch");

    // 4. Missing creativeContract when authorMind is required
    const planWithoutContract = {
      ...validPlan,
      creativeContract: undefined,
    };
    const check4 = isPersistedPlanReusable(planWithoutContract, {
      expectedAuthorMindEnabled: true,
    });
    expect(check4.reusable).toBe(false);
    expect(check4.reason).toContain("lacks a Creative Contract");

    // 5. Legacy plan reuse when authorMind is disabled
    const legacyPlan = {
      ...validPlan,
      creativeContract: undefined,
      planningProfile: undefined,
    };
    const check5 = isPersistedPlanReusable(legacyPlan, {
      expectedAuthorMindEnabled: false,
    });
    expect(check5.reusable).toBe(true);
  });

  it("defaults authorMindEnabled to false and executes plain chapter memo planning", async () => {
    let memoPlanCalled = false;
    let contractPlanCalled = false;

    const mockAgent = new (class extends PlannerAgent {
      override async planChapterMemo(): Promise<any> {
        memoPlanCalled = true;
        return {
          chapter: 1,
          goal: "默认旧版规划目标",
          body: "旧版正文大纲...",
          threadRefs: [],
        };
      }

      override async planGovernedContract(): Promise<any> {
        contractPlanCalled = true;
        throw new Error("Should not be called when authorMind is disabled");
      }
    })({
      client: { defaults: { maxTokens: 4096 } } as any,
      model: "test-model",
      projectRoot: tempDir,
    } as AgentContext);

    await createInitialRuntimeState({ bookDir: tempDir, language: "zh" });

    const output = await mockAgent.planChapter({
      book: { chapterWordCount: 3000, language: "zh" } as any, // No authorMind flag set
      bookDir: tempDir,
      chapterNumber: 1,
    });

    expect(memoPlanCalled).toBe(true);
    expect(contractPlanCalled).toBe(false);
    expect(output.creativeContract).toBeUndefined();
    expect(output.planningProfile).toBeUndefined();
    expect(output.memo.goal).toBe("默认旧版规划目标");
  });

  it("repair loop embeds previous submission into messages for the second attempt", async () => {
    let capturedMessagesOnAttempt2: any[] = [];
    let callCount = 0;

    const mockAgent = new (class extends PlannerAgent {
      protected override async submitStructured(
        messages: any,
        _tool: any,
        _options: any,
      ): Promise<any> {
        callCount++;
        if (callCount === 1) {
          // Attempt 1 fails semantic validation (reveal ∩ withhold collision)
          return {
            result: {
              goal: "调查矿井",
              body: "初次大纲",
              threadRefs: [],
              contractDraft: {
                ...sampleDraft,
                plannedAuthorIntent: {
                  ...sampleDraft.plannedAuthorIntent,
                  informationStrategy: {
                    reveal: [{ semanticKey: "clash", description: "同一事实" }],
                    withhold: [{ semanticKey: "clash", description: "同一事实" }],
                  },
                },
              },
            },
            usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
          };
        }

        // Attempt 2: capture messages history
        capturedMessagesOnAttempt2 = [...messages];
        return {
          result: {
            goal: "调查矿井",
            body: "修正后大纲",
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

    await mockAgent.planGovernedContract({
      chapterNumber: 1,
      contextPackage: { chapter: 1, selectedContext: [] },
      evidenceBundle: sampleBundle,
      lengthSpec: { target: 3000, countingMode: "zh_chars" } as any,
    });

    expect(callCount).toBe(2);
    // Messages must contain: system, user, assistant (previous submission), user (repair diagnostics)
    expect(capturedMessagesOnAttempt2.length).toBeGreaterThanOrEqual(4);
    const assistantMsg = capturedMessagesOnAttempt2.find((m) => m.role === "assistant");
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.content).toContain("初次大纲");

    const repairUserMsg = capturedMessagesOnAttempt2[capturedMessagesOnAttempt2.length - 1];
    expect(repairUserMsg.role).toBe("user");
    expect(repairUserMsg.content).toContain("未通过宿主的一致性校验");
    expect(repairUserMsg.content).toContain("info_clash");
    expect(repairUserMsg.content).toContain("reveal and withhold");
    expect(repairUserMsg.content).not.toContain("初次大纲");
  });

  it("normalizer provides deterministic SHA-256 fallback for non-ASCII semanticKeys", () => {
    const draftWithNonAscii = {
      ...sampleDraft,
      hardConstraints: [
        {
          semanticKey: "幕后黑手身份",
          statement: "主角不得知晓幕后黑手的真实身份",
          source: "canon" as const,
        },
      ],
    };
    const contract1 = normalizePlannerContract(draftWithNonAscii);
    const contract2 = normalizePlannerContract(draftWithNonAscii);

    expect(contract1.hardConstraints[0].id).toBe(contract2.hardConstraints[0].id);
    expect(contract1.hardConstraints[0].id).toMatch(/^hc_[a-f0-9]{12}$/);

    const draftWithDifferentNonAscii = {
      ...sampleDraft,
      hardConstraints: [
        {
          semanticKey: "矿井入口机关",
          statement: "矿井入口机关必须保持封死",
          source: "canon" as const,
        },
      ],
    };
    const contract3 = normalizePlannerContract(draftWithDifferentNonAscii);
    expect(contract3.hardConstraints[0].id).not.toBe(contract1.hardConstraints[0].id);
  });

  it("isPersistedPlanReusable fails closed when expected hashes are specified but missing from profile", () => {
    const basePlan: any = {
      memo: { chapter: 1, goal: "test", body: "test", threadRefs: [] },
      intent: { chapter: 1 },
      creativeContract: { schemaVersion: 3 },
      planningProfile: {
        authorMindEnabled: true,
      },
    };

    const resConfig = isPersistedPlanReusable(basePlan, {
      expectedAuthorMindEnabled: true,
      expectedConfigHash: "abc1234567890def",
    });
    expect(resConfig.reusable).toBe(false);
    expect(resConfig.reason).toContain("missing from persisted plan");

    const resInput = isPersistedPlanReusable(basePlan, {
      expectedAuthorMindEnabled: true,
      expectedInputHash: "1234567890abcdef",
    });
    expect(resInput.reusable).toBe(false);
    expect(resInput.reason).toContain("missing from persisted plan");

    const planWithHashes: any = {
      ...basePlan,
      planningProfile: {
        authorMindEnabled: true,
        plannerConfigHash: "abc1234567890def",
        planningInputHash: "1234567890abcdef",
      },
    };
    const resMatch = isPersistedPlanReusable(planWithHashes, {
      expectedAuthorMindEnabled: true,
      expectedConfigHash: "abc1234567890def",
      expectedInputHash: "1234567890abcdef",
    });
    expect(resMatch.reusable).toBe(true);

    const resMismatch = isPersistedPlanReusable(planWithHashes, {
      expectedAuthorMindEnabled: true,
      expectedConfigHash: "wrong_config_hash",
      expectedInputHash: "1234567890abcdef",
    });
    expect(resMismatch.reusable).toBe(false);
    expect(resMismatch.reason).toContain("mismatch");
  });

  it("computePlanningInputHash produces identical hash regardless of characterId order or evidence array ordering", () => {
    const bundleA: PlanningEvidenceBundle = {
      bookRules: [],
      canonFacts: [
        { ref: "canon:fact1", text: "事实1", authority: "canon" },
        { ref: "canon:fact2", text: "事实2", authority: "canon" },
      ],
      runtimeState: [],
      activeHooks: [],
      outlineIntentions: [],
      authorInstructions: [],
      characterIds: ["arthur", "beaver", "clara"],
    };

    const bundleB: PlanningEvidenceBundle = {
      bookRules: [],
      canonFacts: [
        { ref: "canon:fact2", text: "事实2", authority: "canon" },
        { ref: "canon:fact1", text: "事实1", authority: "canon" },
      ],
      runtimeState: [],
      activeHooks: [],
      outlineIntentions: [],
      authorInstructions: [],
      characterIds: ["clara", "arthur", "beaver"],
    };

    const hashA = computePlanningInputHash(bundleA);
    const hashB = computePlanningInputHash(bundleB);
    expect(hashA).toBe(hashB);

    const dataA = {
      chapterNumber: 2,
      evidenceBundle: bundleA,
      selectedSources: ["source_b.md", "source_a.md"],
    };
    const dataB = {
      chapterNumber: 2,
      evidenceBundle: bundleB,
      selectedSources: ["source_a.md", "source_b.md"],
    };
    expect(computePlanningInputHash(dataA)).toBe(computePlanningInputHash(dataB));
  });

  it("resolveAuthorMindEnabled respects features.authorMind and explicit override", () => {
    expect(resolveAuthorMindEnabled(undefined)).toBe(false);
    expect(resolveAuthorMindEnabled(null)).toBe(false);
    expect(resolveAuthorMindEnabled({})).toBe(false);

    expect(resolveAuthorMindEnabled({ features: { authorMind: true } })).toBe(true);
    expect(resolveAuthorMindEnabled({ features: { authorMind: false } })).toBe(false);

    expect(resolveAuthorMindEnabled({ features: { authorMind: false } }, true)).toBe(true);
    expect(resolveAuthorMindEnabled({ features: { authorMind: true } }, false)).toBe(false);
  });

  it("end-to-end: Planner generation and Runner recomputation achieve 100% cache hit, and invalidate on input change", async () => {
    // Setup book environment with runtime state and story files
    await createInitialRuntimeState({ bookDir: tempDir, language: "zh" });
    const storyDir = join(tempDir, "story");
    const runtimeDir = join(storyDir, "runtime");
    await mkdir(runtimeDir, { recursive: true });
    await writeFile(join(storyDir, "current_focus.md"), "初次焦点：勘探外围矿道", "utf-8");
    await writeFile(join(storyDir, "author_intent.md"), "意图：保持步步为营的张力", "utf-8");
    await writeFile(join(storyDir, "brief.md"), "故事简述：关于矿山深处的探索", "utf-8");
    await writeFile(
      join(storyDir, "book_rules.json"),
      JSON.stringify({
        version: "2",
        genreLock: { primary: "悬疑", forbidden: [] },
        prohibitions: ["不得引入魔法"],
        enableFullCastTracking: true,
        allowedDeviations: [],
      }),
      "utf-8",
    );
    const rolesDir = join(storyDir, "roles", "主要角色");
    await mkdir(rolesDir, { recursive: true });
    await writeFile(join(rolesDir, "Arthur.md"), "# Arthur\n主要角色", "utf-8");

    const book = {
      id: "test-book",
      title: "矿山探索",
      platform: "default",
      genre: "suspense",
      status: "active" as const,
      targetChapters: 10,
      chapterWordCount: 3000,
      language: "zh" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      features: { authorMind: true },
    };

    let planStructuredCalls = 0;
    vi.spyOn(PlannerAgent.prototype as any, "submitStructured").mockImplementation(async () => {
      planStructuredCalls++;
      return {
        result: {
          goal: "勘探外围矿道",
          body: "规划正文：详细调查第1号矿井",
          threadRefs: [],
          contractDraft: {
            ...sampleDraft,
            hardConstraints: [
              {
                semanticKey: "rule_no_magic",
                statement: "不得引入魔法",
                source: "world" as const,
                sourceRef: "rule:prohibition#01",
                priority: "absolute" as const,
              },
            ],
          },
        },
        usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
      };
    });

    const planner = new PlannerAgent({
      client: { defaults: { maxTokens: 4096 }, provider: "test-provider" } as any,
      model: "test-model",
      projectRoot: tempDir,
    } as AgentContext);

    // 1. Planner generates plan with Author-Mind enabled
    const generatedPlan = await planner.planChapter({
      book,
      bookDir: tempDir,
      chapterNumber: 1,
      authorMindEnabled: true,
    });
    expect(planStructuredCalls).toBe(1);
    expect(generatedPlan.planningProfile?.authorMindEnabled).toBe(true);

    // Save to disk (persisted plan)
    await savePersistedPlan(tempDir, generatedPlan, { authorMindEnabled: true });

    // 2. Runner re-evaluates plan with identical inputs
    const runner = new PipelineRunner({
      projectRoot: tempDir,
      client: { defaults: { maxTokens: 4096 }, provider: "test-provider" } as any,
      model: "test-model",
    });

    // Runner calls resolveGovernedPlan with reuseExistingIntentWhenContextMissing: true
    const reusedPlan = await (runner as any).resolveGovernedPlan(
      book,
      tempDir,
      1,
      undefined,
      { reuseExistingIntentWhenContextMissing: true },
    );

    // Reused plan should be the exact persisted plan, with NO extra LLM call
    expect(planStructuredCalls).toBe(1); // Still 1! Cache HIT!
    expect(reusedPlan.memo.goal).toBe("勘探外围矿道");
    expect(reusedPlan.planningProfile?.planningInputHash).toBe(generatedPlan.planningProfile?.planningInputHash);

    // 3. Invalidation: Modify current_focus.md on disk
    await writeFile(join(storyDir, "current_focus.md"), "焦点改变：矿道发生坍塌事故！", "utf-8");

    // Runner re-evaluates: must detect hash mismatch and trigger planner
    const regeneratedPlan = await (runner as any).resolveGovernedPlan(
      book,
      tempDir,
      1,
      undefined,
      { reuseExistingIntentWhenContextMissing: true },
    );

    // Planner was invoked again because cache was properly invalidated!
    expect(planStructuredCalls).toBe(2);
    expect(regeneratedPlan.memo.goal).toBe("勘探外围矿道");
  });

  it("archives existing V3 plan safely into story/runtime/history when authorMind is toggled off", async () => {
    const runtimeDir = join(tempDir, "story", "runtime");
    const historyDir = join(runtimeDir, "history");
    await mkdir(runtimeDir, { recursive: true });

    const v3Plan: PlanChapterOutput = {
      intent: { chapter: 1, goal: "V3 规划" },
      memo: { chapter: 1, goal: "V3 规划", body: "正文...", threadRefs: [] },
      intentMarkdown: "投影",
      plannerInputs: [],
      runtimePath: join(runtimeDir, "chapter-0001.intent.md"),
      creativeContract: {
        schemaVersion: 1,
        whyThisChapterExists: { statement: "why" },
        humanCore: { statement: "core", anchoredInCharacters: ["arthur"] },
        hardConstraints: [],
        characterConstraints: [],
        readerTransition: { desiredAfter: { knows: [], believes: [], suspects: [], expects: [], questions: [], emotionalPosition: [] }, mustRemainUnknown: [] },
        plannedAuthorIntent: { readerEffects: [], informationStrategy: { reveal: [], withhold: [] }, attentionStrategy: [], emotionalTrajectory: [] },
        forbiddenShortcuts: [],
        freedomZone: { mayInvent: [], mayVary: [], mustRemainUnderspecified: [], surpriseAllowed: true },
      },
      planningProfile: {
        authorMindEnabled: true,
        plannerConfigHash: "config_v3",
        planningInputHash: "input_v3",
      },
    };

    // Save initial V3 plan
    await savePersistedPlan(tempDir, v3Plan, { authorMindEnabled: true });

    // Now user toggles off authorMind, and runs native planner producing a V2 plan
    const v2Plan: PlanChapterOutput = {
      intent: { chapter: 1, goal: "V2 规划" },
      memo: { chapter: 1, goal: "V2 规划", body: "原生正文...", threadRefs: [] },
      intentMarkdown: "原生投影",
      plannerInputs: [],
      runtimePath: join(runtimeDir, "chapter-0001.intent.md"),
    };

    // Save V2 plan with downgradePlan: true (or authorMindEnabled: false)
    await savePersistedPlan(tempDir, v2Plan, { authorMindEnabled: false, downgradePlan: true });

    // 1. Current plan file is now V2
    const currentPlan = await loadPersistedPlan(tempDir, 1);
    expect(currentPlan?.creativeContract).toBeUndefined();
    expect(currentPlan?.memo.goal).toBe("V2 规划");

    // 2. Archive file exists in history directory and contains the original V3 contract!
    const historyFiles = await readdir(historyDir);
    expect(historyFiles.length).toBeGreaterThanOrEqual(1);
    const archiveFile = historyFiles.find((f) => f.startsWith("chapter-0001.plan.author-mind."));
    expect(archiveFile).toBeDefined();

    const archivedContent = await readFile(join(historyDir, archiveFile!), "utf-8");
    const archivedJson = JSON.parse(archivedContent);
    expect(archivedJson.version).toBe(3);
    expect(archivedJson.creativeContract).toBeDefined();
    expect(archivedJson.memo.goal).toBe("V3 规划");
  });

  it("invalidates planningInputHash when role card (Arthur.md) content is modified", async () => {
    await createInitialRuntimeState({ bookDir: tempDir, language: "zh" });
    const storyDir = join(tempDir, "story");
    const rolesDir = join(storyDir, "roles", "主要角色");
    await mkdir(rolesDir, { recursive: true });
    await writeFile(join(rolesDir, "Arthur.md"), "# Arthur\n性格谨慎，从不轻信他人。", "utf-8");

    const checksumsBefore = await computeRelevantSourcesChecksum(tempDir);
    const arthurChecksumBefore = checksumsBefore.find((c) => c.path.includes("Arthur.md"));
    expect(arthurChecksumBefore).toBeDefined();

    const inputHashBefore = computePlanningInputHash({
      chapterNumber: 1,
      evidenceBundle: sampleBundle,
      relevantSourceChecksums: checksumsBefore,
    });

    // Modify Arthur.md content
    await writeFile(join(rolesDir, "Arthur.md"), "# Arthur\n此时决定主动信任 Clara。", "utf-8");

    const checksumsAfter = await computeRelevantSourcesChecksum(tempDir);
    const arthurChecksumAfter = checksumsAfter.find((c) => c.path.includes("Arthur.md"));
    expect(arthurChecksumAfter).toBeDefined();
    expect(arthurChecksumAfter?.hash).not.toBe(arthurChecksumBefore?.hash);

    const inputHashAfter = computePlanningInputHash({
      chapterNumber: 1,
      evidenceBundle: sampleBundle,
      relevantSourceChecksums: checksumsAfter,
    });
    expect(inputHashAfter).not.toBe(inputHashBefore);
  });

  it("invalidates planningInputHash when style_guide.md is modified", async () => {
    await createInitialRuntimeState({ bookDir: tempDir, language: "zh" });
    const storyDir = join(tempDir, "story");
    await writeFile(join(storyDir, "style_guide.md"), "风格：严肃写实", "utf-8");

    const checksumsBefore = await computeRelevantSourcesChecksum(tempDir);
    const styleChecksumBefore = checksumsBefore.find((c) => c.path === "style_guide.md");
    expect(styleChecksumBefore).toBeDefined();

    const inputHashBefore = computePlanningInputHash({
      chapterNumber: 1,
      evidenceBundle: sampleBundle,
      relevantSourceChecksums: checksumsBefore,
    });

    await writeFile(join(storyDir, "style_guide.md"), "风格：严肃写实，增加黑色幽默与讽刺", "utf-8");
    const checksumsAfter = await computeRelevantSourcesChecksum(tempDir);
    const styleChecksumAfter = checksumsAfter.find((c) => c.path === "style_guide.md");
    expect(styleChecksumAfter).toBeDefined();
    expect(styleChecksumAfter?.hash).not.toBe(styleChecksumBefore?.hash);

    const inputHashAfter = computePlanningInputHash({
      chapterNumber: 1,
      evidenceBundle: sampleBundle,
      relevantSourceChecksums: checksumsAfter,
    });
    expect(inputHashAfter).not.toBe(inputHashBefore);
  });

  it("invalidates plannerProtocolHash and plannerConfigHash when skill corpus reference file is modified", async () => {
    const skillDir = join(tempDir, "test-skill");
    const refDir = join(skillDir, "references");
    await mkdir(refDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "# Test Skill\nSkill body", "utf-8");
    await writeFile(join(refDir, "guide.md"), "Original reference guide", "utf-8");

    const activatedSkills = [
      {
        skill: {
          id: "test-skill",
          name: "Test Skill",
          description: "Test description",
          source: "project" as const,
          body: "# Test Skill\nSkill body",
          baseDir: skillDir,
        },
        resources: [],
      },
    ];

    const skillFingerprintBefore = await computeSkillsFingerprint(activatedSkills);
    const protocolHashBefore = computePlannerProtocolHash({
      systemPrompt: "system prompt",
      toolSchema: {},
      contractSchemaVersion: 1,
      language: "zh",
      skillFingerprint: skillFingerprintBefore,
      profileHash: "prof_hash_1",
    });
    const configHashBefore = computePlannerConfigHash({
      authorMindEnabled: true,
      protocolHash: protocolHashBefore,
      workContextHash: "work_hash_1",
    });

    // Modify reference file in skill directory
    await writeFile(join(refDir, "guide.md"), "Updated reference guide with critical constraints", "utf-8");

    const skillFingerprintAfter = await computeSkillsFingerprint(activatedSkills);
    const protocolHashAfter = computePlannerProtocolHash({
      systemPrompt: "system prompt",
      toolSchema: {},
      contractSchemaVersion: 1,
      language: "zh",
      skillFingerprint: skillFingerprintAfter,
      profileHash: "prof_hash_1",
    });
    const configHashAfter = computePlannerConfigHash({
      authorMindEnabled: true,
      protocolHash: protocolHashAfter,
      workContextHash: "work_hash_1",
    });

    expect(skillFingerprintAfter).not.toBe(skillFingerprintBefore);
    expect(protocolHashAfter).not.toBe(protocolHashBefore);
    expect(configHashAfter).not.toBe(configHashBefore);
  });

  it("invalidates planningInputHash when authorRequest is updated", async () => {
    const hash1 = computePlanningInputHash({
      chapterNumber: 1,
      evidenceBundle: sampleBundle,
      authorRequest: "请着重刻画主角的焦虑情绪",
      authorRequestHash: "req_01",
    });

    const hash2 = computePlanningInputHash({
      chapterNumber: 1,
      evidenceBundle: sampleBundle,
      authorRequest: "请着重推进主线侦查谜题",
      authorRequestHash: "req_02",
    });

    expect(hash2).not.toBe(hash1);
  });

  it("savePersistedPlan fails closed and prevents overwrite if existing plan is corrupted before downgrade", async () => {
    const runtimeDir = join(tempDir, "story", "runtime");
    await mkdir(runtimeDir, { recursive: true });

    // Corrupted existing plan on disk
    const planFile = join(runtimeDir, "chapter-0001.plan.json");
    await writeFile(planFile, "{ invalid json content ...", "utf-8");

    const v2Plan: PlanChapterOutput = {
      intent: { chapter: 1, goal: "V2 规划" },
      memo: { chapter: 1, goal: "V2 规划", body: "原生正文...", threadRefs: [] },
      intentMarkdown: "原生投影",
      plannerInputs: [],
      runtimePath: join(runtimeDir, "chapter-0001.intent.md"),
    };

    await expect(
      savePersistedPlan(tempDir, v2Plan, { authorMindEnabled: false, downgradePlan: true }),
    ).rejects.toThrow(/Failed to parse existing plan.*\(Fail-Closed\)/);

    // Verify existing file was not overwritten
    const contentAfter = await readFile(planFile, "utf-8");
    expect(contentAfter).toBe("{ invalid json content ...");
  });
});
