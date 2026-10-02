import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

const mockGetFlowResultPublicationSummary = jest.fn();
const mockPublishFlowResults = jest.fn();
const mockSetOfficeFinalDestination = jest.fn();
const mockCloseOfficeRoundTwo = jest.fn();

jest.mock("@/action/flow/result-publication", () => ({
  getFlowResultPublicationSummary: (
    ...args: Parameters<typeof mockGetFlowResultPublicationSummary>
  ) => mockGetFlowResultPublicationSummary(...args),
  publishFlowResults: (...args: Parameters<typeof mockPublishFlowResults>) =>
    mockPublishFlowResults(...args),
}));

jest.mock("@/action/user-flow/office-final-destination", () => ({
  setOfficeFinalDestination: (...args: unknown[]) =>
    mockSetOfficeFinalDestination(...args),
}));

jest.mock("@/action/user-flow/office-rounds", () => ({
  closeOfficeRoundTwo: (...args: Parameters<typeof mockCloseOfficeRoundTwo>) =>
    mockCloseOfficeRoundTwo(...args),
}));

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { ResultPublicationPanel } from "./ResultPublicationPanel";

const templates = {
  accepted: { templateKey: "exam_result_accepted", updatedAt: null, needsReview: false },
  rejected: { templateKey: "exam_result_rejected", updatedAt: null, needsReview: false },
};

const buildSummary = ({
  status,
  unfinished = 0,
}: { status?: string; unfinished?: number } = {}) => ({
  flow: {
    id: 7,
    title: "2026 秋招笔试",
    type: "recruitment" as const,
    createdAt: new Date("2026-08-01T00:00:00Z"),
  },
  rows: [
    {
      userFlowId: 21,
      userId: 9,
      name: "张三",
      studentId: "B24040001",
      applyGroup: "software",
      status: "passed",
    },
  ],
  counts: { total: 1, accepted: 1, rejected: 0, withdrawn: 0, unfinished },
  publication: status
    ? {
        id: 3,
        fkFlowId: 7,
        status,
        version: 1,
        resultSnapshot: {},
        templateSnapshot: {},
        confirmedBy: 1,
        confirmedAt: null,
        publishedAt: null,
        createdAt: new Date("2026-08-01T00:00:00Z"),
        updatedAt: new Date("2026-08-01T00:00:00Z"),
      }
    : null,
  templates,
});

/** 办公类流程：二面候选人、面试分数、两个志愿部门的报名 */
const buildOfficeSummary = ({
  pending = true,
  publication = null,
  includeRoundStats = true,
}: {
  pending?: boolean;
  publication?: string | null;
  /** false = 模拟旧快照 / 旧数据：没有分轮均分字段 */
  includeRoundStats?: boolean;
} = {}) => ({
  flow: {
    id: 7,
    title: "2026 秋招办公类",
    type: "office_interview" as const,
    createdAt: new Date("2026-08-01T00:00:00Z"),
  },
  isOfficeFlow: true,
  rows: [
    {
      userFlowId: 21,
      userId: 9,
      name: "张三",
      studentId: "B24040001",
      applyGroup: "办公室",
      status: pending ? "ongoing" : "passed",
      round: 2,
      choice: 1,
      finalDepartment: null,
      scores: [88, 92],
      ...(includeRoundStats
        ? { round1Average: 84.3, round1Count: 1, round2Average: 90, round2Count: 2 }
        : {}),
      officeChoices: [
        { userFlowId: 21, choice: 1, department: "office", flowTitle: "办公室" },
        { userFlowId: 22, choice: 2, department: "publicity", flowTitle: "科宣部" },
      ],
    },
    {
      userFlowId: 22,
      userId: 10,
      name: "李四",
      studentId: "B24040002",
      applyGroup: "科宣部",
      status: pending ? "ongoing" : "failed",
      round: 2,
      choice: 2,
      finalDepartment: null,
      scores: [],
      ...(includeRoundStats
        ? { round1Average: null, round1Count: 0, round2Average: null, round2Count: 0 }
        : {}),
      officeChoices: [
        { userFlowId: 22, choice: 2, department: "publicity", flowTitle: "科宣部" },
      ],
    },
  ],
  counts: { total: 2, accepted: 0, rejected: 0, withdrawn: 0, unfinished: pending ? 2 : 0 },
  publication: publication
    ? {
        id: 4,
        fkFlowId: 7,
        status: publication,
        version: 1,
        resultSnapshot: {},
        templateSnapshot: {},
        confirmedBy: 1,
        confirmedAt: new Date("2026-08-01T00:00:00Z"),
        publishedAt: publication === "published" ? new Date("2026-08-01T00:00:00Z") : null,
        createdAt: new Date("2026-08-01T00:00:00Z"),
        updatedAt: new Date("2026-08-01T00:00:00Z"),
      }
    : null,
  templates,
});

