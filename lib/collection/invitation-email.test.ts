/** @jest-environment node */

import {
  buildCollectionInvitationEmail,
  buildCollectionReturnEmail,
} from "./invitation-email";

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

  it("tells already-submitted invitees they can ignore the email", () => {
    const base = {
      formTitle: "表单",
      deadlineLabel: null,
      url: "https://people.example/collect/token",
    };
    expect(
      buildCollectionInvitationEmail({ ...base, alreadySubmitted: true }).html,
    ).toContain("可忽略本邮件");
    expect(
      buildCollectionInvitationEmail({ ...base, alreadySubmitted: false }).html,
    ).not.toContain("可忽略本邮件");
  });
});

describe("buildCollectionReturnEmail", () => {
  it("asks the submitter to revise without offering an ignore option", () => {
    const email = buildCollectionReturnEmail({
      name: "张三",
      formTitle: "社团成员信息收集表",
      deadlineLabel: "2026-10-30 18:00:00",
      url: "https://people.sast.fun/collect/token",
      note: "班级格式不对，请改为 B240101",
    });

    expect(email.subject).toContain("填写需要修改");
    expect(email.html).toContain("请修改后重新提交");
    expect(email.html).toContain("请在截止时间前完成修改并重新提交");
    expect(email.html).toContain("班级格式不对");
    expect(email.html).not.toContain("忽略");
  });
});
