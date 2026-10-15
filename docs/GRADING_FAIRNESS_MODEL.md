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
| 审计留痕与长期归档报表 | 参考用途，先把模型与可视化做对 |

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

### 3.1 讲师级判据：零空间

要报告的量是**讲师之间的差** $\gamma_j-\gamma_k$，所以可辨识性也按**这一对**来问，而不是问整个分量满不满秩：

```
γ_j − γ_k 可估  ⟺  (e_j − e_k) ⊥ null(X)        （差向量与设计矩阵零空间正交）
```

实现：对 Gram 矩阵 $A = X^\top X$ 做一次消元，同时得到**正交归一零空间基**（`nullSpaceBasis`，维数 $= p - \mathrm{rank}(X)$，见 `lib/grading-fairness/matrix.ts`）；把每对讲师的差向量与基逐个做点积，绝对值 $\le 10^{-7}$（`CONTRAST_TOLERANCE`）即视为落在行空间里。真实数据里这个点积要么是消元噪声（$\lesssim10^{-12}$）、要么是 $O(0.1\sim1)$，中间地带不存在。

**「可估」可传递**：$(\gamma_j-\gamma_k)$ 与 $(\gamma_k-\gamma_l)$ 都可估 $\Rightarrow$ $(\gamma_j-\gamma_l) = (\gamma_j-\gamma_k)+(\gamma_k-\gamma_l)$ 也可估。于是「两两可比」在讲师集合上是一个等价关系，划分出若干**可比簇**（comparable cluster）：**这是本模型的最小可比单元**——只有同一簇内的讲师才能互相比较、互相居中（§4）；簇与簇之间、以及簇外的孤立讲师之间**不可比**。

- 一名讲师**孤立**（他的考生没有任何别的讲师评过，分量里其他讲师也与他不可比）时，只让他自己 `clusterIndex = -1`、`identifiable = false`，**不再让整个分量不可判定**：同分量里其他互相重叠的讲师照常出估计。这是相对「分量满秩才算可辨识」的关键行为变化。
- `clusterCount` = 可比簇数量（每簇 $\ge2$ 名讲师）；`comparableJudgerCount` = 落在可比簇里的讲师数；每名讲师的 `clusterIndex` $\ge0$ 表示所属簇，$-1$ 表示不可判定。
- 分量级的秩判定仍然保留并输出（`componentCount`、`identifiableComponentCount`），只是它的语义变了：`identifiableComponentCount` 现在数的是「**分量内全部讲师都落在同一个可比簇**的分量」，而不是「能否给出任何估计」。`GradingModelFit.identifiable` 也改为「**全部**讲师两两可比」。

结构性必要条件（便于理解与向使用者解释，但**不充分**）：

1. 关联图连通（否则拆分量）；
2. 观测数 $N \ge p$；
3. 每名讲师都至少与另一名讲师在**同一考生**或**同一题目**上出现（即存在重叠）——这是簇内可比的必要条件，不满足就必然孤立。

**为什么不用经验法则代替零空间判定**——反例：只有两条观测 $(c_1,p_1,j_1)$、$(c_1,p_2,j_2)$。关联图连通、两名讲师确实「在同一考生上重叠」，但 $N=2 < p=3$，秩为 2：把 $\gamma_1$ 抬 0.1、同时把 $\alpha_1$ 压 0.1，拟合完全相同。此时 $(\gamma_1-\gamma_2)$ 与零空间不正交 ⇒ 两名讲师各自成簇、都是孤立讲师，任何「校正」都是任意的。

### 3.2 秩亏与岭回退

- 满秩就用 LU 精确求解（哪怕分量里只有 1 名讲师：拟合值仍要准）。
- 秩亏时给正规方程加岭 $\lambda_r = 10^{-6}\cdot\max_i A_{ii}$ 得到一个**有界**解。**该岭解只用于重建拟合值 $\hat r$ 与画残差图**（$\hat r$ 是 $r$ 在列空间上的投影，与岭挑出的那个解无关）；**绝不进入宽严、标准误、收缩与校正**。
- 回代前，对比向量先**投影到可估子空间**（把零空间分量抹掉），否则岭解会把这些分量放大成天文数字（§4）。
- 不可判定的讲师一律：`rawBias = 0`、`bias = 0`、`credibility = 0`、`standardError = null`、`verdict = "unknown"`、`clusterIndex = -1`；`maxPointsSum` 与观测数等描述性字段照常输出。
- 页面必须显式显示「不可判定」，并说明原因（可比簇数 / 可比讲师数 / 分量数 / 秩），**不得**显示一个看起来精确的数字。

> 当前生产数据的实际情形：每个流程只有 1 名阅卷人，$\gamma$ 与 $\alpha+\beta$ **完全共线**，所有讲师都不可判定（见 §14）。

---

## 4. 估计（分量内最小二乘，簇内居中）

正规方程：$A\hat\theta = b$，其中 $A = X^\top X$（$p\times p$）、$b = X^\top r$，按观测稀疏累加（每条观测只有 4 个非零列）。

