import sanitizeHtml from "sanitize-html";

import type { EmailBlock, EmailColumnCell } from "./blocks";

/**
 * 邮件 HTML 清洗。
 *
 * 模板允许管理员贴自定义 HTML/CSS（富文本编辑器的产物、以及「自定义代码」区块），
 * 而同一段 HTML 会经历两次清洗：
 * - 保存时：把落库内容清一遍（预览与真实发送看到的是同一份干净内容）；
 * - 渲染时：先做 `{变量}` 替换再清一遍——变量值是管理员填的 URL / 文案，
 *   替换发生在 HTML 上下文里，只有替换之后再解析才能挡住引号逃逸注入的属性。
 *
 * 邮件客户端（尤其 Outlook）只认内联 style、忽略 `<style>` 与 class，
 * 因此这里**不**允许 style/script 标签与 class，也不保留任何 `on*` 事件属性；
 * 常用标签会被补上内联样式，保证「编辑器里看到的」与「收件箱里渲染的」一致。
 */

const RICH_TEXT_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "span",
  "a",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "code",
  "pre",
  "hr",
  "div",
  "small",
  /* 富文本里也能插图与做高亮（TipTap 的 Image / Highlight 产物） */
  "img",
  "mark",
];

/** 卡片标题这类「只能内联」的字段 */
const INLINE_ONLY_TAGS = ["br", "strong", "b", "em", "i", "u", "s", "span", "a", "small"];

/** 自定义代码区块额外允许的排版标签：整段版式需要表格与图片 */
const CODE_BLOCK_TAGS = [
  ...RICH_TEXT_TAGS,
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "img",
  "section",
  "center",
  "font",
];

const ALLOWED_ATTRIBUTES = [
  "href",
  "target",
  "rel",
  "style",
  "align",
  "valign",
  "bgcolor",
  "src",
  "alt",
  "title",
  "width",
  "height",
  "border",
  "cellpadding",
  "cellspacing",
  "colspan",
  "rowspan",
  "color",
  "face",
  "size",
];

/** 单个样式值的安全底线：不允许表达式、脚本协议与任意外链资源 */
const SAFE_STYLE_VALUE = [/^(?!.*(?:expression|javascript:|@import))[\s\S]*$/i];

