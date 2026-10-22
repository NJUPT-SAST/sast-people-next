/** @jest-environment node */

import { buildCollectionInvitationEmail } from "./invitation-email";

describe("buildCollectionInvitationEmail", () => {
  it("includes the inviter, form title, deadline and link", () => {
    const email = buildCollectionInvitationEmail({
      inviterName: "陈屹",
      formTitle: "社团成员信息收集表",
      deadlineLabel: "2026-10-30 18:00:00",
      url: "https://people.example/collect/token",
      message: "请尽快填写",
    });

    expect(email.subject).toContain("陈屹");
    expect(email.subject).toContain("社团成员信息收集表");
    expect(email.html).toContain("截止时间：2026-10-30 18:00:00");
    expect(email.html).toContain("https://people.example/collect/token");
    expect(email.html).toContain("请尽快填写");
  });

  it("escapes user-controlled HTML", () => {
    const email = buildCollectionInvitationEmail({
      inviterName: "<script>alert(1)</script>",
      formTitle: "<b>标题</b>",
      deadlineLabel: null,
      url: "https://people.example/collect/token?x=<y>",
      message: "<img src=x onerror=alert(1)>",
    });

    expect(email.html).not.toContain("<script>alert(1)</script>");
    expect(email.html).not.toContain("<b>标题</b>");
    expect(email.html).not.toContain("<img src=x onerror=alert(1)>");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).toContain("&lt;b&gt;标题&lt;/b&gt;");
  });
});
