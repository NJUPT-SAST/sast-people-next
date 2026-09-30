import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockGetFlowResultPublicationSummary = jest.fn();
const mockPublishFlowResults = jest.fn();
const mockSetOfficeFinalDestination = jest.fn();

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

describe("ResultPublicationPanel publication status", () => {
  beforeEach(() => {
    mockGetFlowResultPublicationSummary.mockReset();
  });

  it("shows an in-progress state while a publication is running", async () => {
    mockGetFlowResultPublicationSummary.mockResolvedValue(buildSummary({ status: "publishing" }));

    render(<ResultPublicationPanel flowId={7} />);

    expect(await screen.findByText("结果正在发布，请稍候。")).toBeInTheDocument();
    expect(screen.getAllByText("发布中")).toHaveLength(2);
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

  it("lets a manager set the final destination for an office candidate with two volunteers", async () => {
    const user = userEvent.setup();
    mockSetOfficeFinalDestination.mockReset();
    mockSetOfficeFinalDestination.mockResolvedValue({
      success: true,
      department: "publicity",
    });
    mockGetFlowResultPublicationSummary.mockResolvedValue({
      ...buildSummary(),
      isOfficeFlow: true,
      rows: [
        {
          userFlowId: 21,
          userId: 9,
          name: "张三",
          studentId: "B24040001",
          applyGroup: null,
          status: "passed",
          choice: 1,
          finalDepartment: null,
          officeChoices: [
            { userFlowId: 21, choice: 1, department: "office", flowTitle: "办公室" },
            { userFlowId: 22, choice: 2, department: "publicity", flowTitle: "科宣部" },
          ],
        },
      ],
    });

    render(<ResultPublicationPanel flowId={7} />);
    await user.click(await screen.findByRole("button", { name: "查看完整名单" }));

    expect(screen.getByText("第一志愿")).toBeInTheDocument();
    expect(screen.getByText("另一志愿：科宣部")).toBeInTheDocument();
    const trigger = screen.getByLabelText("设置 张三 的最终去向");
    expect(trigger).toHaveTextContent("自动");

    await user.click(trigger);
    await user.click(
      await screen.findByRole("option", { name: /科宣部（第二志愿）/ }),
    );

    expect(mockSetOfficeFinalDestination).toHaveBeenCalledWith(21, "publicity");
  });
});
