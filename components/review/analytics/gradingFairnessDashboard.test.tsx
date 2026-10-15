/**
 * 阅卷公平性面板的接线测试：λ 与人工权重是否真的驱动了校正结果，
 * 以及「保存参数」是否把当前参数交给服务端。
 *
 * 模型本身在 `lib/grading-fairness/model.test.ts` 里已经覆盖，这里只验证页面装配。
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

type SaveProfileInput = {
  flowId: number;
  lambda: number;
  judgerWeights?: Record<string, number>;
  note?: string | null;
};

const saveGradingFairnessProfile = jest.fn(async (input: SaveProfileInput) => ({
  flowId: input.flowId,
  lambda: input.lambda,
  judgerWeights: input.judgerWeights ?? {},
  note: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
}));
jest.mock("@/action/user-flow/grading-fairness/profile", () => ({
  saveGradingFairnessProfile: (input: SaveProfileInput) => saveGradingFairnessProfile(input),
}));

import type { GradingFairnessData } from "@/action/user-flow/grading-fairness/load";
import type { GradingFairnessProfile } from "@/action/user-flow/grading-fairness/profile";
import { GradingFairnessDashboard } from "@/components/review/analytics/gradingFairnessDashboard";
import { fitGradingModel } from "@/lib/grading-fairness/model";
import type { GradingModelFit, GradingObservation } from "@/lib/grading-fairness/types";

/** 确定性噪声，保证名次与分数可复现 */
function createNoise(seed: number, amplitude: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state / 4294967296 - 0.5) * 2 * amplitude;
  };
}

const noise = createNoise(4242, 0.05);
const difficulty: Record<number, number> = { 1: 0.02, 2: -0.02 };
const ability = (candidateId: number) => {
  if (candidateId <= 2) return 0.5 + candidateId * 0.005;
  if (candidateId <= 4) return 0.6 + (candidateId - 2) * 0.005;
  return 0.55 + (candidateId - 4) * 0.005;
};
const severity: Record<number, number> = { 11: 0.1, 12: -0.1 };

const rows: Array<{ candidate: number; problem: number; judger: number }> = [];
for (const candidate of [1, 2]) for (const problem of [1, 2]) rows.push({ candidate, problem, judger: 11 });
for (const candidate of [3, 4]) for (const problem of [1, 2]) rows.push({ candidate, problem, judger: 12 });
rows.push({ candidate: 5, problem: 1, judger: 11 });
rows.push({ candidate: 5, problem: 2, judger: 12 });
rows.push({ candidate: 6, problem: 1, judger: 11 });
rows.push({ candidate: 6, problem: 2, judger: 12 });

const observations: GradingObservation[] = rows.map(({ candidate, problem, judger }) => ({
  userFlowId: candidate,
  problemId: problem,
  judgerId: judger,
  points: Math.round(
    Math.min(0.95, ability(candidate) + difficulty[problem] + severity[judger] + noise()) * 100,
  ),
  maxPoints: 100,
}));

const fit = fitGradingModel(observations);

const data: GradingFairnessData = {
  flow: { id: 501, title: "演示流程", department: "software" },
  observations,
  candidateLabels: Object.fromEntries(
    [1, 2, 3, 4, 5, 6].map((id) => [
      String(id),
      { name: `考生${id}`, studentId: `B0000000${id}` },
    ]),
  ),
  problemLabels: {
    "1": { title: "第一题", maxPoints: 100 },
    "2": { title: "第二题", maxPoints: 100 },
  },
  judgerLabels: { "11": "讲师甲", "12": "讲师乙" },
  unattributedCount: 0,
  fit,
};

const profile: GradingFairnessProfile = {
  flowId: 501,
  lambda: 0,
  judgerWeights: {},
  note: null,
  updatedAt: null,
};

