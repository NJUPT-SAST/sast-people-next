import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";

import { EmailRecordActions } from "./EmailRecordActions";
import { PreviewDialog } from "./emailDashboardDialogs";
import type { EmailDeliveryRecord } from "./emailDashboardTypes";

jest.mock("@/action/email/delivery", () => ({
  retryEmailDelivery: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    promise: jest.fn(),
    success: jest.fn(),
  },
}));

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

const delivery: EmailDeliveryRecord = {
  id: 1,
  category: "result",
  templateKey: "recruitment.result.accepted",
  subject: "结果通知",
  toAddress: "candidate@njupt.edu.cn",
  status: "sent",
  errorMessage: null,
  attemptCount: 1,
  lastAttemptAt: new Date("2026-06-08T08:00:00.000Z"),
  nextRetryAt: null,
  deadLetteredAt: null,
  sentAt: new Date("2026-06-08T08:01:00.000Z"),
  createdAt: new Date("2026-06-08T08:00:00.000Z"),
  htmlSnapshot: "<html><body><script>window.top.alert('xss')</script></body></html>",
  userId: 101,
  flowId: 7,
  userFlowId: 42,
  batchId: 9,
  relatedScheduleId: null,
  createdById: 3,
  batchName: "批次",
  flowTitle: "2026 春季招新",
  userName: "张三",
  studentId: "B001",
  createdByName: "管理员",
  attempts: [],
};

describe("email preview iframes", () => {
  beforeEach(() => {
    mockUseRouter.mockReturnValue({
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
    });
  });

  it("sandboxes template preview iframe content", async () => {
    const user = userEvent.setup();
    render(<PreviewDialog title="模板预览" html="<p>preview</p>" />);

    await user.click(screen.getByRole("button", { name: "模板样张" }));

    expect(screen.getByTitle("模板预览")).toHaveAttribute("sandbox", "");
  });

  it("sandboxes stored delivery snapshot iframe content", async () => {
    const user = userEvent.setup();
    render(<EmailRecordActions delivery={delivery} />);

    await user.click(screen.getByRole("button", { name: "查看详情" }));

    expect(screen.getByTitle("结果通知 邮件正文")).toHaveAttribute("sandbox", "");
  });
});