describe("ResultPublicationPanel publication status", () => {
  beforeEach(() => {
    mockGetFlowResultPublicationSummary.mockReset();
  });

  it("shows an in-progress state while a publication is running", async () => {
    mockGetFlowResultPublicationSummary.mockResolvedValue(buildSummary({ status: "publishing" }));

    render(<ResultPublicationPanel flowId={7} />);

    /* 状态徽章与主按钮都说「发布中」：状态本身不再另写一句重复的说明 */
    expect(await screen.findAllByText("发布中")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /发布中/ })).toBeDisabled();
  });

  it("keeps the publish action disabled after publication", async () => {
    mockGetFlowResultPublicationSummary.mockResolvedValue(buildSummary({ status: "published" }));

    render(<ResultPublicationPanel flowId={7} />);

    expect(await screen.findByText("已发布")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /结果已发布/ })).toBeDisabled();
  });

  it("reports unfinished results instead of offering publication", async () => {
    mockGetFlowResultPublicationSummary.mockResolvedValue(buildSummary({ unfinished: 2 }));

    render(<ResultPublicationPanel flowId={7} />);

    expect(await screen.findByText("有未完成结果")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /确认并发布结果/ })).toBeDisabled();
  });

  it("offers publication once every result is finished", async () => {
    mockGetFlowResultPublicationSummary.mockResolvedValue(buildSummary());

    render(<ResultPublicationPanel flowId={7} />);

    expect(await screen.findByText("可以发布")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /确认并发布结果/ })).toBeEnabled();
  });
});