/** 从观测生成完整 data：标签按需生成，避免每加一个夹具就手写一遍 */
function buildData(rows: GradingObservation[]): GradingFairnessData {
  const idsOf = (pick: (row: GradingObservation) => number) =>
    [...new Set(rows.map(pick))].sort((left, right) => left - right);
  const judgerIds = idsOf((row) => row.judgerId);
  const candidateIds = idsOf((row) => row.userFlowId);
  const problemIds = idsOf((row) => row.problemId);
  return {
    flow: { id: 501, title: "演示流程", department: "software" },
    observations: rows,
    candidateLabels: Object.fromEntries(
      candidateIds.map((id) => [String(id), { name: `考生${id}`, studentId: `B0000000${id}` }]),
    ),
    problemLabels: Object.fromEntries(
      problemIds.map((id) => [String(id), { title: `第${id}题`, maxPoints: 100 }]),
    ),
    judgerLabels: Object.fromEntries(judgerIds.map((id) => [String(id), `讲师${id}`])),
    unattributedCount: 0,
    fit: fitGradingModel(rows),
  };
}

/**
 * 造一个可比簇：两名讲师各评自己的一批考生（同两道题），再由一名交叉考生把两人连起来
 * ——交叉考生的两道题分别由两名讲师评，宽严才可分离。
 */
function comparableCluster(
  left: number,
  right: number,
  ownCandidates: [number[], number[]],
  crossCandidate: number,
  problems: [number, number],
  points: [number, number],
): GradingObservation[] {
  const rows: GradingObservation[] = [];
  for (const candidate of ownCandidates[0]) {
    for (const problem of problems) {
      rows.push({
        userFlowId: candidate,
        problemId: problem,
        judgerId: left,
        points: points[0],
        maxPoints: 100,
      });
    }
  }
  for (const candidate of ownCandidates[1]) {
    for (const problem of problems) {
      rows.push({
        userFlowId: candidate,
        problemId: problem,
        judgerId: right,
        points: points[1],
        maxPoints: 100,
      });
    }
  }
  rows.push({
    userFlowId: crossCandidate,
    problemId: problems[0],
    judgerId: left,
    points: points[0],
    maxPoints: 100,
  });
  rows.push({
    userFlowId: crossCandidate,
    problemId: problems[1],
    judgerId: right,
    points: points[1],
    maxPoints: 100,
  });
  return rows;
}

/** 两个可比簇（各 2 名讲师）+ 1 名不可判定的孤立讲师 */
const clusteredObservations: GradingObservation[] = [
  ...comparableCluster(11, 12, [[1, 2], [3, 4]], 5, [1, 2], [60, 66]),
  ...comparableCluster(13, 14, [[6, 7], [8, 9]], 10, [1, 2], [52, 58]),
  /* 自己的考生与题目，和谁都不重叠 ⇒ 不可判定 */
  { userFlowId: 11, problemId: 3, judgerId: 15, points: 50, maxPoints: 100 },
  { userFlowId: 12, problemId: 4, judgerId: 15, points: 52, maxPoints: 100 },
];

/** 两个互不相连的阅卷小组：各自评自己的考生与题目，讲师之间没有任何重叠 ⇒ 可比讲师 0 */
const disjointObservations: GradingObservation[] = [];
for (const [index, candidate] of [1, 2].entries()) {
  for (const problem of [1, 2]) {
    disjointObservations.push({
      userFlowId: candidate,
      problemId: problem,
      judgerId: 11,
      points: 60 + index * 7 + problem * 3,
      maxPoints: 100,
    });
  }
}
for (const [index, candidate] of [3, 4].entries()) {
  for (const problem of [3, 4]) {
    disjointObservations.push({
      userFlowId: candidate,
      problemId: problem,
      judgerId: 12,
      points: 70 + index * 6 + problem,
      maxPoints: 100,
    });
  }
}

