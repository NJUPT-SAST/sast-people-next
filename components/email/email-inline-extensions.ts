"use client";

import { Color, FontFamily, FontSize, LineHeight, TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TextAlign from "@tiptap/extension-text-align";
import StarterKit from "@tiptap/starter-kit";

/**
 * 邮件里的图片：只认外链（data:/cid: 在收件箱里表现不可控），
 * 宽度只有两种可靠写法 —— 纯数字走 `width` 属性（Outlook 最认这个），
 * 带单位/百分比（如 `60%`）走内联 `style="width: 60%"`。
 */
export const EmailImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        /* 读回 `width="320"` 或 `style="width: 320px"`（清洗后可能是后者），
           统一成纯数字，输出时再决定用属性还是内联样式 */
        parseHTML: (element: HTMLElement) => {
          const attribute = element.getAttribute("width");
          if (attribute) return attribute;
          const styleWidth = element.style?.width ?? "";
          const px = styleWidth.match(/^(\d+)px$/);
          if (px) return px[1];
          return styleWidth || null;
        },
        renderHTML: (attributes: Record<string, unknown>) => {
          const width = attributes.width;
          if (width === null || width === undefined || width === "") return {};
          const value = String(width);
          if (/^\d+$/.test(value)) return { width: value };
          return { style: `width: ${value}; max-width: 100%` };
        },
      },
    };
  },
}).configure({ inline: false, allowBase64: false });

/**
 * 邮件正文的行内能力：**画布外层文档与富文本区块共用同一套**（加粗/斜体/下划线/删除线/
 * 标题/列表/引用/代码/链接/文字色/高亮/字号/字体/行高/对齐/上标下标/图片）。
 *
 * 两边共用是必须的：同一个 `{变量}` 富文本既可能长在外层文档（文本区块），
 * 也可能长在区块里的行（卡片行 / 双栏），序列化与清洗规则一旦分叉就会出现
 * 「保存一次格式就丢」的问题。
 */
export function createEmailInlineExtensions({
  undoRedo = true,
}: {
  /** 画布外层用自己的草稿历史，关掉 ProseMirror 自带的 history */
  undoRedo?: boolean;
} = {}) {
  return [
    StarterKit.configure({
      undoRedo: undoRedo ? undefined : false,
      heading: { levels: [2, 3, 4] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
      },
    }),
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    LineHeight,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Superscript,
    Subscript,
    EmailImage,
  ];
}
