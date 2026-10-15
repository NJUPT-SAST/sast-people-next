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
import type { GradingObservation } from "@/lib/grading-fairness/types";

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

  it("默认 λ=0：校正分与原始分一致，且显示整体均分守恒", () => {
    renderDashboard();

    expect(screen.getByText(/总分变化 0 分/)).toBeInTheDocument();
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
    /* 不可校正时不该出现任何校正控件 */
    expect(screen.queryByRole("slider", { name: "全局校正强度" })).toBeNull();
    expect(screen.queryByRole("button", { name: "保存参数" })).toBeNull();
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
    expect(screen.getByText(/可可靠检出约 \d+pp 以上的差异/)).toBeInTheDocument();
    expect(screen.getByText("讲师宽严（森林图）")).toBeInTheDocument();
    expect(screen.getByText("校正前后平均得分率")).toBeInTheDocument();
    expect(screen.getByText(/诊断：讲师 × 题目 标准化残差/)).toBeInTheDocument();
    expect(screen.getByText("名次变化")).toBeInTheDocument();
  });
});
