/**
 * 阅卷公平性模型的行为测试（规范 §12.1）。
 *
 * 覆盖：
 *  - 可辨识设计下精确还原讲师宽严，而朴素均值差不能（§2.1 / §3）；
 *  - 现状形态（每流程单讲师）与秩亏反例 ⇒ 不可判定、不校正；
 *  - 讲师级可辨识：孤立讲师只让自己不可判定、可比簇各自居中；
 *  - 收缩方向、可信度单调性；
 *  - 守恒性（按题目满分加权）、λ=0 恒等、保序的前提、校正方向、名次反转；
 *  - 退化分支（空输入、满分非正、超满分、自由度不足、完美拟合）。
 *
 * 阅卷结构约束（来自生产实现）：`user_point` 唯一键是 (考生, 题目)，
 * 因此同一考生的同一道题只可能有一名阅卷人；「重叠」只能表现为
 * 「同一考生由多名讲师分别评不同题」或「同一道题由多名讲师分别评不同考生」。
 * 可辨识性不靠经验法则：一律以设计矩阵的零空间判定，且**逐讲师**判定
 * （「同一道题由多名讲师评不同考生」只有在考生也被交叉时才够用）。
 */

import { fitGradingModel, adjustedRatio, buildLeaderboard, standardizedResidual } from "@/lib/grading-fairness/model";
import type { GradingModelFit, GradingObservation } from "@/lib/grading-fairness/types";

/** 确定性伪随机噪声（避免测试抖动） */
function createNoise(seed: number, amplitude: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state / 4294967296 - 0.5) * 2 * amplitude;
  };
}

function observation(
  userFlowId: number,
  problemId: number,
  judgerId: number,
  ratio: number,
  maxPoints = 1000,
): GradingObservation {
  return { userFlowId, problemId, judgerId, points: Math.round(ratio * maxPoints), maxPoints };
}

type JudgerGroup = {
  judger: number;
  candidates: number[];
  problems: number[];
  severity: number;
};

/** 按「阅卷范围」构造观测：每个 (考生, 题目) 单元只属于一名讲师 */
function buildObservations(
  groups: JudgerGroup[],
  difficulty: Record<number, number>,
  ability: (candidateId: number) => number,
  noise?: () => number,
): GradingObservation[] {
  const rows: GradingObservation[] = [];
  for (const group of groups) {
    for (const candidateId of group.candidates) {
      for (const problemId of group.problems) {
        const ratio =
          ability(candidateId) +
          difficulty[problemId] +
          group.severity +
          (noise ? noise() : 0);
        rows.push(observation(candidateId, problemId, group.judger, ratio));
      }
    }
  }
  return rows;
}

const estimateOf = (fit: GradingModelFit, judgerId: number) => {
  const estimate = fit.judgers.find((candidate) => candidate.judgerId === judgerId);
  if (!estimate) throw new Error(`未找到讲师 ${judgerId} 的估计`);
  return estimate;
};

const mean = (values: number[]) =>
  values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1);

