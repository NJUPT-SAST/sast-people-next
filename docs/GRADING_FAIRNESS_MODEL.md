# 阅卷公平性分析模型规范 v1

> 状态：**待评审**（评审通过后即作为实现的唯一依据）
> 范围：笔试阅卷（`problem` / `user_point`）的讲师宽严度估计、校正预览与可视化
> 定位：**仅供人工参考**。不写回 `user_point`，不改动官方成绩，不影响发布结果。
>
> 已定决策（来自需求方）：
> 1. 现阶段只做「看」与「调参预览」，正式使用与写回留待后续；
> 2. 采用「三因子加法固定效应 + 经验贝叶斯收缩」，不上多面 Rasch（列为升级路径）；
> 3. 页面按部长及以上（role ≥ 3）开放，部门内可见；
> 4. 不新增前端依赖，图表手写 SVG。

---

## 0. 非目标（v1 明确不做）

| 不做 | 原因 |
|---|---|
| 把校正后的分数写回 `user_point` 或结果发布快照 | 模型误差会直接变成对考生的误差；需要可解释、可申诉的规则 |
| 随机双评抽检的流程功能 | 属于流程改造，且当前数据本就不足以辨识（见 §14） |
| 多面 Rasch / 部分计分模型（MFRM） | 需要边缘极大似然迭代；v1 目标只是「讲师宽严」 |
| 讲师本人自助查看自己的偏差 | 属管理决策；v1 仅部长及以上 |
| CSV 导出、审计留痕以外的报表 | 参考用途，先把模型与可视化做对 |

---

## 1. 数据与记号

一次观测 = 「某讲师给某考生的某道题打分」，来自 `user_point` 一行 + 题目满分：

| 记号 | 含义 | 来源 |
|---|---|---|
| $c$ | 考生 | `user_point.fk_user_flow_id` → `user_flow.id` |
| $p$ | 题目 | `user_point.fk_problem_id` → `problem.id` |
| $j$ | 讲师（阅卷人） | `user_point.fk_judger_id`（Link 用户 ID） |
| $M_{cpj}$ | 题目满分 | `problem.score` |
| $y_{cpj}$ | 得分 | `user_point.points` |
| $r_{cpj}$ | **得分率** | $r = \mathrm{clip}(y / M,\,0,\,1)$ |

约定：

- 只分析 $M > 0$ 且 $j$ 非空的观测；其余计入 `skippedObservationCount`。
- $y > M$（题目满分事后被改小）时截断到 $M$，计入 `clampedObservationCount`。
- 唯一键 `(fk_user_flow_id, fk_problem_id)` 保证同一考生同一题只有一条记录。
- 所有宽严量以**得分率**为单位（1 个百分点 = 0.01），展示时乘 100。

---

## 2. 模型

三因子加法（无交互）固定效应模型：

```
r(c,p,j) = μ + α(c) + β(p) + γ(j) + ε,   ε ~ (0, σ²) 独立同分布
约束： Σ_c α(c) = Σ_p β(p) = Σ_j γ(j) = 0
```

- $\alpha(c)$：考生水平；$\beta(p)$：题目难度（含评分尺度松紧）；$\gamma(j)$：**讲师宽严**，即我们要求的量。
- 建模单位是**单题得分率**而不是整卷总分：观测数更多、量纲统一、不受题目数量差异影响。
- 加法假设（无交互）是可检验的：标准化残差热力图（§10.2）出现按题型成片的正负结构时说明该假设不成立，此时应上交互模型（§13）。

### 2.1 为什么不能用「每个讲师的平均分」

设讲师 $j$ 的观测集合为 $O_j$，$\bar r_j = \frac{1}{n_j}\sum_{O_j} r$，则

```
E[ r̄_A − r̄_B ] = ( ᾱ_A − ᾱ_B ) + ( β̄_A − β̄_B ) + ( γ_A − γ_B )
                   考生构成差        题目分配差        真正想量的东西
```

**数值例子**（说明偏差可以有多大）：甲评题 1、2，乙评题 3、4；题 1、2 是送分题（$\bar\beta = +0.10$），题 3、4 是压轴题（$\bar\beta = -0.10$）；两批考生水平相同（$\bar\alpha$ 相同）；两人真实宽严相同（$\gamma_\text{甲} = \gamma_\text{乙} = 0$）。

```
朴素结论：r̄_甲 − r̄_乙 = +0.20  →  “甲比乙松 20 个百分点”
真实情况：γ_甲 − γ_乙 = 0       →  差异 100% 来自题目分配
```

本项目的阅卷方式正好制造这种共线：阅卷范围由讲师自选（`people_selectedProbs`），`user_point` 先写先占（讲师之间互不覆盖，部长及以上可覆盖）。因此**必须先分离 $\alpha,\beta$ 才能谈 $\gamma$**。

