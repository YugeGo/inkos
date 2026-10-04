# InkOS Author-Mind Extension Map: 扩展映射与侵入性分析

> 本文档为 **Author-Mind Edition Phase 0 只读架构审计** 的架构扩展映射交付物。  
> 明确各项需求对应的推荐扩展点、拟修改/新增文件及侵入性风险等级。  
> 严格遵循核心准则：`复用 > 扩展 > 替换 > 重写`。

---

## 一、需求与扩展点总览表

| 阶段 / 需求项 | 核心功能概述 | 推荐扩展机制 | 拟修改/新增文件 | 风险等级 |
| :--- | :--- | :--- | :--- | :---: |
| **Phase 1: Creative Contract Schema** | 定义结构化、带 ID、带置信度与人物锚点的创作契约模型 | 独立 Zod 类型定义，在 `input-governance` 中复合暴露 | `[NEW] packages/core/src/models/creative-contract.ts`<br>`[MODIFY] packages/core/src/models/input-governance.ts` | **低** |
| **Phase 2: Planner 集成** | Planner 生成契约并内嵌持久化至 Plan（判别联合 V2/V3） | 扩展 Planner 工具 Schema 与 `persisted-governed-plan` | `[MODIFY] packages/core/src/agents/planner.ts`<br>`[MODIFY] packages/core/src/agents/planner-tool.ts`<br>`[MODIFY] packages/core/src/agents/planner-prompts.ts`<br>`[MODIFY] packages/core/src/pipeline/persisted-governed-plan.ts` | **中** |
| **Phase 3: Composer 上下文组装** | 将 Contract 纳入受保护上下文源（运输不丢失保证） | 在 `collectSelectedContext` 中追加 protected 条目 | `[MODIFY] packages/core/src/agents/composer.ts`<br>`[MODIFY] packages/core/src/utils/context-assembly.ts` | **低** |
| **Phase 3.5: Contract Compiler** | 将机器存储契约编译为 Writer 面向模型的紧凑层级提示词 | 解耦 Persistence Schema 与 Prompt Representation | `[NEW] packages/core/src/agents/contract-compiler.ts` | **低** |
| **Phase 4: Writer 自由裁量权围栏** | 将编译后契约注入写作提示词，锁死硬边界同时开放微观自由 | 扩展 `buildWriterSystemPrompt` 与 User Prompt 构造 | `[MODIFY] packages/core/src/agents/writer-prompts.ts`<br>`[MODIFY] packages/core/src/agents/writer.ts` | **低** |
| **Phase 5: 逆向拆书与决策分析** | 分析优秀样本的读者状态、推测作者意图假设与反事实推演 | 独立的 Research 模块，产出 InferredAuthorIntentHypothesis | `[NEW] packages/core/src/models/book-analysis.ts`<br>`[NEW] packages/core/src/agents/book-analyzer.ts`<br>`[NEW] packages/core/src/pipeline/book-analysis-runner.ts` | **低** |
| **Phase 6: 叙事机制库 (Mechanism Library)** | 沉淀可复用的叙事手法、生效前提与风险声明 | 模块化机制注册表与检索器 | `[NEW] packages/core/src/mechanisms/schema.ts`<br>`[NEW] packages/core/src/mechanisms/registry.ts`<br>`[NEW] packages/core/src/mechanisms/builtins/` | **低** |
| **Phase 7: Reader Simulator & Critic 重构** | 模拟读者认知转变（期望 vs 实测），解耦 Critic 与 Reviser | 新增模拟器 Agent，重构审查观察分类与校验项 | `[NEW] packages/core/src/agents/reader-simulator.ts`<br>`[MODIFY] packages/core/src/agents/continuity.ts`<br>`[MODIFY] packages/core/src/pipeline/chapter-review.ts` | **中** |
| **Phase 8: 人类编辑记忆 (Editorial Memory)** | 追踪人工修改偏好，提取写作风格微调样本 | 监听人类修改差异，沉淀样本库至 `story/style_exemplars/` | `[NEW] packages/core/src/state/editorial-memory.ts`<br>`[MODIFY] packages/core/src/pipeline/runner.ts` | **低** |
| **Phase 9: 双盲 A/B Benchmark** | 原生 vs Author-Mind 盲评打分与决策把关 | 自动化评测脚手架，无侵入式对比基准测试 | `[NEW] packages/core/src/harness/blind-benchmark.ts`<br>`[NEW] scripts/run-author-mind-benchmark.ts` | **低** |
| **Phase 10: Studio 可视化与契约编辑器** | 在 Web 界面直观查看和编辑 Contract 及拆书工件 | 扩展 Studio REST/SSE 路由与前端展示面板 | `[MODIFY] packages/studio/src/api/server.ts`<br>`[NEW] packages/studio/src/components/chat/ContractViewer.tsx` | **低** |