describe("fitGradingModel：可辨识设计与精确还原", () => {
  /* 30 名考生 × 4 道题 × 3 名讲师：各自认领不同的题目子集（真实轮换形态），考生全体共享 */
  const candidateIds = Array.from({ length: 30 }, (_, index) => index + 1);
  const difficulty: Record<number, number> = { 1: 0.08, 2: 0.02, 3: -0.04, 4: -0.1 };
  const groups: JudgerGroup[] = [
    { judger: 11, candidates: candidateIds, problems: [1, 2], severity: 0 },
    { judger: 12, candidates: candidateIds, problems: [3, 4], severity: 0.1 },
    { judger: 13, candidates: candidateIds, problems: [1, 3], severity: -0.1 },
  ];
  const observations = buildObservations(groups, difficulty, (candidateId) =>
    0.55 + ((candidateId * 37) % 21 - 10) * 0.005,
  );
  const fit = fitGradingModel(observations);

  it("关联图连通且满秩时判定为可辨识", () => {
    expect(fit.observationCount).toBe(180);
    expect(fit.componentCount).toBe(1);
    expect(fit.identifiableComponentCount).toBe(1);
    expect(fit.identifiable).toBe(true);
    expect(fit.judgers.every((estimate) => estimate.identifiable)).toBe(true);
  });

  it("精确还原真实宽严（误差 < 1e-6）", () => {
    expect(estimateOf(fit, 11).rawBias).toBeCloseTo(0, 6);
    expect(estimateOf(fit, 12).rawBias).toBeCloseTo(0.1, 6);
    expect(estimateOf(fit, 13).rawBias).toBeCloseTo(-0.1, 6);
  });

  it("朴素均值差被题目分配污染，模型差值则不受影响", () => {
    const naiveDifference = estimateOf(fit, 12).rawMeanRatio - estimateOf(fit, 11).rawMeanRatio;
    const modelDifference = estimateOf(fit, 12).rawBias - estimateOf(fit, 11).rawBias;
    const truth = 0.1;

    /* 讲师 12 认领的是两道更难的题，朴素差值因此把难度算成了「更严」 */
    expect(Math.abs(naiveDifference - truth)).toBeGreaterThan(0.02);
    expect(modelDifference).toBeCloseTo(truth, 6);
  });

  it("完美拟合（无残差尺度）时不做统计推断，也不校正", () => {
    expect(fit.residualSd).toBeNull();
    for (const estimate of fit.judgers) {
      expect(estimate.standardError).toBeNull();
      expect(estimate.credibility).toBe(0);
      expect(estimate.bias).toBe(0);
      expect(estimate.verdict).toBe("unknown");
    }
    /* 点估计仍如实输出，但没有可用于校正的量 */
    for (const row of observations) {
      expect(adjustedRatio(row, fit, { lambda: 1 })).toBeCloseTo(
        row.points / row.maxPoints,
        9,
      );
    }
  });
});

describe("fitGradingModel：现状形态与秩亏反例", () => {
  it("每名讲师独占考生与题目（当前生产数据形态）⇒ 全部不可判定且不校正", () => {
    const observations = buildObservations(
      [
        { judger: 11, candidates: [1, 2], problems: [101, 102], severity: 0 },
        { judger: 12, candidates: [3, 4], problems: [201, 202], severity: 0 },
      ],
      { 101: 0.02, 102: -0.01, 201: -0.02, 202: 0.01 },
      (candidateId) => 0.4 + candidateId * 0.05,
    );
    const fit = fitGradingModel(observations);

    expect(fit.componentCount).toBe(2);
    expect(fit.identifiableComponentCount).toBe(0);
    expect(fit.identifiable).toBe(false);
    expect(fit.judgers).toHaveLength(2);
    for (const estimate of fit.judgers) {
      expect(estimate.identifiable).toBe(false);
      expect(estimate.rawBias).toBe(0);
      expect(estimate.bias).toBe(0);
      expect(estimate.standardError).toBeNull();
      expect(estimate.credibility).toBe(0);
      expect(estimate.verdict).toBe("unknown");
    }
    for (const row of observations) {
      expect(adjustedRatio(row, fit, { lambda: 1 })).toBeCloseTo(row.points / row.maxPoints, 9);
    }
  });

  it("关联图连通但观测数少于参数数 ⇒ 仍然不可辨识（不靠经验法则）", () => {
    const fit = fitGradingModel([
      observation(1, 101, 11, 0.6),
      observation(1, 102, 12, 0.7),
    ]);

    expect(fit.componentCount).toBe(1);
    expect(fit.identifiableComponentCount).toBe(0);
    expect(fit.identifiable).toBe(false);
    expect(fit.judgers.every((estimate) => estimate.rawBias === 0)).toBe(true);
  });

  it("讲师只评自己独占的题目时，其宽严与那批题目的难度共线 ⇒ 不可判定", () => {
    /* 两名讲师共享考生但题目集合互不相交：没有任何观测能把「题难」与「人严」分开 */
    const observations = buildObservations(
      [
        { judger: 11, candidates: [1, 2, 3], problems: [101, 102], severity: 0.1 },
        { judger: 12, candidates: [1, 2, 3], problems: [201, 202], severity: -0.1 },
      ],
      { 101: 0.02, 102: 0.01, 201: -0.01, 202: -0.02 },
      (candidateId) => 0.5 + candidateId * 0.01,
    );
    const fit = fitGradingModel(observations);

    expect(fit.componentCount).toBe(1);
    expect(fit.identifiable).toBe(false);
    expect(fit.judgers.every((estimate) => estimate.verdict === "unknown")).toBe(true);
  });

  it("单名讲师时 γ 无从比较 ⇒ 不可判定，但拟合值仍可重建", () => {
    const observations = buildObservations(
      [{ judger: 11, candidates: [1, 2, 3], problems: [101, 102], severity: 0.2 }],
      { 101: 0.02, 102: -0.02 },
      (candidateId) => 0.5 + candidateId * 0.05,
    );
    const fit = fitGradingModel(observations);

    expect(fit.identifiable).toBe(false);
    expect(fit.judgers).toHaveLength(1);
    expect(estimateOf(fit, 11).verdict).toBe("unknown");
    expect(fit.residualSd).toBeNull();
    expect(standardizedResidual(observations[0], fit)).toBeNull();
  });
});

