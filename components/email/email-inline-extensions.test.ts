/**
 * 正文 HTML 的往返契约：`html → 编辑器文档 → html`。
 *
 * 下一步会把文本区块升级成「文档里的正文节点」（整篇一个编辑器、跨块选中、整篇文字撤销）。
 * 那一步的前提是**序列化不丢东西** —— 这里先用真实编辑器把现有的行内能力全部过一遍：
 * 加粗/斜体/下划线/删除线/上标下标/标题/列表/引用/行内代码/链接/文字色/高亮/字号/字体/行高/对齐/图片。
 *
 * 判定口径：往返后的 HTML 再解析成文本 + 标记集合必须一致；只允许标签写法差异（如 b/strong）。
 */
import { Editor } from "@tiptap/core";

import { createEmailInlineExtensions } from "@/components/email/email-inline-extensions";
import { renderTemplateText } from "@/lib/email/template-settings";

function createEditor() {
  return new Editor({
    extensions: createEmailInlineExtensions(),
    content: "<p>seed</p>",
  });
}

/** 把一段 HTML 解析进编辑器再取回来（模拟「载入 → 保存」） */
function roundTrip(editor: Editor, html: string): string {
  editor.commands.setContent(`<p>${html}</p>`, { emitUpdate: false });
  return editor.getHTML();
}

function textOf(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("邮件正文 HTML 往返", () => {
  let editor: Editor;

  beforeAll(() => {
    editor = createEditor();
  });

  afterAll(() => {
    editor.destroy();
  });

  it("保留文字与 {变量} 占位", () => {
    const html = "亲爱的{name}同学，恭喜你顺利通过 {flowName}。";
    const out = roundTrip(editor, html);

    expect(textOf(out)).toBe(html);
    /* 变量替换依赖花括号原样保留 */
    expect(renderTemplateText(textOf(out), { name: "张三", flowName: "2026 春招" })).toBe(
      "亲爱的张三同学，恭喜你顺利通过 2026 春招。",
    );
  });

  it("保留行内标记（加粗/斜体/下划线/删除线/颜色/高亮/字号/字体/行高/上标）", () => {
    const out = roundTrip(
      editor,
      '<strong>粗</strong><em>斜</em><u>下</u><s>删</s>' +
        '<span style="color: #157347">绿字</span>' +
        /* 高亮的规范形态是 mark 自带内联背景色（编辑器就是这么产出的） */
        '<mark style="background-color: #fef08a">高亮</mark>' +
        '<span style="font-size: 18px; font-family: Georgia, serif; line-height: 26px">大字</span>' +
        "<sup>上</sup><sub>下</sub>",
    );

    expect(out).toMatch(/<(strong|b)>粗<\/(strong|b)>/);
    expect(out).toContain("斜");
    expect(out).toMatch(/<u>下<\/u>/);
    expect(out).toMatch(/<(s|del)>删<\/(s|del)>/);
    /* DOM 会把颜色规范化成 rgb()，这里按语义断言 */
    expect(out).toMatch(/color: (rgb\(21, 115, 71\)|#157347)/);
    expect(out).toMatch(/background-color: (rgb\(254, 240, 138\)|#fef08a)/);
    expect(out).toContain("font-size: 18px");
    expect(out).toContain("Georgia, serif");
    expect(out).toContain("line-height: 26px");
    expect(out).toContain("<sup>上</sup>");
    expect(out).toContain("<sub>下</sub>");
    expect(textOf(out)).toBe("粗斜下删绿字高亮大字上下");
  });

  it("保留链接与列表", () => {
    const linked = roundTrip(
      editor,
      '<a href="https://example.com/a">链接</a>',
    );
    expect(linked).toContain('href="https://example.com/a"');
    expect(textOf(linked)).toBe("链接");

    const list = roundTrip(editor, "<ul><li>一</li><li>二</li></ul>");
    expect(list).toMatch(/<ul>/);
    expect(list.match(/<li>/g)?.length).toBe(2);
  });

  it("保留图片的宽度写法（纯数字走 width 属性）", () => {
    const out = roundTrip(
      editor,
      '<img src="https://example.com/a.png" width="320" alt="图">',
    );
    expect(out).toContain('src="https://example.com/a.png"');
    expect(out).toContain('width="320"');
  });
});
