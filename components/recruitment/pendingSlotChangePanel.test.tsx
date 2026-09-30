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

const pendingRow = {
  id: 7,
  userFlowId: 12,
  flowId: 5,
  flowTitle: "办公室面试招新",
  flowType: "office_interview",
  isOfficeFlow: true,
  department: "office",
  userId: 4,
  candidateName: "李四",
  candidateStudentId: "B24040002",
  currentSlot: "13:00-14:00",
  currentStartsAt: null,
  currentEndsAt: null,
  requestedSlot: "15:00-16:00",
  requestedStartsAt: null,
  requestedEndsAt: null,
  reason: "与考试冲突",
  scheduleId: null,
  organizerId: null,
  createdAt: new Date("2026-08-21T02:00:00Z"),
};

const technicalPendingRow = {
  id: 8,
  userFlowId: 13,
  flowId: 6,
  flowTitle: "2026 软件研发部 WOC",
  flowType: "woc",
  isOfficeFlow: false,
  department: "software",
  userId: 5,
  candidateName: "王五",
  candidateStudentId: "B24040003",
  currentSlot: null,
  currentStartsAt: new Date("2026-06-06T08:00:00.000Z"),
  currentEndsAt: new Date("2026-06-06T08:30:00.000Z"),
  requestedSlot: null,
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

  it("approves a pending slot change request with an optional note", async () => {
    const user = userEvent.setup();
    mockReviewInterviewSlotChange.mockResolvedValue({
      success: true,
      appliedSlot: "15:00-16:00",
    });

    render(<PendingSlotChangePanel rows={[pendingRow]} />);

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
        { reviewNote: "已与候选人确认" },
      ),
    );
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("requires a rejection reason before rejecting", async () => {
    const user = userEvent.setup();
    mockReviewInterviewSlotChange.mockResolvedValue({ success: true });

    render(<PendingSlotChangePanel rows={[pendingRow]} />);

    await user.click(screen.getByRole("button", { name: "驳回" }));
    expect(screen.getByRole("button", { name: "确认驳回" })).toBeDisabled();

    await user.type(
      screen.getByLabelText("驳回理由（必填）"),
      "该时段已有其他安排",
    );
    await user.click(screen.getByRole("button", { name: "确认驳回" }));

    await waitFor(() =>
      expect(mockReviewInterviewSlotChange).toHaveBeenCalledWith(
        pendingRow.id,
        false,
        { reviewNote: "该时段已有其他安排" },
      ),
    );
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("approves a technical reschedule request with the new interview time", async () => {
    const user = userEvent.setup();
    mockReviewInterviewSlotChange.mockResolvedValue({
      success: true,
      appliedStartsAt: technicalPendingRow.requestedStartsAt,
    });

    render(<PendingSlotChangePanel rows={[technicalPendingRow]} />);

    expect(screen.getByText("2026 软件研发部 WOC")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "通过" }));
    expect(screen.getByText(/同步飞书日程与留档会议/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认通过" }));

    await waitFor(() =>
      expect(mockReviewInterviewSlotChange).toHaveBeenCalledWith(
        technicalPendingRow.id,
        true,
        { reviewNote: undefined },
      ),
    );
    await waitFor(() =>
      expect(jest.requireMock("sonner").toast.success).toHaveBeenCalledWith(
        expect.stringContaining("飞书日程与通知已同步"),
      ),
    );
  });

  it("surfaces a failed review instead of refreshing the list", async () => {
    const user = userEvent.setup();
    mockReviewInterviewSlotChange.mockRejectedValue(new Error("该申请已处理"));

    render(<PendingSlotChangePanel rows={[pendingRow]} />);

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