describe("fitGradingModel：收缩", () => {
  /* 大样本（24）/ 中样本（16）/ 小样本（8）三名讲师，题目子集互相搭接 ⇒ 可辨识 */
  const noise = createNoise(20261015, 0.05);
  const observations = buildObservations(
    [
      { judger: 11, candidates: [1, 2, 3, 4], problems: [2, 4], severity: 0.1 },
      { judger: 11, candidates: [5, 6, 7, 8, 9, 10, 11, 12], problems: [1, 2], severity: 0.1 },
      { judger: 12, candidates: [5, 6, 7, 8, 9, 10, 11, 12], problems: [3, 4], severity: -0.1 },
      { judger: 13, candidates: [1, 2, 3, 4], problems: [1, 3], severity: 0 },
    ],
    { 1: 0.04, 2: 0.01, 3: -0.01, 4: -0.04 },
    (candidateId) => 0.55 + ((candidateId * 37) % 11 - 5) * 0.002,
    noise,
  );
  const fit = fitGradingModel(observations);

  it("设计可辨识，且可信度随样本量单调（大样本 > 小样本）", () => {
    expect(fit.identifiable).toBe(true);
    expect(fit.residualSd).not.toBeNull();

    const big = estimateOf(fit, 11);
    const small = estimateOf(fit, 13);
    expect(big.observationCount).toBe(24);
    expect(small.observationCount).toBe(8);
    expect(big.credibility).toBeGreaterThan(small.credibility);
    expect(big.credibility).toBeLessThanOrEqual(1);
    expect(small.credibility).toBeGreaterThan(0);
  });

  it("收缩只把估计拉向 0，不放大", () => {
    for (const estimate of fit.judgers) {
      expect(Math.abs(estimate.bias)).toBeLessThanOrEqual(Math.abs(estimate.rawBias) + 1e-12);
    }
  });

  it("讲师之间确实存在差异时给出显著判定", () => {
    expect(estimateOf(fit, 11).verdict).toBe("lenient");
    expect(estimateOf(fit, 12).verdict).toBe("strict");
    expect(fit.betweenJudgerSd).toBeGreaterThan(0.02);
  });

  it("残差可标准化（供热力图使用）", () => {
    const residual = standardizedResidual(observations[0], fit);
    expect(residual).not.toBeNull();
    expect(Number.isFinite(residual as number)).toBe(true);
  });
});

