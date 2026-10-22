/** @jest-environment node */

import { buildCollectionInvitationEmail } from "./invitation-email";

describe("buildCollectionInvitationEmail", () => {
  it("includes the form title, deadline, link and message without an inviter", () => {
    const email = buildCollectionInvitationEmail({
      formTitle: "社团成员信息收集表",
      deadlineLabel: "2026-10-30 18:00:00",
      url: "https://people.example/collect/token",
      message: "请尽快填写",
    });

    expect(email.subject).toContain("社团成员信息收集表");
    expect(email.subject).not.toContain("邀请人");
    expect(email.html).toContain("截止时间：2026-10-30 18:00:00");
    expect(email.html).toContain("https://people.example/collect/token");
    expect(email.html).toContain("请尽快填写");
    expect(email.html).not.toContain("陈屹");
  });

  it("supports custom managed template values", () => {
    const email = buildCollectionInvitationEmail({
      formTitle: "表单",
      deadlineLabel: null,
      url: "https://people.example/collect/token",
      template: {
        subjectTemplate: "自定义主题 {formTitle}",
        titleTemplate: "自定义标题",
        bodyTemplate: "自定义正文：{formTitle}，截止 {deadline}",
        footerText: "自定义落款",
      },
    });

    expect(email.subject).toBe("自定义主题 表单");
    expect(email.html).toContain("自定义标题");
    expect(email.html).toContain("自定义正文：表单，截止 不设截止");
    expect(email.html).toContain("自定义落款");
  });

  it("escapes user-controlled HTML", () => {
    const email = buildCollectionInvitationEmail({
      formTitle: "<b>标题</b>",
      deadlineLabel: null,
      url: "https://people.example/collect/token?x=<y>",
      message: "<img src=x onerror=alert(1)>",
    });

    expect(email.html).not.toContain("<b>标题</b>");
    expect(email.html).not.toContain("<img src=x onerror=alert(1)>");
    expect(email.html).toContain("&lt;b&gt;标题&lt;/b&gt;");
  });
});
