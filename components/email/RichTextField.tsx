"use client";

import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  EditorContent,
  Extension,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CaseSensitive,
  Code,
  Eraser,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  MoreHorizontal,
  Palette,
  Quote,
  Redo,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Type,
  Underline,
  Undo,
} from "lucide-react";
import Suggestion from "@tiptap/suggestion";
import { createEmailInlineExtensions } from "./email-inline-extensions";
import { EmailVariableMenu } from "./email-variables";
import { useEffect, useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * 邮件正文的富文本编辑器（TipTap）。
 *
 * 输出的是**内联样式友好**的语义 HTML：邮件客户端（Outlook / Gmail）不认 `<style>` 与 class，
 * 所以这里只产出 p/br/strong/em/u/s/span/a/ul/ol/li/h2/h3/h4/blockquote/code/pre/hr/mark/img/sup/sub 这类标签，
 * 具体的内联样式与清洗由服务端 `lib/email/sanitize.ts` 统一补上——
 * 编辑器里看到的样式与收件箱里渲染的结果因此保持一致。
 *
 * 两种外观：
 * - `boxed`（缺省）：带边框与顶部工具栏，用于表单里「一块输入框」的场景；
 * - `bare`：只有一块可直接打字的正文区（无边框、无工具栏），排版由调用方的 `contentClassName` 决定，
 *   用于「正文长在画布上」的就地编辑。
 * 两种外观都带浮动工具条（选中文字后出现在选区旁），能力与顶部工具栏一致。
 */

const TEXT_COLORS = [
  { label: "正文黑", value: "#172033" },
  { label: "协会绿", value: "#157347" },
  { label: "警示橙", value: "#b45309" },
  { label: "强调红", value: "#c2410c" },
  { label: "链接蓝", value: "#1d4ed8" },
  { label: "玫红", value: "#be185d" },
  { label: "灰", value: "#6b7280" },
];

const HIGHLIGHT_COLORS = [
  { label: "浅黄", value: "#fef08a" },
  { label: "浅绿", value: "#bbf7d0" },
  { label: "浅蓝", value: "#bfdbfe" },
  { label: "浅粉", value: "#fbcfe8" },
  { label: "浅橙", value: "#fed7aa" },
  { label: "浅紫", value: "#ddd6fe" },
];

const FONT_SIZES = [
  { label: "默认", value: null },
  { label: "12px", value: "12px" },
  { label: "14px", value: "14px" },
  { label: "16px", value: "16px" },
  { label: "18px", value: "18px" },
  { label: "20px", value: "20px" },
  { label: "24px", value: "24px" },
] as const;

/* 字体族只写「邮件客户端认得住」的常见栈，且不用引号包裹多词族名，
   免得序列化进 style 属性时多一层转义 */
const FONT_FAMILIES = [
  { label: "默认", value: null },
  { label: "无衬线", value: "Arial, Helvetica, sans-serif" },
  { label: "衬线", value: "Georgia, Times New Roman, serif" },
  { label: "等宽", value: "Courier New, Courier, monospace" },
  { label: "微软雅黑", value: "Microsoft YaHei, PingFang SC, sans-serif" },
] as const;

/* 行高用 px：Outlook 的排版引擎对无单位行高支持不稳 */
const LINE_HEIGHTS = [
  { label: "默认", value: null },
  { label: "18px", value: "18px" },
  { label: "22px", value: "22px" },
  { label: "26px", value: "26px" },
  { label: "32px", value: "32px" },
] as const;

/** 空文档时的占位文案：靠下面的装饰插件把 class 与 data 属性挂到第一个空段落上 */
const PLACEHOLDER_CLASS =
  "[&_p.is-editor-empty:first-child::before]:pointer-events-none [&_p.is-editor-empty:first-child::before]:float-left [&_p.is-editor-empty:first-child::before]:h-0 [&_p.is-editor-empty:first-child::before]:text-muted-foreground [&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]";

const CONTENT_CLASS = cn(
  "min-h-[132px] w-full px-3 py-2 text-sm leading-6 outline-none",
  "[&_p]:my-0 [&_p+p]:mt-2",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
  "[&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2:first-child]:mt-0",
  "[&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3:first-child]:mt-0",
  "[&_h4]:mt-3 [&_h4]:text-sm [&_h4]:font-semibold [&_h4:first-child]:mt-0",
  "[&_img]:my-2 [&_img]:max-w-full",
  "[&_a]:text-primary [&_a]:underline [&_hr]:my-3 [&_hr]:border-border",
  PLACEHOLDER_CLASS,
);

/**
 * `bare` 变体的正文排版：只保留「Tailwind preflight 会抹掉、但邮件里必须有」的结构规则
 * （列表符号、标题字号字重、引用缩进、图片与分隔线），
 * 字体/字号/行高/颜色这些容器级排版留给调用方的 `contentClassName`。
 */
const BARE_CONTENT_CLASS = cn(
  /* 不写 w-full：宽度/显示方式交给调用方（画布上有整行正文，也有 inline-block 的徽章文案） */
  "outline-none",
  "[&_p]:my-0 [&_p+p]:mt-2",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
  "[&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2:first-child]:mt-0",
  "[&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3:first-child]:mt-0",
  "[&_h4]:mt-3 [&_h4]:text-sm [&_h4]:font-semibold [&_h4:first-child]:mt-0",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5",
  "[&_img]:my-2 [&_img]:max-w-full",
  "[&_a]:underline [&_hr]:my-3 [&_hr]:border-border",
  PLACEHOLDER_CLASS,
);


/**
 * 空文档的占位文案（只挂在 `bare` 变体上）。
 *
 * 光靠 `data-placeholder` 属性 + `p.is-editor-empty::before` 是不显示的：CSS 的 `attr()`
 * 只读伪元素宿主（也就是段落）自己的属性，而属性挂在 ProseMirror 根元素上；
 * 而且没有任何扩展会给段落挂 `is-editor-empty`。这里按 TipTap Placeholder 的做法，
 * 整篇为空时给第一个空段落补上 class 与属性，让 `PLACEHOLDER_CLASS` 里那套规则真正生效。
 * 文案用 getter 读取，运行时改 props 也能跟上。
 */
const EMAIL_PLACEHOLDER_KEY = new PluginKey("emailPlaceholder");

function createEmailPlaceholderExtension() {
  return Extension.create({
    name: "emailPlaceholder",
    addProseMirrorPlugins() {
      /* 占位文案直接从编辑器的 data-placeholder 读（editorProps 已经写上），
         避免为了一个装饰器把 placeholder 关进 ref 在渲染期读取 */
      const editor = this.editor;
      return [
        new Plugin({
          key: EMAIL_PLACEHOLDER_KEY,
          props: {
            decorations(state) {
              const first = state.doc.firstChild;
              /* 只有「整篇只有一个空段落」才算空编辑器，与 is-editor-empty 的语义一致 */
              if (
                !first ||
                !first.type.isTextblock ||
                first.content.size > 0 ||
                state.doc.childCount > 1
              ) {
                return null;
              }
              const placeholder =
                editor?.view.dom.getAttribute("data-placeholder") ?? "";
              return DecorationSet.create(state.doc, [
                Decoration.node(0, first.nodeSize, {
                  class: "is-editor-empty",
                  "data-placeholder": placeholder,
                }),
              ]);
            },
          },
        }),
      ];
    },
  });
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("shrink-0", active && "bg-muted text-foreground")}
    >
      {children}
    </Button>
  );
}

