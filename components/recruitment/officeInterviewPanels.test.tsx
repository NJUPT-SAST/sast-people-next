import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockReviewInterviewSlotChange = jest.fn();
const mockRefresh = jest.fn();

jest.mock("@/action/user-flow/office-interview", () => ({
  reviewInterviewSlotChange: (...args: unknown[]) =>
    mockReviewInterviewSlotChange(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

import { OfficeInterviewPanels } from "./officeInterviewPanels";

const secondChoiceRow = {
  userFlowId: 11,
  flowId: 5,
  flowTitle: "办公室面试招新",
  round: 2,
  userId: 3,
  candidateName: "张三",
  candidateStudentId: "B24040001",
  firstChoiceDepartment: "software",
  progressStatus: "ongoing",
  interviewSlot: "13:00-14:00",
  createdAt: new Date("2026-08-20T02:00:00Z"),
};

const pendingRow = {
  id: 7,
  userFlowId: 12,
  flowId: 5,
  flowTitle: "办公室面试招新",
  department: "office",
  userId: 4,
  candidateName: "李四",
  candidateStudentId: "B24040002",
  currentSlot: "13:00-14:00",
  requestedSlot: "15:00-16:00",
  reason: "与考试冲突",
  createdAt: new Date("2026-08-21T02:00:00Z"),
};

describe("OfficeInterviewPanels", () => {
  beforeEach(() => {
    mockReviewInterviewSlotChange.mockReset();
    mockRefresh.mockReset();
  });

  it("renders nothing when both office lists are empty", () => {
    const { container } = render(
      <OfficeInterviewPanels secondChoiceRows={[]} pendingSlotRows={[]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("lists candidates who put this office department second", () => {
    render(
      <OfficeInterviewPanels
        secondChoiceRows={[secondChoiceRow]}
        pendingSlotRows={[]}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "第二志愿意向本部门的候选人" }),
    ).toBeInTheDocument();
    expect(screen.getByText("张三")).toBeInTheDocument();
    expect(screen.getByText("B24040001")).toBeInTheDocument();
    expect(screen.getByText("软件研发部")).toBeInTheDocument();
    /* user_flow.round 是当前阶段，不是流程轮次 */
    expect(screen.getByText("二面")).toBeInTheDocument();
    expect(screen.getByText("阶段")).toBeInTheDocument();
    expect(screen.getByText("进行中")).toBeInTheDocument();
    expect(screen.getByText("13:00-14:00")).toBeInTheDocument();
    expect(screen.getByText("2026-08-20 10:00")).toBeInTheDocument();
    expect(screen.getByText("办公室面试招新")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "通过" }),
    ).not.toBeInTheDocument();
  });

  it("approves a pending slot change request with an optional note", async () => {
    const user = userEvent.setup();
    mockReviewInterviewSlotChange.mockResolvedValue({
      success: true,
      appliedSlot: "15:00-16:00",
    });

    render(
      <OfficeInterviewPanels
        secondChoiceRows={[]}
        pendingSlotRows={[pendingRow]}
      />,
    );

    expect(screen.getByText("李四")).toBeInTheDocument();
    expect(screen.getByText("与考试冲突")).toBeInTheDocument();
    expect(screen.getByText("2026-08-21 10:00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "通过" }));
    await user.type(
      screen.getByLabelText("备注（选填）"),
      "已与候选人确认",
    );
    await user.click(screen.getByRole("button", { name: "确认通过" }));

    await waitFor(() =>
      expect(mockReviewInterviewSlotChange).toHaveBeenCalledWith(
        pendingRow.id,
        true,
        undefined,
        "已与候选人确认",
      ),
    );
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("rejects a pending slot change request without touching the candidate slot", async () => {
    const user = userEvent.setup();
    mockReviewInterviewSlotChange.mockResolvedValue({ success: true });

    render(
      <OfficeInterviewPanels
        secondChoiceRows={[]}
        pendingSlotRows={[pendingRow]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "驳回" }));
    await user.click(screen.getByRole("button", { name: "确认驳回" }));

    await waitFor(() =>
      expect(mockReviewInterviewSlotChange).toHaveBeenCalledWith(
        pendingRow.id,
        false,
        undefined,
        undefined,
      ),
    );
  });

  it("surfaces a failed review instead of refreshing the list", async () => {
    const user = userEvent.setup();
    mockReviewInterviewSlotChange.mockRejectedValue(new Error("该申请已处理"));

    render(
      <OfficeInterviewPanels
        secondChoiceRows={[]}
        pendingSlotRows={[pendingRow]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "通过" }));
    await user.click(screen.getByRole("button", { name: "确认通过" }));

    await waitFor(() =>
      expect(
        jest.requireMock("sonner").toast.error,
      ).toHaveBeenCalledWith("该申请已处理"),
    );
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
