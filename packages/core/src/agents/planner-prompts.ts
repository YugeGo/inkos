import type { ContextPackage, ContractIssue } from "../models/input-governance.js";
import { renderNarrativeSelectedContext } from "../utils/narrative-control.js";
import type { PlanningEvidenceBundle } from "../models/evidence-bundle.js";

export function getPlannerMemoSystemPrompt(language: "zh" | "en" = "zh"): string {
  return language === "en"
    ? "Compile the supplied governed context into one chapter memo. Do not write prose. Professional planning methodology comes only from the activated Skill. Preserve user direction and established facts, use only supplied hook ids, and submit one concrete goal plus a readable Markdown plan through the result tool."
    : "把输入的 governed context 编译为一份章节 memo，不写正文。专业规划方法只来自已激活 Skill。保留用户方向和既成事实，只使用输入中存在的 hook id，并通过结果工具提交一个具体目标和完整可读的 Markdown 计划。";
}

/**
 * Four-layer System Prompt for the Author-Mind Planner.
 * Establishes narrative governance, contract fence philosophy, and strict canon boundaries.
 */
export function getAuthorMindPlannerSystemPrompt(language: "zh" | "en" = "zh"): string {
  if (language === "en") {
    return [
      "# Role & Architectural Mission (Layer 1)",
      "You are the Author-Mind Chapter Planner for InkOS. You do NOT write novel prose.",
      "Your sole mission is to produce a structurally rigorous Chapter Memo and a binding Chapter Creative Contract via the submit_governed_plan_contract tool.",
      "",
      "# Creative Contract Fence Philosophy (Layer 2)",
      "\"The Creative Contract is a fence, not a railroad.\"",
      "- Memo Goal vs Why This Chapter Exists: memo.goal defines the external plot event; whyThisChapterExists defines the indispensable structural/thematic reason the entire book cannot do without this chapter. They MUST NOT be identical.",
      "- Human Core: Must anchor in concrete characters and describe their genuine human dilemma, not abstract tropes.",
      "- Reader Transition: Map the simulated reader's psychological journey (knows, believes, suspects, expects, questions) across this chapter.",
      "",
      "# Evidence Authority & Canon Separation (Layer 3)",
      "- Canon reality (canonFacts, runtimeState, bookRules) is immutable reality. If you propose a canon hard constraint, cite verified sourceRefs.",
      "- Outlines (outlineIntentions) are future creative hopes, NOT established canon reality. NEVER claim outline intentions as canon.",
      "- Do not invent new canon facts under the guise of world truth.",
      "",
      "# Information Strategy & Creative Latitude (Layer 4)",
      "- Information strategy: reveal and withhold MUST NOT target the same information ID.",
      "- Information marked for reveal must not appear in mustRemainUnknown.",
      "- Forbidden Shortcuts: Explain the specific narrative reason why a cliché is banned.",
      "- Freedom Zone: Explicitly designate what the downstream Writer is empowered to invent and vary, and what must remain underspecified.",
    ].join("\n");
  }

  return [
    "# 角色定位与架构职责（第一层：核心定位）",
    "你是 InkOS 的 Author-Mind 章节规划器。你【绝对不写小说正文】。",
    "你的唯一使命是规划出高结构化、高保真度的【章节 Memo】与【章节创作契约（Creative Contract）】，并通过 submit_governed_plan_contract 提交。",
    "",
    "# 创作契约围栏哲学（第二层：围栏而非铁轨）",
    "【创作契约是围栏，不是铁轨】——它划定不可突破的边界与读者心理目的地，同时为 Writer 留出自由创作空间：",
    "- 剧情目标 vs 章节存在理由：memo.goal 描述本章外部发生了什么；whyThisChapterExists 阐述整本书为何不能缺失本章（缺失后会瓦解什么）。两者严禁文本完全相同。",
    "- 人物内核（Human Core）：必须锚定到具体角色（anchoredInCharacters），描写具体人物面临的困境与真实心理，拒绝假大空的说教。",
    "- 读者心智演进（Reader Transition）：细致勾勒读者在本章的认知轨迹（已知、相信、怀疑、预期、悬念）。",
    "",
    "# 证据权威与既定事实分级（第三层：严禁大纲冒充现实）",
    "- 既定现实（canonFacts、runtimeState、bookRules）属于不可撼动的世界现实；引用硬约束时必须基于确凿的 sourceRef。",
    "- 大纲意图（outlineIntentions）仅仅是未来意向，绝非既定事实。严禁把未来大纲当成 canon 进行约束。",
    "- 严禁私自捏造未经证实的设定作为 Canon 约束。",
    "",
    "# 信息控制与自由留白（第四层：精准边界）",
    "- 信息策略：reveal（揭示）与 withhold（隐瞒）的目标 ID 必须严格互斥，不可对同一件事物既揭示又隐瞒。",
    "- 标记为 reveal 的信息严禁出现在 mustRemainUnknown（不可泄露边界）中。",
    "- 违禁捷径（Forbidden Shortcuts）：指出俗套模式并给出不可违背的创作理由（reason）。",
    "- 自由区域（Freedom Zone）：明确告知 Writer 哪些细节可以自由发明、哪些可微调、哪些必须刻意留白（mustRemainUnderspecified）。",
  ].join("\n");
}

