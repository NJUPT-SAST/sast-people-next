import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRequestInterviewSlotChange = jest.fn();
const mockRefresh = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

jest.mock("@/action/user-flow/interview-slot-change", () => ({
  requestInterviewSlotChange: (...args: unknown[]) =>
    mockRequestInterviewSlotChange(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

import { SlotChangeRequest } from "./slotChangeRequest";

/* 申请改期只剩技术部门；办公类时段调整已下线（部长直接改） */
const techProps = {
  userFlowId: 12,
  currentStartsAt: new Date("2026-06-06T08:00:00.000Z"),
  currentEndsAt: new Date("2026-06-06T08:30:00.000Z"),
};

describe("SlotChangeRequest", () => {
  beforeEach(() => {
    mockRequestInterviewSlotChange.mockReset();
    mockRefresh.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
  });

  it("stays hidden for finished registrations without a pending request", () => {
    const { container } = render(
      <SlotChangeRequest {...techProps} pending={null} editable={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("disables the entry while a request is awaiting approval", () => {
    render(
      <SlotChangeRequest
        {...techProps}
        pending={{
          id: 3,
          requestedStartsAt: new Date("2026-06-07T08:00:00.000Z"),
          requestedEndsAt: new Date("2026-06-07T08:30:00.000Z"),
        }}
        editable
      />,
    );

    expect(
      screen.getByText("改约申请处理中：2026-06-07 16:00"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "申请修改面试时间" }),
    ).toBeDisabled();
  });

  it("submits a new time with the mandatory reason and refreshes", async () => {
    const user = userEvent.setup();
    mockRequestInterviewSlotChange.mockResolvedValue({ success: true });

    render(<SlotChangeRequest {...techProps} pending={null} editable />);

    expect(
      screen.getByText(/面试时间不合适？提交申请，由预约讲师处理/),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "申请修改面试时间" }),
    );
    expect(
      screen.getByText(/当前面试时间：2026-06-06 16:00 - 16:30/),
    ).toBeInTheDocument();

    const input = screen.getByLabelText("申请调整为");
    await user.clear(input);
    await user.type(input, "2026-06-07T16:00");
    expect(screen.getByRole("button", { name: "提交申请" })).toBeDisabled();

    await user.type(screen.getByLabelText("申请理由（必填）"), "课程冲突");
    await user.click(screen.getByRole("button", { name: "提交申请" }));

    await waitFor(() =>
      expect(mockRequestInterviewSlotChange).toHaveBeenCalledWith({
        userFlowId: 12,
        requestedStartsAt: "2026-06-07T16:00",
        reason: "课程冲突",
      }),
    );
    expect(mockToastSuccess).toHaveBeenCalledWith("申请已提交，等待预约讲师处理");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("keeps the dialog open and reports the server error", async () => {
    const user = userEvent.setup();
    mockRequestInterviewSlotChange.mockResolvedValue({
      success: false,
      error: { message: "该时间与当前面试时间相同" },
    });

    render(<SlotChangeRequest {...techProps} pending={null} editable />);

    await user.click(
      screen.getByRole("button", { name: "申请修改面试时间" }),
    );
    await user.type(screen.getByLabelText("申请理由（必填）"), "冲突");
    await user.click(screen.getByRole("button", { name: "提交申请" }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("该时间与当前面试时间相同"),
    );
    expect(
      screen.getByRole("heading", { name: "申请修改面试时间" }),
    ).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
