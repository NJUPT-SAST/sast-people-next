import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CheckinScanner from "./checkinScanner";

let onDecodeResult: ((result: { getText: () => string }) => void) | undefined;
const resolveCheckinCandidates = jest.fn();
const checkInCandidate = jest.fn();
const toastError = jest.fn();
const toastSuccess = jest.fn();
const onSignedIn = jest.fn();

const stableDevices = [{ deviceId: "camera-1", label: "后置摄像头" }];

jest.mock("react-zxing", () => ({
  useZxing: (options: {
    onDecodeResult: (result: { getText: () => string }) => void;
  }) => {
    onDecodeResult = options.onDecodeResult;
    return { ref: { current: null } };
  },
}));

jest.mock("react-media-devices", () => ({
  useMediaDevices: () => ({ devices: stableDevices }),
}));

jest.mock("@/action/user-flow/checkin", () => ({
  resolveCheckinCandidates: (...args: unknown[]) =>
    resolveCheckinCandidates(...args),
  checkInCandidate: (...args: unknown[]) => checkInCandidate(...args),
}));

jest.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const candidate = (overrides: Record<string, unknown> = {}) => ({
  userFlowId: 588,
  uid: 9001,
  name: "张三",
  studentId: "2026001",
  interviewSlot: "13:00-14:00",
  choice: 1,
  round: 1,
  otherDepartments: [],
  ...overrides,
});

const decode = async (payload: unknown) => {
  await act(async () => {
    onDecodeResult?.({ getText: () => btoa(JSON.stringify(payload)) });
  });
};

const startScanning = async (user: ReturnType<typeof userEvent.setup>) => {
  render(<CheckinScanner round={1} onSignedIn={onSignedIn} />);
  await user.click(screen.getByRole("button", { name: /开启摄像头/i }));
};

describe("CheckinScanner", () => {
  beforeEach(() => {
    resolveCheckinCandidates.mockReset();
    checkInCandidate.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
    onSignedIn.mockReset();
  });

  it("checks a scanned candidate into the department they queued for", async () => {
    const user = userEvent.setup();
    resolveCheckinCandidates.mockResolvedValue({
      uid: 9001,
      matches: [
        {
          flowId: 141,
          departmentLabel: "办公室",
          choice: 1,
          existing: null,
          candidate: candidate(),
          block: null,
        },
      ],
    });
    checkInCandidate.mockResolvedValue({
      success: true,
      entry: { id: 1, queueNo: "A001" },
    });

    await startScanning(user);
    await decode({ uid: 9001, time: Date.now() });

    await waitFor(() => {
      expect(resolveCheckinCandidates).toHaveBeenCalledWith(1, 9001);
      expect(screen.getByText("办公室")).toBeInTheDocument();
      expect(screen.getByText("第一志愿")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "签到" }));

    await waitFor(() => {
      expect(checkInCandidate).toHaveBeenCalledWith(141, 1, 588, "staff_scan");
      expect(toastSuccess).toHaveBeenCalledWith("办公室 签到成功 · 叫号 A001");
      expect(onSignedIn).toHaveBeenCalled();
    });
  });

  it("offers both volunteer registrations and signs the pending one", async () => {
    const user = userEvent.setup();
    const second = candidate({ userFlowId: 777, choice: 2, otherDepartments: ["办公室"] });
    resolveCheckinCandidates.mockResolvedValue({
      uid: 9001,
      matches: [
        {
          flowId: 141,
          departmentLabel: "办公室",
          choice: 1,
          existing: { id: 7, queueNo: "A003", status: "waiting" },
          candidate: null,
          block: null,
        },
        {
          flowId: 142,
          departmentLabel: "科宣部",
          choice: 2,
          existing: null,
          candidate: second,
          block: { reason: "busy", departmentLabel: "办公室" },
        },
      ],
    });
    checkInCandidate.mockResolvedValue({
      success: true,
      entry: { id: 2, queueNo: "A004" },
    });

    await startScanning(user);
    await decode({ uid: 9001, time: Date.now() });

    await waitFor(() => {
      expect(screen.getByText("办公室")).toBeInTheDocument();
      expect(screen.getByText("科宣部")).toBeInTheDocument();
      expect(screen.getByText("第二志愿")).toBeInTheDocument();
      expect(screen.getByText(/正在办公室面试/)).toBeInTheDocument();
    });

    // 已签到的部门只显示状态，只有未签到的部门有「签到」按钮
    expect(screen.getAllByRole("button", { name: "签到" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "签到" }));

    await waitFor(() => {
      expect(checkInCandidate).toHaveBeenCalledWith(142, 1, 777, "staff_scan");
    });
  });

  it("rejects a candidate with no office registration this round", async () => {
    const user = userEvent.setup();
    resolveCheckinCandidates.mockResolvedValue({ uid: 4242, matches: [] });

    await startScanning(user);
    await decode({ uid: 4242, time: Date.now() });

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("该同学本轮没有可面试的办公部门报名");
    });
    expect(checkInCandidate).not.toHaveBeenCalled();
  });

  it("rejects an unreadable QR payload", async () => {
    const user = userEvent.setup();
    await startScanning(user);

    await act(async () => {
      onDecodeResult?.({ getText: () => "not-base64-json" });
    });

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("二维码内容无效，请重试");
    });
    expect(resolveCheckinCandidates).not.toHaveBeenCalled();
  });
});
