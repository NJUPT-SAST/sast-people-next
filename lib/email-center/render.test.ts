jest.mock("server-only", () => ({}));

jest.mock("@/lib/email/result-email", () => ({
  renderResultEmail: jest.fn(async () => "<html>result</html>"),
  renderResultEmailSubject: jest.fn((flowName: string) => `${flowName} 结果通知`),
}));

jest.mock("@/lib/email/interview-schedule", () => ({
  renderInterviewScheduleEmail: jest.fn(async () => "<html>interview</html>"),
  renderInterviewScheduleEmailSubject: jest.fn(
    async (flowName: string, kind: string) => `${flowName} ${kind}`,
  ),
}));

import {
  renderInterviewScheduleEmail,
  renderInterviewScheduleEmailSubject,
} from "@/lib/email/interview-schedule";
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
      "2026 春季招新",
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
      "2026 免试招新",
      "cancelled",
    );
    expect(renderInterviewScheduleEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateName: "李四",
        flowName: "2026 免试招新",
        kind: "cancelled",
      }),
    );
  });
});
