# ADR-001: Creative Contract 持久化边界与三重保证架构决策

- **状态**：Accepted
- **日期**：2026-10-04
- **决定人**：系统架构评审委员会 / Antigravity
- **关联阶段**：Phase 0 审查修订、Phase 1 Schema 设计、Phase 2-4 实施

---

## 1. 背景与问题陈述

在 Phase 0 审计产出中，关于 `ChapterCreativeContract` 的存储与执行存在两处需要明确的架构边界：
1. **存储双权威冲突**：`current-pipeline.md` 提及独立 `chapter-XXXX.contract.json`，而 `extension-map.md` 提及内嵌至 `plan.json`。若两套并存将导致权威源（Authority）不明确。
2. **`protected` 上下文的语义边界**：InkOS 原生 `protected` 机制仅是 Token 预算层面的**运输不丢失保证**，并不能保证大语言模型在面对长上下文时产生足够的 Attention 并严格遵守硬约束。
3. **旧版兼容与版本化**：简单的在 `version: 2` 上添加可选字段，若遇到严格模式校验的旧版读取器可能导致反向兼容失败；且当 `authorMind: false` 时未定义计划缓存的命中指纹。

---

## 2. 核心架构决策

### 决策 1：采用 Plan 聚合根内嵌持久化，杜绝双权威

* **决定**：Creative Contract 本质属于 **Chapter Planning Artifact**，其生命周期与 `memo`、`intent`、`plannerInputs` 严格绑定（重新规划本章即意味契约重构）。
* **权威存储**：统一内嵌在 `story/runtime/chapter-XXXX.plan.json` 中作为唯一结构化权威。
* **投影分离**：`story/runtime/chapter-XXXX.contract.md` 仅为人类可读的只读 Markdown 投影，严禁反向解析为运行时状态。不生成独立的 `contract.json`。

### 决策 2：Persisted Plan 显式版本化（Discriminated Union）

* **决定**：淘汰在 `version: 2` 上隐式修改的方案，在 `persisted-governed-plan.ts` 中显式定义判别联合体：
  ```typescript
  const PersistedPlanSchema = z.discriminatedUnion("version", [
    PersistedPlanV2Schema,
    PersistedPlanV3Schema,
  ]);
  ```
* **向后兼容归一化（Normalization）**：
  - 读取旧版 `version: 2` 时，自动归一化输出，`creativeContract` 置为 `undefined`。
  - 新写入一律使用 `version: 3`，携带可选的 `creativeContract` 与 `planningProfile`。

### 决策 3：三层保障模型（Triple Guarantee Architecture）

确立契约从传输到执行的闭环分工，杜绝“塞进 protected 即完事”的粗放假设：
1. **第一层：运输保证（Protected ContextPackage）**  
   Contract 完整语义注册为 `protection: "protected"`，确保在任何 Token Budget 策略下绝不被压缩、裁切或丢弃。
2. **第二层：执行保证（Writer Rule Stack / Authority 动态编译）**  
   在进入 Writer 前，提取 Contract 中的核心不可违背内容（`hardConstraints`, `characterConstraints.mustNot`, `readerTransition.mustRemainUnknown`, `forbiddenShortcuts`），编译进 Writer 的 System Prompt 顶级权威规则栈，明确声明为不可违抗的硬边界；将 `freedomZone` 编译为明确授予模型的创作宽容度（Creative Latitude）。
3. **第三层：事后保证（Validator / Auditor）**  
   `ContinuityAuditor` 与 `StateValidator` 根据约束的稳定 ID 检查生成正文是否违约并输出确凿证据行。

### 决策 4：前向计划与逆向推断的意图语义解耦

* **前向创作规划**：命名为 `PlannedAuthorIntent`，代表创作者预设的读者影响目标、信息披露/隐藏策略、注意力流向与情绪轨迹。
* **逆向拆书分析**：后续 Phase 5 命名为 `InferredAuthorIntentHypothesis`，包含推测假设、置信度评估（`weak | moderate | strong`）与文本证据，二者在类型系统与语义层严格分离。

### 决策 5：增加 Phase 3.5 —— Contract Compiler

在 Phase 3（Composer）与 Phase 4（Writer）之间增设编译器阶段：
$$\text{CreativeContract (Machine JSON)} \xrightarrow{\text{Contract Compiler}} \text{Writer Contract Representation (Prompt)}$$
使机器存储结构（便于审计、diff、结构化存取）与大模型提示词表示（紧凑、优先级明确、引导力强）完全解耦。

### 决策 6：`authorMind: false` 时的数据行为准则

* **消费控制而非破坏性删除**：当特性开关关闭时，已有章节的 Contract 保持静默存储，任何消费端（Planner/Composer/Writer）予以彻底忽略。
* **计划缓存指纹校验**：在 `resolveGovernedPlan` 中引入规划环境指纹（`planningProfile`），防范在特性开关切换时错误命中不同模式下的旧 Plan 缓存。

---

## 3. 影响评估

* **兼容性**：完全保证旧版 `version: 2` 存量小说项目无缝读取。
* **开发成本**：Phase 1 Schema 增加了必要的结构元信息（ID、枚举、人物锚点、留白说明），但为后续 Audit 与 Compiler 扫清了模糊匹配的技术债务。

---

## 4. Phase 1.1 契约模型加固增补决议（Hardening Addendum）

在 Phase 1 评审与 Phase 1.1 加固中，补充了以下防御性架构决策：

### 决策 7：契约体积上限防御（Volume Bounds）
* **决定**：在 Schema 层全面引入 `max()` 数组长度上限与字符串长度上限，防止 Planner 生成条目过多导致下游 Composer 在组装 `protected` 上下文时直接超出 Token Budget 崩溃。例如：Hard Constraints 上限 12 条，单项 500 字符；Forbidden Shortcuts 上限 10 条等。

### 决策 8：稳定 ID 唯一性断言与来源溯源（Provenance）
* **决定**：
  1. `HardConstraintSchema` 增加 `sourceRef?: string`（如 `state:current_state.json#console.status`），约束必须溯源至具体事实源。
  2. 在 `ChapterCreativeContractSchema` 中引入 `.superRefine()`，对 `hardConstraints`、`mustRemainUnknown` 及 `forbiddenShortcuts` 实行跨字段全局排重，禁止 ID 碰撞。

### 决策 9：收紧信念状态与约束严重性语义
* **决定**：
  1. 约束严重性 `severity` 明确划分为 `absolute`（不可谈判的绝对硬线）与 `strong`（强约束）。
  2. 角色认知边界中，将原潜在歧义的 `mustBelieve` 细化为 `beliefsThatMustPersist`（本章全程必须持续持有的信念）与可选的 `beliefsAtStart`（进章初始信念，允许在章内转变）。

### 决策 10：两层 Schema 与宿主归一化（Host Normalization）
* **决定**：LLM Tool Schema（`PlannerCreativeContractDraftSchema`）仅负责创作决策字段，不要求模型生成系统级元数据（如 `schemaVersion`、自增 ID 等）；由宿主函数 `normalizePlannerContract` 统一注入权威版本号与指纹，并在持久化前通过 `validateCreativeContractSemantics` 实施严格语义冲突校验。