---

## 二、逐阶段详细设计与侵入性控制策略

### Phase 1: Creative Contract Schema
* **核心结构规范**：
  - `schemaVersion: 1`：契约自身独立版本化。
  - `whyThisChapterExists: { statement: string }`：章节核心存在价值（非流水账）。
  - `chapterFunction?: { primary: string; secondary?: string[]; plotProgress?: "none" | "low" | "medium" | "high" }`。
  - `humanCore: { statement: string; anchoredInCharacters: string[] }`：硬性要求人物锚点，杜绝空泛文学套话。
  - `hardConstraints: Constraint[]`：带 `id`、`statement`、`source` 与 `severity: "absolute" | "strong"`。
  - `characterConstraints: CharacterConstraint[]`：带 `characterId`、`mustNotKnow`、`mustBelieve`、`behavioralLimits`。
  - `readerTransition`:
    - `inputState?: ReaderState`（未来可对接上一章实测状态）
    - `desiredAfter: ReaderState`
    - `mustRemainUnknown: InformationBoundary[]`
  - `ReaderState`:
    - `knows: string[]`
    - `believes: ReaderBelief[]`（`strength: "weak" | "moderate" | "strong"`，避免假精确）
    - `suspects: ReaderBelief[]`
    - `expects: ReaderBelief[]`
    - `questions: ReaderQuestion[]`（`salience: "low" | "medium" | "high"`）
    - `emotionalPosition: string[]`
  - `plannedAuthorIntent`: 前向规划专用（`readerEffects`, `informationStrategy: { reveal, withhold }`, `attentionStrategy`, `emotionalTrajectory`）。
  - `forbiddenShortcuts: ForbiddenShortcut[]`：带 `code`、`description` 与 `reason`（解释为何禁止）。
  - `freedomZone`: `mayInvent`、`mayVary`、`mustRemainUnderspecified`（保护未确定性与潜台词）、`surpriseAllowed`。
* **推荐实现**：在 `packages/core/src/models/creative-contract.ts` 中声明独立 Zod Schema。
* **风险评估（低）**：仅增加类型模型与校验器，不影响运行时代码。

---

### Phase 2: Planner 集成
* **核心内容**：
  - Planner 生成契约并内嵌持久化至 Plan。
* **侵入性控制与版本化**：
  - **Plan 显式版本化**：`PersistedPlanSchema` 升级为 `z.discriminatedUnion("version", [PersistedPlanV2Schema, PersistedPlanV3Schema])`。
  - **向下兼容归一化**：读取旧版 `version: 2` 自动归一化处理，`creativeContract` 置为 `undefined`。
  - **环境指纹隔离**：在 `PersistedPlanV3` 中引入 `planningProfile: { authorMindEnabled: boolean, contractSchemaVersion: number }`，防范 `authorMind: false` 时的脏缓存命中。
* **风险评估（中）**：需保证各主流模型在 Tool Call 中稳定输出完整复杂契约。

---

### Phase 3: Composer 上下文组装
* **核心内容**：
  - 将生成的 `CreativeContract` 注册进 `ContextPackage`。
* **侵入性控制**：
  - 标记为 `protection: "protected"`，享有原生 Token 预算不可压缩保证（传输层保障）。
* **风险评估（低）**：完全融入现存的分级上下文机制。

---

### Phase 3.5: Contract Compiler (新增编译器层)
* **核心内容**：
  - 将机器可读的契约 JSON 编译为给 Writer 的紧凑、结构化的自然语言提示词表示：
    - 硬约束（`hardConstraints`, `mustNotKnow`, `forbiddenShortcuts`）编译为顶层不可违背条款（NON-NEGOTIABLE）；
    - 软目标（`whyThisChapterExists`, `humanCore`, `desiredAfter`）编译为创作意图；
    - 自由区（`freedomZone`, `mustRemainUnderspecified`）编译为明确授权宽容度（CREATIVE LATITUDE）。
* **风险评估（低）**：纯文本转换与编译工具函数。
    ```typescript
    if (contract) {
      entries.push({
        source: "runtime/creative-contract",
        reason: "Author-Mind Chapter Creative Contract defining non-negotiable boundaries.",
        excerpt: renderContractMarkdown(contract),
        protection: "protected", // 绝不被 Context Budget 压缩
      });
    }
    ```
