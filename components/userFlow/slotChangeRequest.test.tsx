import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRequestInterviewSlotChange = jest.fn();
const mockRefresh = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

jest.mock("@/action/user-flow/office-interview", () => ({
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

/* Radix Select 在 jsdom 下依赖指针 API；这里换成原生 select，只验证提交行为 */
jest.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
    children?: React.ReactNode;
  }) => (
    <select
      aria-label="面试时段"
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      <option value="" />
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children?: React.ReactNode;
  }) => <option value={value}>{children}</option>,
}));

import { SlotChangeRequest } from "./slotChangeRequest";

const slotOptions = [
  { label: "13:00-14:00" },
  { label: "15:00-16:00" },
];

describe("SlotChangeRequest", () => {
  beforeEach(() => {
    mockRequestInterviewSlotChange.mockReset();
    mockRefresh.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
  });

  it("stays hidden for finished registrations without a pending request", () => {
    const { container } = render(
      <SlotChangeRequest
        userFlowId={8}
        currentSlot="13:00-14:00"
        slotOptions={slotOptions}
        pendingRequestedSlot={null}
        editable={false}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("disables the entry while a request is awaiting approval", () => {
    render(
      <SlotChangeRequest
        userFlowId={8}
        currentSlot="13:00-14:00"
        slotOptions={slotOptions}
        pendingRequestedSlot="15:00-16:00"
        editable
      />,
    );

    expect(
      screen.getByText("改时段申请待审批：15:00-16:00"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "申请修改面试时段" }),
    ).toBeDisabled();
  });

  it("submits the chosen slot with the reason and refreshes", async () => {
    const user = userEvent.setup();
    mockRequestInterviewSlotChange.mockResolvedValue({ success: true });

    render(
      <SlotChangeRequest
        userFlowId={8}
        currentSlot="13:00-14:00"
        slotOptions={slotOptions}
        pendingRequestedSlot={null}
        editable
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "申请修改面试时段" }),
    );
    expect(screen.getByText(/当前时段：13:00-14:00/)).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox"), "15:00-16:00");
    await user.type(screen.getByLabelText("申请理由（选填）"), "与考试冲突");
    await user.click(screen.getByRole("button", { name: "提交申请" }));

    await waitFor(() =>
      expect(mockRequestInterviewSlotChange).toHaveBeenCalledWith(
        8,
        "15:00-16:00",
        "与考试冲突",
      ),
    );
    expect(mockToastSuccess).toHaveBeenCalledWith("申请已提交，等待部长审批");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("keeps the dialog open and reports the server error", async () => {
    const user = userEvent.setup();
    mockRequestInterviewSlotChange.mockResolvedValue({
      success: false,
      error: { message: "该时段与当前时段相同" },
    });

    render(
      <SlotChangeRequest
        userFlowId={8}
        currentSlot="13:00-14:00"
        slotOptions={slotOptions}
        pendingRequestedSlot={null}
        editable
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "申请修改面试时段" }),
    );
    await user.selectOptions(screen.getByRole("combobox"), "13:00-14:00");
    await user.click(screen.getByRole("button", { name: "提交申请" }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("该时段与当前时段相同"),
    );
    expect(screen.getByText("申请修改面试时段", { selector: "h2" })).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