describe("校正：守恒性、恒等性与方向", () => {
  /**
   * 宽松讲师评低水平考生、严格讲师评高水平考生，另有重叠考生由两人分别评不同题。
   * 未校正时宽松讲师评的考生名次更高，校正后应当反转。
   */
  const noise = createNoise(777, 0.05);
  const ability = (candidateId: number) => {
    if (candidateId <= 4) return 0.5 + candidateId * 0.005;
    if (candidateId <= 8) return 0.6 + (candidateId - 4) * 0.005;
    return 0.55 + (candidateId - 8) * 0.005;
  };
  const observations = buildObservations(
    [
      { judger: 11, candidates: [1, 2, 3, 4], problems: [1, 2], severity: 0.1 },
      { judger: 11, candidates: [9, 10, 11, 12], problems: [1], severity: 0.1 },
      { judger: 12, candidates: [5, 6, 7, 8], problems: [1, 2], severity: -0.1 },
      { judger: 12, candidates: [9, 10, 11, 12], problems: [2], severity: -0.1 },
    ],
    { 1: 0.02, 2: -0.02 },
    ability,
    noise,
  );
  const fit = fitGradingModel(observations);
  const leaderboard = buildLeaderboard(observations, fit, { lambda: 1 });
  const rowOf = (userFlowId: number) => {
    const row = leaderboard.find((candidate) => candidate.userFlowId === userFlowId);
    if (!row) throw new Error(`名次表缺少考生 ${userFlowId}`);
    return row;
  };

  it("设计可辨识，且校正方向正确（宽松讲师评的考生整体下移）", () => {
    expect(fit.identifiable).toBe(true);

    const shiftOf = (judgerId: number) => {
      const rows = observations.filter((row) => row.judgerId === judgerId);
      return mean(
        rows.map((row) => adjustedRatio(row, fit, { lambda: 1 }) - row.points / row.maxPoints),
      );
    };

    expect(shiftOf(11)).toBeLessThan(0);
    expect(shiftOf(12)).toBeGreaterThan(0);
  });

  it("λ=0 时逐点恒等、名次完全一致", () => {
    const identity = buildLeaderboard(observations, fit, { lambda: 0 });
    for (const row of identity) {
      expect(row.adjustedPoints).toBe(row.rawPoints);
      expect(row.rankDelta).toBe(0);
    }
  });

  it("λ=1 时整届总分守恒（仅受整数舍入影响）", () => {
    const rawTotal = leaderboard.reduce((total, row) => total + row.rawPoints, 0);
    const adjustedTotal = leaderboard.reduce((total, row) => total + row.adjustedPoints, 0);
    expect(Math.abs(adjustedTotal - rawTotal)).toBeLessThanOrEqual(leaderboard.length * 0.5);
  });

  it("名次确实反转：宽松讲师评的考生校正后整体下滑", () => {
    const lenientGroup = [1, 2, 3, 4];
    const strictGroup = [5, 6, 7, 8];

    expect(mean(lenientGroup.map((id) => rowOf(id).rawRank))).toBeLessThan(
      mean(strictGroup.map((id) => rowOf(id).rawRank)),
    );
    expect(mean(lenientGroup.map((id) => rowOf(id).adjustedRank))).toBeGreaterThan(
      mean(strictGroup.map((id) => rowOf(id).adjustedRank)),
    );
    expect(leaderboard.some((row) => row.rankDelta !== 0)).toBe(true);
  });

  it("同一讲师内部保序（校正对同一讲师的观测是同一个常数）", () => {
    for (const ids of [[1, 2, 3, 4], [5, 6, 7, 8]]) {
      const byRaw = [...ids].sort((left, right) => rowOf(right).rawRatio - rowOf(left).rawRatio);
      const byAdjusted = [...ids].sort(
        (left, right) => rowOf(right).adjustedRatio - rowOf(left).adjustedRatio,
      );
      expect(byAdjusted).toEqual(byRaw);
    }
  });

  it("人工权重按 0..2 收敛，非法值按默认 1", () => {
    const row = observations.find((candidate) => candidate.judgerId === 11) as GradingObservation;
    const baseline = adjustedRatio(row, fit, { lambda: 0 });
    expect(adjustedRatio(row, fit, { lambda: 0, judgerWeights: { 11: Number.NaN } })).toBeCloseTo(
      baseline,
      9,
    );
    expect(adjustedRatio(row, fit, { lambda: 0, judgerWeights: { 11: 99 } })).toBeCloseTo(
      baseline,
      9,
    );
    /* 权重 0 ⇒ 该讲师不参与校正；权重 2 ⇒ 校正量翻倍（方向不变） */
    const full = adjustedRatio(row, fit, { lambda: 1, judgerWeights: { 11: 1 } });
    const doubled = adjustedRatio(row, fit, { lambda: 1, judgerWeights: { 11: 2 } });
    const raw = row.points / row.maxPoints;
    expect(Math.abs(doubled - raw)).toBeGreaterThan(Math.abs(full - raw));
  });
});

