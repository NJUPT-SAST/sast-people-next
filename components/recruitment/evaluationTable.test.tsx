import { render } from "@testing-library/react";

import { EvaluationTable } from "./evaluationTable";

jest.mock("@/action/user-flow/evaluation", () => ({
  createEvaluation: jest.fn(),
  rejectCandidate: jest.fn(),
  reopenAndEvaluate: jest.fn(),
}));

jest.mock("@/action/user-flow/interviewSchedule", () => ({
  cancelInterviewSchedule: jest.fn(),
  createInterviewSchedule: jest.fn(),
  previewInterviewScheduleEmail: jest.fn(),
}));

jest.mock("@/action/ai/candidate", () => ({
  generateEvaluationDraft: jest.fn(),
}));

jest.mock("@/components/feishu-oauth-status", () => ({
  FeishuOAuthStatus: () => null,
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
  },
}));

describe("EvaluationTable", () => {
  it("uses distinct target ids for desktop and mobile render paths", () => {
    render(
      <EvaluationTable
        role={3}
        targetUserFlowId={42}
        onRefresh={jest.fn()}
        candidates={[
          {
            userFlowId: 42,
            uid: 1,
            name: "张三",
            studentId: "B001",
            phoneNumber: "13800000000",
            status: "ongoing",
            portfolioLink: null,
            evalId: null,
            evalContent: null,
            evalMeetingLink: null,
            evalStatus: null,
            scheduleId: null,
            scheduleMeetingLink: null,
            scheduleLink: null,
            scheduleMeetingMinuteLink: null,
            scheduleLocation: null,
            scheduleStartsAt: null,
            scheduleEndsAt: null,
            scheduleStatus: null,
          },
        ]}
      />,
    );

    expect(document.getElementById("user-flow-42-desktop")).toBeInTheDocument();
    expect(document.getElementById("user-flow-42-mobile")).toBeInTheDocument();
    expect(document.getElementById("user-flow-42")).not.toBeInTheDocument();
  });
});