/** 单个连通分量：两名讲师共享题目、但考生完全不交叉 ⇒ 可辨识性仍然缺失 */
const crosslessObservations: GradingObservation[] = [
  { userFlowId: 1, problemId: 1, judgerId: 11, points: 80, maxPoints: 100 },
  { userFlowId: 2, problemId: 1, judgerId: 11, points: 60, maxPoints: 100 },
  { userFlowId: 3, problemId: 1, judgerId: 12, points: 90, maxPoints: 100 },
  { userFlowId: 4, problemId: 1, judgerId: 12, points: 70, maxPoints: 100 },
  { userFlowId: 1, problemId: 2, judgerId: 11, points: 80, maxPoints: 100 },
  { userFlowId: 3, problemId: 2, judgerId: 12, points: 90, maxPoints: 100 },
];

/** 指标行某一格的全部文字（label + value + hint） */
const statText = (label: string) => screen.getByText(label).closest("div")?.textContent ?? "";

const renderDashboard = () => {
  try {
    return render(<GradingFairnessDashboard data={data} profile={profile} />);
  } catch (error) {
    const inner = (error as AggregateError).errors?.[0];
    throw inner ?? error;
  }
};

/** 名次表里某位考生的「原始分 → 校正分」 */
const scoresOf = (candidateName: string) => {
  const cell = screen.getByText(candidateName).closest("tr");
  if (!cell) throw new Error(`名次表里找不到 ${candidateName}`);
  const cells = within(cell).getAllByRole("cell");
  const [raw, adjusted] = (cells[2].textContent ?? "").split("→");
  return { raw, adjusted };
};
const lambdaThumb = () =>
  screen.getByRole("slider", { name: "全局校正强度" }) as HTMLElement;

