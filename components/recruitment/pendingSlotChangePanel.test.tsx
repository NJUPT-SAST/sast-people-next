import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockReviewInterviewSlotChange = jest.fn();
const mockRefresh = jest.fn();

jest.mock("@/action/user-flow/interview-slot-change", () => ({
  reviewInterviewSlotChange: (...args: unknown[]) =>
    mockReviewInterviewSlotChange(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

import { PendingSlotChangePanel } from "./pendingSlotChangePanel";

/* 改期审批只剩技术部门：办公类时段调整已下线（部长直接改） */
const pendingRow = {
  id: 8,
  userFlowId: 13,
  flowId: 6,
  flowTitle: "2026 软件研发部 WOC",
  flowType: "woc",
  department: "software",
  userId: 5,
  candidateName: "王五",
  candidateStudentId: "B24040003",
  currentStartsAt: new Date("2026-06-06T08:00:00.000Z"),
  currentEndsAt: new Date("2026-06-06T08:30:00.000Z"),
  requestedStartsAt: new Date("2026-06-07T08:00:00.000Z"),
  requestedEndsAt: new Date("2026-06-07T08:30:00.000Z"),
  reason: "与课程冲突",
  scheduleId: 33,
  organizerId: 7,
  createdAt: new Date("2026-06-05T02:00:00.000Z"),
};

describe("PendingSlotChangePanel", () => {
  beforeEach(() => {
    mockReviewInterviewSlotChange.mockReset();
    mockRefresh.mockReset();
  });

  it("renders nothing when there is no pending request", () => {
    const { container } = render(<PendingSlotChangePanel rows={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("approves a technical reschedule request with the new interview time", async () => {
    const user = userEvent.setup();
    mockReviewInterviewSlotChange.mockResolvedValue({
      success: true,
      appliedStartsAt: pendingRow.requestedStartsAt,
    });

    render(<PendingSlotChangePanel rows={[pendingRow]} />);

    expect(screen.getByText("2026 软件研发部 WOC")).toBeInTheDocument();
    expect(screen.getByText("王五")).toBeInTheDocument();
    expect(screen.getByText("与课程冲突")).toBeInTheDocument();
    expect(screen.getByText("2026-06-05 10:00")).toBeInTheDocument();
    expect(screen.getByText("2026-06-06 16:00")).toBeInTheDocument();
    expect(screen.getByText("2026-06-07 16:00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "同意改约" }));
    expect(screen.getByText(/同步飞书日程与留档会议/)).toBeInTheDocument();
    await user.type(
      screen.getByLabelText("备注（选填）"),
      "已与候选人确认",
    );
    await user.click(screen.getByRole("button", { name: "确认同意" }));

    await waitFor(() =>
      expect(mockReviewInterviewSlotChange).toHaveBeenCalledWith(
        pendingRow.id,
        true,
        { reviewNote: "已与候选人确认" },
      ),
    );
    await waitFor(() =>
      expect(jest.requireMock("sonner").toast.success).toHaveBeenCalledWith(
        expect.stringContaining("飞书日程与通知已同步"),
      ),
    );
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("requires a rejection reason before rejecting", async () => {
    const user = userEvent.setup();
    mockReviewInterviewSlotChange.mockResolvedValue({ success: true });

    render(<PendingSlotChangePanel rows={[pendingRow]} />);

    await user.click(screen.getByRole("button", { name: "暂不改期" }));
    expect(screen.getByRole("button", { name: "确认暂不改期" })).toBeDisabled();

    await user.type(
      screen.getByLabelText("说明（必填）"),
      "该时间已有其他安排",
    );
    await user.click(screen.getByRole("button", { name: "确认暂不改期" }));

    await waitFor(() =>
      expect(mockReviewInterviewSlotChange).toHaveBeenCalledWith(
        pendingRow.id,
        false,
        { reviewNote: "该时间已有其他安排" },
      ),
    );
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("surfaces a failed review instead of refreshing the list", async () => {
    const user = userEvent.setup();
    mockReviewInterviewSlotChange.mockRejectedValue(new Error("该申请已处理"));

    render(<PendingSlotChangePanel rows={[pendingRow]} />);

    await user.click(screen.getByRole("button", { name: "同意改约" }));
    await user.click(screen.getByRole("button", { name: "确认同意" }));

    await waitFor(() =>
      expect(
        jest.requireMock("sonner").toast.error,
      ).toHaveBeenCalledWith("该申请已处理"),
    );
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