export function buildPlannerUserMessage(input: {
  readonly chapterNumber: number;
  readonly contextPackage: ContextPackage;
  readonly currentInstruction?: string;
  readonly previousChapter?: string;
  readonly lengthBudget: {
    readonly target: number;
    readonly unit: string;
  };
  readonly evidenceBundle?: PlanningEvidenceBundle;
  readonly language?: "zh" | "en";
}): string {
  const language = input.language ?? "zh";
  const context = renderNarrativeSelectedContext(input.contextPackage.selectedContext, language);
  const instruction = input.currentInstruction?.trim();
  const previous = input.previousChapter?.trim();

  let evidenceSection = "";
  if (input.evidenceBundle) {
    const b = input.evidenceBundle;
    const lines: string[] = [];
    if (b.canonFacts.length > 0) {
      lines.push("### Verified Canon Facts:");
      b.canonFacts.slice(0, 10).forEach((c) => lines.push(`- [${c.ref}]: ${c.text}`));
    }
    if (b.bookRules.length > 0) {
      lines.push("### World Rules:");
      b.bookRules.slice(0, 10).forEach((r) => lines.push(`- [${r.ref}]: ${r.text}`));
    }
    if (b.activeHooks.length > 0) {
      lines.push("### Active Hooks:");
      b.activeHooks.slice(0, 10).forEach((h) => lines.push(`- [${h.ref}]: ${h.text}`));
    }
    if (b.characterIds.length > 0) {
      lines.push(`### Registered Characters: ${b.characterIds.join(", ")}`);
    }
    evidenceSection = lines.length > 0 ? `\n\n## Planning Evidence (Available References)\n${lines.join("\n")}` : "";
  }

  if (language === "en") {
    return [
      `# Chapter ${input.chapterNumber} memo request`,
      instruction ? `## Current user instruction\n${instruction}` : "",
      `## Governed context\n${context}`,
      evidenceSection,
      previous ? `## Previous chapter\n${previous}` : "",
      "## Host length telemetry",
      `User target: ${input.lengthBudget.target} ${input.lengthBudget.unit}. Treat it as a creative constraint, not a host quality verdict.`,
    ].filter(Boolean).join("\n\n");
  }
  return [
    `# 第${input.chapterNumber}章 memo 与契约规划请求`,
    instruction ? `## 当前用户指令\n${instruction}` : "",
    `## 权威上下文\n${context}`,
    evidenceSection,
    previous ? `## 上一章正文\n${previous}` : "",
    "## 宿主字数遥测",
    `用户目标：${input.lengthBudget.target} ${input.lengthBudget.unit}。这是创作约束，不是宿主质量判决。`,
  ].filter(Boolean).join("\n\n");
}

/**
 * Builds a diagnostic repair prompt exposing specific validation errors ONLY,
 * without prescribing creative answers or leaking replacement text.
 */
export function buildContractRepairUserMessage(errors: ReadonlyArray<ContractIssue>, language: "zh" | "en" = "zh"): string {
  const errorLines = errors.map((e, idx) => `${idx + 1}. [${e.code}] at ${e.path}: ${e.message}`).join("\n");
  if (language === "en") {
    return [
      "# Contract Validation Failed (Host Diagnostic Report)",
      "The submitted chapter creative contract failed host validation with the following specific diagnostic issues:",
      "",
      errorLines,
      "",
      "## Targeted Repair Instructions",
      "- Repair ONLY the specific issues listed above.",
      "- If a sourceRef was unverified or invalid, remove it or cite a valid evidence reference.",
      "- If information targets collided between reveal and withhold, resolve the contradiction.",
      "- Do NOT invent replacement canon facts.",
      "- Resubmit the complete plan and corrected contract draft via submit_governed_plan_contract.",
    ].join("\n");
  }

  return [
    "# 创作契约校验失败（宿主诊断报告）",
    "你提交的章节创作契约未通过宿主的一致性校验，具体错误诊断如下：",
    "",
    errorLines,
    "",
    "## 定向修复指令",
    "1. 仅针对上述诊断报告中列出的具体错误进行修正；",
    "2. 若存在未经验证的 sourceRef 或大纲与现实混淆，请更正或移除该引用，严禁凭空捏造 Canon；",
    "3. 若 reveal 与 withhold 存在信息目标冲突，请明晰本章究竟是揭示还是隐瞒；",
    "4. 保持其他合法的创作决策不变，重新通过 submit_governed_plan_contract 提交完整计划与修正后的契约草案。",
  ].join("\n");
}
