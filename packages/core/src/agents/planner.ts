import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { BaseAgent } from "./base.js";
import { resolveAuthorMindEnabled, type BookConfig } from "../models/book.js";
import type { LengthSpec } from "../models/length-governance.js";
import { buildLengthSpec } from "../utils/length-metrics.js";
import {
  ChapterIntentSchema,
  ChapterMemoSchema,
  type ChapterIntent,
  type ChapterMemo,
  type ContextPackage,
  type ChapterCreativeContract,
  type ContractIssue,
  type ContractValidationResult,
  validateCreativeContractSemantics,
} from "../models/input-governance.js";
import { loadPlanningSeedMaterials } from "../utils/planning-materials.js";
import {
  ChapterMemoToolSchema,
  GovernedPlanContractToolSchema,
} from "./planner-tool.js";
import {
  buildPlannerUserMessage,
  getPlannerMemoSystemPrompt,
  getAuthorMindPlannerSystemPrompt,
  buildContractRepairUserMessage,
} from "./planner-prompts.js";
import { ComposerAgent } from "./composer.js";
import { buildPlanningEvidenceBundle } from "./planner-evidence.js";
import { normalizePlannerContract } from "./planner-contract-normalizer.js";
import {
  computePlannerConfigHash,
  computePlannerProtocolHash,
  computePlanningInputHash,
  preparePlanningFingerprint,
  PLANNER_PROMPT_VERSION,
  PLANNER_TOOL_VERSION,
  type PlanningProfile,
} from "../pipeline/persisted-governed-plan.js";

export { PLANNER_PROMPT_VERSION, PLANNER_TOOL_VERSION };

export interface PlanChapterInput {
  readonly book: BookConfig;
  readonly bookDir: string;
  readonly chapterNumber: number;
  readonly externalContext?: string;
  readonly authorMindEnabled?: boolean;
}

export interface PlanChapterOutput {
  readonly intent: ChapterIntent;
  readonly memo: ChapterMemo;
  readonly intentMarkdown: string;
  readonly plannerInputs: ReadonlyArray<string>;
  readonly runtimePath: string;
  readonly creativeContract?: ChapterCreativeContract;
  readonly planningProfile?: PlanningProfile;
}

/**
 * The model submits the semantic plan through a typed Pi tool. The host owns
 * chapter identity and persists a readable projection separately.
 * Under Author-Mind mode, executes two-phase validation and repair loops
 * to guarantee contract consistency before persistence.
 */
export class PlannerAgent extends BaseAgent {
  get name(): string {
    return "planner";
  }

  async planChapter(input: PlanChapterInput): Promise<PlanChapterOutput> {
    const storyDir = join(input.bookDir, "story");
    const runtimeDir = join(storyDir, "runtime");
    await mkdir(runtimeDir, { recursive: true });

    const seedMaterials = await loadPlanningSeedMaterials({
      bookDir: input.bookDir,
      chapterNumber: input.chapterNumber,
    });
    const taskGoal = [
      input.externalContext,
      seedMaterials.currentFocus,
      seedMaterials.authorIntent,
      seedMaterials.brief,
    ].map((value) => value?.trim()).filter(Boolean).join("\n\n")
      || (input.book.language === "en"
        ? `Continue chapter ${input.chapterNumber} from the current Work state.`
        : `根据当前作品状态续写第${input.chapterNumber}章。`);

    const selected = await new ComposerAgent(this.ctx).selectTaskContext({
      bookDir: input.bookDir,
      chapterNumber: input.chapterNumber,
      goal: taskGoal,
      language: input.book.language,
    });

    const contextPackage: ContextPackage = seedMaterials.previousEndingExcerpt
      ? {
          ...selected,
          selectedContext: [
            ...selected.selectedContext,
            {
              source: `runtime/previous_chapter#${input.chapterNumber - 1}`,
              reason: "Previous chapter text required for chapter transition planning.",
              excerpt: seedMaterials.previousEndingExcerpt,
              protection: "protected",
            },
          ],
        }
      : selected;
    const plannerInputs = contextPackage.selectedContext.map((entry) => entry.source);

    const lengthSpec = buildLengthSpec(
      input.book.chapterWordCount,
      input.book.language,
    );

    const authorMindEnabled = resolveAuthorMindEnabled(input.book, input.authorMindEnabled);
    const language = input.book.language ?? "zh";
    const padded = String(input.chapterNumber).padStart(4, "0");

    let memo: ChapterMemo;
    let creativeContract: ChapterCreativeContract | undefined;
    let planningProfile: PlanningProfile | undefined;

    if (authorMindEnabled) {
      const fingerprint = await preparePlanningFingerprint({
        book: input.book,
        bookDir: input.bookDir,
        chapterNumber: input.chapterNumber,
        externalContext: input.externalContext,
        plannerCtx: this.ctx,
      });

      const planResult = await this.planGovernedContract({
        chapterNumber: input.chapterNumber,
        contextPackage,
        evidenceBundle: fingerprint.evidenceBundle,
        currentInstruction: input.externalContext,
        language,
        lengthSpec: fingerprint.lengthSpec,
      });

      memo = planResult.memo;
      creativeContract = planResult.creativeContract;

      const provider = (this.ctx.client as any).provider ?? "unknown";
      const model = this.ctx.model;

      planningProfile = {
        authorMindEnabled: true,
        contractSchemaVersion: creativeContract.schemaVersion,
        plannerPromptVersion: PLANNER_PROMPT_VERSION,
        plannerToolVersion: PLANNER_TOOL_VERSION,
        plannerProvider: provider,
        plannerModel: model,
        plannerConfigHash: fingerprint.configHash,
        planningInputHash: fingerprint.inputHash,
        plannerProtocolHash: fingerprint.protocolHash,
      };

      // Persist Markdown projection for creative contract
      const contractPath = join(runtimeDir, `chapter-${padded}.contract.md`);
      const contractMarkdown = this.renderContractMarkdown(input.chapterNumber, creativeContract);
      await writeFile(contractPath, contractMarkdown, "utf-8");
    } else {
      memo = await this.planChapterMemo({
        chapterNumber: input.chapterNumber,
        contextPackage,
        currentInstruction: input.externalContext,
        language,
        lengthSpec,
      });
    }

    const intent = ChapterIntentSchema.parse({
      chapter: input.chapterNumber,
      goal: memo.goal,
    });

    const runtimePath = join(runtimeDir, `chapter-${padded}.intent.md`);
    const intentMarkdown = this.renderIntentMarkdown(intent, memo);
    await writeFile(runtimePath, intentMarkdown, "utf-8");

    return {
      intent,
      memo,
      intentMarkdown,
      plannerInputs,
      runtimePath,
      ...(creativeContract ? { creativeContract } : {}),
      ...(planningProfile ? { planningProfile } : {}),
    };
  }