const ALLOWED_STYLES: Record<string, Record<string, RegExp[]>> = {
  "*": {
    color: SAFE_STYLE_VALUE,
    "background-color": SAFE_STYLE_VALUE,
    "background-image": [/^url\(\s*['"]?https:\/\//i],
    background: SAFE_STYLE_VALUE,
    "font-family": SAFE_STYLE_VALUE,
    "font-size": SAFE_STYLE_VALUE,
    "font-weight": SAFE_STYLE_VALUE,
    "font-style": SAFE_STYLE_VALUE,
    "line-height": SAFE_STYLE_VALUE,
    "letter-spacing": SAFE_STYLE_VALUE,
    "text-align": SAFE_STYLE_VALUE,
    "text-decoration": SAFE_STYLE_VALUE,
    "text-transform": SAFE_STYLE_VALUE,
    "white-space": SAFE_STYLE_VALUE,
    "word-break": SAFE_STYLE_VALUE,
    "overflow-wrap": SAFE_STYLE_VALUE,
    "vertical-align": SAFE_STYLE_VALUE,
    display: SAFE_STYLE_VALUE,
    width: SAFE_STYLE_VALUE,
    height: SAFE_STYLE_VALUE,
    "min-width": SAFE_STYLE_VALUE,
    "max-width": SAFE_STYLE_VALUE,
    margin: SAFE_STYLE_VALUE,
    "margin-top": SAFE_STYLE_VALUE,
    "margin-right": SAFE_STYLE_VALUE,
    "margin-bottom": SAFE_STYLE_VALUE,
    "margin-left": SAFE_STYLE_VALUE,
    padding: SAFE_STYLE_VALUE,
    "padding-top": SAFE_STYLE_VALUE,
    "padding-right": SAFE_STYLE_VALUE,
    "padding-bottom": SAFE_STYLE_VALUE,
    "padding-left": SAFE_STYLE_VALUE,
    border: SAFE_STYLE_VALUE,
    "border-color": SAFE_STYLE_VALUE,
    "border-style": SAFE_STYLE_VALUE,
    "border-width": SAFE_STYLE_VALUE,
    "border-radius": SAFE_STYLE_VALUE,
    "border-top": SAFE_STYLE_VALUE,
    "border-bottom": SAFE_STYLE_VALUE,
    "border-left": SAFE_STYLE_VALUE,
    "border-right": SAFE_STYLE_VALUE,
    "box-sizing": SAFE_STYLE_VALUE,
  },
};

/** 常用标签的默认内联样式：编辑器只输出语义标签，间距/颜色由这里补 */
const TAG_DEFAULT_STYLES: Record<string, string> = {
  p: "margin:0 0 12px;",
  a: "color:#1d4ed8;text-decoration:underline;",
  ul: "margin:0 0 12px;padding:0 0 0 22px;",
  ol: "margin:0 0 12px;padding:0 0 0 22px;",
  li: "margin:0 0 6px;",
  blockquote:
    "margin:0 0 12px;padding:8px 14px;border-left:3px solid #d7e5dc;color:#52615a;",
  h1: "margin:0 0 12px;font-size:20px;line-height:28px;",
  h2: "margin:0 0 12px;font-size:18px;line-height:26px;",
  h3: "margin:0 0 10px;font-size:16px;line-height:24px;",
  h4: "margin:0 0 10px;font-size:15px;line-height:22px;",
  hr: "border:none;border-top:1px solid #edf1ef;margin:18px 0;",
  table: "border-collapse:collapse;width:100%;",
  img: "max-width:100%;height:auto;",
};

/**
 * 把标签的默认内联样式并进它已有的 style。
 *
 * **同名属性已经有了就不再写一遍**：清洗在保存与渲染时都会跑，简单的前置拼接会让
 * 「保存一次多一份默认值」无限增长（`color:x;color:x;color:x;…`），既撑大正文，
 * 也让「跟上次保存比有没有改动」永远判成有改动。已有声明仍然排在后面，优先级不变。
 */
function mergeStyleDefaults(defaults: string, style: string) {
  const declared = new Set(
    style
      .split(";")
      .map((declaration) => declaration.split(":")[0]?.trim().toLowerCase())
      .filter((property): property is string => Boolean(property)),
  );
  const missing = defaults
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => {
      const property = declaration.split(":")[0]?.trim().toLowerCase();
      return Boolean(property) && !declared.has(property);
    });
  if (missing.length === 0) return style;
  return `${missing.join(";")};${style}`;
}

const transformTags: NonNullable<sanitizeHtml.IOptions["transformTags"]> =
  Object.fromEntries(
    Object.entries(TAG_DEFAULT_STYLES).map(([tag, defaults]) => [
      tag,
      (tagName: string, attribs: Record<string, string>) => ({
        tagName,
        attribs: { ...attribs, style: mergeStyleDefaults(defaults, attribs.style ?? "") },
      }),
    ]),
  );

export type EmailHtmlSanitizeMode = "richText" | "inlineText" | "codeBlock";

const ALLOWED_TAGS_BY_MODE: Record<EmailHtmlSanitizeMode, string[]> = {
  richText: RICH_TEXT_TAGS,
  inlineText: INLINE_ONLY_TAGS,
  codeBlock: CODE_BLOCK_TAGS,
};

/**
 * 保存前把区块里的 HTML 字段全部清洗一遍（富文本正文、卡片标题与行、自定义代码）。
 * 按钮文案是纯文本、链接由渲染器校验协议，这里只处理 HTML。
 */
export function sanitizeEmailBlocks(blocks: EmailBlock[]): EmailBlock[] {
  return blocks.map((block) => {
    switch (block.type) {
      case "card":
        return {
          ...block,
          title: sanitizeEmailHtml(block.title, "inlineText"),
          rows: block.rows.map((row) => {
            if (row.kind === "divider") return row;
            if (row.kind === "button") return { ...row, label: row.label.trim() };
            return { ...row, html: sanitizeEmailHtml(row.html, "richText") };
          }),
        };
      case "resultPanel":
        return {
          ...block,
          badge: sanitizeEmailHtml(block.badge, "inlineText"),
          title: sanitizeEmailHtml(block.title, "inlineText"),
          summary: sanitizeEmailHtml(block.summary, "inlineText"),
        };
      case "badge":
        return { ...block, text: sanitizeEmailHtml(block.text, "inlineText") };
      case "columns":
        return {
          ...block,
          left: sanitizeColumnCell(block.left),
          right: sanitizeColumnCell(block.right),
        };
      case "image":
        return { ...block, alt: block.alt.trim(), src: block.src.trim(), href: block.href.trim() };
      case "button":
        return { ...block, label: block.label.trim(), url: block.url.trim() };
      case "spacer":
      case "divider":
        return block;
      default:
        return {
          ...block,
          html: sanitizeEmailHtml(
            block.html,
            block.type === "code" ? "codeBlock" : "richText",
          ),
        };
    }
  });
}

/** 分栏单元格：富文本正文清洗 + 按钮文案去空格 */
function sanitizeColumnCell(cell: EmailColumnCell): EmailColumnCell {
  return {
    html: sanitizeEmailHtml(cell.html, "richText"),
    buttonLabel: cell.buttonLabel.trim(),
    buttonUrl: cell.buttonUrl.trim(),
  };
}

/**
 * 按邮件安全白名单清洗 HTML，并给常用标签补上内联样式。
 * 返回值可以直接塞进 `dangerouslySetInnerHTML`。
 */
export function sanitizeEmailHtml(
  value: string,
  mode: EmailHtmlSanitizeMode = "richText",
): string {
  if (!value) return "";
  return sanitizeHtml(value, {
    allowedTags: ALLOWED_TAGS_BY_MODE[mode],
    allowedAttributes: { "*": ALLOWED_ATTRIBUTES },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
    allowedStyles: ALLOWED_STYLES,
    transformTags,
    disallowedTagsMode: "discard",
  }).trim();
}