describe("ResultPublicationPanel office roster", () => {
  beforeEach(() => {
    mockGetFlowResultPublicationSummary.mockReset();
    mockSetOfficeFinalDestination.mockReset();
    mockCloseOfficeRoundTwo.mockReset();
    (toast.success as jest.Mock).mockClear();
    (toast.error as jest.Mock).mockClear();
  });

  it("confirms the round-two roster and publishes with the selected notifications", async () => {
    const user = userEvent.setup();
    mockGetFlowResultPublicationSummary.mockResolvedValue(
      buildOfficeSummary({ pending: true }),
    );
    mockCloseOfficeRoundTwo.mockResolvedValue({ success: true, publishedCount: 2 });

    render(<ResultPublicationPanel flowId={7} />);

    /* 办公类不看「未完成结果」，只看待确认名单的人数 */
    expect(await screen.findByText("待确认名单（2 人）")).toBeInTheDocument();
    const openButton = screen.getByRole("button", { name: /确认名单并发布/ });
    expect(openButton).toBeEnabled();

    await user.click(openButton);

    expect(await screen.findByText("确认最终名单并发布")).toBeInTheDocument();
    /* 弹窗带出二面面试记录的均分与志愿（桌面表格与移动卡片各渲染一份） */
    expect(screen.getAllByText("90")[0]).toBeInTheDocument();
    /* 一面（单人终评）与二面（多位部长均分）分开展示，避免把两轮成绩混为一谈 */
    expect(screen.getAllByText("一面均分").length).toBeGreaterThan(0);
    expect(screen.getAllByText("84.3").length).toBeGreaterThan(0);
    expect(screen.getAllByText("二面均分").length).toBeGreaterThan(0);
    expect(screen.getAllByText("（2 份）").length).toBeGreaterThan(0);
    expect(screen.getAllByText("第一志愿")[0]).toBeInTheDocument();
    expect(screen.getByText("另一志愿：科宣部")).toBeInTheDocument();
    expect(screen.getByText(/1 人没有面试记录/)).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "李四 不通过" })[0]);
    await user.click(
      screen.getAllByRole("checkbox", { name: "向 张三 发送结果邮件" })[0],
    );
    await user.click(screen.getByRole("checkbox", { name: "确认邮件模板" }));
    await user.click(screen.getByRole("button", { name: /确认名单并发布（通过 1 人）/ }));

    await waitFor(() =>
      expect(mockCloseOfficeRoundTwo).toHaveBeenCalledWith(
        7,
        [
          { userFlowId: 21, passed: true },
          { userFlowId: 22, passed: false },
        ],
        [22],
        true,
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("最终结果已发布");
  });

  it("回退旧数据：缺少分轮字段时只按当前轮分数展示", async () => {
    const user = userEvent.setup();
    mockGetFlowResultPublicationSummary.mockResolvedValue(
      buildOfficeSummary({ pending: true, includeRoundStats: false }),
    );

    render(<ResultPublicationPanel flowId={7} />);
    await user.click(await screen.findByRole("button", { name: /确认名单并发布/ }));

    expect(await screen.findByText("确认最终名单并发布")).toBeInTheDocument();
    /* 旧快照没有一面均分字段：整段省略，不影响二面均分展示 */
    expect(screen.queryByText("一面均分")).not.toBeInTheDocument();
    expect(screen.getAllByText("90")[0]).toBeInTheDocument();
    expect(screen.getAllByText("（2 份）").length).toBeGreaterThan(0);
  });

  it("publishes directly when no candidate is left to confirm", async () => {
    const user = userEvent.setup();
    mockGetFlowResultPublicationSummary.mockResolvedValue(
      buildOfficeSummary({ pending: false }),
    );
    mockCloseOfficeRoundTwo.mockResolvedValue({ success: true, publishedCount: 2 });

    render(<ResultPublicationPanel flowId={7} />);

    expect(await screen.findByText("待确认名单（0 人）")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /确认名单并发布/ }));

    await waitFor(() =>
      expect(mockCloseOfficeRoundTwo).toHaveBeenCalledWith(7, [], [21, 22], true),
    );
    expect(screen.queryByText("确认最终名单并发布")).not.toBeInTheDocument();
  });

  it("shows the publish failure verbatim so the manager can retry", async () => {
    const user = userEvent.setup();
    mockGetFlowResultPublicationSummary.mockResolvedValue(
      buildOfficeSummary({ pending: true }),
    );
    mockCloseOfficeRoundTwo.mockResolvedValue({
      success: false,
      error: { message: "名单已确认，但结果发布失败：邮件服务不可用" },
    });

    render(<ResultPublicationPanel flowId={7} />);
    await user.click(await screen.findByRole("button", { name: /确认名单并发布/ }));
    await user.click(await screen.findByRole("checkbox", { name: "确认邮件模板" }));
    await user.click(screen.getByRole("button", { name: /确认名单并发布（通过 2 人）/ }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "名单已确认，但结果发布失败：邮件服务不可用",
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("办公类已发布或发布中时不再提供名单确认", async () => {
    mockGetFlowResultPublicationSummary.mockResolvedValue(
      buildOfficeSummary({ pending: true, publication: "published" }),
    );
    const { unmount } = render(<ResultPublicationPanel flowId={7} />);

    expect(await screen.findByText("已发布")).toBeInTheDocument();
    expect(screen.queryByText(/待确认名单/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /结果已发布/ })).toBeDisabled();
    unmount();

    mockGetFlowResultPublicationSummary.mockResolvedValue(
      buildOfficeSummary({ pending: true, publication: "publishing" }),
    );
    render(<ResultPublicationPanel flowId={7} />);

    expect((await screen.findAllByText("发布中")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/待确认名单/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /发布中/ })).toBeDisabled();
  });

  it("lets a manager set the final destination from the roster dialog", async () => {
    const user = userEvent.setup();
    mockSetOfficeFinalDestination.mockResolvedValue({
      success: true,
      department: "publicity",
    });
    mockGetFlowResultPublicationSummary.mockResolvedValue(
      buildOfficeSummary({ pending: true }),
    );

    render(<ResultPublicationPanel flowId={7} />);
    await user.click(await screen.findByRole("button", { name: /确认名单并发布/ }));

    const trigger = (await screen.findAllByLabelText("设置 张三 的最终去向"))[0];
    if (!trigger) throw new Error("最终去向选择器缺失");
    expect(trigger).toHaveTextContent("自动");

    await user.click(trigger);
    await user.click(
      await screen.findByRole("option", { name: /科宣部（第二志愿）/ }),
    );

    await waitFor(() =>
      expect(mockSetOfficeFinalDestination).toHaveBeenCalledWith(21, "publicity"),
    );
  });
});