describe("fitGradingModel：讲师级可辨识与可比簇", () => {
  const difficulty: Record<number, number> = { 1: 0.04, 2: 0.01, 3: -0.01, 4: -0.04 };
  const ability = (candidateId: number) => 0.55 + (candidateId % 7) * 0.01;
  /* 核心：3 名讲师共享考生、题目子集互相搭接 ⇒ 两两可比 */
  const core = buildObservations(
    [
      { judger: 11, candidates: [1, 2, 3, 4, 5, 6], problems: [1, 2], severity: 0.1 },
      { judger: 12, candidates: [1, 2, 3, 4, 5, 6], problems: [3, 4], severity: -0.1 },
      { judger: 13, candidates: [1, 2, 3, 4, 5, 6], problems: [1, 3], severity: 0 },
    ],
    difficulty,
    ability,
  );
  /* 孤立讲师：与核心共用题目（所以仍在同一分量），但他的两名考生没有别的讲师评过 */
  const orphan = buildObservations(
    [{ judger: 14, candidates: [21, 22], problems: [1, 2], severity: 0.3 }],
    difficulty,
    ability,
  );
  const coreFit = fitGradingModel(core);
  const mixedFit = fitGradingModel([...core, ...orphan]);

  it("只有核心时 3 名讲师落在同一个可比簇", () => {
    expect(coreFit.identifiable).toBe(true);
    expect(coreFit.clusterCount).toBe(1);
    expect(coreFit.comparableJudgerCount).toBe(3);
    expect(coreFit.judgers.every((estimate) => estimate.clusterIndex === 0)).toBe(true);
  });

  it("孤立讲师只让自己不可判定，不再拖垮同分量的其他讲师", () => {
    expect(mixedFit.componentCount).toBe(1);
    expect(mixedFit.identifiable).toBe(false);
    expect(mixedFit.judgerCount).toBe(4);
    expect(mixedFit.comparableJudgerCount).toBe(3);

    for (const judgerId of [11, 12, 13]) {
      const estimate = estimateOf(mixedFit, judgerId);
      expect(estimate.identifiable).toBe(true);
      expect(estimate.clusterIndex).toBe(0);
      expect(estimate.standardError).not.toBeNull();
      expect(estimate.verdict).not.toBe("unknown");
    }

    const isolated = estimateOf(mixedFit, 14);
    expect(isolated.identifiable).toBe(false);
    expect(isolated.clusterIndex).toBe(-1);
    expect(isolated.rawBias).toBe(0);
    expect(isolated.bias).toBe(0);
    expect(isolated.standardError).toBeNull();
    expect(isolated.verdict).toBe("unknown");
  });

  it("孤立讲师几乎不改变核心讲师的宽严估计（只通过共享题目带来 1e-5 量级扰动）", () => {
    for (const judgerId of [11, 12, 13]) {
      expect(estimateOf(mixedFit, judgerId).rawBias).toBeCloseTo(
        estimateOf(coreFit, judgerId).rawBias,
        4,
      );
    }
    expect(estimateOf(mixedFit, 11).rawBias).toBeCloseTo(0.1, 4);
    expect(estimateOf(mixedFit, 12).rawBias).toBeCloseTo(-0.1, 4);
  });

  it("多个可比簇各自居中（簇内 n 加权和为零），互不比较", () => {
    /* 两组考生互不相交、只通过共享题目并入同一分量 ⇒ 两个可比簇，各 3 名讲师 */
    const observations = buildObservations(
      [
        { judger: 11, candidates: [1, 2, 3, 4], problems: [1, 2], severity: 0.1 },
        { judger: 12, candidates: [1, 2, 3, 4], problems: [3, 4], severity: -0.1 },
        { judger: 13, candidates: [1, 2, 3, 4], problems: [1, 3], severity: 0 },
        { judger: 14, candidates: [11, 12, 13, 14], problems: [1, 2], severity: 0.2 },
        { judger: 15, candidates: [11, 12, 13, 14], problems: [3, 4], severity: 0.05 },
        { judger: 16, candidates: [11, 12, 13, 14], problems: [1, 3], severity: -0.05 },
      ],
      difficulty,
      ability,
    );
    const fit = fitGradingModel(observations);

    expect(fit.componentCount).toBe(1);
    expect(fit.clusterCount).toBe(2);
    expect(fit.comparableJudgerCount).toBe(6);
    expect(fit.identifiable).toBe(true);

    const clusters = new Map<number, number[]>();
    for (const estimate of fit.judgers) {
      clusters.set(estimate.clusterIndex, [
        ...(clusters.get(estimate.clusterIndex) ?? []),
        estimate.judgerId,
      ]);
    }
    expect([...clusters.keys()].sort()).toEqual([0, 1]);
    for (const judgerIds of clusters.values()) {
      expect(judgerIds).toHaveLength(3);
      /* 簇内按观测数加权居中：Σ n_j·δ_j = 0（收缩前） */
      const weighted = judgerIds.reduce(
        (total, judgerId) =>
          total + estimateOf(fit, judgerId).observationCount * estimateOf(fit, judgerId).rawBias,
        0,
      );
      expect(Math.abs(weighted)).toBeLessThan(1e-9);
    }
  });
});