function HeadingControls({ editor }: { editor: Editor }) {
  return (
    <>
      <ToolbarButton
        label="大标题"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <span className="text-xs font-semibold">H2</span>
      </ToolbarButton>
      <ToolbarButton
        label="小标题"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <span className="text-xs font-semibold">H3</span>
      </ToolbarButton>
      <ToolbarButton
        label="次级标题"
        active={editor.isActive("heading", { level: 4 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
      >
        <span className="text-xs font-semibold">H4</span>
      </ToolbarButton>
    </>
  );
}

function ListControls({ editor }: { editor: Editor }) {
  return (
    <>
      <ToolbarButton
        label="无序列表"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List />
      </ToolbarButton>
      <ToolbarButton
        label="有序列表"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered />
      </ToolbarButton>
    </>
  );
}

function HistoryControls({ editor }: { editor: Editor }) {
  /* 画布外层文档用自己的草稿历史（关掉了 ProseMirror 的 history），
     那里没有 undo/redo 命令，这两个按钮要能优雅地不可用而不是抛错 */
  const can = editor.can() as { undo?: () => boolean; redo?: () => boolean };
  const hasUndo = typeof can.undo === "function";
  const hasRedo = typeof can.redo === "function";

  return (
    <>
      <ToolbarButton
        label="撤销"
        disabled={!hasUndo || !can.undo?.()}
        onClick={() => {
          if (hasUndo) editor.chain().focus().undo().run();
        }}
      >
        <Undo />
      </ToolbarButton>
      <ToolbarButton
        label="重做"
        disabled={!hasRedo || !can.redo?.()}
        onClick={() => {
          if (hasRedo) editor.chain().focus().redo().run();
        }}
      >
        <Redo />
      </ToolbarButton>
    </>
  );
}

function FontSizeControl({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="字号"
          title="字号"
          aria-pressed={FONT_SIZES.some(
            (size) =>
              size.value !== null &&
              editor.isActive("textStyle", { fontSize: size.value }),
          )}
          className="shrink-0"
        >
          <Type />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48">
        <p className="mb-2 text-xs text-muted-foreground">字号</p>
        <div className="grid grid-cols-2 gap-1.5">
          {FONT_SIZES.map((size) => (
            <button
              key={size.label}
              type="button"
              className={cn(
                "rounded-md border px-2 py-1.5 text-xs transition-colors hover:bg-muted",
                size.value !== null &&
                  editor.isActive("textStyle", { fontSize: size.value }) &&
                  "bg-muted",
              )}
              onClick={() => {
                if (size.value === null) {
                  editor.chain().focus().unsetFontSize().run();
                } else {
                  editor.chain().focus().setFontSize(size.value).run();
                }
                setOpen(false);
              }}
            >
              {size.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FontFamilyControl({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="字体"
          title="字体"
          aria-pressed={FONT_FAMILIES.some(
            (font) =>
              font.value !== null &&
              editor.isActive("textStyle", { fontFamily: font.value }),
          )}
          className={cn(
            "shrink-0",
            FONT_FAMILIES.some(
              (font) =>
                font.value !== null &&
                editor.isActive("textStyle", { fontFamily: font.value }),
            ) && "bg-muted text-foreground",
          )}
        >
          <CaseSensitive />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52">
        <p className="mb-2 text-xs text-muted-foreground">字体</p>
        <div className="grid grid-cols-1 gap-1.5">
          {FONT_FAMILIES.map((font) => (
            <button
              key={font.label}
              type="button"
              className={cn(
                "rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                font.value !== null &&
                  editor.isActive("textStyle", { fontFamily: font.value }) &&
                  "bg-muted",
              )}
              style={font.value ? { fontFamily: font.value } : undefined}
              onClick={() => {
                if (font.value === null) {
                  editor.chain().focus().unsetFontFamily().run();
                } else {
                  editor.chain().focus().setFontFamily(font.value).run();
                }
                setOpen(false);
              }}
            >
              {font.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LineHeightControl({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="行高"
          title="行高"
          aria-pressed={LINE_HEIGHTS.some(
            (height) =>
              height.value !== null &&
              editor.isActive("textStyle", { lineHeight: height.value }),
          )}
          className={cn(
            "shrink-0",
            LINE_HEIGHTS.some(
              (height) =>
                height.value !== null &&
                editor.isActive("textStyle", { lineHeight: height.value }),
            ) && "bg-muted text-foreground",
          )}
        >
          <span className="text-xs font-semibold">行高</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-40">
        <p className="mb-2 text-xs text-muted-foreground">行高</p>
        <div className="grid grid-cols-2 gap-1.5">
          {LINE_HEIGHTS.map((height) => (
            <button
              key={height.label}
              type="button"
              className={cn(
                "rounded-md border px-2 py-1.5 text-xs transition-colors hover:bg-muted",
                height.value !== null &&
                  editor.isActive("textStyle", { lineHeight: height.value }) &&
                  "bg-muted",
              )}
              onClick={() => {
                if (height.value === null) {
                  editor.chain().focus().unsetLineHeight().run();
                } else {
                  editor.chain().focus().setLineHeight(height.value).run();
                }
                setOpen(false);
              }}
            >
              {height.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ColorControl({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="文字颜色"
          title="文字颜色"
          className="shrink-0"
        >
          <Palette />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56">
        <p className="mb-2 text-xs text-muted-foreground">文字颜色</p>
        <div className="grid grid-cols-2 gap-1.5">
          {TEXT_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors hover:bg-muted"
              onClick={() => {
                editor.chain().focus().setColor(color.value).run();
                setOpen(false);
              }}
            >
              <span
                aria-hidden="true"
                className="size-3.5 shrink-0 rounded-full border"
                style={{ backgroundColor: color.value }}
              />
              {color.label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 w-full"
          onClick={() => {
            editor.chain().focus().unsetColor().run();
            setOpen(false);
          }}
        >
          恢复默认颜色
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function HighlightControl({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="文字高亮"
          title="文字高亮"
          aria-pressed={editor.isActive("highlight")}
          className={cn(
            "shrink-0",
            editor.isActive("highlight") && "bg-muted text-foreground",
          )}
        >
          <Highlighter />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56">
        <p className="mb-2 text-xs text-muted-foreground">文字高亮</p>
        <div className="grid grid-cols-2 gap-1.5">
          {HIGHLIGHT_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors hover:bg-muted"
              onClick={() => {
                editor
                  .chain()
                  .focus()
                  .setHighlight({ color: color.value })
                  .run();
                setOpen(false);
              }}
            >
              <span
                aria-hidden="true"
                className="size-3.5 shrink-0 rounded-full border"
                style={{ backgroundColor: color.value }}
              />
              {color.label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 w-full"
          onClick={() => {
            editor.chain().focus().unsetHighlight().run();
            setOpen(false);
          }}
        >
          清除高亮
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function AlignControls({ editor }: { editor: Editor }) {
  const alignLeft =
    !editor.isActive({ textAlign: "center" }) &&
    !editor.isActive({ textAlign: "right" });

  return (
    <>
      <ToolbarButton
        label="左对齐"
        active={alignLeft}
        onClick={() => editor.chain().focus().unsetTextAlign().run()}
      >
        <AlignLeft />
      </ToolbarButton>
      <ToolbarButton
        label="居中"
        active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        <AlignCenter />
      </ToolbarButton>
      <ToolbarButton
        label="右对齐"
        active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        <AlignRight />
      </ToolbarButton>
    </>
  );
}

function LinkControl({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");
  const inputId = useId();

  const applyLink = () => {
    const next = href.trim();
    if (!next) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: next }).run();
    setOpen(false);
    setHref("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setHref(editor.getAttributes("link").href ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="插入链接"
          title="插入链接"
          aria-pressed={editor.isActive("link")}
          className={cn(
            "shrink-0",
            editor.isActive("link") && "bg-muted text-foreground",
          )}
        >
          <Link2 />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <Label htmlFor={inputId} className="text-xs text-muted-foreground">
          链接地址（http/https，也支持 {"{calendarUrl}"} 这类变量）
        </Label>
        <Input
          id={inputId}
          value={href}
          onChange={(event) => setHref(event.target.value)}
          placeholder="https://..."
          className="mt-1.5"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              applyLink();
            }
          }}
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              setOpen(false);
            }}
          >
            移除链接
          </Button>
          <Button type="button" size="sm" onClick={applyLink}>
            应用
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ImageControl({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState("");
  const [width, setWidth] = useState("");
  const srcId = useId();
  const widthId = useId();

  const applyImage = () => {
    const next = src.trim();
    if (!/^https?:\/\//i.test(next)) return;
    const nextWidth = width.trim();
    editor
      .chain()
      .focus()
      .insertContent({
        type: "image",
        attrs: { src: next, width: nextWidth || null },
      })
      .run();
    setOpen(false);
    setSrc("");
    setWidth("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSrc("");
          setWidth("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="插入图片"
          title="插入图片"
          className="shrink-0"
        >
          <ImagePlus />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <Label htmlFor={srcId} className="text-xs text-muted-foreground">
          图片地址（http/https）
        </Label>
        <Input
          id={srcId}
          value={src}
          onChange={(event) => setSrc(event.target.value)}
          placeholder="https://..."
          className="mt-1.5"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              applyImage();
            }
          }}
        />
        <Label htmlFor={widthId} className="mt-2 block text-xs text-muted-foreground">
          宽度（可选，如 320 或 60%）
        </Label>
        <Input
          id={widthId}
          value={width}
          onChange={(event) => setWidth(event.target.value)}
          placeholder="320"
          className="mt-1.5"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              applyImage();
            }
          }}
        />
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={!/^https?:\/\//i.test(src.trim())}
            onClick={applyImage}
          >
            插入图片
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** `boxed` 变体的顶部工具栏：浮动工具条上有的能力这里都有 */
function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
      <ToolbarButton
        label="加粗"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold />
      </ToolbarButton>
      <ToolbarButton
        label="斜体"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic />
      </ToolbarButton>
      <ToolbarButton
        label="下划线"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline />
      </ToolbarButton>
      <ToolbarButton
        label="删除线"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough />
      </ToolbarButton>
      <ToolbarButton
        label="上标"
        active={editor.isActive("superscript")}
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
      >
        <SuperscriptIcon />
      </ToolbarButton>
      <ToolbarButton
        label="下标"
        active={editor.isActive("subscript")}
        onClick={() => editor.chain().focus().toggleSubscript().run()}
      >
        <SubscriptIcon />
      </ToolbarButton>

      <HeadingControls editor={editor} />
      <FontSizeControl editor={editor} />
      <FontFamilyControl editor={editor} />
      <LineHeightControl editor={editor} />
      <ListControls editor={editor} />

      <ToolbarButton
        label="引用"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote />
      </ToolbarButton>
      <ToolbarButton
        label="行内代码"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code />
      </ToolbarButton>
      <ToolbarButton
        label="插入分隔线"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <span className="text-xs font-semibold">—</span>
      </ToolbarButton>

      <ImageControl editor={editor} />
      <ColorControl editor={editor} />
      <HighlightControl editor={editor} />
      <AlignControls editor={editor} />
      <LinkControl editor={editor} />
      <ToolbarButton
        label="清除格式"
        onClick={() =>
          editor.chain().focus().unsetAllMarks().clearNodes().run()
        }
      >
        <Eraser />
      </ToolbarButton>
      <HistoryControls editor={editor} />
    </div>
  );
}

/**
 * 浮动工具条的内容。
 *
 * TipTap v3 默认不因事务重渲染，选中态得自己订阅，否则「加粗/斜体」这些按钮的高亮不会跟着选区走。
 */
function BubbleToolbar({
  editor,
  blockCommands = true,
}: {
  editor: Editor;
  /** 画布外层文档关掉块级命令：标题 / 列表 / 引用进不了序列化边界 */
  blockCommands?: boolean;
}) {
  useEditorState({
    editor,
    selector: ({ transactionNumber }) => transactionNumber,
  });

  /* 窄屏（<sm）放不下的控件收进「更多」，避免浮动工具条横向溢出 */
  const secondary = (
    <>
      <ToolbarButton
        label="删除线"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough />
      </ToolbarButton>
      <ToolbarButton
        label="上标"
        active={editor.isActive("superscript")}
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
      >
        <SuperscriptIcon />
      </ToolbarButton>
      <ToolbarButton
        label="下标"
        active={editor.isActive("subscript")}
        onClick={() => editor.chain().focus().toggleSubscript().run()}
      >
        <SubscriptIcon />
      </ToolbarButton>
      {blockCommands && <HeadingControls editor={editor} />}
      <FontSizeControl editor={editor} />
      <FontFamilyControl editor={editor} />
      <LineHeightControl editor={editor} />
      {blockCommands && <ListControls editor={editor} />}
      {blockCommands && (
        <ToolbarButton
          label="引用"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote />
        </ToolbarButton>
      )}
      <ToolbarButton
        label="行内代码"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code />
      </ToolbarButton>
      <HighlightControl editor={editor} />
      <AlignControls editor={editor} />
      <HistoryControls editor={editor} />
    </>
  );

  return (
    <div className="flex max-w-[calc(100vw-1rem)] flex-wrap items-center gap-0.5 rounded-md border bg-popover px-1 py-0.5 text-popover-foreground shadow-md">
      <ToolbarButton
        label="加粗"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold />
      </ToolbarButton>
      <ToolbarButton
        label="斜体"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic />
      </ToolbarButton>
      <ToolbarButton
        label="下划线"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline />
      </ToolbarButton>

      <div className="hidden items-center gap-0.5 sm:flex">{secondary}</div>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="更多格式"
            title="更多格式"
            className="shrink-0 sm:hidden"
          >
            <MoreHorizontal />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto">
          <div className="flex max-w-56 flex-wrap items-center gap-0.5">
            {secondary}
          </div>
        </PopoverContent>
      </Popover>

      <ColorControl editor={editor} />
      <LinkControl editor={editor} />
      <EmailVariableMenu editor={editor} />
      <ToolbarButton
        label="清除格式"
        onClick={() =>
          editor.chain().focus().unsetAllMarks().clearNodes().run()
        }
      >
        <Eraser />
      </ToolbarButton>
    </div>
  );
}

export type SlashItem = { id: string; label: string; hint?: string; group?: string };

declare module "@tiptap/core" {
  interface Storage {
    emailSlashCommand: {
      items: SlashItem[];
      /** `range` 是 `/query` 在文档里的位置：调用方靠它决定插到哪一块后面 */
      onSelect?: (id: string, range: { from: number; to: number }) => void;
    };
  }
}

/**
 * 斜杠菜单：输入 `/` 唤起，上下键选择、回车插入。
 *
 * 只负责「选一个条目」，插入什么区块由调用方决定（画布会把它插到当前块后面）。
 * 菜单用原生 DOM + 内联样式绘制，不依赖 portal —— 它在富文本编辑器内部，
 * 弹层被 Radix 弹窗裁切的概率更低。
 */
export function createSlashExtension() {
  return Extension.create({
    name: "emailSlashCommand",
    /* 条目与回调放在 storage 里：扩展只创建一次，调用方每次渲染再更新，
       避免把 ref 传进渲染期创建的闭包（react-hooks/refs 会拦） */
    addStorage() {
      return {
        items: [] as SlashItem[],
        onSelect: undefined as ((id: string) => void) | undefined,
      };
    },
    addProseMirrorPlugins() {
      const storage = this.editor.storage.emailSlashCommand;
      return [
        Suggestion<SlashItem>({
          editor: this.editor,
          char: "/",
          startOfLine: false,
          allowSpaces: false,
          /* 允许在任意位置（含中文标点后）用 / 唤起，不要求前面是空格 */
          allowedPrefixes: null,
          items: ({ query }) => {
            const all = storage.items;
            const q = query.trim().toLowerCase();
            if (!q) return all.slice(0, 24);
            return all
              .filter(
                (item) =>
                  item.label.toLowerCase().includes(q) ||
                  item.id.toLowerCase().includes(q) ||
                  (item.hint ?? "").toLowerCase().includes(q),
              )
              .slice(0, 24);
          },
          command: ({ editor, range, props }) => {
            editor.chain().focus().deleteRange(range).run();
            storage.onSelect?.(props.id, range);
          },
          render: () => {
            let element: HTMLDivElement | null = null;
            let filtered: SlashItem[] = [];
            let selected = 0;
            /* 菜单挂在弹窗内容里（而不是 body）：Radix 弹窗打开时会给 body 设
               `pointer-events:none`，挂在 body 上的菜单就变成「看得见、点不到」；
               挂在弹窗里还能让 Radix 认为这是「弹窗内部」，点它不会把弹窗关掉。 */
            let host: HTMLElement | null = null;
            let detachFocusOut: (() => void) | null = null;

            const place = (clientRect?: (() => DOMRect | null) | null) => {
              if (!element || !host) return;
              const rect = clientRect?.();
              if (!rect) return;
              const hostRect = host.getBoundingClientRect();
              const offsetLeft = host === document.body ? 0 : hostRect.left;
              const offsetTop = host === document.body ? 0 : hostRect.top;
              const height = element.offsetHeight;
              let top = rect.bottom + 6 - offsetTop;
              if (rect.bottom + 6 + height > window.innerHeight - 8) {
                top = rect.top - height - 6 - offsetTop;
              }
              element.style.left = `${Math.max(8 - offsetLeft, rect.left - offsetLeft)}px`;
              element.style.top = `${Math.max(8 - offsetTop, top)}px`;
            };

            const paint = () => {
              if (!element) return;
              element.innerHTML = "";
              if (filtered.length === 0) {
                const empty = document.createElement("div");
                empty.textContent = "没有匹配的区块";
                empty.style.cssText = "padding:6px 10px;font-size:12px;color:#8b949e";
                element.appendChild(empty);
                return;
              }
              filtered.forEach((item, index) => {
                const row = document.createElement("button");
                row.type = "button";
                row.setAttribute("aria-label", item.hint ? `${item.label} ${item.hint}` : item.label);
                row.style.cssText = `display:flex;width:100%;gap:8px;align-items:center;border:0;background:${index === selected ? "#eff6ff" : "transparent"};padding:6px 10px;text-align:left;cursor:pointer;font:inherit;border-radius:4px`;
                const label = document.createElement("span");
                label.textContent = item.label;
                label.style.cssText = "font-size:13px;color:#111827";
                row.appendChild(label);
                if (item.hint) {
                  const hint = document.createElement("span");
                  hint.textContent = item.hint;
                  hint.style.cssText = "font-size:11px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
                  row.appendChild(hint);
                }
                row.addEventListener("mousedown", (event) => {
                  event.preventDefault();
                  selected = index;
                  element?.dispatchEvent(new CustomEvent("slash-select"));
                });
                element?.appendChild(row);
                if (index === selected) row.scrollIntoView({ block: "nearest" });
              });
            };

            const destroy = () => {
              detachFocusOut?.();
              detachFocusOut = null;
              element?.remove();
              element = null;
              host = null;
            };

            return {
              onStart: (props) => {
                filtered = props.items;
                selected = 0;
                host =
                  (props.editor.view.dom.closest('[data-slot="dialog-content"]') as HTMLElement | null) ??
                  document.body;
                element = document.createElement("div");
                element.setAttribute("role", "listbox");
                element.setAttribute("aria-label", "插入区块");
                element.style.cssText = `position:${host === document.body ? "fixed" : "absolute"};z-index:60;min-width:220px;max-height:280px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:8px;background:#fff;box-shadow:0 10px 30px rgba(15,23,42,0.15);padding:4px;pointer-events:auto`;
                element.addEventListener("slash-select", () => {
                  const item = filtered[selected];
                  if (!item) return;
                  props.command(item);
                });
                host.appendChild(element);
                /* 焦点离开编辑器（例如点到卡片里另一个富文本、或工具栏）时收起菜单，
                   否则它会一直挂在屏幕上 */
                const editorDom = props.editor.view.dom;
                const onFocusOut = (event: FocusEvent) => {
                  const next = event.relatedTarget as Node | null;
                  if (next && (editorDom.contains(next) || element?.contains(next))) return;
                  destroy();
                };
                editorDom.addEventListener("focusout", onFocusOut);
                detachFocusOut = () => editorDom.removeEventListener("focusout", onFocusOut);
                paint();
                place(props.clientRect);
              },
              onUpdate: (props) => {
                filtered = props.items;
                selected = Math.min(selected, Math.max(0, filtered.length - 1));
                paint();
                place(props.clientRect);
              },
              onKeyDown: ({ event }) => {
                if (filtered.length === 0) return false;
                if (event.key === "ArrowDown") {
                  selected = (selected + 1) % filtered.length;
                  paint();
                  return true;
                }
                if (event.key === "ArrowUp") {
                  selected = (selected - 1 + filtered.length) % filtered.length;
                  paint();
                  return true;
                }
                if (event.key === "Enter" && !event.isComposing) {
                  const item = filtered[selected];
                  if (!item) return false;
                  const props = { item } as unknown as { command: (item: SlashItem) => void };
                  void props;
                  element?.dispatchEvent(new CustomEvent("slash-select"));
                  return true;
                }
                if (event.key === "Escape") {
                  destroy();
                  return true;
                }
                return false;
              },
              onExit: destroy,
            };
          },
        }),
      ];
    },
  });
}

/** 选中文字时浮出的格式工具条：富文本区块与画布外层文档共用 */
export function EmailBubbleMenu({
  editor,
  blockCommands = true,
}: {
  editor: Editor;
  /** 画布外层文档只有 emailText / emailBlock，块级命令要收起来 */
  blockCommands?: boolean;
}) {
  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8, shift: { padding: 8 } }}
    >
      <BubbleToolbar editor={editor} blockCommands={blockCommands} />
    </BubbleMenu>
  );
}

export function RichTextField({
  value,
  onChange,
  placeholder = "在这里写正文，支持加粗、颜色、链接与列表。",
  id,
  variant = "boxed",
  contentClassName,
  autoFocus = false,
  slashItems,
  onSlashSelect,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  id?: string;
  /** `boxed`（缺省）= 带边框 + 顶部工具栏；`bare` = 只有可编辑正文区 */
  variant?: "boxed" | "bare";
  /** 仅 `bare` 变体生效：拼进 ProseMirror 根元素的排版 class（字体/字号/行高/颜色等） */
  contentClassName?: string;
  autoFocus?: boolean;
  /** 斜杠菜单条目（输入 `/` 唤起）；不传则不挂这个扩展 */
  slashItems?: SlashItem[];
  onSlashSelect?: (id: string) => void;
}) {
  const [placeholderExtension] = useState(() => createEmailPlaceholderExtension());
  const [slashExtension] = useState(() => createSlashExtension());
  const editor = useEditor({
    /* SSR 下不要立即渲染：TipTap 的文档结构由浏览器创建，避免水合不一致 */
    immediatelyRender: false,
    autofocus: autoFocus,
    extensions: [
      ...createEmailInlineExtensions(),
      /* 占位装饰只在 bare 挂：boxed 的占位文案一直是「属性 + CSS 规则都在、但没有扩展给段落挂
         is-editor-empty」的现状，这里不顺手改掉它（boxed 要求与现在完全一致） */
      ...(variant === "bare" ? [placeholderExtension] : []),
      ...(slashItems && slashItems.length > 0 ? [slashExtension] : []),
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          variant === "bare"
            ? cn(BARE_CONTENT_CLASS, contentClassName)
            : CONTENT_CLASS,
        ...(id ? { id } : {}),
        "data-placeholder": placeholder,
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
  });

  /* 斜杠菜单的条目与回调写进编辑器 storage：扩展只在挂载时建一次 */
  useEffect(() => {
    if (!editor) return;
    const storage = editor.storage.emailSlashCommand;
    if (!storage) return;
    /* 编辑器 storage 是 TipTap 官方给扩展存可变配置的地方，这里按设计就地更新 */
    // eslint-disable-next-line react-hooks/immutability
    storage.items = slashItems ?? [];
    storage.onSelect = onSlashSelect;
  }, [editor, slashItems, onSlashSelect]);

  /* 外部改动（例如「恢复内置版式」「插入样式」）才回写编辑器内容；
     自己输入触发的那次 onChange 回来后 getHTML() 已经相等，不会重置光标 */
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  const bubbleMenu = editor ? <EmailBubbleMenu editor={editor} /> : null;

  if (variant === "bare") {
    return (
      <div className="relative">
        {bubbleMenu}
        <EditorContent editor={editor} />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border bg-background focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
      {editor && <Toolbar editor={editor} />}
      {bubbleMenu}
      <EditorContent editor={editor} />
    </div>
  );
}