- 秩判定与求解均用**带部分主元的高斯消元**；秩容差 $10^{-9}\cdot\max_i A_{ii}$（见 `lib/grading-fairness/matrix.ts`）。
- 满秩 → LU 求解；秩亏 → 加岭重解，**仅用于拟合值与残差图**（§3.2）。
- 拟合值 $\hat r = \mu + \hat\alpha + \hat\beta + \hat\gamma$（实现里截距折进考生效应，即 `candidateEffects + problemEffects + judgerEffects`）；残差平方和 $\mathrm{RSS} = \sum (r - \hat r)^2$。
- 自由度 $\mathrm{df} = N - \mathrm{rank}$；$\hat\sigma = \sqrt{\mathrm{RSS}/\mathrm{df}}$，$\mathrm{df} \le 0$ 时 $\hat\sigma = \mathrm{null}$（此时不给标准误）。

**簇内居中**：讲师 $j$ 只与**它所在可比簇**内的讲师比较（§3.1）——不同簇的参照系与截距不同，跨簇相减没有意义：

```
δ_j = γ̂_j − Σ_{k∈簇} (n_k / N_簇) · γ̂_k        N_簇 = Σ_{k∈簇} n_k
```

于是**簇内**精确满足 $\sum_{k\in\text{簇}} n_k\,\delta_k = 0$；整届层面的守恒由按满分加权的统一偏移 $O$ 保证（§7）。

**标准误**：报告量是「相对**所在可比簇**加权平均」的对比，对比向量（删参照的参数化下，$e_k$ 为讲师 $k$ 的效应列，参照讲师 $e_\text{ref} = 0$）

```
c_j = e_j − Σ_{k∈簇} (n_k / N_簇) · e_k
γ̂_j − γ̄_簇 = c_jᵀ θ̂
s_j = σ̂ · sqrt( c_jᵀ A⁻¹ c_j )
```

对比向量在回代前先**投影到可估子空间**（`projectOut`：逐个减去它在零空间基上的分量），把浮点噪声残留的零空间分量抹掉——否则岭解会把这点噪声放大成天文数字的标准误。

实现：一次 LU 分解，簇内每名讲师一次回代求 $A^{-1}c_j$；只算讲师对比，不算全矩阵逆（$O(p^3/3 + Jp^2)$）。

---

## 5. 经验贝叶斯收缩（小样本讲师自动回归 0）

目的：$n_j$ 很小的讲师，$\delta_j$ 噪声极大，直接校正会引入比偏差本身更大的误差。

先估讲师之间的**真实**差异尺度 $\tau$（DerSimonian–Laird 矩估计）：

```
w_j = 1 / s_j²            δ̄_w = Σ w_j δ_j / Σ w_j            Q = Σ w_j (δ_j − δ̄_w)²
C   = Σ w_j − Σ w_j² / Σ w_j
τ²  = max( 0, (Q − (J_eff − 1)) / C )
```

**在全部可比讲师上合并估计**：上式里的 $\delta$、$s$、$J_\text{eff}$ 取的是**所有可比簇的讲师**（各簇内部已各自居中，量纲一致，可以直接放在一起做矩估计）。这是一个**有意的简化**：一个可比簇里往往只有 2~3 名讲师，逐簇做矩估计的噪声比合并估计还大；v1 宁可牺牲「每簇各自的异质性尺度」，也要一个稳的 $\tau$。局限与升级见 §13。

**护栏**：$J_\text{eff} < 2$（有效讲师数，$s_j>0$ 的讲师）或 $C \le 0$ 时 $\tau^2 := 0$。**没有任何可比讲师**时也 $\tau^2 := 0$：此时 `betweenJudgerSd = 0` 是**假零**——不是「讲师之间没有差异」，而是**根本没有估计**（不可判定，见 §8）。

可信度与收缩估计：

```
w_cred(j) = τ² / (τ² + s_j²) ∈ (0, 1]        s_j = null 时取 0
bias(j)   = w_cred(j) · δ_j                  ← 这是真正用于校正的量
```

**$\tau^2 = 0$ 是一个有意义的结果**：数据无法证明讲师之间存在系统性差异，此时全部 `bias = 0`、$\lambda$ 失效、页面显示「未检测到讲师间系统性差异」。这是最保守也最常见的正确结论，不允许用「强行放大 $\tau$」的方式掩盖它。注意 $\tau^2 = 0$ 只关掉**校正**（`credibility` 与 `bias`），**不**改变 `verdict`（§6）。

`betweenJudgerSd = sqrt(τ²)` 一并输出，供界面解释收缩强度。

---

## 6. 判定（verdict）

对每个讲师用**收缩前**的 $\delta_j$ 与 $s_j$ 做双侧 95% 区间：

```
s_j 可用且可辨识：
  δ_j − 1.96·s_j > 0  →  "lenient"  （偏松）
  δ_j + 1.96·s_j < 0  →  "strict"   （偏严）
  否则                 →  "fair"     （无显著差异）
s_j 不可用（null 或 ≤ 0）/ 不可辨识 →  "unknown"  （样本不足或设计不可辨识）
```

**`verdict` 与 `credibility`/`bias` 是两个不同的问题，必须分开读**：

| | 问的问题 | 用的量 | 输出 |
|---|---|---|---|
| `verdict` | 「证据足以说明这名讲师与**簇内**同侪不同吗？」 | **收缩前**的 $\delta_j$、$s_j$（§4） | 偏松 / 无显著差异 / 偏严 / 不可判定 |
| `credibility` + `bias` | 「该按多大力度**改分**？」 | **收缩后**的 $w_\text{cred}(j)\cdot\delta_j$（§5） | 校正量（可能被 $\tau^2$ 压到 0） |

