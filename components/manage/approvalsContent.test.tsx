import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApprovalsContent } from "./approvalsContent";

jest.mock("@/action/user-flow/evaluation", () => ({
  getAllEvaluations: jest.fn(),
  approveEvaluation: jest.fn(),
  rejectEvaluation: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

const timestamp = new Date("2026-08-06T08:00:00.000Z");

function row({
  id,
  candidateName,
  status,
  recommendation,
  reviewerName = null,
}: {
  id: number;
  candidateName: string;
  status: "submitted" | "approved" | "rejected";
  recommendation: "passed" | "failed" | null;
  reviewerName?: string | null;
}) {
  return {
    evaluation: {
      id,
      fkUserFlowId: id,
      content: `${candidateName} 的面评`,
      meetingLink: null,
      recommendation,
      status,
      fkReviewedBy: status === "submitted" ? null : 1,
      fkUserId: 2,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    meetingLink: null,
    portfolioLink: null,
    authorName: "讲师",
    reviewerName,
    candidateName,
    candidateStudentId: `B26${id}`,
    flowTitle: "2026 免试招新",
    flowType: "recruitment_exemption",
  } as never;
}

describe("ApprovalsContent", () => {
  it("searches within every administrator-decided archive record", async () => {
    const user = userEvent.setup();
    render(
      <ApprovalsContent
        initialEvaluations={[
          row({ id: 1, candidateName: "待审同学", status: "submitted", recommendation: "passed" }),
          row({ id: 2, candidateName: "张三", status: "approved", recommendation: "passed" }),
          row({ id: 3, candidateName: "李四", status: "rejected", recommendation: "failed" }),
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "已归档 (2)" }));

    expect(screen.getByText("张三")).toBeInTheDocument();
    expect(screen.getByText("李四")).toBeInTheDocument();
    expect(screen.getByText("讲师建议不通过")).toBeInTheDocument();

    await user.type(screen.getByLabelText("搜索归档面评"), "李四");

    expect(screen.queryByText("张三")).not.toBeInTheDocument();
    expect(screen.getByText("李四")).toBeInTheDocument();
  });

  it("shows and searches the administrator who made an archived decision", async () => {
    const user = userEvent.setup();
    render(
      <ApprovalsContent
        initialEvaluations={[
          row({
            id: 1,
            candidateName: "王五",
            status: "approved",
            recommendation: "passed",
            reviewerName: "管理员甲",
          }),
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "已归档 (1)" }));

    expect(screen.getByText("面评人：讲师")).toBeInTheDocument();
    expect(screen.getByText("审批人：管理员甲")).toBeInTheDocument();

    await user.type(screen.getByLabelText("搜索归档面评"), "管理员甲");

    expect(screen.getByText("王五")).toBeInTheDocument();
  });
});