describe("校正：守恒口径、保序前提与 λ=0 截断", () => {
  /* 两名讲师观测的平均满分相差悬殊（1000 分题 vs 10 分题） */
  const uneven: GradingObservation[] = [
    observation(1, 1, 11, 0.8, 1000),
    observation(1, 2, 12, 0.8, 10),
    observation(2, 1, 11, 0.8, 1000),
    observation(2, 2, 12, 0.8, 10),
    observation(3, 1, 12, 0.85, 1000),
    observation(3, 2, 11, 0.8, 10),
    observation(4, 1, 11, 0.79, 1000),
    observation(4, 2, 12, 0.8, 10),
    observation(5, 1, 11, 0.8, 1000),
    observation(5, 2, 12, 0.8, 10),
  ];
  const unevenFit = fitGradingModel(uneven);

  it("构造前提成立：设计可辨识，且两名讲师的平均满分确实不同", () => {
    expect(unevenFit.identifiable).toBe(true);
    const perObservationMaxPoints = (judgerId: number) => {
      const estimate = estimateOf(unevenFit, judgerId);
      return estimate.maxPointsSum / estimate.observationCount;
    };
    expect(perObservationMaxPoints(11)).toBeGreaterThan(perObservationMaxPoints(12) * 3);
  });

  it("按满分加权后整届原始总分守恒（按观测条数加权会漂 20 分以上）", () => {
    const leaderboard = buildLeaderboard(uneven, unevenFit, { lambda: 1 });
    const rawTotal = leaderboard.reduce((total, row) => total + row.rawPoints, 0);
    const adjustedTotal = leaderboard.reduce((total, row) => total + row.adjustedPoints, 0);
    expect(Math.abs(adjustedTotal - rawTotal)).toBeLessThanOrEqual(uneven.length * 0.5);
  });

  it("λ=0 时校正分等于原始分，即使有超过当前满分的评分", () => {
    const rows: GradingObservation[] = [
      observation(1, 1, 11, 1.3, 100),
      observation(1, 2, 12, 0.5, 100),
      observation(2, 1, 12, 0.7, 100),
      observation(2, 2, 11, 0.6, 100),
    ];
    const fit = fitGradingModel(rows);
    expect(fit.clampedObservationCount).toBe(1);
    const leaderboard = buildLeaderboard(rows, fit, { lambda: 0 });
    for (const row of leaderboard) expect(row.adjustedPoints).toBe(row.rawPoints);
  });

  it("保序只在「同一讲师 + 题目集合与满分结构相同」时成立", () => {
    const rows: GradingObservation[] = [
      observation(1, 1, 11, 0.8, 100),
      observation(1, 2, 12, 0.8, 10),
      observation(2, 1, 12, 0.85, 100),
      observation(2, 2, 11, 0.7, 10),
      /* 3 号考生由 11 评两道题（满分 110），5 号考生只由 11 评一道题（满分 100） */
      observation(3, 1, 11, 0.8, 100),
      observation(3, 2, 11, 0.8, 10),
      observation(4, 1, 12, 0.88, 100),
      observation(4, 2, 12, 0.9, 10),
      observation(5, 1, 11, 0.8, 100),
    ];
    const fit = fitGradingModel(rows);
    const leaderboard = buildLeaderboard(rows, fit, { lambda: 1 });
    const rowOf = (userFlowId: number) => {
      const row = leaderboard.find((candidate) => candidate.userFlowId === userFlowId);
      if (!row) throw new Error(`名次表缺少考生 ${userFlowId}`);
      return row;
    };

    /* 同一讲师的每条观测拿到的是同一个得分率偏移 …… */
    const shiftOf = (index: number) =>
      adjustedRatio(rows[index], fit, { lambda: 1 }) - rows[index].points / rows[index].maxPoints;
    expect(shiftOf(4)).toBeCloseTo(shiftOf(8), 12);
    /* …… 但两名考生的满分结构不同 ⇒ 汇总成总分后名次可以翻转（所以不变量必须带前提） */
    expect(rowOf(3).rawRatio).toBeCloseTo(rowOf(5).rawRatio, 12);
    expect(rowOf(5).adjustedRatio).toBeGreaterThan(rowOf(3).adjustedRatio);
    expect(rowOf(5).rawRank).toBe(rowOf(3).rawRank);
    expect(rowOf(5).adjustedRank).toBeLessThan(rowOf(3).adjustedRank);
  });
});