于是 $\tau^2 = 0$（§5）时会出现「**个体显著、总体无异质性证据**」：`credibility = 0`、`bias = 0`、**不做任何校正**，但个别讲师仍可能带着 `lenient` / `strict` 标签。这是**有意的模型契约**，不是矛盾：$\tau^2$ 估计的是「全部可比讲师之间**是否有**系统性差异」，$s_j$ 衡量的是「这一名讲师的区间有多窄」；小样本下前者可以估成 0，而后者恰好很窄。**界面必须注解这一点**（判定 ≠ 校正：本页对这名讲师不做任何分数调整），并**不校正**。

**不做多重比较校正**：$J$ 名讲师各自 95% 区间的族错误率约为 $1-0.95^J$。因此界面**必须同时给出区间**而不是只给标签；`fair` 的解释口径是「证据不足」而非「证明无差异」。（Bonferroni 选项列入 §13 升级路径。）

---

## 7. 校正语义与不变量

校正定义（对每条观测）：

```
r′ = clip( r − λ · m_j · bias(j) + λ · O , 0 , 1 )
O  = Σ_j ( m_j · bias(j) · M_j ) / Σ_j M_j       ← 统一偏移（cohort offset），按题目满分加权
M_j = 该讲师观测的题目满分之和                    ← 输出字段 maxPointsSum
adjustedPoints = clip( round( r′ · M ), 0 , M )
```

| 参数 | 含义 | 取值 | 谁定 |
|---|---|---|---|
| $\lambda$ | 全局校正强度（政策旋钮） | 0..1，0 = 只看不校 | 使用者，按 flow 持久化 |
| $m_j$ | 人工权重（模型看不到的因素，如当天状态、题目分配特殊） | 0..2，默认 1 | 使用者，按 flow 持久化 |
| $w_\text{cred}(j)$ | 可信度权重 | 自动 | 数据（§5），**不可手改** |
| $O$ | 统一偏移 | 自动 | 由「保持整届原始总分不变」开关决定 |

