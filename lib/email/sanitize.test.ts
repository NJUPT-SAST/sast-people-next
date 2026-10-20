import { sanitizeEmailBlocks, sanitizeEmailHtml } from "@/lib/email/sanitize";
import type { EmailBlock } from "@/lib/email/blocks";

describe("sanitizeEmailHtml", () => {
  it("strips scripts, event handlers and dangerous url schemes", () => {
    const html = sanitizeEmailHtml(
      '<p>正文</p><script>alert(1)</script><img src="x" onerror="alert(2)" /><a href="javascript:alert(3)">点我</a>',
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("正文");
    /* 危险链接保留文字但不留 href */
    expect(html).toContain("点我");
  });

  it("keeps inline styles that email clients honour and drops the rest", () => {
    const html = sanitizeEmailHtml(
      '<p style="color:#157347;font-size:16px;position:fixed">彩色</p>',
    );

    expect(html).toContain("color:#157347");
    expect(html).toContain("font-size:16px");
    expect(html).not.toContain("position");
  });

  it("keeps template placeholders in href so {变量} still works at render time", () => {
    const html = sanitizeEmailHtml(
      '<a href="{memberInfoFormUrl}">填写信息表</a>',
    );

    expect(html).toContain('href="{memberInfoFormUrl}"');
    /* 链接默认样式由清洗器补上，编辑器里看到的与收件箱里一致 */
    expect(html).toContain("text-decoration:underline");
  });

  it("restricts rich text to inline-friendly tags but lets code blocks use tables", () => {
    const rich = sanitizeEmailHtml("<table><tr><td>表格</td></tr></table>", "richText");
    const code = sanitizeEmailHtml("<table><tr><td>表格</td></tr></table>", "codeBlock");

    expect(rich).not.toContain("<table");
    expect(code).toContain("<table");
  });

  it("never keeps a style tag even in code blocks", () => {
    const html = sanitizeEmailHtml("<style>p{color:red}</style><p>正文</p>", "codeBlock");

    expect(html).not.toContain("<style");
    expect(html).toContain("正文");
  });

  it("is idempotent: re-cleaning an already cleaned body must not pile up default styles", () => {
    const once = sanitizeEmailHtml('<p>正文</p><a href="https://a.b">链接</a>');
    const twice = sanitizeEmailHtml(once);
    const thrice = sanitizeEmailHtml(twice);

    /* 保存与渲染都会清洗一遍，重复清洗不能让默认样式一次次追加（否则正文每存一次就变长） */
    expect(twice).toBe(once);
    expect(thrice).toBe(once);
    expect(once.match(/color:#1d4ed8/g)).toHaveLength(1);
  });
});

describe("sanitizeEmailBlocks", () => {
  it("cleans every html field of a card", () => {
    const blocks: EmailBlock[] = [
      {
        id: "b1",
        type: "card",
        enabled: true,
        tone: "success",
        title: "<b>标题</b><script>alert(1)</script>",
        rows: [
          { id: "b1r1", kind: "text", html: "<span onclick=\"x()\">行</span>" },
          { id: "b1r2", kind: "button", label: " 按钮 ", url: "{feishuGroupUrl}", variant: "dark" },
          { id: "b1r3", kind: "divider" },
        ],
      },
    ];

    const [cleaned] = sanitizeEmailBlocks(blocks);
    expect(cleaned.type).toBe("card");
    if (cleaned.type !== "card") return;

    expect(cleaned.title).toBe("<b>标题</b>");
    expect(JSON.stringify(cleaned.rows)).not.toContain("onclick");
    /* 按钮文案是纯文本，只做去空格 */
    expect(cleaned.rows[1]).toMatchObject({ kind: "button", label: "按钮" });
  });
});