  /**
   * Plans the chapter with full Author-Mind governance, executing a 2-attempt
   * validation and repair state machine. Fails closed if validation fails twice.
   */
  async planGovernedContract(input: {
    readonly chapterNumber: number;
    readonly contextPackage: ContextPackage;
    readonly evidenceBundle: import("../models/evidence-bundle.js").PlanningEvidenceBundle;
    readonly currentInstruction?: string;
    readonly language?: "zh" | "en";
    readonly lengthSpec: LengthSpec;
  }): Promise<{ readonly memo: ChapterMemo; readonly creativeContract: ChapterCreativeContract }> {
    const language = input.language ?? "zh";

    const userMessage = buildPlannerUserMessage({
      chapterNumber: input.chapterNumber,
      contextPackage: input.contextPackage,
      currentInstruction: input.currentInstruction,
      lengthBudget: {
        target: input.lengthSpec.target,
        unit: input.lengthSpec.countingMode === "en_words" ? "words" : "字",
      },
      evidenceBundle: input.evidenceBundle,
      language,
    });

    const systemPrompt = getAuthorMindPlannerSystemPrompt(language);

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];

    let attempt = 0;
    let lastErrors: ReadonlyArray<ContractIssue> = [];

    while (attempt < 2) {
      const { result } = await this.submitStructured(
        messages,
        {
          name: "submit_governed_plan_contract",
          label: "Submit governed plan and creative contract",
          description: "Submit the chapter memo alongside the structured creative contract draft.",
          parameters: GovernedPlanContractToolSchema,
        },
        { temperature: 0.7, maxTokens: Math.min(8192, this.ctx.client.defaults.maxTokens) },
      );

      // 1. Structural Normalization
      let normalizedContract: ChapterCreativeContract;
      try {
        normalizedContract = normalizePlannerContract(result.contractDraft, input.evidenceBundle);
      } catch (structuralError: any) {
        attempt++;
        const issue: ContractIssue = {
          path: "contractDraft",
          message: structuralError.message,
          code: "STRUCTURAL_VALIDATION_ERROR",
        };
        lastErrors = [issue];
        if (attempt >= 2) {
          throw new Error(`Planner contract structural normalization failed after repair (Fail-Closed): ${structuralError.message}`);
        }
        messages.push({
          role: "assistant",
          content: JSON.stringify(result, null, 2),
        });
        messages.push({
          role: "user",
          content: buildContractRepairUserMessage(lastErrors, language),
        });
        continue;
      }

      // 2. Semantic Validation
      const validation: ContractValidationResult = validateCreativeContractSemantics(
        normalizedContract,
        input.evidenceBundle,
        { memoGoal: result.goal },
      );

      if (validation.ok) {
        const memo = ChapterMemoSchema.parse({
          chapter: input.chapterNumber,
          goal: result.goal,
          body: result.body,
          threadRefs: result.threadRefs,
        });
        return {
          memo,
          creativeContract: normalizedContract,
        };
      }

      attempt++;
      lastErrors = validation.errors;
      if (attempt >= 2) {
        const summary = validation.errors.map((e) => `[${e.code}] ${e.path}: ${e.message}`).join("; ");
        throw new Error(`Planner contract semantic validation failed after repair (Fail-Closed): ${summary}`);
      }

      // Append targeted diagnostic repair instructions and retry
      messages.push({
        role: "assistant",
        content: JSON.stringify(result, null, 2),
      });
      messages.push({
        role: "user",
        content: buildContractRepairUserMessage(validation.errors, language),
      });
    }