**统一偏移必须按题目满分加权**（相对旧口径的关键修正）：原始分是 $y = M\cdot r$（得分率 × 满分），所以「整届原始总分不变」要求的是 $\sum_i M_i\,(r'_i - r_i) = 0$。按**观测条数**加权（旧口径 $O = \sum_k n_k m_k \mathrm{bias}(k)/N$）只能保证「得分率之和」守恒，各题满分不同时总分照样会漂：

> **数值例子**：两名讲师各评 1 条，甲评的题满分 100、乙评的题满分 10；$m=1$、$\lambda=1$、$\mathrm{bias}(\text{甲}) = +0.10$、$\mathrm{bias}(\text{乙}) = -0.10$。
>
> - 按条数加权：$O = (0.10 - 0.10)/2 = 0$ ⇒ 甲那条 $+10$ 分、乙那条 $-1$ 分，整届总分 $+9$ 分（漂了）。
> - 按满分加权：$O = (0.10\times100 - 0.10\times10)/110 = +0.0818$ ⇒ 甲那条 $+10 - 8.18 = +1.82$ 分、乙那条 $-1 - 0.82 = -1.82$ 分，整届总分 $0$。
>
> 一份卷子里混排 100 分题与 10 分题时，旧口径实测能让整届总分漂出 20+ 分。

**不变量（必须成立，且要单测）**

1. **整届原始总分守恒**（`preserveTotal = true`，默认）：$\sum_i M_i\,(r'_i - r_i) = -\lambda\sum_j m_j M_j \mathrm{bias}(j) + \lambda O \sum_j M_j = 0$，故 $\left|\sum \text{adjustedPoints} - \sum \text{points}\right| \le N/2$（每条整数舍入）$+$ 截断质量。校正只**重新分配原始总分**，不抬高或压低整届总分。
2. **保序（带前提）**：同一讲师的所有观测各自减去同一个常数 $\lambda m_j \mathrm{bias}(j) - \lambda O$，所以
   - 前提成立时保序：**同一名考生**的题目集合与满分结构相同（只是评卷讲师不同）⇒ 该考生的**总分变化**可与其他同样结构的考生比较，名次不会因题目构成差异而翻转；
   - 前提不成立时名次**可以翻转**（反例）：考生 A 的两道 100 分题都由偏松讲师（$\mathrm{bias}=+0.10$）评，考生 B 的两道 100 分题都由偏严讲师（$\mathrm{bias}=-0.10$）评，两人原始总分相同（各 $140/200$）。$\lambda=1$、$m=1$、$O=0$ 时 A 变成 $140-20=120$、B 变成 $140+20=160$，B 反超 A。这正是校正的目的（把讲师宽严从总分里剥掉），所以**不能笼统宣称「保序」**；
   - 唯一无条件的保序在**得分率层面**：同一讲师评的每条观测拿到同一个得分率偏移，所以同一讲师所评观测的得分率次序不变；**总分层面**只对同一名考生（或题目集合与满分结构完全相同的考生）成立——同一讲师评的两名考生，若题目集合或满分结构不同，汇总成总分后名次仍可能翻转（`lib/grading-fairness/model.test.ts` 有对应用例）。
3. **$\lambda = 0$ 恒等**：`adjustedPoints === points`，名次完全一致（界面默认即此状态）。两者都按**当前满分**截断：$y > M$ 时原始分与校正分**都等于满分 $M$**（`clampPoints` / `adjustedPoints` 各自截到 $[0, M]$），不会出现「校正把分数抬过满分」。
4. **$\tau^2 = 0$ ⇒ 无校正**：全部 `bias = 0` ⇒ $O = 0$ ⇒ 恒等。

**必须写进界面与文档的解释**：`bias(j)` 是「该讲师相对**同簇**同侪的**相对**系统性偏移」，不是「该讲师判错了多少」；$O$ 是记账用的统一平移，**不是**对任何人的宽严估计（尤其对可信度为 0 的讲师，其行上的偏移完全来自 $O$）。

**截断与舍入**：$r'$ 被截到 $[0,1]$ 会破坏精确守恒（被压到边界的观测不再参与再分配），这是有意的——校正不得把分数推到满分之上。界面在守恒性提示里给出实际偏差量。

---

## 8. 退化与边界情形（实现必须逐条处理）

| 情形 | 行为 |
|---|---|
| 观测为空 | 返回空 fit（`observationCount=0`、`identifiable=false`、`clusterCount=0`、`comparableJudgerCount=0`、`judgers=[]`），不抛错 |
| $M \le 0$ 或讲师缺失 | 跳过并计入 `skippedObservationCount` |
| $y > M$ | 截断并计入 `clampedObservationCount` |
| 只有一个讲师 | 该讲师必然孤立（没有任何可比对象）⇒ `clusterIndex=-1`、`identifiable=false`、`verdict="unknown"`、`bias=0`、无校正。**注意**：这只影响他自己，不再让同 flow 里其他互相重叠的讲师跟着变「不可判定」 |
| **孤立讲师**（他的考生没有任何别的讲师评过，即使同分量里还有别的讲师） | 只他本人 `clusterIndex=-1` / `identifiable=false` / `unknown` / 不校正；同分量其他可比讲师照常出估计。他不进入 $\tau^2$ 的估计（§5），也不参与统一偏移 $O$（其 `bias=0`） |
| **分量内多个可比簇** | 每簇**各自居中**、各自算标准误（§4）；`clusterIndex` 按簇大小排序递增（大簇在前），簇内按偏松→偏严排；界面按簇分组呈现并标注「簇间不可比」（§10.0）。$\tau^2$ 在所有可比讲师上**合并**估计（§5） |
| 多个互不相连的阅卷小组 | 各自拟合（各自截距），可辨识性按分量分别判定；`componentCount` / `identifiableComponentCount` / `clusterCount` / `comparableJudgerCount` 输出到界面 |
| 秩亏（如 §3.1 反例） | 加岭求有界解，**仅用于拟合值与残差图**；相关讲师因差向量与零空间不正交而**各自孤立** ⇒ 不校正、标记不可判定 |
| $\mathrm{df} \le 0$ | $\hat\sigma = \mathrm{null}$，全部 $s_j = \mathrm{null}$，全部 `unknown`、不校正；点估计 $\delta_j$、`clusterIndex` 与 `maxPointsSum` 仍如实输出 |
| $\hat\sigma = 0$（合成数据完美拟合） | 低于 $10^{-9}$（得分率单位）一律视为「没有残差尺度」：$\hat\sigma := \mathrm{null}$、$s_j = \mathrm{null}$、`credibility = 0`、`unknown`、不校正。真实阅卷数据不可能出现零残差，这里报「无限置信度」只会误导；点估计 $\delta_j$ 仍如实输出 |
| 某讲师 0 条观测 | 不出现在 `judgers[]`；其观测不存在 |
| **无可比讲师**（`comparableJudgerCount = 0`） | `identifiable=false`、`betweenJudgerSd = 0`（**假零**：没有估计，不是没有差异，§5）；页面**仍渲染**残差热力图与名次表（此时名次恒等），森林图 / 哑铃图 / λ + 人工权重 / 保存按钮都不渲染、改用「讲师阅卷量（描述性）」表（与热力图、名次表并存），指标行的 $\tau$ 显示 `—`（§10.0） |

---

## 9. 输出契约

类型定义在 `lib/grading-fairness/types.ts`（服务端 / 客户端共用，全部可 JSON 序列化）：

```ts
type GradingObservation = { userFlowId: number; problemId: number; judgerId: number; points: number; maxPoints: number };

type JudgerVerdict = "lenient" | "fair" | "strict" | "unknown";

type JudgerEstimate = {
  judgerId: number; observationCount: number; candidateCount: number;
  maxPointsSum: number;      // 该讲师观测的题目满分之和（统一偏移按它加权，§7）
  rawMeanRatio: number;      // 未校正平均得分率（受题目/考生构成影响）
  adjustedMeanRatio: number; // λ=1、m=1、保持整届总分时的平均得分率
  rawBias: number;           // 收缩前、已按所在可比簇居中的 δ_j
  bias: number;              // 收缩后，用于校正
  standardError: number | null; // 相对所在可比簇加权的标准误
  credibility: number;
  identifiable: boolean;     // 是否与其他讲师两两可比（落在某个可比簇里）
  clusterIndex: number;      // 可比簇序号（≥0）；-1 = 不可判定（没有可比对象）
  verdict: JudgerVerdict;
};

type GradingModelFit = {
  observationCount: number; skippedObservationCount: number; clampedObservationCount: number;
  candidateCount: number; problemCount: number; judgerCount: number;
  residualSd: number | null; betweenJudgerSd: number;
  identifiable: boolean;              // 是否「全部讲师两两可比」
  componentCount: number;             // 连通分量数
  identifiableComponentCount: number; // 分量内全部讲师落在同一可比簇的分量数
  clusterCount: number;               // 可比簇数量（每簇 ≥2 名讲师）
  comparableJudgerCount: number;      // 落在可比簇里的讲师数
  candidateEffects: Record<string, number>; // 已折入分量截距
  problemEffects: Record<string, number>;
  judgerEffects: Record<string, number>;
  judgers: JudgerEstimate[];          // 可判定在前（按簇分组、簇内偏松→偏严），不可判定最后
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
2. **结论条**：图标 + 粗体标题 + 说明。**检出偏离**时列出偏离最大的 3 名讲师（**只数 `credibility > 0` 的讲师**）、各多少个百分点、λ=1 时多少名考生名次变化、能可靠检出多大的差异，并注明「整届总分不变（按满分加权）」。**算不出时**按原因分支：讲师数 = 1 / `componentCount > 1`（多个互不相连的阅卷小组）/ `componentCount = 1` 但无可比讲师（说明「讲师之间没有考生交叉；共享题目并不能分离宽严，需要同一名考生被 ≥2 名讲师评过」）/ 没有任何评分记录。**有可比讲师但全部 `credibility = 0`**（$\tau^2 = 0$）⇒ 标题「未检测到讲师之间的系统性差异」，并追加「另有 N 名讲师个体上达到显著阈值，但总体异质性证据不足，不做任何校正」——这就是 §6 的「判定 ≠ 校正」，界面**必须**注解。**$\tau^2 > 0$ 但无人个体显著** ⇒ 同一标题但改说「只按整体异质性做保守收缩，不点名任何讲师」，**不得**声称「校正不会改变任何结果」。
3. **关键指标行**：固定 6 格（评分观测（hint 考生数）、题目、阅卷讲师、**可比讲师**（值 `comparableJudgerCount / judgerCount`，hint「可判定阅卷组 `identifiableComponentCount / componentCount`」）、$\tau$（`comparableJudgerCount === 0` 时显示 `—`，hint「无可比讲师」）、$\hat\sigma$），不随条件增减，避免出现孤行；「可检出差异」写在结论条里，「未记录阅卷人」也写进结论条。`clusterCount` 与簇内成员写在讲师宽严各处的**簇分隔标签**上（§10.1）。
4. **讲师宽严与校正**：一行两栏（左 `minmax(0,1fr)`、右 `19rem`），两栏**等高**。左栏自上而下 = 森林图 + 判定色例 + 「校正前后平均得分率」哑铃图（上限 26rem 居中，避免被拉伸放大）；右栏 = 校正参数，**一行一名讲师**（名称 / 权重滑块 / 权重值 / 可信度），不换行、不产生第二行小字。森林图、哑铃图与参数面板三处在存在 **≥2 组**（可比簇 + 「不可判定」组）时插入簇分隔标签，单组不插（§10.1）。
5. **名次变化**（整宽）：筛选与导出放在 `CardAction`，表格默认只渲染前 50 行。
6. **诊断与口径**：两栏（各 1/2）—— 左 = 讲师 × 题目残差热力图（自然宽度居中），右 = 四条短句的口径说明（相对量 / 只重新分配（整届原始总分不变）/ 只读 / 不可判定怎么办），不用长卡片堆字。

**布局约束**：同一行的卡片必须等高（默认 stretch，不用 `items-start`），且只把**内容高度相近**的内容放同一行；整宽区块内部要分栏时用「卡片内部两栏 + 分隔线」，不要用「两张高度不一的卡片并排」。所有手写 SVG 都加自然宽度上限（或容器宽度上限），`w-full` 只允许缩小、不允许放大到字号与其它图不一致；含 `overflow-x-auto` 的卡片一律加 `min-w-0`（flex/grid 子项默认 `min-width: auto`，否则整页会被撑出横向滚动）。

**降级规则**：只要**有评分数据**，残差热力图（§10.2）与名次表（§10.4）**始终渲染**——它们只依赖拟合值与残差，与可辨识性无关（无可比讲师时名次表是恒等映射，λ 改不动任何分数）。森林图、哑铃图、λ 滑块、人工权重与**保存按钮**依赖 `comparableJudgerCount > 0`：**没有可比讲师**时这几项都不渲染，其位置放一张「讲师阅卷量（描述性，仅供参考）」表（观测数 / 考生数 / 未校正平均得分率），标注「这些平均分之间不可直接比较」并附「需要重叠」的说明——**该描述性表与热力图 / 名次表并存**。**没有任何评分记录**时页面只剩这张描述性表（热力图与名次表也无可渲染）。给不出结论时，页面必须说清给不出的原因和补救办法。**注意**：只要还有**任何一个**可比簇（`comparableJudgerCount > 0`）就走正常布局，孤立的讲师作为「不可判定」段出现在同一列表里，而不是把整页降级。

### 10.1 讲师宽严森林图（`judgerForestPlot`）
横轴 = 宽严（百分点，0 为中心参考线，刻度在绘图区下方）；每名讲师一个点（$\delta_j$）+ 须线（$\pm1.96s_j$）；点半径随 $n_j$，不透明度随 $w_\text{cred}(j)$；行尾给出该讲师的**宽严数值**（`+4.3pp`）、**判定标签**（偏松 / 无显著差异 / 偏严 / 样本不足）与 $n_j$。不可判定行画空心虚线点（`--muted-foreground`），不画须线。
**按可比簇分组呈现**：按连续相同的 `clusterIndex` 切段（可比簇 ≥0 与「不可判定」组 -1 **都算组**），`组数 > 1` 时插入簇分隔标签，**只有「全部讲师落在同一个可比簇」时才完全不插**（1 个可比簇 + 若干孤立讲师 = 2 组 ⇒ 插两行标签）；文案固定为

```
阅卷组 ${clusterIndex + 1} · ${n} 名讲师 · 仅组内可比
不可判定 · 没有其他讲师评过同一名考生                       （clusterIndex = -1，排最后，不带编号）
```

不同簇的 $\delta_j$ 参照系不同，跨簇比点的高低没有意义。列表顺序与 `fit.judgers` 一致（可判定在前、按簇分组、簇内偏松→偏严）。同样的分隔标签也用在哑铃图（§10.3）与参数面板（§10.5）。
**可读出的结论**：某讲师是否显著偏松/偏严，以及**证据有多弱**（宽须线 = 样本不足）——但只在**同一可比簇内**。
**不可读出的结论**：区间不重叠 ≠ 「一个错了」；跨簇比长短 ≠ 谁更松。

### 10.2 讲师 × 题目 标准化残差热力图（`judgerResidualHeatmap`）
格子的统计量 = **该讲师 × 该题目上全部观测的标准化残差均值**：$\bar z_{j,p} = \operatorname{mean}\{\, (r-\hat r)/\hat\sigma \,\}$（同一格里可能有多条观测，例如同一名讲师给多名考生评同一道题），正值 `--error`、负值 `--success`，不透明度随 $|\bar z|$（饱和于 `maxAbs`，默认 3σ）；格子 `<title>` 必须写清「讲师 · 题目 · 均值 σ · **样本数 n**」（如 `甲讲师 · 题目一 · +1.2σ · n=3`）；无观测的格子写 `… · 无数据 · n=0`，不传 count 时省略 `n=` 部分；行/列标签截断到 6 个字符、完整名在 `<title>`；画布宽度随列数自适应并设**自然宽度上限**，避免在宽卡片里被拉伸放大。行**按可比簇分组**（簇分隔标签与森林图一致，§10.1），孤立讲师排在最后；**簇间不可比**，跨簇比较同一列的颜色没有意义。残差全部为 null（未识别出残差尺度）时改为一行说明，不画空格子。
**可读出的结论**：宽严是否只在**某类题**上出现（结构性问题 ⇒ 加法假设不成立 ⇒ §13 交互模型）。
**不可读出的结论**：$n=1$ 的格子是噪声，不得据此下结论（界面把样本数放在 `<title>` 里）。

### 10.3 校正前后哑铃图（`judgerShiftChart`）
每名讲师的原始平均得分率（空心环 `--muted-foreground`）→ 校正后平均得分率（实心点 `--primary`），两点连线，行尾给出差值（`−4.3pp`）。两点重合（λ=0）时外圈空心环仍可见。行分组与簇分隔标签同森林图（§10.1）。
**可读出的结论**：校正是否真的让讲师之间收敛（模型有效性自检）；不收敛说明 $\tau^2$ 或可信度压制了校正。

### 10.4 名次变化表（用现有 `components/ui/table`）
四列：`名次（原始 → 校正 + Δ 徽标）`、`考生`、`得分（原始 → 校正，表头带满分）`、`得分率（原始 → 校正）`。窄屏隐藏学号并允许横向滚动。
**可读出的结论**：校正对录取结果的实际影响面（多少人、多少名）。
**不可读出的结论**：名次变化不等于「原来判错了」，它是模型下的相对调整。

### 10.5 参数面板
$\lambda$ 滑块（0..1）+「不校正 / 半量 / 全量」快捷按钮、每名讲师的人工权重 $m_j$（0..2，行下标注该讲师的可信度与**当前**校正量；不可判定的讲师也在列表里，但校正量恒为 0 并标注「不可判定」）、**「保持整届原始总分不变」开关**（关掉即统一偏移 $O = 0$，§7）、保存/重置与**未保存改动提示**、以及当前守恒偏差（文案「总分变化 N 分（舍入与截断）· 已保持整届总分 / 未保持整届总分 · M 名考生名次变化」）。列表也按簇分隔标签分组（§10.1）。当某讲师 `credibility === 0` 而 `verdict` 是偏松 / 偏严时，在其判定标签下方另起一行画注解「总体无异质性证据，不校正」（§6）。参数按 flow 持久化（§11）。

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
| 3 | 当前生产形态（每 flow 单讲师、无重叠）⇒ 该讲师孤立 ⇒ `identifiable=false`、`clusterIndex=-1`、`bias=0`、`verdict="unknown"` | 不允许在不可辨识时给数字 |
| 4 | §3.1 的 2 观测反例 ⇒ 秩亏 ⇒ 两名讲师各自孤立、不校正 | 零空间判定生效 |
| 5 | `preserveTotal=true` 时 $\left\lvert\sum \text{adjustedPoints} - \sum \text{points}\right\rvert \le N/2$ | 守恒性 |
| 6 | `lambda=0` 时逐点恒等、名次一致 | 默认无副作用 |
| 7 | 可信度随 $n_j$ 单调不减；$\lvert bias\rvert \le \lvert rawBias\rvert$ | 收缩方向正确 |
| 8 | 名次变化方向：宽松讲师评的考生在校正后整体下移、严格讲师评的整体上移 | 校正方向正确 |
| 9 | 同一讲师内部保序（同一讲师评的观测之间、同一考生的不同题之间） | §7 不变量 2 的无条件部分 |
| 10 | 空输入、$M\le0$、$y>M$、$\mathrm{df}\le0$、$\hat\sigma=0$ 各退化分支 | §8 逐条 |
| 11 | `matrixRank` / `factorize` / `nullSpaceBasis`：奇异矩阵秩 < n、已知线性方程组的解正确、部分主元换行、零空间基正交归一 | 线性代数底座 |
| 12 | 讲师只评自己独占的题目（题目集合互不相交）⇒ 该讲师孤立、不可辨识 | 生产里最常见的共线形态 |
| 13 | 互不相连的阅卷小组各自拟合，`identifiableComponentCount` / `clusterCount` 分别判定 | 多小组场景 |
| 14 | **讲师级可辨识**：同一分量内甲、乙重叠（可比）而丙孤立 ⇒ 甲乙同簇（`clusterIndex≥0`、`identifiable=true`）、丙 `clusterIndex=-1` | 判据是「讲师对可估」而非「分量满秩」（§3.1） |
| 15 | **孤立讲师不牵连他人**：丙不可判定时，甲乙的 `rawBias` / `standardError` / `credibility` 与「数据里只有甲乙」时逐位一致（< 1e-9） | 孤立讲师只让自己不可判定 |
| 16 | **多簇各自居中**：分量内甲乙重叠、丙丁重叠而两组之间无共享考生/题目 ⇒ `clusterCount=2`、两簇各自 $\sum_{k\in\text{簇}} n_k\delta_k = 0$、`clusterIndex` 分别 0/1 | §4 簇内居中 |
| 17 | **不等满分下总分守恒**：满分 100 与 10 混排、两名讲师 `bias` 一正一负 ⇒ `preserveTotal=true` 时总分差 ≤ N/2；同一份数据用按**条数**加权的旧口径重算会漂 > 5 分（反例固定在测试里） | §7 统一偏移按满分加权 |
| 18 | **保序边界**：两名考生题目集合与满分结构相同 ⇒ 校正后名次不变；结构不同 ⇒ 允许翻转，且翻转方向与 `bias` 符号一致（§7 反例可复现） | §7 不变量 2 的前提 |
| 19 | **λ=0 与截断**：`lambda=0` 时 `adjustedPoints === points`；$y>M$ 时原始分与校正分都等于满分 $M$ | 恒等与截断口径（§7 不变量 3） |

### 12.2 集成与图表/面板测试
- `loadGradingFairnessData`：`fk_judger_id` 为空的行计入 `unattributedCount` 且不进模型；跨部门流程返回 `null`；软删除流程返回 `null`；**全局流程只返回本部门考生的观测**（管理员可见全部）；Link 姓名解析失败时仍返回结果、标签为 null。
- `listGradingFairnessFlows`：只列 scope 内有评分记录的流程，`observationCount` 只算已归属行；`scope: none` 返回空数组。
- `saveGradingFairnessProfile` / `loadGradingFairnessProfile`：往返一致、upsert 单行、role 2 拒绝、非法参数拒绝。
- 图表与面板（`components/review/analytics/*.test.tsx`，4 suites / 52 条行为断言，`npx jest components/review/analytics`）：簇分隔标签**仅在组数 > 1 时插入**且文案固定（§10.1）；指标行第 4 格「可比讲师 `comparableJudgerCount / judgerCount`」与 `comparableJudgerCount = 0` 时 $\tau$ 显示 `—`；热力图 `<title>` 的 `n=` 口径（有观测 / 无数据 / 不传 count）；**无可比讲师时热力图与名次表仍渲染、描述性表与它们并存**（§10.0 降级规则）；`credibility === 0` 且 `verdict` 为偏松/偏严时的行内注解「总体无异质性证据，不校正」；λ 驱动校正与保存参数往返。

### 12.3 浏览器 smoke（真实页面，已验证）
以软件研发部部长身份打开 `/dashboard/review/analytics?flowId=101`：

| 检查 | 结果 |
|---|---|
| 状态卡 | 评分观测 20 · 考生 5 · 题目 4 · 阅卷讲师 2 · 可比讲师 2/2（hint「可判定阅卷组 1/1」）· τ = 7.7pp · σ̂ = 2.1pp |
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
| **可比簇内只有 2 名讲师** | $\tau^2$ 的矩估计只有 1 个自由度，噪声大（$Q$ 的抽样波动直接进 $\tau^2$） | v1 在**全部可比讲师上合并估计**（§5，有意简化）；升级：分层贝叶斯，或逐簇估计并同时报告区间 |
| **讲师级可辨识依赖零空间的数值判定** | 容差（`CONTRAST_TOLERANCE = 1e-7`）附近的对比会被判成「可估」或「不可估」；重叠极少的病态设计下标准误巨大 | 报告对比向量的零空间点积（可诊断）；升级：按条件数缩放容差、或用精确消元 |
| **多个可比簇之间不可比** | 不能跨簇比较谁更松，也不能把两簇的 $\delta$ 放在一起排序 | 让**同一名考生**被两簇的讲师评过（各评不同的题），使两簇合并；只让同一道题被两簇评过（不同考生）不够——考生不交叉时考生水平差会顶替讲师差 |
| 某讲师与任何人都无可比重叠 | 该讲师孤立、不可判定（**不再牵连**同分量其他讲师） | **随机双评抽检**（按设计保证可辨识，并可算 ICC / Krippendorff α 做仲裁） |
| 校正写回官方成绩 | 模型误差变成对考生的误差 | 先做「复核队列」：只把 $\lvert z\rvert>2.5$ 的卷子推给人工复核 |

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

1. **现在算不出任何讲师的宽严**——每个流程只有 1 名阅卷人，关联图是星形，$\gamma$ 与 $\alpha+\beta$ 完全共线，该讲师**没有任何可比对象** ⇒ 孤立（`clusterCount = 0`、`comparableJudgerCount = 0`、`betweenJudgerSd = 0` 是**假零**：没有估计，不是「大家一样严」）。页面必须以「不可判定」呈现，这是正确行为，不是 bug。
2. **样本量也不够**：下表是「独立样本、同方差」条件下的**理想化量级**（双侧 $\alpha=0.05$、power 0.80、$\sigma\approx0.10$），**不是**本流程的检出能力承诺——真实数据里 $\hat\sigma$、题目/考生构成的共线与多簇结构都会改变它。页面上的「可检出差异」用的是当前拟合的 $\hat\sigma$ 与各讲师观测数（$2.8\hat\sigma/\sqrt{n}$ 的中位数），口径与下表一致，但数值随数据变：

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
可辨识        γ_j − γ_k 可估 ⟺ (e_j − e_k) ⊥ null(X)   （讲师级；可传递 ⇒ 可比簇）
估计          (XᵀX)θ̂ = Xᵀr  → LU（部分主元）；秩亏则加岭 1e-6·max diag
              （岭解只用于拟合值/残差图，不进宽严、标准误、收缩与校正）
自由度        df = N − rank,  σ̂ = sqrt(RSS/df)
标准误        s_j = σ̂·sqrt(c_jᵀ(XᵀX)⁻¹c_j),  c_j = e_j − Σ_{k∈簇} (n_k/N_簇)e_k  （已投影到可估子空间）
居中          δ_j = γ̂_j − Σ_{k∈簇} (n_k/N_簇) γ̂_k        （簇内居中）
τ²(DL)        τ² = max(0, (Q − (J_eff−1))/C)            （在全部可比讲师上合并估计）
可信度        w_cred(j) = τ²/(τ² + s_j²),  bias(j) = w_cred(j)·δ_j
判定          δ_j ∓ 1.96 s_j 是否跨越 0（收缩前的 δ、s；不做多重比较校正）
校正          r′ = clip(r − λ·m_j·bias(j) + λ·O, 0, 1),  O = Σ_j m_j·bias(j)·M_j / Σ_j M_j
              M_j = 该讲师观测的题目满分之和（maxPointsSum）
守恒          Σ_i M_i (r′_i − r_i) = 0（截断与舍入前）⇒ 整届**原始总分**不变
```

## 附录 B：术语表

| 术语 | 口径 |
|---|---|
| 宽严（severity / leniency） | $\gamma_j$：同考生同题目下，该讲师得分率相对**所在可比簇**加权平均的系统性偏移；正 = 偏松 |
| 宽严估计 `bias` | 收缩后的 $\mathrm{bias}(j)$，是**相对**偏移，不是「判错量」 |
| 可比簇（comparable cluster） | 由「$\gamma_j-\gamma_k$ 可估」这一可传递关系划分出的等价类（`clusterIndex`），**最小可比单元**；只有簇内讲师才能互相比较、互相居中 |
| 孤立讲师 | 没有任何可比对象的讲师：`clusterIndex = -1`、`identifiable = false`、不校正；只影响他自己 |
| 可信度 | 收缩权重 $w_\text{cred}$，样本越少越接近 0；数据给出，不可手改 |
| 人工权重 $m_j$ | 使用者对模型之外因素的修正倍数，默认 1 |
| 校正强度 $\lambda$ | 全局政策旋钮，0 = 只看不校 |
| 统一偏移 $O$ | 按题目满分加权（$M_j$ = `maxPointsSum`）的记账平移，保证整届**原始总分**不变；不是任何人的宽严 |
| 不可辨识 | $\gamma_j-\gamma_k$ 与设计矩阵零空间不正交（例如该讲师独占一批互不相交的考生与题目），此时该对的差不可估 |
| 假零（`betweenJudgerSd = 0`） | 没有任何可比讲师时 $\tau$ 报 0，但这不是「讲师之间没有差异」，而是**根本没有估计**；界面按「不可判定」呈现 |
| 连通分量 | 关联图中互相可达的 (考生, 题目, 讲师) 集合；分量之间不可比，各自有截距 |
