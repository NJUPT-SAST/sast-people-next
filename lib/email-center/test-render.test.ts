/** @jest-environment node */

jest.mock("server-only", () => ({}));

/**
 * 「测试发送」的渲染请求必须取模板设置里的值（正文、QQ 群号、按钮文案、链接），
 * 只有「候选人 / 流程 / 时间」这类每封信不同的变量才用示例数据。
 * 曾经把 groupNumber 写死成 "123456789"，导致填了群号却在测试邮件里看不到。
 */

const mockReadResultEmailTemplateSetting = jest.fn();
jest.mock("@/lib/email-center/template-resolution", () => ({
  readResultEmailTemplateSetting: (...args: unknown[]) =>
    mockReadResultEmailTemplateSetting(...args),
}));

import { createTestRenderRequest } from "./test-render";
import { defaultResultEmailTemplateSettings } from "@/lib/email/template-settings";

const officeSetting = {
  ...defaultResultEmailTemplateSettings.find(
    (item) => item.templateKey === "office_round1.result.accepted",
  )!,
  groupNumber: "888777666",
  department: "office" as string | null,
};

beforeEach(() => {
  mockReadResultEmailTemplateSetting.mockReset();
  mockReadResultEmailTemplateSetting.mockResolvedValue(officeSetting);
});

describe("createTestRenderRequest", () => {
  it("uses the saved group number instead of a sample value", async () => {
    const request = await createTestRenderRequest({
      templateKey: "office_round1.result.accepted",
      flowName: "2026 办公类部门面试招新",
      name: "张三",
      operatorName: "部长甲",
      operatorRole: 3,
      department: "office",
    });

    expect(request.variables).toMatchObject({
      name: "张三",
      flowName: "2026 办公类部门面试招新",
      department: "办公室",
      groupNumber: "888777666",
      round: 1,
    });
    /* 设置整体透传：正文 / 链接 / 按钮文案都来自同一条解析结果 */
    expect((request.variables as { setting?: unknown }).setting).toBe(officeSetting);
    expect(mockReadResultEmailTemplateSetting).toHaveBeenCalledWith(
      "office_round1.result.accepted",
      "office",
    );
  });

  it("keeps the office round from the template key", async () => {
    const request = await createTestRenderRequest({
      templateKey: "office_round2.result.accepted",
      flowName: "2026 办公类部门面试招新",
      name: "张三",
      operatorName: "部长甲",
      operatorRole: 3,
      department: "publicity",
    });

    expect(request.variables).toMatchObject({ round: 2, department: "科宣部" });
  });

  it("builds interview schedule samples without touching result settings", async () => {
    const request = await createTestRenderRequest({
      templateKey: "interview.schedule.created",
      flowName: "2026 免试招新",
      name: "李四",
      operatorName: "讲师乙",
      operatorRole: 2,
      department: "software",
    });

    expect(request.variables).toMatchObject({
      candidateName: "李四",
      flowName: "2026 免试招新",
      /* 面试官读当前账号真实姓名，不再用「李四」这类样例值 */
      organizerName: "讲师乙",
    });
    expect(mockReadResultEmailTemplateSetting).not.toHaveBeenCalled();
  });
});