    throw new Error(`Planner contract validation failed (Fail-Closed).`);
  }

  /** Compile the governed context into a typed semantic chapter memo. */
  async planChapterMemo(input: {
    readonly chapterNumber: number;
    readonly contextPackage: ContextPackage;
    readonly currentInstruction?: string;
    readonly language?: "zh" | "en";
    readonly lengthSpec: LengthSpec;
  }): Promise<ChapterMemo> {
    const language = input.language ?? "zh";

    const userMessage = buildPlannerUserMessage({
      chapterNumber: input.chapterNumber,
      contextPackage: input.contextPackage,
      currentInstruction: input.currentInstruction,
      lengthBudget: {
        target: input.lengthSpec.target,
        unit: input.lengthSpec.countingMode === "en_words" ? "words" : "字",
      },
      language,
    });

    const systemPrompt = getPlannerMemoSystemPrompt(language);

    const { result } = await this.submitStructured(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      {
        name: "submit_chapter_memo",
        label: "Submit chapter memo",
        description: "Submit the complete semantic chapter plan for host persistence.",
        parameters: ChapterMemoToolSchema,
      },
      { temperature: 0.7, maxTokens: Math.min(8192, this.ctx.client.defaults.maxTokens) },
    );
    return ChapterMemoSchema.parse({
      chapter: input.chapterNumber,
      goal: result.goal,
      body: result.body,
      threadRefs: result.threadRefs,
    });
  }

  private renderIntentMarkdown(
    intent: ChapterIntent,
    memo: ChapterMemo,
  ): string {
    const memoBody = memo.body.trim();
    const threadRefsLine = memo.threadRefs.length > 0
      ? memo.threadRefs.map((id) => `- ${id}`).join("\n")
      : "- (none)";

    return [
      "# Chapter Intent",
      "",
      "## Goal",
      "",
      intent.goal,
      "",
      "## Memo",
      "",
      memoBody,
      "",
      "## Active Threads",
      "",
      threadRefsLine,
    ].join("\n");
  }

  private renderContractMarkdown(
    chapterNumber: number,
    contract: ChapterCreativeContract,
  ): string {
    const hardConstraintsList = contract.hardConstraints
      .map((hc) => `- **[${hc.priority.toUpperCase()}]** \`${hc.id}\` (${hc.source}${hc.sourceRef ? ` -> ${hc.sourceRef}` : ""}): ${hc.statement}`)
      .join("\n");

    const revealList = contract.plannedAuthorIntent.informationStrategy.reveal
      .map((t) => `- \`${t.id}\`: ${t.description}`)
      .join("\n") || "- (none)";

    const withholdList = contract.plannedAuthorIntent.informationStrategy.withhold
      .map((t) => `- \`${t.id}\`: ${t.description}`)
      .join("\n") || "- (none)";

    const shortcutsList = contract.forbiddenShortcuts
      .map((fs) => `- \`${fs.code}\`: ${fs.description} *(Reason: ${fs.reason})*`)
      .join("\n") || "- (none)";

    return [
      `# Chapter ${chapterNumber} Creative Contract (Projection)`,
      "",
      `> Schema Version: ${contract.schemaVersion}`,
      "",
      "## 1. Why This Chapter Exists",
      contract.whyThisChapterExists.statement,
      "",
      "## 2. Human Core",
      `${contract.humanCore.statement} *(Anchored: ${contract.humanCore.anchoredInCharacters.join(", ")})*`,
      "",
      "## 3. Hard Constraints",
      hardConstraintsList || "- (none)",
      "",
      "## 4. Information Strategy",
      "### Reveal:",
      revealList,
      "### Withhold:",
      withholdList,
      "",
      "## 5. Forbidden Shortcuts",
      shortcutsList,
      "",
      "## 6. Freedom Zone",
      `- May Invent: ${contract.freedomZone.mayInvent.join("; ") || "(none)"}`,
      `- May Vary: ${contract.freedomZone.mayVary.join("; ") || "(none)"}`,
      `- Must Remain Underspecified: ${contract.freedomZone.mustRemainUnderspecified.join("; ") || "(none)"}`,
      `- Surprise Allowed: ${contract.freedomZone.surpriseAllowed ? "Yes" : "No"}`,
    ].join("\n");
  }
}