* **风险评估（低）**：完全融入现存的分级上下文机制，无需改动 Token 预算算法。

---

### Phase 4: Writer 自由裁量权围栏
* **核心内容**：
  - 提示词明确强化“围栏原则”（限制边界，不限制路径）。
* **侵入性控制**：
  - 在 `packages/core/src/agents/writer-prompts.ts` 的 `buildWriterSystemPrompt` 中追加：
    - 禁忌清单（`forbiddenShortcuts`）
    - 开放自由区声明（`freedomZone`：对白、细节、场面调度、隐喻模型可自由发挥）
  - 模型调用的入参和出参工具（`submit_chapter_draft`，返回 `{ title, content }`）完全保持不变。
* **风险评估（低）**：仅为提示词上下文增强，不影响正文解析与状态结算管道。

---

### Phase 5: 逆向拆书与决策分析 (Book Reverse Engineering)
* **核心内容**：
  - 针对外部输入的优秀小说章节，做 Reader State / Information Release / Author Intent 分析，提取 `NarrativeMechanism`。
* **侵入性控制**：
  - 建立在 `packages/core/src/agents/book-analyzer.ts` 独立模块中。
  - 严格遵守版权隔离原则：外部版权文本只在本地内存或个人研究目录分析，不与主线正典混杂，不提交至公共 Git。
* **风险评估（低）**：纯只读外挂模块，独立运行，对长篇主流程无副作用。

---

### Phase 6: 叙事机制库 (Mechanism Library)
* **核心内容**：
  - 抽象可复用的叙事技法元数据（名称、适用场景、读者心理影响、风险与反模式）。
* **侵入性控制**：
  - 作为本地轻量级注册表 `packages/core/src/mechanisms/`，类似现有的 `skills/` 系统，按需挂载。
* **风险评估（低）**：纯数据与静态检索结构。

---

### Phase 7: Reader Simulator & Critic 重构
* **核心内容**：
  - **Reader Simulator**：在正文写完后，让模型扮演真实读者，记录阅读后的真实感知（Observed Reader State），并与契约中预期的（Desired Reader State）进行对比（Counterfactual & Discrepancy Analysis）。
  - **Critic 解耦**：审查只负责输出客观证据（Observations），不得因为“没有反转”或“节奏平缓”就无端判定低分；重写决策权归属于独立策略层。
* **侵入性控制**：
  - Simulator 输出转化为既有的 `Observation` 格式，复用 `ContinuityAuditor` 的证据行引用规范。
* **风险评估（中）**：需平衡审稿的严格度与避免因过度敏感导致频繁触发无效重写（Revision Thrashing）。

---

### Phase 8: 人类编辑记忆 (Human Editorial Memory)
* **核心内容**：
  - 用户在 Studio 或本地直接修改章节正文时，系统自动捕捉差异，提炼出人类作者的微观文风偏好。
* **侵入性控制**：
  - 复用 `packages/core/src/utils/source-text.ts` 已有的 `changedSourceRegion` 算法，增量记录到本地 JSON。
* **风险评估（低）**：旁路记录，不阻塞主干。

---

### Phase 9: 双盲 A/B Benchmark
* **核心内容**：
  - 相同设定与大纲下，由原生 InkOS 与 Author-Mind 各生成对照章节，打乱标识由评测模型与人类进行盲评。
  - 产出清晰的指标对比（AI味、人物一致性、自然度、结构僵硬度）。
* **侵入性控制**：
  - 作为独立脚本或命令行任务运行。
* **风险评估（低）**：评测工具代码，不影响生产代码。

---

### Phase 10: Studio UI
* **核心内容**：
  - 在前端界面展示 Creative Contract 卡片，直观查看本章存在意义、Human Core 与读者预期。
* **侵入性控制**：
  - 基于 React 组件扩展，通过现有 Hono 接口获取 JSON 数据。
* **风险评估（低）**：纯表现层。

---

## 三、架构回滚与退回方案 (Rollback Guarantee)

为彻底贯彻总控规范第 0 节与第 65 节关于“研究型工程，允许被关闭、删除或回滚”的最高准则：

1. **统一特性开关**：
   在 `inkos.json` / 项目配置中引入：
   ```json
   {
     "features": {
       "authorMind": false
     }
   }
   ```
2. **零副作用回滚保障**：
   - 当 `authorMind: false` 时：
     - Planner 直接退回输出普通 `ChapterMemo`；
     - Composer 不挂载 `runtime/creative-contract`；
     - Writer 提示词退回原生 `buildWriterSystemPrompt`；
     - 系统行为 100% 等价于未修改前的 InkOS 原生状态。
