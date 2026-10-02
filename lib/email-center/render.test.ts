jest.mock("server-only", () => ({}));

jest.mock("@/lib/email/result-email", () => ({
  renderResultEmail: jest.fn(async () => "<html>result</html>"),
  renderResultEmailSubject: jest.fn(
    (variables: { flowName: string }) => `${variables.flowName} 结果通知`,
  ),
}));

jest.mock("@/lib/email/interview-schedule", () => ({
  renderInterviewScheduleEmail: jest.fn(async () => "<html>interview</html>"),
  renderInterviewScheduleEmailSubject: jest.fn(
    async (variables: { flowName: string; kind?: string }) =>
      `${variables.flowName} ${variables.kind}`,
  ),
}));

jest.mock("@/lib/email-center/interview-withdrawal", () => ({
  renderInterviewWithdrawalEmail: jest.fn(async () => "<html>withdrawal</html>"),
  renderInterviewWithdrawalEmailSubject: jest.fn(
    (variables: { flowName: string }) => `${variables.flowName} withdrawn`,
  ),
}));

import {
  renderInterviewScheduleEmail,
  renderInterviewScheduleEmailSubject,
} from "@/lib/email/interview-schedule";
import {
  renderInterviewWithdrawalEmail,
  renderInterviewWithdrawalEmailSubject,
} from "@/lib/email-center/interview-withdrawal";
import {
  renderResultEmail,
  renderResultEmailSubject,
} from "@/lib/email/result-email";
import { renderEmailTemplate } from "@/lib/email-center/render";

describe("renderEmailTemplate", () => {
  it("validates required variables from the registry", async () => {
    await expect(
      renderEmailTemplate({
        templateKey: "recruitment.result.accepted",
        variables: {
          name: "",
          flowName: "2026 春季招新",
        },
      }),
    ).rejects.toThrow("候选人姓名");
  });

  it("renders result templates through the result email renderer", async () => {
    const rendered = await renderEmailTemplate({
      templateKey: "recruitment.result.accepted",
      variables: {
        name: "张三",
        flowName: "2026 春季招新",
      },
    });

    expect(rendered).toEqual({
      subject: "2026 春季招新 结果通知",
      html: "<html>result</html>",
    });
    expect(renderResultEmailSubject).toHaveBeenCalledWith(
      {
        name: "张三",
        flowName: "2026 春季招新",
        department: undefined,
        groupNumber: undefined,
      },
      undefined,
    );
    expect(renderResultEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "张三",
        flowName: "2026 春季招新",
        accept: true,
      }),
    );
  });

  it("routes the exemption result templates through the result renderer", async () => {
    const rendered = await renderEmailTemplate({
      templateKey: "recruitment_exemption.result.rejected",
      variables: {
        name: "李四",
        flowName: "2026 免试招新",
      },
    });

    expect(rendered).toEqual({
      subject: "2026 免试招新 结果通知",
      html: "<html>result</html>",
    });
    expect(renderResultEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "李四",
        flowName: "2026 免试招新",
        accept: false,
        flowKind: "recruitment_exemption",
      }),
    );
  });

  it("maps interview template keys to their concrete kind", async () => {
    const startsAt = new Date("2026-06-06T08:00:00.000Z");
    const endsAt = new Date("2026-06-06T08:30:00.000Z");

    const rendered = await renderEmailTemplate({
      templateKey: "interview.schedule.cancelled",
      variables: {
        candidateName: "李四",
        flowName: "2026 免试招新",
        organizerName: "讲师",
        startsAt,
        endsAt,
      },
    });

    expect(rendered).toEqual({
      subject: "2026 免试招新 cancelled",
      html: "<html>interview</html>",
    });
    expect(renderInterviewScheduleEmailSubject).toHaveBeenCalledWith(
      expect.objectContaining({
        flowName: "2026 免试招新",
        candidateName: "李四",
        kind: "cancelled",
      }),
    );
    expect(renderInterviewScheduleEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateName: "李四",
        flowName: "2026 免试招新",
        kind: "cancelled",
      }),
    );
  });

  it("renders the withdrawal notification with its reason", async () => {
    const rendered = await renderEmailTemplate({
      templateKey: "interview.application.withdrawn",
      variables: {
        candidateName: "王五",
        flowName: "2026 免试招新",
        reason: "请补充作品集后重新报名。",
      },
    });

    expect(rendered).toEqual({
      subject: "2026 免试招新 withdrawn",
      html: "<html>withdrawal</html>",
    });
    expect(renderInterviewWithdrawalEmailSubject).toHaveBeenCalledWith(
      expect.objectContaining({
        flowName: "2026 免试招新",
        candidateName: "王五",
        reason: "请补充作品集后重新报名。",
      }),
    );
    expect(renderInterviewWithdrawalEmail).toHaveBeenCalledWith({
      candidateName: "王五",
      flowName: "2026 免试招新",
      reason: "请补充作品集后重新报名。",
      department: undefined,
    });
  });

  it("passes the department override to the interview renderers", async () => {
    await renderEmailTemplate({
      templateKey: "interview.schedule.created",
      department: "software",
      variables: {
        candidateName: "李四",
        flowName: "2026 免试招新",
        organizerName: "讲师",
        startsAt: new Date("2026-06-06T08:00:00.000Z"),
        endsAt: new Date("2026-06-06T08:30:00.000Z"),
      },
    });
    await renderEmailTemplate({
      templateKey: "interview.application.withdrawn",
      department: "software",
      variables: {
        candidateName: "王五",
        flowName: "2026 免试招新",
        reason: "请补充作品集后重新报名。",
      },
    });

    expect(renderInterviewScheduleEmailSubject).toHaveBeenCalledWith(
      expect.objectContaining({
        flowName: "2026 免试招新",
        kind: "created",
        department: "software",
      }),
    );
    expect(renderInterviewScheduleEmail).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "created", department: "software" }),
    );
    expect(renderInterviewWithdrawalEmailSubject).toHaveBeenCalledWith(
      expect.objectContaining({
        flowName: "2026 免试招新",
        department: "software",
      }),
    );
    expect(renderInterviewWithdrawalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "请补充作品集后重新报名。", department: "software" }),
    );
  });
});