---

## 3. 可辨识性（本模型的核心前提）

把每条观测看成连接 $(c, p, j)$ 三个节点的超边，得到**关联图**。先按连通分量拆分，在每个分量内独立拟合（不同分量有各自的截距）。

设计矩阵 $X$：1 列截距 + $(C-1)$ 个考生哑变量 + $(P-1)$ 个题目哑变量 + $(J-1)$ 个讲师哑变量（各因子第一个水平为参照），参数数

```
p = 1 + (C − 1) + (P − 1) + (J − 1) = C + P + J − 2
```

**判据（充要，且直接可计算）**

```
可辨识  ⟺  rank(X) = p        （分量内，N ≥ p 隐含在其中）
```

结构性必要条件（便于理解与向使用者解释，但**不充分**）：

1. 关联图连通（否则拆分量）；
2. 观测数 $N \ge p$；
3. 每名讲师都至少与另一名讲师在**同一考生**或**同一题目**上出现（即存在重叠）。

**为什么不用经验法则代替秩判定**——反例：只有两条观测 $(c_1,p_1,j_1)$、$(c_1,p_2,j_2)$。关联图连通、两名讲师确实「在同一考生上重叠」，但 $N=2 < p=3$，秩为 2：把 $\gamma_1$ 抬 0.1、同时把 $\alpha_1$ 压 0.1，拟合完全相同。此时任何「校正」都是任意的。

**秩亏时的行为（强制）**：

- 给正规方程加岭 $\lambda_r = 10^{-6}\cdot\max_i (X^\top X)_{ii}$ 得到一个**有界**解，仅用于重建拟合值与画残差图；
- **一律不做校正**：$\gamma_j^{EB} := 0$、可信度 $:= 0$、`identifiable = false`、`verdict = "unknown"`；
- `rawBias` 也报 0：岭解没有统计意义，不允许出现在界面上冒充估计值；
- 页面必须显式显示「不可判定」，并说明原因（分量数 / 可辨识分量数 / 秩），**不得**显示一个看起来精确的数字。

> 当前生产数据的实际情形：每个流程只有 1 名阅卷人，$\gamma$ 与 $\alpha+\beta$ **完全共线**，所有讲师都不可判定（见 §14）。

---

## 4. 估计（分量内最小二乘）

正规方程：$A\hat\theta = b$，其中 $A = X^\top X$（$p\times p$）、$b = X^\top r$，按观测稀疏累加（每条观测只有 4 个非零列）。

- 秩判定与求解均用**带部分主元的高斯消元**；秩容差 $10^{-9}\cdot\max_i A_{ii}$（见 `lib/grading-fairness/matrix.ts`）。
- 秩满 → LU 求解；秩亏 → 加岭重解并标记不可辨识（§3）。
- 拟合值 $\hat r = \mu + \hat\alpha + \hat\beta + \hat\gamma$；残差平方和 $\mathrm{RSS} = \sum (r - \hat r)^2$。
- 自由度 $\mathrm{df} = N - \mathrm{rank}$；$\hat\sigma = \sqrt{\mathrm{RSS}/\mathrm{df}}$，$\mathrm{df} \le 0$ 时 $\hat\sigma = \mathrm{null}$（此时不给标准误）。

**标准误**：报告量是「相对全体讲师加权平均」的对比，对比向量（在删参照的参数化下）

```
c_j = e_j − Σ_k (n_k / N) · e_k        （参照讲师 e_ref = 0，故 c_ref = −Σ_{k≠ref}(n_k/N)e_k）
γ̂_j − γ̄  = c_jᵀ θ̂
s_j = σ̂ · sqrt( c_jᵀ A⁻¹ c_j )
```

实现：一次 LU 分解，$J$ 次回代求 $A^{-1}c_j$；只算讲师对比，不算全矩阵逆（$O(p^3/3 + Jp^2)$）。

**居中**：$\delta_j = \hat\gamma_j - \sum_k n_k \hat\gamma_k / N$，按观测数加权，于是 $\sum_j n_j\delta_j = 0$ 精确成立（这是 §7 守恒性的基础）。

---

## 5. 经验贝叶斯收缩（小样本讲师自动回归 0）

目的：$n_j$ 很小的讲师，$\delta_j$ 噪声极大，直接校正会引入比偏差本身更大的误差。

先估讲师之间的**真实**差异尺度 $\tau$（DerSimonian–Laird 矩估计）：

```
w_j = 1 / s_j²            δ̄_w = Σ w_j δ_j / Σ w_j            Q = Σ w_j (δ_j − δ̄_w)²
C   = Σ w_j − Σ w_j² / Σ w_j
τ²  = max( 0, (Q − (J_eff − 1)) / C )
```

