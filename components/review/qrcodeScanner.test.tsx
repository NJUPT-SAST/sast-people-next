import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";

import QRCodeScanner from "./qrcodeScanner";

let onDecodeResult: ((result: { getText: () => string }) => void) | undefined;
const useUserInfoById = jest.fn();
const resolveUserFlowForReview = jest.fn();
const stableDevices = [{ deviceId: "camera-1", label: "前置摄像头" }];

jest.mock("react-zxing", () => ({
  useZxing: (options: { onDecodeResult: (result: { getText: () => string }) => void }) => {
    onDecodeResult = options.onDecodeResult;
    return { ref: { current: null } };
  },
}));

jest.mock("react-media-devices", () => ({
  useMediaDevices: () => ({
    devices: stableDevices,
  }),
}));

jest.mock("@/hooks/useUserInfoById", () => ({
  useUserInfoById: (...args: unknown[]) => useUserInfoById(...args),
}));

jest.mock("@/hooks/useLocalFlowId", () => ({
  useLocalFlowId: () => 1,
}));

jest.mock("./resolveUserFlow", () => ({
  resolveUserFlowForReview: (
    ...args: Parameters<typeof resolveUserFlowForReview>
  ) => resolveUserFlowForReview(...args),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
  },
}));

jest.mock("../ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock("../ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("QRCodeScanner", () => {
  beforeEach(() => {
    resolveUserFlowForReview.mockReset();
    useUserInfoById.mockResolvedValue({
      studentId: "2026001",
      name: "张三",
      major: "软件工程",
    });
    resolveUserFlowForReview.mockResolvedValue({ success: true, userFlowId: 8 });
  });

  it("starts scanning and shows the decoded user info", async () => {
    const user = userEvent.setup();

    render(<QRCodeScanner />);

    await user.click(screen.getByRole("button", { name: /开启摄像头/i }));

    await act(async () => {
      onDecodeResult?.({
        getText: () =>
          btoa(
            JSON.stringify({
              uid: 9,
              time: Date.now(),
            }),
          ),
      });
    });

    await waitFor(() => {
      expect(useUserInfoById).toHaveBeenCalledWith(9);
      expect(resolveUserFlowForReview).toHaveBeenCalledWith("2026001", 1);
      expect(screen.getByText("2026001")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "确认并开始阅卷" }),
      ).toHaveAttribute(
        "href",
        "/dashboard/review/marking?user=2026001",
      );
    });
  });
});
