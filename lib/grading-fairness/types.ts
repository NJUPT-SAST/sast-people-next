/**
 * 阅卷公平性分析的数据契约（纯类型，无副作用，服务端与客户端共用）。
 *
 * 观测 r = points / maxPoints 同时受「考生水平 + 题目难度 + 讲师宽严 + 噪声」影响：
 *   r = μ + α(考生) + β(题目) + γ(讲师) + ε
 * 只有讲师之间在考生或题目上存在重叠时，γ 才可辨识；**逐个讲师**判定（设计矩阵零空间），
 * 不可辨识的讲师一律报「不可判定」，绝不给出一个任意的校正值，也不牵连同分量的其他讲师。
 *
 * 该分析**仅供人工参考**：不写回 user_point，不影响官方成绩。
 */

/** 一次「某讲师给某考生的某道题打分」的观测（user_point 一行 + 题目满分）。 */
export type GradingObservation = {
  /** 考生 = user_flow.id */
  userFlowId: number;
  problemId: number;
  /** 阅卷人 = user_point.fk_judger_id（Link 用户 ID） */
  judgerId: number;
  points: number;
  maxPoints: number;
};

/** 讲师宽严判定：显著偏松 / 无显著差异 / 显著偏严 / 样本不足或不可辨识。 */
export type JudgerVerdict = "lenient" | "fair" | "strict" | "unknown";

export type JudgerEstimate = {
  judgerId: number;
  observationCount: number;
  candidateCount: number;
  /** 该讲师观测的题目满分之和（统一偏移按它加权，于是整届原始总分守恒） */
  maxPointsSum: number;
  /** 原始平均得分率（未校正，受题目与考生构成影响） */
  rawMeanRatio: number;
  /** 校正后平均得分率（λ=1、人工权重=1、保持整体总分时） */
  adjustedMeanRatio: number;
  /** 收缩前的宽严估计（得分率差，正 = 偏松）；不可辨识时为 0 */
  rawBias: number;
  /** 经验贝叶斯收缩后的宽严估计 —— 实际用于校正的值 */
  bias: number;
  /** 相对**所在可比簇**加权的标准误；不可辨识或残差尺度缺失时为 null */
  standardError: number | null;
  /** 可信度权重 0..1（收缩权重，样本越少越接近 0） */
  credibility: number;
  /** 是否与其他讲师两两可比（落在某个可比簇里） */
  identifiable: boolean;
  /** 可比簇序号（≥0）；-1 = 不可判定（没有其他讲师与之可比） */
  clusterIndex: number;
  verdict: JudgerVerdict;
};

export type GradingModelFit = {
  observationCount: number;
  /** 因满分非正、讲师缺失等原因被排除的观测数 */
  skippedObservationCount: number;
  /** 因 points > maxPoints 被截断到满分的观测数 */
  clampedObservationCount: number;
  candidateCount: number;
  problemCount: number;
  judgerCount: number;
  /** 残差标准差（得分率单位）；自由度不足或拟合完美时为 null */
  residualSd: number | null;
  /**
   * 讲师之间真实差异的标准差（收缩强度 τ）。
   * 在**全部可比讲师**上合并估计（各可比簇内部已各自居中，量纲一致）；簇内讲师太少时
   * 逐簇估计的矩估计噪声过大，所以 v1 合并估计。无任何可比讲师时为 0。
   */
  betweenJudgerSd: number;
  /** 是否**全部**讲师两两可比（等价于每个讲师都落在某个可比簇里） */
  identifiable: boolean;
  /** 连通分量数（(考生,题目,讲师) 关联图） */
  componentCount: number;
  /** 分量内全部讲师都落在同一个可比簇里的分量数（整组可比） */
  identifiableComponentCount: number;
  /** 可比簇数量（每簇 ≥2 名两两可比的讲师） */
  clusterCount: number;
  /** 落在可比簇里的讲师数（可比簇之外的是「不可判定」的孤立讲师） */
  comparableJudgerCount: number;
  /**
   * 重建拟合值用的效应（键为 id 的字符串形式，**未收缩、未居中**）：
   * `fitted = candidateEffects + problemEffects + judgerEffects`。
   * 考生效应里折入了所在连通分量的截距（存在多个互不相连的阅卷小组时截距各不相同）。
   * 报告用的宽严估计请用 `judgers[].bias`（已收缩 + 已居中）。
   */
  candidateEffects: Record<string, number>;
  problemEffects: Record<string, number>;
  judgerEffects: Record<string, number>;
  judgers: JudgerEstimate[];
};

export type FairnessAdjustmentOptions = {
  /** 全局校正强度 0..1；0 = 只看不校 */
  lambda: number;
  /** 人工权重（按讲师 ID 覆盖，默认 1，范围 0..2） */
  judgerWeights?: Record<string, number>;
  /**
   * 是否保持整届**原始总分**不变（默认 true）：把全体讲师的加权平均校正量按题目满分
   * 加权后补回，于是校正只重新分配分数、不抬高或压低整届总分。
   */
  preserveTotal?: boolean;
};

export type GradingLeaderboardRow = {
  userFlowId: number;
  observationCount: number;
  rawPoints: number;
  maxPoints: number;
  adjustedPoints: number;
  rawRatio: number;
  adjustedRatio: number;
  /** 名次（1 为最高，并列同名次） */
  rawRank: number;
  adjustedRank: number;
  /** 正 = 校正后名次上升 */
  rankDelta: number;
};