**护栏**：$J_\text{eff} < 2$（有效讲师数，$s_j>0$ 的讲师）或 $C \le 0$ 时 $\tau^2 := 0$。

可信度与收缩估计：

```
w_cred(j) = τ² / (τ² + s_j²) ∈ (0, 1]        s_j = null 时取 0
bias(j)   = w_cred(j) · δ_j                  ← 这是真正用于校正的量
```

**$\tau^2 = 0$ 是一个有意义的结果**：数据无法证明讲师之间存在系统性差异，此时全部 `bias = 0`、$\lambda$ 失效、页面显示「未检测到讲师间系统性差异」。这是最保守也最常见的正确结论，不允许用「强行放大 $\tau$」的方式掩盖它。

`betweenJudgerSd = sqrt(τ²)` 一并输出，供界面解释收缩强度。

---

## 6. 判定（verdict）

对每个讲师用 $\delta_j$ 与 $s_j$ 做双侧 95% 区间：

```
s_j 可用且可辨识：
  δ_j − 1.96·s_j > 0  →  "lenient"  （偏松）
  δ_j + 1.96·s_j < 0  →  "strict"   （偏严）
  否则                 →  "fair"     （无显著差异）
s_j 不可用（null 或 ≤ 0）/ 不可辨识 →  "unknown"  （样本不足或设计不可辨识）
```

**不做多重比较校正**：$J$ 名讲师各自 95% 区间的族错误率约为 $1-0.95^J$。因此界面**必须同时给出区间**而不是只给标签；`fair` 的解释口径是「证据不足」而非「证明无差异」。（Bonferroni 选项列入 §13 升级路径。）

---

## 7. 校正语义与不变量

校正定义（对每条观测）：

```
r′ = clip( r − λ · m_j · bias(j) + λ · O , 0 , 1 )
O  = ( Σ_k n_k · m_k · bias(k) ) / N            ← 统一偏移（cohort offset）
adjustedPoints = clip( round( r′ · M ), 0 , M )
```

| 参数 | 含义 | 取值 | 谁定 |
|---|---|---|---|
| $\lambda$ | 全局校正强度（政策旋钮） | 0..1，0 = 只看不校 | 使用者，按 flow 持久化 |
| $m_j$ | 人工权重（模型看不到的因素，如当天状态、题目分配特殊） | 0..2，默认 1 | 使用者，按 flow 持久化 |
| $w_\text{cred}(j)$ | 可信度权重 | 自动 | 数据（§5），**不可手改** |
| $O$ | 统一偏移 | 自动 | 由「保持整体均分」开关决定 |

**不变量（必须成立，且要单测）**