describe("退化与边界情形", () => {
  it("空输入返回空模型而不是抛错", () => {
    const fit = fitGradingModel([]);
    expect(fit.observationCount).toBe(0);
    expect(fit.identifiable).toBe(false);
    expect(fit.judgers).toEqual([]);
    expect(fit.residualSd).toBeNull();
    expect(buildLeaderboard([], fit, { lambda: 1 })).toEqual([]);
  });

  it("满分非正或缺少讲师的观测被跳过并计数", () => {
    const fit = fitGradingModel([
      { userFlowId: 1, problemId: 1, judgerId: 11, points: 5, maxPoints: 0 },
      { userFlowId: 1, problemId: 2, judgerId: 0, points: 5, maxPoints: 10 },
      observation(1, 3, 11, 0.5),
    ]);
    expect(fit.observationCount).toBe(1);
    expect(fit.skippedObservationCount).toBe(2);
  });

  it("得分超过满分的观测被截断并计数", () => {
    const fit = fitGradingModel([
      { userFlowId: 1, problemId: 1, judgerId: 11, points: 120, maxPoints: 100 },
      { userFlowId: 2, problemId: 1, judgerId: 11, points: 50, maxPoints: 100 },
    ]);
    expect(fit.clampedObservationCount).toBe(1);
    expect(fit.observationCount).toBe(2);
  });

  it("自由度不足（N = 参数数）时不输出残差尺度与标准误", () => {
    const observations = [observation(1, 1, 11, 0.6)];
    const fit = fitGradingModel(observations);
    expect(fit.residualSd).toBeNull();
    expect(fit.judgers[0].standardError).toBeNull();
    expect(fit.judgers[0].verdict).toBe("unknown");
    expect(standardizedResidual(observations[0], fit)).toBeNull();
  });

  it("互不相连的阅卷小组各自拟合，可辨识性按分量分别判定", () => {
    const observations = buildObservations(
      [
        /* 小组一：两名讲师搭接题目子集，共享考生 ⇒ 可辨识 */
        { judger: 11, candidates: [1, 2, 3, 4, 5, 6], problems: [1, 2], severity: 0.1 },
        { judger: 12, candidates: [1, 2, 3, 4, 5, 6], problems: [3, 4], severity: -0.1 },
        { judger: 13, candidates: [1, 2, 3, 4, 5, 6], problems: [1, 3], severity: 0 },
        /* 小组二：与小组一没有共同考生或题目 ⇒ 不可辨识 */
        { judger: 14, candidates: [21, 22], problems: [91], severity: 0.2 },
      ],
      { 1: 0.04, 2: 0.01, 3: -0.01, 4: -0.04, 91: 0 },
      (candidateId) => 0.55 + (candidateId % 7) * 0.01,
    );
    const fit = fitGradingModel(observations);

    expect(fit.componentCount).toBe(2);
    expect(fit.identifiableComponentCount).toBe(1);
    expect(fit.identifiable).toBe(false);
    expect(estimateOf(fit, 11).identifiable).toBe(true);
    expect(estimateOf(fit, 14).identifiable).toBe(false);
    expect(estimateOf(fit, 14).verdict).toBe("unknown");
  });
});