describe("GradingFairnessDashboard", () => {
  beforeEach(() => {
    saveGradingFairnessProfile.mockClear();
  });

  it("夹具本身可辨识（否则这条测试没有意义）", () => {
    expect(fit.identifiable).toBe(true);
    expect(fit.judgers).toHaveLength(2);
    expect(fit.judgers.some((estimate) => estimate.bias !== 0)).toBe(true);
  });

  it("默认 λ=0：校正分与原始分一致，且显示整届总分守恒", () => {
    renderDashboard();

    expect(screen.getByText(/总分变化 0 分（舍入与截断）/)).toBeInTheDocument();
    expect(screen.getByText(/已保持整届总分/)).toBeInTheDocument();
    expect(screen.getByText(/无名次变化/)).toBeInTheDocument();

    const scores = scoresOf("考生1");
    expect(scores.adjusted).toBe(scores.raw);
  });

  it("把 λ 调到 1 后重新计算：宽松讲师评的考生分数下调、名次发生变化", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const before = scoresOf("考生1");
    lambdaThumb().focus();
    await user.keyboard("{End}");
    await user.keyboard("{End}");

    const after = scoresOf("考生1");
    expect(after.adjusted).not.toBe(before.adjusted);

    const rawValue = Number(before.raw.split("/")[0].trim());
    const adjustedValue = Number(after.adjusted.split("/")[0].trim());
    expect(adjustedValue).toBeLessThan(rawValue);
    expect(screen.getByText(/总分变化 0 分/)).toBeInTheDocument();
  });

  it("保存参数把 flowId、λ 与人工权重交给服务端，并在成功后清掉「未保存」提示", async () => {
    const user = userEvent.setup();
    renderDashboard();

    expect(screen.getByText("参数已保存")).toBeInTheDocument();

    lambdaThumb().focus();
    await user.keyboard("{End}");
    expect(screen.getByText("有未保存的改动")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存参数" }));

    expect(saveGradingFairnessProfile).toHaveBeenCalledTimes(1);
    const payload = saveGradingFairnessProfile.mock.calls[0][0];
    expect(payload.flowId).toBe(501);
    expect(payload.lambda).toBeGreaterThan(0.9);
    await screen.findByText("参数已保存");
    expect(screen.queryByText("有未保存的改动")).toBeNull();
  });

  it("不可判定时不提供校正控件，改为描述性回退并说明原因", () => {
    const singleJudger: GradingObservation[] = observations
      .filter((row) => row.judgerId === 11)
      .map((row) => ({ ...row }));
    const singleFit = fitGradingModel(singleJudger);

    render(
      <GradingFairnessDashboard
        data={{ ...data, observations: singleJudger, fit: singleFit }}
        profile={profile}
      />,
    );

    expect(screen.getByText("当前数据无法判定讲师宽严")).toBeInTheDocument();
    /* 描述性回退：原始口径照给，但明确标注不可比较 */
    expect(screen.getByText("讲师阅卷量（描述性，仅供参考）")).toBeInTheDocument();
    expect(screen.getByText(/不可直接比较/)).toBeInTheDocument();
    expect(screen.getByText(/要让这里出现可判定的宽严估计/)).toBeInTheDocument();
    /* 热力图与名次表不依赖可比讲师（秩亏不影响拟合值与 σ̂），照常渲染 */
    expect(screen.getByText(/诊断：讲师 × 题目 标准化残差/)).toBeInTheDocument();
    expect(screen.getByText("名次变化")).toBeInTheDocument();
    expect(screen.getByText("考生1")).toBeInTheDocument();
    /* 不可校正时不该出现任何校正控件 */
    expect(screen.queryByRole("slider", { name: "全局校正强度" })).toBeNull();
    expect(screen.queryByRole("button", { name: "保存参数" })).toBeNull();
    expect(screen.queryByText("讲师宽严（森林图）")).toBeNull();
    expect(screen.queryByText("校正前后平均得分率")).toBeNull();
  });

  it("可判定但没有残差尺度时不报「系统性偏离」，而是说明无法判定", () => {
    /* 完美拟合（无残差尺度）⇒ 设计可辨识但判定全为 unknown，此时不该出现「发现 N 名讲师偏离」 */
    const exact: GradingObservation[] = [];
    const candidates = [1, 2, 3, 4];
    const problemSets: Record<number, number[]> = { 11: [1, 2], 12: [3, 4], 13: [1, 3] };
    const difficulty: Record<number, number> = { 1: 80, 2: 20, 3: -40, 4: -100 };
    const severity: Record<number, number> = { 11: 0, 12: 100, 13: -100 };
    for (const [judgerIdText, problems] of Object.entries(problemSets)) {
      const judgerId = Number(judgerIdText);
      for (const candidate of candidates) {
        for (const problem of problems) {
          exact.push({
            userFlowId: candidate,
            problemId: problem,
            judgerId,
            points: 500 + candidate * 5 + difficulty[problem] + severity[judgerId],
            maxPoints: 1000,
          });
        }
      }
    }
    const exactFit = fitGradingModel(exact);
    expect(exactFit.identifiable).toBe(true);
    expect(exactFit.judgers.every((estimate) => estimate.verdict === "unknown")).toBe(true);

    render(
      <GradingFairnessDashboard
        data={{ ...data, observations: exact, fit: exactFit }}
        profile={profile}
      />,
    );

    expect(screen.getByText("当前数据不足以判定讲师宽严")).toBeInTheDocument();
    expect(screen.queryByText(/发现 \d+ 名讲师的打分系统性偏离同侪/)).toBeNull();
  });

  it("可判定时给出结论摘要（谁偏松、影响多少名次、能检出多大差异）", () => {
    renderDashboard();

    expect(screen.getByText(/发现 \d 名讲师的打分系统性偏离同侪/)).toBeInTheDocument();
    expect(screen.getByText(/λ = 1 时 \d+ 名考生名次变化/)).toBeInTheDocument();
    expect(screen.getByText(/整届总分不变（按满分加权）/)).toBeInTheDocument();
    expect(screen.getByText(/可可靠检出约 \d+pp 以上的差异/)).toBeInTheDocument();
    expect(screen.getByText("讲师宽严（森林图）")).toBeInTheDocument();
    expect(screen.getByText("校正前后平均得分率")).toBeInTheDocument();
    expect(screen.getByText(/诊断：讲师 × 题目 标准化残差/)).toBeInTheDocument();
    expect(screen.getByText("名次变化")).toBeInTheDocument();
  });

  it("指标行按可比讲师口径：可比讲师 2/2（hint 保留分量信息），τ 用真实估计，热力图 <title> 带样本数", () => {
    const { container } = renderDashboard();

    expect(statText("可比讲师")).toContain("2 / 2");
    expect(statText("可比讲师")).toContain("可判定阅卷组 1/1");
    expect(statText("讲师间差异 τ")).toContain("13.3pp");
    expect(statText("讲师间差异 τ")).not.toContain("—");

    /* 规范 §10.2：样本数写进格子 <title>（n=1 的格子是噪声） */
    const titles = Array.from(container.querySelectorAll('[data-part="cell"] title')).map(
      (node) => node.textContent ?? "",
    );
    expect(titles.length).toBeGreaterThan(0);
    for (const title of titles) {
      expect(title).toMatch(/· n=\d+$/);
    }
    expect(titles.some((title) => title.includes("n=4"))).toBe(true);
  });

  it("没有可比讲师（多个互不相连的阅卷小组）：描述性表与热力图、名次表并存，τ 显示 —", () => {
    const disjointData = buildData(disjointObservations);
    /* 夹具自检：确实是「2 个分量、0 名可比讲师」 */
    expect(disjointData.fit.componentCount).toBe(2);
    expect(disjointData.fit.comparableJudgerCount).toBe(0);

    const { container } = render(
      <GradingFairnessDashboard data={disjointData} profile={profile} />,
    );

    expect(screen.getByText(/2 个互不相连的阅卷小组/)).toBeInTheDocument();
    /* 描述性表是唯一能给出阅卷量的地方，必须保留 */
    expect(screen.getByText("讲师阅卷量（描述性，仅供参考）")).toBeInTheDocument();
    /* 热力图与名次表不依赖可比讲师 */
    expect(screen.getByText(/诊断：讲师 × 题目 标准化残差/)).toBeInTheDocument();
    expect(screen.getByText("名次变化")).toBeInTheDocument();
    expect(screen.getByText("考生1")).toBeInTheDocument();
    /* τ 在无可比讲师时是假零（根本没有估计），显示 — */
    expect(statText("讲师间差异 τ")).toContain("—");
    expect(statText("讲师间差异 τ")).toContain("无可比讲师");
    expect(statText("可比讲师")).toContain("0 / 2");
    /* 依赖可比讲师的部件一律不出现 */
    expect(screen.queryByText("讲师宽严（森林图）")).toBeNull();
    expect(screen.queryByText("校正前后平均得分率")).toBeNull();
    expect(screen.queryByRole("slider", { name: "全局校正强度" })).toBeNull();
    expect(screen.queryByRole("button", { name: "保存参数" })).toBeNull();
    expect(container.querySelectorAll('[data-part="cluster-label"]')).toHaveLength(0);
  });

  it("只有一个分量但没有考生交叉：结论条指出缺的是考生交叉，而不是「多个互不相连的小组」", () => {
    const crosslessData = buildData(crosslessObservations);
    /* 夹具自检：关联图连通（1 个分量）但讲师之间不可比 */
    expect(crosslessData.fit.componentCount).toBe(1);
    expect(crosslessData.fit.comparableJudgerCount).toBe(0);
    expect(crosslessData.fit.judgerCount).toBe(2);

    const { container } = render(
      <GradingFairnessDashboard data={crosslessData} profile={profile} />,
    );

    expect(screen.getByText("当前数据无法判定讲师宽严")).toBeInTheDocument();
    expect(screen.getByText(/没有考生交叉/)).toBeInTheDocument();
    expect(screen.getByText(/每名考生基本只被一名讲师评过/)).toBeInTheDocument();
    expect(screen.getByText(/共享题目并不能分离宽严/)).toBeInTheDocument();
    expect(screen.queryByText(/互不相连的阅卷小组/)).toBeNull();
    /* 热力图与名次表照常渲染（σ̂ 可用，格子带样本数） */
    expect(container.querySelectorAll('[data-part="cell"]').length).toBeGreaterThan(0);
    expect(screen.getByText("名次变化")).toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: "全局校正强度" })).toBeNull();
  });

  it("按可比簇分组：森林图、哑铃图、参数面板都在簇边界插入分隔标签，不可判定组排最后", () => {
    const clusteredData = buildData(clusteredObservations);
    /* 夹具自检：2 个可比簇（4 名可比讲师）+ 1 名孤立讲师 */
    expect(clusteredData.fit.clusterCount).toBe(2);
    expect(clusteredData.fit.comparableJudgerCount).toBe(4);
    expect(clusteredData.fit.judgerCount).toBe(5);
    expect(clusteredData.fit.judgers.map((estimate) => estimate.clusterIndex)).toEqual([
      0, 0, 1, 1, -1,
    ]);

    const { container } = render(
      <GradingFairnessDashboard data={clusteredData} profile={profile} />,
    );

    const groupLabels = [
      "阅卷组 1 · 2 名讲师 · 仅组内可比",
      "阅卷组 2 · 2 名讲师 · 仅组内可比",
      "不可判定 · 没有其他讲师评过同一名考生",
    ];
    /* 森林图 / 哑铃图 / 参数面板各一组，顺序与 fit.judgers 的簇顺序一致 */
    expect(
      Array.from(container.querySelectorAll('[data-part="cluster-label"]')).map(
        (node) => node.textContent,
      ),
    ).toEqual([...groupLabels, ...groupLabels, ...groupLabels]);
    expect(statText("可比讲师")).toContain("4 / 5");
  });

  it("τ² = 0 但个别讲师显著：说明总体异质性证据不足，并在行内注明不校正", () => {
    /* 契约：verdict 按收缩前的 δ 判定，τ² = 0 时 credibility = bias = 0，两者必须分开读 */
    const tauZeroFit: GradingModelFit = {
      ...fit,
      betweenJudgerSd: 0,
      judgers: fit.judgers.map((estimate) => ({
        ...estimate,
        bias: 0,
        credibility: 0,
        verdict: "lenient",
      })),
    };
    const { container } = render(
      <GradingFairnessDashboard data={{ ...data, fit: tauZeroFit }} profile={profile} />,
    );

    expect(screen.getByText("未检测到讲师之间的系统性差异")).toBeInTheDocument();
    expect(
      screen.getByText(
        /另有 2 名讲师个体上达到显著阈值，但总体异质性证据不足，不做任何校正/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/发现 \d 名讲师的打分系统性偏离同侪/)).toBeNull();
    /* 「偏松」标签旁边必须注明不校正，否则与校正量 0 并列看起来自相矛盾 */
    expect(screen.getAllByText("总体无异质性证据，不校正")).toHaveLength(2);
    expect(container.querySelectorAll('[data-part="verdict-note"]')).toHaveLength(2);
    expect(screen.getByText(/当前没有可用于校正的量/)).toBeInTheDocument();
  });

  it("τ² > 0 但没有讲师单独显著：不声称「校正不会改变任何结果」", () => {
    /* τ² > 0 时 bias ≠ 0，收缩仍会改分；此时不能照抄 τ² = 0 的文案 */
    const shrinkOnlyFit: GradingModelFit = {
      ...fit,
      judgers: fit.judgers.map((estimate) => ({
        ...estimate,
        bias: 0.01,
        credibility: 0.4,
        verdict: "fair",
      })),
    };
    render(<GradingFairnessDashboard data={{ ...data, fit: shrinkOnlyFit }} profile={profile} />);

    expect(screen.getByText("未检测到讲师之间的系统性差异")).toBeInTheDocument();
    expect(screen.getByText(/没有哪名讲师的偏离单独达到显著阈值/)).toBeInTheDocument();
    expect(screen.getByText(/保守收缩，不点名任何讲师/)).toBeInTheDocument();
    expect(screen.queryByText(/校正不会改变任何结果/)).toBeNull();
  });
});