1. **总量守恒**（`preserveTotal = true`，默认）：$\sum_j n_j\,(r' - r) = -\lambda\sum_j n_j m_j\,\mathrm{bias}(j) + \lambda N O = 0$，故 $\left|\sum \text{adjustedPoints} - \sum \text{points}\right| \le N/2$（整数舍入）$+$ 截断质量。校正只**重新分配**分数，不抬高或压低整届均分。
2. **组内保序**：同一讲师的观测各自减同一个常数，故**同一讲师内部的名次不变**；名次变化只可能发生在不同讲师评过的考生之间。
3. **$\lambda = 0$ 恒等**：`adjustedPoints === points`，名次完全一致（界面默认即此状态）。
4. **$\tau^2 = 0$ ⇒ 无校正**：全部 `bias = 0` ⇒ $O = 0$ ⇒ 恒等。

**必须写进界面与文档的解释**：`bias(j)` 是「该讲师相对同侪的**相对**系统性偏移」，不是「该讲师判错了多少」；$O$ 是记账用的统一平移，**不是**对任何人的宽严估计（尤其对可信度为 0 的讲师，其行上的偏移完全来自 $O$）。

**截断与舍入**：$r'$ 被截到 $[0,1]$ 会破坏精确守恒（被压到边界的观测不再参与再分配），这是有意的——校正不得把分数推到满分之上。界面在守恒性提示里给出实际偏差量。

---

## 8. 退化与边界情形（实现必须逐条处理）

| 情形 | 行为 |
|---|---|
| 观测为空 | 返回空 fit（`observationCount=0`、`identifiable=false`、`judgers=[]`），不抛错 |
| $M \le 0$ 或讲师缺失 | 跳过并计入 `skippedObservationCount` |
| $y > M$ | 截断并计入 `clampedObservationCount` |
| 只有一个讲师 | 分量内 $\gamma$ 恒等于 0；`identifiable=false`、全部 `unknown`、无校正 |
| 多个互不相连的阅卷小组 | 各自拟合（各自截距），可辨识性按分量分别判定；`componentCount` / `identifiableComponentCount` 输出到界面 |
| 秩亏（如 §3 反例） | 加岭求有界解，仅用于残差图；不校正，标记不可判定 |
| $\mathrm{df} \le 0$ | $\hat\sigma = \mathrm{null}$，全部 $s_j = \mathrm{null}$，全部 `unknown` |
| $\hat\sigma = 0$（合成数据完美拟合） | 低于 $10^{-9}$（得分率单位）一律视为「没有残差尺度」：$\hat\sigma := \mathrm{null}$、$s_j = \mathrm{null}$、`credibility = 0`、`unknown`、不校正。真实阅卷数据不可能出现零残差，这里报「无限置信度」只会误导；点估计 $\delta_j$ 仍如实输出 |
| 某讲师 0 条观测 | 不出现在 `judgers[]`；其观测不存在 |

---

## 9. 输出契约

类型定义在 `lib/grading-fairness/types.ts`（服务端 / 客户端共用，全部可 JSON 序列化）：

```ts
type GradingObservation = { userFlowId: number; problemId: number; judgerId: number; points: number; maxPoints: number };

type JudgerVerdict = "lenient" | "fair" | "strict" | "unknown";

type JudgerEstimate = {
  judgerId: number; observationCount: number; candidateCount: number;
  rawMeanRatio: number;      // 未校正平均得分率（受题目/考生构成影响）
  adjustedMeanRatio: number; // λ=1、m=1、保持整体均分时的平均得分率
  rawBias: number;           // 收缩前、已居中的 δ_j
  bias: number;              // 收缩后，用于校正
  standardError: number | null; credibility: number;
  identifiable: boolean; verdict: JudgerVerdict;
};

type GradingModelFit = {
  observationCount: number; skippedObservationCount: number; clampedObservationCount: number;
  candidateCount: number; problemCount: number; judgerCount: number;
  residualSd: number | null; betweenJudgerSd: number;
  identifiable: boolean; componentCount: number; identifiableComponentCount: number;
  candidateEffects: Record<string, number>; // 已折入分量截距
  problemEffects: Record<string, number>;
  judgerEffects: Record<string, number>;
  judgers: JudgerEstimate[];
};

type FairnessAdjustmentOptions = { lambda: number; judgerWeights?: Record<string, number>; preserveTotal?: boolean };
type GradingLeaderboardRow = {
  userFlowId: number; observationCount: number; rawPoints: number; maxPoints: number; adjustedPoints: number;
  rawRatio: number; adjustedRatio: number; rawRank: number; adjustedRank: number; rankDelta: number;
};
```

纯函数（`lib/grading-fairness/model.ts`，无 IO、无随机）：

```ts
fitGradingModel(observations: GradingObservation[]): GradingModelFit
fittedRatio(observation, fit): number
standardizedResidual(observation, fit): number | null   // (r − fitted) / σ̂
judgerBiasOf(fit, judgerId): number                     // 收缩后的 bias(j)（不可判定时为 0）
judgerManualWeight(options, judgerId): number           // m_j，未设置按 1，收敛到 0..2
correctionFor(fit, judgerId, options): number           // λ·m_j·bias(j)
cohortOffset(fit, options): number                      // λ·O
adjustedRatio(observation, fit, options): number
buildLeaderboard(observations, fit, options): GradingLeaderboardRow[]
```

**计算分工**：拟合（$O(p^3)$ 级）在服务端做一次；`λ`/`m_j` 只影响校正（$O(N)$），在客户端即时重算，滑块无需往返服务器。模型代码两端共用，保证口径唯一。

数据加载（服务端，部门 scope 内；返回 `null` = 流程不存在或不在本人可见范围）：

```ts
listGradingFairnessFlows(): Promise<Array<{
  id: number; title: string; department: string | null;
  observationCount: number; judgerCount: number;
}>>                                       // 存在评分记录的流程，按开始时间倒序

loadGradingFairnessData(flowId: number): Promise<{
  flow: { id: number; title: string; department: string | null };
  observations: GradingObservation[];
  candidateLabels: Record<string, { name: string | null; studentId: string | null }>;
  problemLabels: Record<string, { title: string; maxPoints: number }>;
  judgerLabels: Record<string, string | null>;
  unattributedCount: number;   // fk_judger_id 为空的评分行
  fit: GradingModelFit;
} | null>
```

姓名解析（Link）失败只记日志并把标签留空，模型照算：不让上游抖动拖垮整个分析页。

**口径（与笔试工作台 `calScore` 一致）**：可见性走 `isFlowVisibleToScope`（全局流程若本部门有报名也放行），观测与 `unattributedCount` 再按 `user_flow.department` 做部门过滤 —— 于是全局流程里本部门部长只分析**本部门考生**的卷子（管理员 scope=all 不受限）。列表与详情**同一套口径**：`listGradingFairnessFlows` 用 `visibleFlowPredicate(scope)` + 候选人部门过滤，`observationCount` 与 `fit.observationCount` 只算 `fk_judger_id` 非空的评分行，不会出现「列表 N 条、点进去 0 条观测」或「按 URL 能打开、列表里却没有」。

---

## 10. 可视化语义（手写 SVG，无新依赖）

统一规则：只用主题变量（`--accent` `--error` `--warning` `--success` `--muted-foreground` `--border`）；`role="img"` + `aria-label`；空数据渲染占位而非空轴；窄屏用 `overflow-x-auto` + `min-w-*` 保持字号，不把 SVG 压成不可读。

### 10.0 信息层级与降级
页面自上而下的顺序按「先结论、后依据、再诊断」：

1. **页头**：页面标题独占一行（不与选择器争宽度，避免标题被挤断行）；下面一行是当前流程名 + 归属与规模信息，右侧是**流程下拉选择器**（`flowPicker`，选中即写入 `?flowId=`，选项里带「N 条 · M 名阅卷讲师」）。
2. **结论条**：图标 + 粗体标题 + 说明，一句话讲清本流程发现了什么（偏离最大的 3 名讲师、各多少个百分点、λ=1 时多少名考生名次变化、能可靠检出多大的差异），或**为什么算不出**（阅卷人只有 1 名 / 多个互不相连的阅卷小组 / 没有评分记录）。
3. **关键指标行**：固定 6 格（观测数（含考生数）、题目数、讲师数、可判定阅卷组、$\tau$、$\hat\sigma$），不随条件增减，避免出现孤行；「可检出差异」写在结论条里，「未记录阅卷人」也写进结论条。
4. **讲师宽严与校正**：一行两栏（左 `minmax(0,1fr)`、右 `19rem`），两栏**等高**。左栏自上而下 = 森林图 + 判定色例 + 「校正前后平均得分率」哑铃图（上限 26rem 居中，避免被拉伸放大）；右栏 = 校正参数，**一行一名讲师**（名称 / 权重滑块 / 权重值 / 可信度），不换行、不产生第二行小字。
5. **名次变化**（整宽）：筛选与导出放在 `CardAction`，表格默认只渲染前 50 行。
6. **诊断与口径**：两栏（各 1/2）—— 左 = 讲师 × 题目残差热力图（自然宽度居中），右 = 四条短句的口径说明（相对量 / 只重新分配 / 只读 / 不可判定怎么办），不用长卡片堆字。

**布局约束**：同一行的卡片必须等高（默认 stretch，不用 `items-start`），且只把**内容高度相近**的内容放同一行；整宽区块内部要分栏时用「卡片内部两栏 + 分隔线」，不要用「两张高度不一的卡片并排」。所有手写 SVG 都加自然宽度上限（或容器宽度上限），`w-full` 只允许缩小、不允许放大到字号与其它图不一致；含 `overflow-x-auto` 的卡片一律加 `min-w-0`（flex/grid 子项默认 `min-width: auto`，否则整页会被撑出横向滚动）。

**降级（不可判定时）**：不渲染森林图、哑铃图、热力图，也**不渲染任何校正控件**（λ 与人工权重此时改不动任何东西，摆出来只会误导），改为一张「讲师阅卷量（描述性，仅供参考）」表（观测数 / 考生数 / 未校正平均得分率）并明确标注「这些平均分之间不可直接比较」，附上「需要重叠」的说明。给不出结论时，页面必须说清给不出的原因和补救办法。

### 10.1 讲师宽严森林图（`judgerForestPlot`）
横轴 = 宽严（百分点，0 为中心参考线，刻度在绘图区下方）；每名讲师一个点（$\delta_j$）+ 须线（$\pm1.96s_j$）；点半径随 $n_j$，不透明度随 $w_\text{cred}(j)$；行尾给出该讲师的**宽严数值**（`+4.3pp`）、**判定标签**（偏松 / 无显著差异 / 偏严 / 样本不足）与 $n_j$。不可判定行画空心虚线点（`--muted-foreground`），不画须线。
**可读出的结论**：某讲师是否显著偏松/偏严，以及**证据有多弱**（宽须线 = 样本不足）。
**不可读出的结论**：区间不重叠 ≠ 「一个错了」。

### 10.2 讲师 × 题目 标准化残差热力图（`judgerResidualHeatmap`）
格 = $z=(r-\hat r)/\hat\sigma$，正值 `--error`、负值 `--success`，不透明度随 $|z|$（饱和于 `maxAbs`，默认 3σ）；行/列标签截断到 6 个字符、完整名在 `<title>`；画布宽度随列数自适应并设**自然宽度上限**，避免在宽卡片里被拉伸放大。残差全部为 null（未识别出残差尺度）时改为一行说明，不画空格子。
**可读出的结论**：宽严是否只在**某类题**上出现（结构性问题 ⇒ 加法假设不成立 ⇒ §13 交互模型）。
**不可读出的结论**：$n=1$ 的格子是噪声，不得据此下结论（界面把样本数放在 `<title>` 里）。

### 10.3 校正前后哑铃图（`judgerShiftChart`）
每名讲师的原始平均得分率（空心环 `--muted-foreground`）→ 校正后平均得分率（实心点 `--primary`），两点连线，行尾给出差值（`−4.3pp`）。两点重合（λ=0）时外圈空心环仍可见。
**可读出的结论**：校正是否真的让讲师之间收敛（模型有效性自检）；不收敛说明 $\tau^2$ 或可信度压制了校正。

### 10.4 名次变化表（用现有 `components/ui/table`）
四列：`名次（原始 → 校正 + Δ 徽标）`、`考生`、`得分（原始 → 校正，表头带满分）`、`得分率（原始 → 校正）`。窄屏隐藏学号并允许横向滚动。
**可读出的结论**：校正对录取结果的实际影响面（多少人、多少名）。
**不可读出的结论**：名次变化不等于「原来判错了」，它是模型下的相对调整。

### 10.5 参数面板
$\lambda$ 滑块（0..1）+「不校正 / 半量 / 全量」快捷按钮、每名讲师的人工权重 $m_j$（0..2，行下标注该讲师的可信度与**当前**校正量）、「保持整体均分」开关、保存/重置与**未保存改动提示**、以及当前守恒偏差（总分变化 / 是否保持整体均分 / 多少名考生名次变化）。参数按 flow 持久化（§11）。

---

## 11. 持久化与权限

表 `grading_fairness_profile`（每 flow 一行）：

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | serial pk | |
| `fk_flow_id` | integer not null unique, FK → `flow(id)` on delete cascade | 一个流程一行 |
| `lambda` | 浮点，默认 0 | 全局校正强度 0..1 |
| `judger_weights` | jsonb not null default `'{}'` | `{ [judgerId]: 0..2 }` |
| `note` | text | 备注 |
| `updated_by` | integer | 最后保存人（Link 用户 ID） |
| `created_at` / `updated_at` | timestamptz | 与仓库其他表一致 |

- 读写入口：`action/user-flow/grading-fairness/profile.ts` 的 `loadGradingFairnessProfile` / `saveGradingFairnessProfile`，**均要求 role ≥ 3**，并做部门越权校验（`assertFlowEditableRecord`）。
- `"use server"` 文件只允许导出 async 函数，因此错误类 `FairnessProfileValidationError` 单独放在 `action/user-flow/grading-fairness/errors.ts`（与 `action/user-flow/user-point/upsert.ts` 同一约定）。
- 入参用 zod 校验（$\lambda\in[0,1]$、$m_j\in[0,2]$、键为数字字符串、note ≤ 500 字）。
- 页面：`app/dashboard/review/analytics/page.tsx`（`?flowId=`），role ≥ 3 才可进入；导航项「阅卷分析」挂在管理分组，且**必须排在「试卷批改」之前**（当前项解析是按数组顺序做前缀匹配，`/review` 会吞掉 `/review/analytics`）。

---

## 12. 验证计划

### 12.1 单元测试（`lib/grading-fairness/*.test.ts`，纯函数、确定性）

| # | 断言 | 意义 |
|---|---|---|
| 1 | 合成数据（已知 $\gamma$、无噪声）下 `rawBias` 精确还原 $\gamma$（误差 < 1e-6） | 估计量正确 |
| 2 | 同一份数据，**朴素均值差**偏离真实 $\gamma$ 差 > 0.02 | 证明模型确实解决了共线，而不是换了个说法 |
| 3 | 当前生产形态（每 flow 单讲师、无重叠）⇒ `identifiable=false`、全部 `bias=0`、`verdict="unknown"` | 不允许在不可辨识时给数字 |
| 4 | §3 的 2 观测反例 ⇒ 秩亏 ⇒ 不校正 | 秩判定生效 |
| 5 | `preserveTotal=true` 时 $\left|\sum \text{adjusted} - \sum \text{raw}\right| \le N/2$ | 守恒性 |
| 6 | `lambda=0` 时逐点恒等、名次一致 | 默认无副作用 |
| 7 | 可信度随 $n_j$ 单调不减；$|bias| \le |rawBias|$ | 收缩方向正确 |
| 8 | 名次变化方向：宽松讲师评的考生在校正后整体下移、严格讲师评的整体上移 | 校正方向正确 |
| 9 | 同一讲师内部保序 | §7 不变量 2 |
| 10 | 空输入、$M\le0$、$y>M$、$\mathrm{df}\le0$、$\hat\sigma=0$ 各退化分支 | §8 逐条 |
| 11 | `matrixRank` / `factorize`：奇异矩阵秩 < n、已知线性方程组的解正确、部分主元换行 | 线性代数底座 |
| 12 | 讲师只评自己独占的题目（题目集合互不相交）⇒ 不可辨识 | 生产里最常见的共线形态 |
| 13 | 互不相连的阅卷小组各自拟合，`identifiableComponentCount` 分别判定 | 多小组场景 |

### 12.2 集成测试
- `loadGradingFairnessData`：`fk_judger_id` 为空的行计入 `unattributedCount` 且不进模型；跨部门流程返回 `null`；软删除流程返回 `null`；**全局流程只返回本部门考生的观测**（管理员可见全部）；Link 姓名解析失败时仍返回结果、标签为 null。
- `listGradingFairnessFlows`：只列 scope 内有评分记录的流程，`observationCount` 只算已归属行；`scope: none` 返回空数组。
- `saveGradingFairnessProfile` / `loadGradingFairnessProfile`：往返一致、upsert 单行、role 2 拒绝、非法参数拒绝。

### 12.3 浏览器 smoke（真实页面，已验证）
以软件研发部部长身份打开 `/dashboard/review/analytics?flowId=101`：

| 检查 | 结果 |
|---|---|
| 状态卡 | 评分观测 20 · 考生 5 · 题目 4 · 阅卷讲师 2 · 可辨识阅卷组 1/1 · τ = 7.7pp · σ̂ = 2.1pp |
| 森林图 / 哑铃图 / 热力图 | 均渲染，图例与说明文字齐全（`--error/--warning/--success` 语义色在浅色与深色主题下都有定义） |
| λ=0 | 校正量 0、逐点恒等、无名次变化（默认态无副作用） |
| λ=1（键盘 Home/End 驱动滑块） | 讲师二校正量 +4.3pp、讲师 −6.4pp；总分变化 0 分；2 名考生名次互换；名次表里 98→94、48→44、45→51 与手算一致 |
| 保存参数 | 落库 `grading_fairness_profile(fk_flow_id=101, lambda=1, judger_weights={}, updated_by=<部长 uid>)`；刷新后 λ 仍为 1.00（读回路径通） |
| 权限 | 部长可进；页面在 role ≥ 3 之外一律重定向 `/dashboard` |

### 12.4 演示数据（已落库）
现有 seed 每个流程只有 1 名阅卷人（§14），页面只能展示「不可判定」状态。因此把 flow 101 改为 **uid 2（讲师）与 uid 11（讲师二）共同批卷**：

- 201、202 两名考生由两人**分别评不同题**（201: uid 2 评 10121/10122、uid 11 评 10123/10124；202 同）⇒ 重叠样本，宽严可辨识；
- 203 只归 uid 2，204/205 只归 uid 11；
- 讲师二的给分整体高约 8%（演示用虚构数据，`scripts/seed-demo-dev.sql` 有注释说明）。

实测（`fitGradingModel` 直接跑这 20 条）：`identifiable=true`、σ̂=2.1pp、τ=7.7pp、讲师二 `rawBias=+4.4pp`（lenient，可信度 0.99）、uid 2 `rawBias=−6.6pp`（strict，可信度 0.98）；λ=1 时两人平均得分率从 77.5%/62.7% 收敛到 73.2%/69.2%。这组数据同时演示了 §2.1 的共线：不校正时「讲师二看起来只是给分高」，校正后才看出差异其实来自题目与考生的分配。

---

## 13. 局限与升级路径

| 局限 | 后果 | 升级 |
|---|---|---|
| 加法假设（无交互） | 讲师在不同题型上的宽严差异被平均掉 | 加 $(j \times p)$ 交互项；热力图可先行预警 |
| 正态/同方差近似，未建模 0/满分边界 | 天花板效应强的题目上残差非正态 | 多面 Rasch（部分计分模型，logit 尺度） |
| 无多重比较校正 | 讲师多时假阳性上升 | Bonferroni / FDR；或只报区间不给标签 |
| 讲师标准随时间漂移（按流程汇总） | 跨月阅卷被当成同一标准 | 时间分块效应（按周/月分组） |
| 部长覆盖评分会改写 `fk_judger_id` | 归属被污染，宽严算到覆盖者头上 | 用 `operation_audit` 还原原始评分人 |
| 无重叠则不可辨识 | 现状即如此 | **随机双评抽检**（按设计保证可辨识，并可算 ICC / Krippendorff α 做仲裁） |
| 校正写回官方成绩 | 模型误差变成对考生的误差 | 先做「复核队列」：只把 $|z|>2.5$ 的卷子推给人工复核 |

---

## 14. 当前数据可行性（实测，dev 库）

```
user_point：52 行，归属率 100%（无 fk_judger_id 为空），阅卷人 3 名（uid 2/206/210，观测 32/10/10）

flow 101 软研春季笔试  阅卷人 1  考生 5  题目 4  评分行 18   被≥2名讲师评过的考生 0
flow 103 软研秋季笔试  阅卷人 1  考生 4  题目 4  评分行 14   被≥2名讲师评过的考生 0
flow 133 多媒体笔试    阅卷人 1  考生 3  题目 4  评分行 10   被≥2名讲师评过的考生 0
flow 137 电子部笔试    阅卷人 1  考生 3  题目 4  评分行 10   被≥2名讲师评过的考生 0
```

结论：

1. **现在算不出任何讲师的宽严**——每个流程只有 1 名阅卷人，关联图是星形，$\gamma$ 与 $\alpha+\beta$ 完全共线。页面必须以「不可判定」呈现，这是正确行为，不是 bug。
2. **样本量也不够**：检出宽严差 $\delta$ 所需观测数（双侧 $\alpha=0.05$、power 0.80、$\sigma\approx0.10$）：

   | $\delta$ | 每名讲师需要 |
   |---|---|
   | 10 个百分点 | ~16 |
   | 5 个百分点 | ~63 |
   | 2.5 个百分点 | ~250 |

   对照现状：uid 2 有 32 条（约可检出 7pp），uid 206/210 各 10 条（约 12.5pp）。
3. **真正提升公平性的第一杠杆是流程设计（随机双评抽检），不是模型**。模型是第二杠杆：它让已有的重叠数据产生可解释的结论。
4. 算力无忧：参数数 $p = C+P+J-2$，典型流程 $p \approx 10$（微秒级），极端 $p \approx 800$ 时 LU 约 0.2s，一次页面加载算一次。

---

## 附录 A：公式汇总

```
得分率        r = clip(y / M, 0, 1)
模型          r = μ + α(c) + β(p) + γ(j) + ε,  Σα = Σβ = Σγ = 0
参数数        p = C + P + J − 2
可辨识        rank(X) = p        （分量内）
估计          (XᵀX)θ̂ = Xᵀr  → LU（部分主元）；秩亏则加岭 1e-6·max diag 并标记不可辨识
自由度        df = N − rank,  σ̂ = sqrt(RSS/df)
标准误        s_j = σ̂·sqrt(c_jᵀ(XᵀX)⁻¹c_j),  c_j = e_j − Σ_k (n_k/N)e_k
居中          δ_j = γ̂_j − Σ_k n_k γ̂_k / N
τ²(DL)        τ² = max(0, (Q − (J_eff−1))/C)
可信度        w_cred(j) = τ²/(τ² + s_j²),  bias(j) = w_cred(j)·δ_j
判定          δ_j ∓ 1.96 s_j 是否跨越 0
校正          r′ = clip(r − λ·m_j·bias(j) + λ·O, 0, 1),  O = Σ_k n_k m_k bias(k) / N
守恒          Σ_j n_j (r′ − r) = 0（截断与舍入前）
```

## 附录 B：术语表

| 术语 | 口径 |
|---|---|
| 宽严（severity / leniency） | $\gamma_j$：同考生同题目下，该讲师得分率相对全体加权平均的系统性偏移；正 = 偏松 |
| 宽严估计 `bias` | 收缩后的 $\mathrm{bias}(j)$，是**相对**偏移，不是「判错量」 |
| 可信度 | 收缩权重 $w_\text{cred}$，样本越少越接近 0；数据给出，不可手改 |
| 人工权重 $m_j$ | 使用者对模型之外因素的修正倍数，默认 1 |
| 校正强度 $\lambda$ | 全局政策旋钮，0 = 只看不校 |
| 统一偏移 $O$ | 保持整体均分不变的记账平移，不是任何人的宽严 |
| 不可辨识 | 设计矩阵秩亏（例如每名讲师独占一批互不相交的考生与题目），此时 $\gamma$ 不可估 |
| 连通分量 | 关联图中互相可达的 (考生, 题目, 讲师) 集合；分量之间不可比，各自有截距 |
