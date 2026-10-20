"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  Code2,
  Columns2,
  Copy,
  EyeOff,
  Image as ImageIcon,
  Layers,
  Minus,
  MousePointerClick,
  MoveVertical,
  Palette,
  Plus,
  Square,
  Trash2,
  Type,
  X,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { DOMSerializer, DOMParser as PMDOMParser } from "@tiptap/pm/model";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type Editor,
  type NodeViewProps,
} from "@tiptap/react";

import type { EmailStylePresetRow } from "@/action/email/style-preset";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  EMAIL_BLOCK_LIMITS,
  EMPTY_EMAIL_BLOCK_STYLE,
  cloneEmailBlocksWithNewIds,
  createEmailBlockTemplate,
  type EmailBlock,
  type EmailBlockInsertKind,
  type EmailBlockRow,
  type EmailBlockStyle,
  type EmailCardTone,
  type EmailColumnCell,
  type EmailFrameStyle,
} from "@/lib/email/blocks";
import {
  badgeStyle,
  blockStyleOverrides,
  buttonRowWrap,
  cardToneStyle,
  columnCell,
  columnCellFirst,
  container,
  content,
  emailButtonStyle,
  eyebrow,
  footer,
  footerImage,
  footerText,
  header,
  importantText,
  innerDivider,
  logo,
  main,
  noticeCard,
  resultPanel,
  resultText,
  resultTitle,
  subtitleStyle,
  text,
  titleStyle,
  topBar,
} from "@/lib/email/email-styles";
import { resolveEmailTheme, type EmailTheme } from "@/lib/email/theme";
import { cn } from "@/lib/utils";

import { InlineEditableText } from "./InlineEditableText";
import { scrollToEmailBlock } from "./emailBlockScroll";
import { EmailBubbleMenu, createSlashExtension } from "./RichTextField";
import { createEmailInlineExtensions } from "./email-inline-extensions";
import { EmailVariablesProvider, type EmailTemplateVariable } from "./email-variables";
import { RichTextField } from "./RichTextField";

/**
 * 邮件画布：**所见即所得**。
 *
 * 左边这一整块就是邮件本身（页面底色 / 内容卡 / 页眉 / 正文 / 页脚，全部用与发送时
 * 同一套内联样式），文字点进去就能改、按钮点一下就能改文案与链接、卡片里的行能加能删，
 * 悬停时左侧出现拖动与区块菜单。格式化跟着选区走（RichTextField 的浮动工具条）。
 *
 * 区块模型与落库格式没变（`lib/email/blocks.ts`），所以画布只是同一份数据的另一种表现。
 */

const INSERT_GROUPS: Array<{ label: string; items: Array<{ kind: EmailBlockInsertKind; label: string; hint: string; icon: ReactNode }> }> = [
  {
    label: "文本",
    items: [
      { kind: "text", label: "文本段落", hint: "富文本，支持加粗/颜色/链接/列表", icon: <Type /> },
      { kind: "code", label: "自定义 HTML / CSS", hint: "整块手写邮件代码", icon: <Code2 /> },
      { kind: "divider", label: "分隔线", hint: "一条水平线", icon: <Minus /> },
      { kind: "spacer", label: "间距", hint: "一段空白，控制节奏", icon: <MoveVertical /> },
    ],
  },
  {
    label: "布局",
    items: [
      { kind: "card", label: "卡片", hint: "标题 + 若干文本/按钮行", icon: <Square /> },
      { kind: "columns", label: "双栏", hint: "左右两栏，各带一段文字与按钮", icon: <Columns2 /> },
    ],
  },
  {
    label: "内容",
    items: [
      { kind: "image", label: "图片", hint: "外链图片，可加宽度与跳转", icon: <ImageIcon /> },
      { kind: "button", label: "按钮", hint: "独立按钮，可左中右对齐", icon: <MousePointerClick /> },
    ],
  },
  {
    label: "组件",
    items: [
      { kind: "resultPanel", label: "结果面板", hint: "标签 + 结果标题 + 摘要", icon: <Layers /> },
      { kind: "badge", label: "状态徽章", hint: "一个胶囊标签", icon: <Layers /> },
      { kind: "stepsCard", label: "重要步骤卡", hint: "预填成员信息表与飞书群", icon: <Layers /> },
      { kind: "calendarCard", label: "授课日历卡", hint: "预填日历订阅说明", icon: <Layers /> },
      { kind: "activityCard", label: "后续活动卡", hint: "预填活动日历说明", icon: <Layers /> },
      { kind: "groupCard", label: "内部群卡片", hint: "预填飞书群与后续安排", icon: <Layers /> },
    ],
  },
];

/** 斜杠菜单条目：直接把插入菜单摊平 */
const SLASH_ITEMS = INSERT_GROUPS.flatMap((group) =>
  group.items.map((item) => ({
    id: item.kind,
    label: item.label,
    hint: item.hint,
    group: group.label,
  })),
);

const CARD_TONE_LABELS: Record<EmailCardTone, string> = {
  success: "通过色",
  warning: "提示色",
  neutral: "中性色",
};

const BUTTON_VARIANT_LABELS = {
  primary: "主题色按钮",
  dark: "深色按钮",
  plain: "描边按钮",
} as const;

const ALIGN_LABELS = { left: "左对齐", center: "居中", right: "右对齐" } as const;

const STYLE_FIELDS: Array<{
  key: keyof EmailBlockStyle;
  label: string;
  placeholder: string;
  kind?: "color" | "align";
}> = [
  { key: "backgroundColor", label: "背景色", placeholder: "#f2fbf6", kind: "color" },
  { key: "color", label: "文字色", placeholder: "#172033", kind: "color" },
  { key: "padding", label: "内边距", placeholder: "12px 16px" },
  { key: "margin", label: "外边距", placeholder: "0 0 16px" },
  { key: "border", label: "描边", placeholder: "1px solid #d7e5dc" },
  { key: "borderRadius", label: "圆角", placeholder: "12px" },
  { key: "textAlign", label: "对齐", placeholder: "left", kind: "align" },
  { key: "maxWidth", label: "最大宽度", placeholder: "480px" },
  { key: "fontSize", label: "字号", placeholder: "15px" },
  { key: "fontWeight", label: "字重", placeholder: "700" },
  { key: "fontFamily", label: "字体", placeholder: "Georgia, serif" },
  { key: "lineHeight", label: "行高", placeholder: "26px" },
  { key: "letterSpacing", label: "字间距", placeholder: "0.6px" },
];

/** 画布上富文本的排版：与邮件里 `sanitizeEmailHtml` 补的内联样式对齐（段落 12px 间距） */
const BARE_TEXT_CLASS = cn(
  "outline-none",
  "[&_p]:my-0 [&_p+p]:mt-3",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
  "[&_h2]:mt-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold [&_h4]:mt-2 [&_h4]:font-semibold",
  "[&_a]:text-blue-700 [&_a]:underline [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_hr]:my-3 [&_hr]:border-border [&_img]:max-w-full [&_code]:rounded [&_code]:bg-muted [&_code]:px-1",
);

const inputClass =
  "h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type CanvasIconButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "variant" | "size" | "children"
> & {
  label: string;
  children: ReactNode;
  destructive?: boolean;
};

/**
 * 画布上的小图标按钮。**必须把 rest props 透传到 DOM**：`DropdownMenuTrigger asChild` /
 * `PopoverTrigger asChild` 会把 onPointerDown、aria-expanded 等注入到这个组件上，
 * 一旦在这里把 props 丢掉，按钮就变成「点了没反应」。
 */
function IconButton({ label, destructive, className, children, ...rest }: CanvasIconButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      {...rest}
      className={cn(
        "shrink-0",
        destructive && "text-muted-foreground hover:text-destructive",
        className,
      )}
    >
      {children}
    </Button>
  );
}

/** 就地编辑用的字段浮层：点画布上的元素，弹出它自己的字段 */
function ElementPopover({
  label,
  children,
  trigger,
  className,
  align = "start",
}: {
  label: string;
  children: ReactNode;
  trigger: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} title={label} className={cn("text-left", className)}>
          {trigger}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function LabeledInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        value={value}
        placeholder={placeholder}
        maxLength={EMAIL_BLOCK_LIMITS.shortText}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0"
      />
    </div>
  );
}

/** 常用样式档位：多数人只想「宽一点 / 圆一点 / 换个底色」，不想手写 CSS */
const PADDING_PRESETS = [
  { value: "", label: "默认" },
  { value: "0", label: "无" },
  { value: "8px 12px", label: "紧凑" },
  { value: "12px 16px", label: "适中" },
  { value: "18px 22px", label: "宽松" },
] as const;

const RADIUS_PRESETS = [
  { value: "", label: "默认" },
  { value: "0", label: "直角" },
  { value: "6px", label: "小圆角" },
  { value: "12px", label: "中圆角" },
  { value: "999px", label: "胶囊" },
] as const;

const FONT_SIZE_PRESETS = [
  { value: "", label: "默认" },
  { value: "13px", label: "13" },
  { value: "15px", label: "15" },
  { value: "17px", label: "17" },
  { value: "20px", label: "20" },
  { value: "24px", label: "24" },
] as const;

const FONT_WEIGHT_PRESETS = [
  { value: "", label: "默认" },
  { value: "400", label: "常规" },
  { value: "600", label: "半粗" },
  { value: "700", label: "加粗" },
] as const;

const BACKGROUND_SWATCHES = ["", "#ffffff", "#f7faf8", "#f2fbf6", "#fef6ec", "#eef4ff", "#f4f4f5"];
const TEXT_SWATCHES = ["", "#172033", "#475569", "#0f766e", "#b45309", "#b91c1c"];

function StylePresetSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <select
        value={options.some((option) => option.value === value) ? value : ""}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      >
        {options.map((option) => (
          <option key={option.label} value={option.value}>
            {option.value === "" ? option.label : `${option.label}（${option.value}）`}
          </option>
        ))}
      </select>
    </div>
  );
}

function StyleColorRow({
  label,
  value,
  swatches,
  onChange,
}: {
  label: string;
  value: string;
  swatches: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          aria-label={`${label}取色`}
          value={/^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : "#ffffff"}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-8 shrink-0 cursor-pointer rounded-md border bg-background p-0.5"
        />
        {swatches.map((swatch) => (
          <button
            key={swatch || "auto"}
            type="button"
            aria-label={swatch ? `${label} ${swatch}` : `${label}默认`}
            title={swatch || "默认"}
            onClick={() => onChange(swatch)}
            className={cn(
              "size-6 shrink-0 rounded-full border text-[9px] leading-none transition-transform hover:scale-110",
              value === swatch && "ring-2 ring-foreground ring-offset-1",
            )}
            style={swatch ? { backgroundColor: swatch } : undefined}
          >
            {swatch ? "" : "自动"}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 区块样式浮层：先给「对齐 / 内边距 / 圆角 / 字号 / 颜色」这些常用档位，
 * 13 个 CSS 字段收进「高级」——留空 = 用邮件默认外观。
 */
function StylePopover({
  style,
  onChange,
  trigger,
}: {
  style: EmailBlockStyle;
  onChange: (style: EmailBlockStyle) => void;
  trigger: ReactNode;
}) {
  const [advanced, setAdvanced] = useState(false);
  const patch = (next: Partial<EmailBlockStyle>) => onChange({ ...style, ...next });

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="max-h-[70vh] w-96 overflow-y-auto">
        <p className="mb-2 text-xs text-muted-foreground">
          这个区块的样式：留空 = 用邮件默认外观
        </p>

        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <Label className="text-[11px] text-muted-foreground">对齐</Label>
            <div className="flex items-center gap-1">
              {(Object.keys(ALIGN_LABELS) as Array<keyof typeof ALIGN_LABELS>).map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={style.textAlign === value ? "default" : "outline"}
                  aria-pressed={style.textAlign === value}
                  onClick={() => patch({ textAlign: style.textAlign === value ? "" : value })}
                >
                  {ALIGN_LABELS[value]}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <StylePresetSelect
              label="内边距"
              value={style.padding}
              options={PADDING_PRESETS}
              onChange={(padding) => patch({ padding })}
            />
            <StylePresetSelect
              label="圆角"
              value={style.borderRadius}
              options={RADIUS_PRESETS}
              onChange={(borderRadius) => patch({ borderRadius })}
            />
            <StylePresetSelect
              label="字号"
              value={style.fontSize}
              options={FONT_SIZE_PRESETS}
              onChange={(fontSize) => patch({ fontSize })}
            />
            <StylePresetSelect
              label="字重"
              value={style.fontWeight}
              options={FONT_WEIGHT_PRESETS}
              onChange={(fontWeight) => patch({ fontWeight })}
            />
          </div>

          <StyleColorRow
            label="背景色"
            value={style.backgroundColor}
            swatches={BACKGROUND_SWATCHES}
            onChange={(backgroundColor) => patch({ backgroundColor })}
          />
          <StyleColorRow
            label="文字色"
            value={style.color}
            swatches={TEXT_SWATCHES}
            onChange={(color) => patch({ color })}
          />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-3 w-full"
          aria-expanded={advanced}
          onClick={() => setAdvanced((current) => !current)}
        >
          {advanced ? "收起高级 CSS" : "高级 CSS（直接写样式）"}
        </Button>

        {advanced && (
          <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
            {STYLE_FIELDS.filter((field) => field.kind !== "align").map((field) => (
              <LabeledInput
                key={field.key}
                label={field.label}
                value={style[field.key]}
                placeholder={field.placeholder}
                onChange={(next) => patch({ [field.key]: next })}
              />
            ))}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={() => onChange({ ...EMPTY_EMAIL_BLOCK_STYLE })}
        >
          清空样式（回到默认外观）
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function ButtonFields({
  label,
  url,
  variant,
  align,
  onChange,
}: {
  label: string;
  url: string;
  variant: "primary" | "dark" | "plain";
  align?: EmailBlockStyle["textAlign"];
  onChange: (next: {
    label: string;
    url: string;
    variant: "primary" | "dark" | "plain";
    align?: EmailBlockStyle["textAlign"];
  }) => void;
}) {
  return (
    <div className="grid gap-2">
      <LabeledInput
        label="按钮文案"
        value={label}
        placeholder="如 点击填写信息表"
        onChange={(next) => onChange({ label: next, url, variant, align })}
      />
      <LabeledInput
        label="按钮链接"
        value={url}
        placeholder="https://… 或 {memberInfoFormUrl}"
        onChange={(next) => onChange({ label, url: next, variant, align })}
      />
      <div className="grid gap-1">
        <Label className="text-[11px] text-muted-foreground">按钮样式</Label>
        <select
          value={variant}
          aria-label="按钮样式"
          onChange={(event) =>
            onChange({
              label,
              url,
              variant: event.target.value as "primary" | "dark" | "plain",
              align,
            })
          }
          className={inputClass}
        >
          {Object.entries(BUTTON_VARIANT_LABELS).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </div>
      {align !== undefined && (
        <div className="grid gap-1">
          <Label className="text-[11px] text-muted-foreground">对齐</Label>
          <select
            value={align}
            aria-label="按钮对齐"
            onChange={(event) =>
              onChange({
                label,
                url,
                variant,
                align: event.target.value as EmailBlockStyle["textAlign"],
              })
            }
            className={inputClass}
          >
            <option value="">默认</option>
            {Object.entries(ALIGN_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

/** 卡片里的一行：文本就地编辑、按钮点开改字段、分隔线悬停可删 */
function CanvasRow({
  row,
  index,
  total,
  theme,
  onChange,
  onMove,
  onRemove,
}: {
  row: EmailBlockRow;
  index: number;
  total: number;
  theme: EmailTheme;
  onChange: (row: EmailBlockRow) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="group/row relative rounded-sm">
      <div className="pointer-events-none absolute -top-3 right-0 z-10 flex items-center gap-0.5 rounded-md border bg-background/95 px-0.5 opacity-0 shadow-sm transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 group-hover/row:pointer-events-auto group-hover/row:opacity-100">
        <IconButton label="上移这一行" disabled={index === 0} onClick={() => onMove(-1)} className="size-6">
          <ArrowUp className="size-3" />
        </IconButton>
        <IconButton label="下移这一行" disabled={index === total - 1} onClick={() => onMove(1)} className="size-6">
          <ArrowDown className="size-3" />
        </IconButton>
        <IconButton label="删除这一行" onClick={onRemove} destructive className="size-6">
          <X className="size-3" />
        </IconButton>
      </div>

      {row.kind === "divider" && <hr style={innerDivider} />}

      {row.kind === "text" && (
        <div style={text}>
          <RichTextField
            variant="bare"
            contentClassName={BARE_TEXT_CLASS}
            value={row.html}
            onChange={(html) => onChange({ ...row, html })}
            placeholder="写点什么…"
          />
        </div>
      )}

      {row.kind === "button" && (
        <div style={buttonRowWrap}>
          <ElementPopover
            label="编辑这个按钮"
            trigger={
              <span style={emailButtonStyle(theme, row.variant)}>
                {row.label || "（未命名的按钮）"}
              </span>
            }
          >
            <ButtonFields
              label={row.label}
              url={row.url}
              variant={row.variant}
              onChange={(next) => onChange({ ...row, ...next })}
            />
          </ElementPopover>
        </div>
      )}
    </div>
  );
}

function CanvasColumnCell({
  title,
  cell,
  first,
  theme,
  onChange,
}: {
  title: string;
  cell: EmailColumnCell;
  first: boolean;
  theme: EmailTheme;
  onChange: (cell: EmailColumnCell) => void;
}) {
  return (
    <td style={first ? columnCellFirst : columnCell}>
      <div style={text}>
        <RichTextField
          variant="bare"
          contentClassName={BARE_TEXT_CLASS}
          value={cell.html}
          onChange={(html) => onChange({ ...cell, html })}
          placeholder={`${title}文字`}
        />
      </div>
      {cell.buttonLabel.trim() || cell.buttonUrl.trim() ? (
        <div style={buttonRowWrap}>
          <ElementPopover
            label={`编辑${title}按钮`}
            trigger={
              <span style={emailButtonStyle(theme, "primary")}>
                {cell.buttonLabel || "（未命名的按钮）"}
              </span>
            }
          >
            <ButtonFields
              label={cell.buttonLabel}
              url={cell.buttonUrl}
              variant="primary"
              onChange={(next) =>
                onChange({ ...cell, buttonLabel: next.label, buttonUrl: next.url })
              }
            />
          </ElementPopover>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...cell, buttonLabel: "按钮文案", buttonUrl: "" })}
        >
          <Plus data-icon="inline-start" />
          加按钮
        </Button>
      )}
    </td>
  );
}

/** 区块之间的「插入」细线：鼠标移上去才出现，插到这一格 */
export function BlockLibraryContent({ onInsert }: { onInsert: (kind: EmailBlockInsertKind) => void }) {
  return (
    <DropdownMenuContent align="center" className="max-h-[70vh] w-80 overflow-y-auto">
      {INSERT_GROUPS.map((group, index) => (
        <div key={group.label}>
          {index > 0 && <DropdownMenuSeparator />}
          <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
          {group.items.map((item) => (
            <DropdownMenuItem key={item.kind} onSelect={() => onInsert(item.kind)}>
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-muted-foreground">{item.icon}</span>
                <span className="min-w-0">
                  <span className="block truncate">{item.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.hint}</span>
                </span>
              </span>
            </DropdownMenuItem>
          ))}
        </div>
      ))}
    </DropdownMenuContent>
  );
}

/** 区块菜单：拖动排序、上下移、复制、样式、存为样式、启用、删除 */
function BlockMenu({
  block,
  index,
  total,
  presets,
  onMove,
  onDuplicate,
  onRemove,
  onToggleEnabled,
  onStyleChange,
  onSavePreset,
  onDeletePreset,
}: {
  block: EmailBlock;
  index: number;
  total: number;
  presets: EmailStylePresetRow[];
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onToggleEnabled: () => void;
  onStyleChange: (style: EmailBlockStyle) => void;
  onSavePreset: (name: string, blocks: EmailBlock[]) => Promise<void>;
  onDeletePreset: (presetId: number) => Promise<void>;
}) {
  const [presetName, setPresetName] = useState("");
  const style = block.style ?? EMPTY_EMAIL_BLOCK_STYLE;

  return (
    <>
      <StylePopover
        style={style}
        onChange={onStyleChange}
        trigger={
          <IconButton label="这个区块的样式" className="size-5">
            <Palette className="size-3.5" />
          </IconButton>
        }
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton label="区块菜单" className="size-5">
            <span className="text-sm leading-none">⋯</span>
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(-1)}>
            <ArrowUp className="size-3.5" />
            上移
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === total - 1} onSelect={() => onMove(1)}>
            <ArrowDown className="size-3.5" />
            下移
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDuplicate}>
            <Copy className="size-3.5" />
            复制这个区块
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onToggleEnabled}>
            {block.enabled ? <EyeOff className="size-3.5" /> : <Check className="size-3.5" />}
            {block.enabled ? "在邮件里隐藏" : "在邮件里显示"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[11px] text-muted-foreground">
            存成可复用样式
          </DropdownMenuLabel>
          <div className="flex items-center gap-1.5 px-2 pb-1.5">
            <Input
              value={presetName}
              onChange={(event) => setPresetName(event.target.value)}
              placeholder="样式名称"
              className="h-8"
            />
            <Button
              type="button"
              size="sm"
              disabled={!presetName.trim()}
              onClick={() => {
                void onSavePreset(presetName.trim(), [block]).then(() => setPresetName(""));
              }}
            >
              保存
            </Button>
          </div>
          {presets.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                已保存的样式
              </DropdownMenuLabel>
              {presets.map((preset) => (
                <DropdownMenuItem
                  key={preset.id}
                  onSelect={() => onSavePreset(preset.name, preset.blocks)}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="min-w-0 truncate">覆盖为「{preset.name}」</span>
                  {preset.editable && (
                    <button
                      type="button"
                      aria-label={`删除样式 ${preset.name}`}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void onDeletePreset(preset.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onRemove} className="text-destructive">
            <Trash2 className="size-3.5" />
            删除这个区块
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/** 「插入样式」下拉内容：把已保存的自定义样式插进正文，或整封替换 */
export function PresetMenuContent({
  presets,
  onInsert,
  onReplace,
  onDelete,
}: {
  presets: EmailStylePresetRow[];
  onInsert: (preset: EmailStylePresetRow) => void;
  onReplace: (preset: EmailStylePresetRow) => void;
  onDelete: (presetId: number) => void;
}) {
  return (
    <DropdownMenuContent align="end" className="w-80">
      <DropdownMenuLabel>已保存的样式 / 版式</DropdownMenuLabel>
      {presets.length === 0 && (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          还没有保存过。用工具栏的「存为版式」把当前正文存下来，就能在别的模板里套用。
        </p>
      )}
      {presets.map((preset) => (
        <DropdownMenuItem
          key={preset.id}
          onSelect={() => onInsert(preset)}
          className="flex items-center justify-between gap-2"
        >
          <span className="min-w-0 truncate">{preset.name}</span>
          <span className="flex shrink-0 items-center gap-1">
            <span
              role="button"
              tabIndex={0}
              aria-label={`用「${preset.name}」替换正文`}
              title="替换正文"
              className="rounded px-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onReplace(preset);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                onReplace(preset);
              }}
            >
              替换
            </span>
            {preset.editable && (
              <button
                type="button"
                aria-label={`删除样式 ${preset.name}`}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onDelete(preset.id);
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </span>
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  );
}

/** 把当前整封正文存成一个可复用版式 */
export function SaveLayoutPopover({
  onSave,
  trigger,
}: {
  onSave: (name: string) => Promise<void>;
  trigger: ReactNode;
}) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <Label className="text-xs text-muted-foreground">
          把当前正文存成版式：之后可以在任意模板里「插入」或「替换正文」
        </Label>
        <div className="mt-2 flex items-center gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="版式名称，如「招新蓝色提醒版」"
          />
          <Button
            type="button"
            size="sm"
            disabled={!name.trim()}
            onClick={() => {
              void onSave(name.trim()).then(() => {
                setName("");
                setOpen(false);
              });
            }}
          >
            保存
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CanvasBlock({
  block,
  theme,
  onChange,
}: {
  block: EmailBlock;
  theme: EmailTheme;
  onChange: (block: EmailBlock) => void;
}) {
  const blockStyle = block.style ?? EMPTY_EMAIL_BLOCK_STYLE;
  const overrides = blockStyleOverrides(block.style);
  const updateRow = (rowId: string, next: EmailBlockRow) => {
    if (block.type !== "card") return;
    onChange({ ...block, rows: block.rows.map((row) => (row.id === rowId ? next : row)) });
  };

  return (
    <div
      className={cn(
        "group/block relative rounded-sm ring-1 ring-transparent transition-[background-color,box-shadow] hover:bg-[#eff6ff]/50 hover:ring-[#bfdbfe]",
        !block.enabled && "opacity-50",
      )}
    >

      {block.type === "badge" && (
        <div style={{ margin: "0 0 12px", ...overrides }}>
          <span style={badgeStyle(theme)}>
            <RichTextField
              variant="bare"
              contentClassName={cn(BARE_TEXT_CLASS, "inline-block min-w-[3rem]")}
              value={block.text}
              onChange={(text) => onChange({ ...block, text })}
              placeholder="徽章文案"
            />
          </span>
        </div>
      )}

      {block.type === "resultPanel" && (
        <div
          style={{
            ...resultPanel,
            borderColor: theme.border,
            backgroundColor: theme.panel,
            ...overrides,
          }}
        >
          <div style={badgeStyle(theme)}>
            <RichTextField
              variant="bare"
              contentClassName={cn(BARE_TEXT_CLASS, "inline-block min-w-[3rem]")}
              value={block.badge}
              onChange={(badge) => onChange({ ...block, badge })}
              placeholder="结果标签"
            />
          </div>
          <div style={{ ...resultTitle, color: theme.primary }}>
            <RichTextField
              variant="bare"
              contentClassName={BARE_TEXT_CLASS}
              value={block.title}
              onChange={(title) => onChange({ ...block, title })}
              placeholder="结果标题"
            />
          </div>
          <div style={resultText}>
            <RichTextField
              variant="bare"
              contentClassName={BARE_TEXT_CLASS}
              value={block.summary}
              onChange={(summary) => onChange({ ...block, summary })}
              placeholder="结果摘要"
            />
          </div>
        </div>
      )}

      {block.type === "image" && (
        <div style={{ ...overrides }}>
          {block.src.trim() ? (
            <ElementPopover
              label="编辑图片"
              trigger={
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={block.src}
                  alt={block.alt}
                  width={/^\d+$/.test(block.width.trim()) ? block.width.trim() : undefined}
                  style={{
                    display: "block",
                    maxWidth: "100%",
                    height: "auto",
                    ...(block.width.trim() && !/^\d+$/.test(block.width.trim())
                      ? { width: block.width.trim() }
                      : {}),
                  }}
                  className="cursor-pointer rounded"
                />
              }
            >
              <ImageFields block={block} onChange={onChange} />
            </ElementPopover>
          ) : (
            <ElementPopover
              label="添加图片"
              className="w-full"
              trigger={
                <span className="flex w-full items-center justify-center gap-2 rounded border border-dashed border-border py-6 text-xs text-muted-foreground">
                  <ImageIcon className="size-4" />
                  点击填写图片地址
                </span>
              }
            >
              <ImageFields block={block} onChange={onChange} />
            </ElementPopover>
          )}
        </div>
      )}

      {block.type === "button" && (
        <div
          style={{
            textAlign: block.align || "left",
            margin: "0 0 14px",
            ...overrides,
          }}
        >
          <ElementPopover
            label="编辑按钮"
            trigger={
              <span style={emailButtonStyle(theme, block.variant)}>
                {block.label || "（未命名的按钮）"}
              </span>
            }
          >
            <ButtonFields
              label={block.label}
              url={block.url}
              variant={block.variant}
              align={block.align}
              onChange={(next) =>
                onChange({
                  ...block,
                  label: next.label,
                  url: next.url,
                  variant: next.variant,
                  align: next.align ?? "",
                })
              }
            />
          </ElementPopover>
        </div>
      )}

      {block.type === "columns" && (
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ borderCollapse: "collapse", width: "100%", ...overrides }}
        >
          <tbody>
            <tr>
              <CanvasColumnCell
                first
                title="左栏"
                cell={block.left}
                theme={theme}
                onChange={(left) => onChange({ ...block, left })}
              />
              <CanvasColumnCell
                first={false}
                title="右栏"
                cell={block.right}
                theme={theme}
                onChange={(right) => onChange({ ...block, right })}
              />
            </tr>
          </tbody>
        </table>
      )}

      {block.type === "code" && (
        <div style={{ ...overrides }}>
          <Textarea
            value={block.html}
            onChange={(event) => onChange({ ...block, html: event.target.value })}
            placeholder={'<div style="padding:16px;background:#f2fbf6">…</div>'}
            className="min-h-[140px] resize-y bg-background font-mono text-xs"
            spellCheck={false}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            直接写邮件 HTML：保存与发送前都会按邮件白名单清洗（保留内联 style、去掉 script
            与事件属性）。邮件客户端不执行 {"<style>"} 标签；{"{变量}"} 会被替换成实际值。
          </p>
        </div>
      )}

      {block.type === "card" && (
        <div
          style={{
            ...noticeCard,
            ...cardToneStyle(theme, block.tone),
            ...overrides,
          }}
        >
          <div style={importantText}>
            <RichTextField
              variant="bare"
              contentClassName={BARE_TEXT_CLASS}
              value={block.title}
              onChange={(title) => onChange({ ...block, title })}
              placeholder="卡片标题（可留空）"
            />
          </div>
          {block.rows.map((row, rowIndex) => (
            <CanvasRow
              key={row.id}
              row={row}
              index={rowIndex}
              total={block.rows.length}
              theme={theme}
              onChange={(next) => updateRow(row.id, next)}
              onMove={(delta) => {
                const target = rowIndex + delta;
                if (target < 0 || target >= block.rows.length) return;
                const rows = [...block.rows];
                [rows[rowIndex], rows[target]] = [rows[target], rows[rowIndex]];
                onChange({ ...block, rows });
              }}
              onRemove={() =>
                onChange({ ...block, rows: block.rows.filter((item) => item.id !== row.id) })
              }
            />
          ))}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {(
              [
                { kind: "text" as const, label: "文本行" },
                { kind: "button" as const, label: "按钮" },
                { kind: "divider" as const, label: "分隔线" },
              ] as const
            ).map((option) => (
              <Button
                key={option.kind}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const id = `${block.id}r${Date.now().toString(36)}`;
                  const row: EmailBlockRow =
                    option.kind === "button"
                      ? { id, kind: "button", label: "按钮文案", url: "", variant: "primary" }
                      : option.kind === "divider"
                        ? { id, kind: "divider" }
                        : { id, kind: "text", html: "" };
                  onChange({ ...block, rows: [...block.rows, row] });
                }}
              >
                <Plus data-icon="inline-start" />
                {option.label}
              </Button>
            ))}
            {/* 卡片配色：语义色快捷 + 直接取色（取色写进 blockStyle.backgroundColor，覆盖语义色） */}
            <div className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1">
              <span className="text-[11px] text-muted-foreground">配色</span>
              {(Object.keys(CARD_TONE_LABELS) as EmailCardTone[]).map((tone) => {
                const swatch = cardToneStyle(theme, tone).backgroundColor;
                const active = block.tone === tone && !blockStyle.backgroundColor;
                return (
                  <button
                    key={tone}
                    type="button"
                    aria-label={`卡片配色：${CARD_TONE_LABELS[tone]}`}
                    title={CARD_TONE_LABELS[tone]}
                    onClick={() =>
                      onChange({
                        ...block,
                        tone,
                        style: { ...blockStyle, backgroundColor: "", border: "" },
                      })
                    }
                    className={cn(
                      "size-5 rounded-full border transition-transform hover:scale-110",
                      active ? "ring-2 ring-foreground ring-offset-1" : "border-border",
                    )}
                    style={{ backgroundColor: swatch }}
                  />
                );
              })}
              <input
                type="color"
                aria-label="自定义卡片背景色"
                title="自定义卡片背景色"
                value={/^#[0-9a-fA-F]{6}$/.test(blockStyle.backgroundColor) ? blockStyle.backgroundColor : "#f7faf8"}
                onChange={(event) =>
                  onChange({
                    ...block,
                    style: { ...blockStyle, backgroundColor: event.target.value },
                  })
                }
                className="size-5 shrink-0 cursor-pointer rounded-full border bg-background p-0"
              />
              {blockStyle.backgroundColor && (
                <button
                  type="button"
                  aria-label="清除自定义背景色"
                  title="清除自定义背景色"
                  className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  onClick={() =>
                    onChange({ ...block, style: { ...blockStyle, backgroundColor: "" } })
                  }
                >
                  自动
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageFields({
  block,
  onChange,
}: {
  block: Extract<EmailBlock, { type: "image" }>;
  onChange: (block: EmailBlock) => void;
}) {
  return (
    <div className="grid gap-2">
      <LabeledInput
        label="图片地址（https）"
        value={block.src}
        placeholder="https://…"
        onChange={(src) => onChange({ ...block, src })}
      />
      <LabeledInput
        label="替代文字"
        value={block.alt}
        onChange={(alt) => onChange({ ...block, alt })}
      />
      <LabeledInput
        label="宽度（如 320 或 60%）"
        value={block.width}
        onChange={(width) => onChange({ ...block, width })}
      />
      <LabeledInput
        label="点击跳转（可留空）"
        value={block.href}
        placeholder="https://…"
        onChange={(href) => onChange({ ...block, href })}
      />
    </div>
  );
}

/** 文本区块的样式 → 内联 CSS 字符串（画布与真实邮件用同一套计算） */
function textBlockCss(style: EmailBlockStyle | null | undefined) {
  const overrides = blockStyleOverrides(style ?? undefined) as Record<string, unknown>;
  const merged: Record<string, unknown> = {
    margin: "0 0 14px",
    color: "#172033",
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: "15px",
    fontWeight: "400",
    lineHeight: "26px",
    ...overrides,
  };
  return Object.entries(merged)
    .filter(([, value]) => value !== "" && value !== null && value !== undefined)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${String(value)}`)
    .join(";");
}

/** 正文节点：文字就是文档内容（不是 atom），所以能有跨块选中与整篇文字撤销 */
const EmailTextNode = Node.create({
  name: "emailText",
  group: "block",
  content: "inline*",
  defining: true,
  addAttributes() {
    return {
      blockId: { default: null },
      style: { default: null },
      enabled: { default: true },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-email-text]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-email-text": "",
        "data-block-id": (node.attrs.blockId as string | null) ?? "",
        style: textBlockCss(node.attrs.style as EmailBlockStyle | null),
      }),
      0,
    ];
  },
});

/** 一段 HTML → 若干「段落行内内容」（一个段落就是一个文本区块） */
function inlineParagraphs(html: string, editor: Editor): JSONContent[][] {
  if (!html.trim()) return [];
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const parsed = PMDOMParser.fromSchema(editor.schema).parse(wrapper);
  const result: JSONContent[][] = [];
  parsed.forEach((child) => {
    const json = child.toJSON() as { content?: JSONContent[] };
    result.push(json.content ?? []);
  });
  return result;
}

/** 画布 → 文档：文本区块变正文节点，其余仍是带完整 EmailBlock 的 atom 节点 */
function blocksToDoc(blocks: EmailBlock[], editor: Editor) {
  const content: JSONContent[] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      const paragraphs = inlineParagraphs(block.html, editor);
      const attrs = { style: block.style ?? null, enabled: block.enabled };
      if (paragraphs.length === 0) {
        content.push({ type: "emailText", attrs: { ...attrs, blockId: block.id }, content: [] });
        continue;
      }
      paragraphs.forEach((inline, index) => {
        content.push({
          type: "emailText",
          attrs: { ...attrs, blockId: index === 0 ? block.id : `${block.id}-p${index + 1}` },
          content: inline,
        });
      });
      continue;
    }
    content.push({ type: "emailBlock", attrs: { blockId: block.id, block } });
  }
  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  } as JSONContent;
}

/** 文档 → 画布：只认 emailBlock 节点（空文档的占位段落忽略） */
function docToBlocks(
  doc: { content?: Array<{ type: string; attrs?: Record<string, unknown>; content?: unknown[] }> },
  editor: Editor,
) {
  const serializer = DOMSerializer.fromSchema(editor.schema);
  const blocks: EmailBlock[] = [];
  for (const node of doc.content ?? []) {
    if (node.type === "emailBlock" && node.attrs?.block) {
      blocks.push(node.attrs.block as EmailBlock);
      continue;
    }
    if (node.type !== "emailText") continue;
    const pmNode = editor.schema.nodeFromJSON(node as never);
    const holder = document.createElement("div");
    holder.appendChild(serializer.serializeFragment(pmNode.content));
    blocks.push({
      id: (node.attrs?.blockId as string | null) ?? `t${blocks.length}`,
      type: "text",
      enabled: node.attrs?.enabled !== false,
      style: (node.attrs?.style as EmailBlockStyle | null) ?? undefined,
      html: holder.innerHTML.trim(),
    });
  }
  return blocks;
}

const EmailBlockNode = Node.create({
  name: "emailBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      blockId: { default: null },
      block: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-email-block]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-email-block": "",
        "data-kind": (node.attrs.block as EmailBlock | null)?.type ?? "",
      }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(EmailBlockNodeView);
  },
});

type EmailCanvasActions = {
  theme: EmailTheme;
  updateAt: (pos: number, block: EmailBlock) => void;
  insertAfter: (pos: number, kind: EmailBlockInsertKind) => void;
};

const EmailCanvasContext = createContext<EmailCanvasActions | null>(null);

/** 单个区块的节点视图：直接复用画布上的区块组件 */
function EmailBlockNodeView({ node, getPos }: NodeViewProps) {
  const actions = useContext(EmailCanvasContext);
  const block = node.attrs.block as EmailBlock | null;
  if (!actions || !block) return <NodeViewWrapper data-email-block="" />;
  return (
    <NodeViewWrapper data-email-block="" data-block-id={block.id} className="relative">
      <CanvasBlock
        block={block}
        theme={actions.theme}
        onChange={(next) => actions.updateAt(typeof getPos === "function" ? (getPos() ?? -1) : -1, next)}
      />
    </NodeViewWrapper>
  );
}

export type EmailCanvasProps = {
  blocks: EmailBlock[];
  onBlocksChange: (blocks: EmailBlock[]) => void;
  frame: EmailFrameStyle;
  onFrameChange: (frame: EmailFrameStyle) => void;
  themeColor: string;
  title: string;
  onTitleChange: (value: string) => void;
  subtitle?: string;
  onSubtitleChange?: (value: string) => void;
  presets: EmailStylePresetRow[];
  onSavePreset: (name: string, blocks: EmailBlock[]) => Promise<void>;
  onDeletePreset: (presetId: number) => Promise<void>;
  /** 主题色回落的语义色：通过 / 不通过 */
  accept: boolean;
  /** 只读浏览（其他部门的覆盖）：画布仍然渲染，但不能改 */
  editable?: boolean;
};

/**
 * 邮件画布：**整篇是一个 TipTap 文档**。
 *
 * 每个区块是文档里的一个 atom 节点（NodeView 里渲染我们自己的区块 UI），
 * 因此拖拽把手、区块菜单、选中与「插入到哪」都由 TipTap 官方拖拽扩展统一处理 ——
 * 不再有「把手互相压住 / 点不到」这类自研交互的问题。
 * 数据仍是 `EmailBlock[]`（落库与渲染完全没变），文档只是它的另一种视图。
 */
export function EmailCanvas({
  blocks,
  onBlocksChange,
  frame,
  onFrameChange,
  themeColor,
  title,
  onTitleChange,
  subtitle,
  onSubtitleChange,
  presets,
  onSavePreset,
  onDeletePreset,
  accept,
  editable = true,
  variables = [],
}: EmailCanvasProps & { variables?: readonly EmailTemplateVariable[] }) {
  const theme = resolveEmailTheme(themeColor, accept);
  const [hovered, setHovered] = useState<{ pos: number; block: EmailBlock } | null>(null);
  const [slashExtension] = useState(() => createSlashExtension());
  const blocksRef = useRef(blocks);
  /* 正文灌进编辑器之前，任何一次 update 都不能当作「用户改了什么」：那时文档还是空的 */
  const hydratedRef = useRef(false);
  /* 同步「最近一次已提交的区块」：onUpdate 里用它判断文档变化是否已被吸收 */
  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      ...createEmailInlineExtensions({ undoRedo: false }),
      EmailBlockNode,
      EmailTextNode,
      slashExtension,
    ],
    content: { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      attributes: {
        class: "outline-none [&_.ProseMirror]:outline-none",
      },
    },
    onUpdate: ({ editor: current }) => {
      if (!hydratedRef.current) return;
      const next = docToBlocks(current.getJSON() as never, current);
      if (JSON.stringify(next) === JSON.stringify(blocksRef.current)) return;
      blocksRef.current = next;
      onBlocksChange(next);
    },
  });

  /* 只读浏览：编辑器跟着 `editable` 走，别人部门的模板连选区都改不动。
     注意 `setEditable` 默认会 emit("update")（哪怕值没变），挂载时那一下会在正文
     还没灌进去之前触发 onUpdate，把整篇正文清成空；所以这里只在真的变了时才改，
     并且显式关掉 emit。 */
  useEffect(() => {
    if (!editor || editor.isEditable === editable) return;
    editor.setEditable(editable, false);
  }, [editor, editable]);

  /* 把回调与最新区块放进 ref：插入动作不该因为「区块数组变了」而换一份新函数，
     否则每次按键都会让 context 变化，画布上所有区块跟着重渲染一遍。 */
  const onBlocksChangeRef = useRef(onBlocksChange);
  useEffect(() => {
    onBlocksChangeRef.current = onBlocksChange;
  });

  /** 文档位置 → 顶层区块下标（拖拽 / 斜杠 / 插入都用同一份口径） */
  const indexAt = useCallback(
    (pos: number) => {
      if (!editor || pos < 0) return -1;
      try {
        return editor.state.doc.resolve(pos).index(0);
      } catch {
        return -1;
      }
    },
    [editor],
  );

  const insertBlockAt = useCallback((index: number, kind: EmailBlockInsertKind) => {
    const block = createEmailBlockTemplate(kind);
    const next = [...blocksRef.current];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, block);
    blocksRef.current = next;
    onBlocksChangeRef.current(next);
    /* 新块可能落在可视区外（比如「插入区块」追加到结尾）：插完滚过去，不然点了像没反应 */
    scrollToEmailBlock(block.id);
  }, []);

  /* 斜杠菜单：条目与回调写进编辑器 storage（扩展只建一次）。
     `editor.storage` 是 TipTap 暴露给扩展的可变槽位，这里写它是唯一用法；
     React Compiler 的 immutability 规则按「改了 editor」报，故整段豁免。 */
  /* eslint-disable react-hooks/immutability -- TipTap storage 槽位，写入是扩展的约定用法 */
  useEffect(() => {
    if (!editor) return;
    const storage = editor.storage.emailSlashCommand;
    if (!storage) return;
    storage.items = SLASH_ITEMS;
    storage.onSelect = (kind, range) => {
      /* 插到「敲 / 的那一块」后面，而不是整封邮件的末尾 */
      const index = indexAt(range.from);
      insertBlockAt(index < 0 ? blocksRef.current.length : index + 1, kind as EmailBlockInsertKind);
    };
  }, [editor, indexAt, insertBlockAt]);
  /* eslint-enable react-hooks/immutability */

  /* 首次挂载：编辑器要先有 schema，才能把 blocks 里的 HTML 解析成正文节点 */
  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(blocksToDoc(blocksRef.current, editor), { emitUpdate: false });
    hydratedRef.current = true;
  }, [editor]);

  /* 外部改动（撤销 / 套用版式 / 恢复内置）同步回文档；文档自己触发的更新不回写 */
  useEffect(() => {
    if (!editor) return;
    const current = docToBlocks(editor.getJSON() as never, editor);
    if (JSON.stringify(current) === JSON.stringify(blocks)) return;
    editor.commands.setContent(blocksToDoc(blocks, editor), { emitUpdate: false });
    blocksRef.current = blocks;
  }, [editor, blocks]);

  const contextValue = useMemo<EmailCanvasActions>(
    () => ({
      theme,
      updateAt: (pos, next) => {
        if (!editor || pos < 0) return;
        const node = editor.state.doc.nodeAt(pos);
        if (!node) return;
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            block: next,
            blockId: next.id,
          }),
        );
      },
      /* 插入菜单：插到「当前块」后面 */
      insertAfter: (pos, kind) => {
        const index = indexAt(pos);
        insertBlockAt(index < 0 ? blocksRef.current.length : index + 1, kind);
      },
    }),
    [editor, theme, indexAt, insertBlockAt],
  );

  const insertBlock = (kind: EmailBlockInsertKind) => insertBlockAt(blocksRef.current.length, kind);

  /* `hovered.block` 是悬停那一刻的快照：改完样式 / 开关之后它不会自己更新，浮层就会
     一直显示旧值（点了「居中」也不高亮）。按位置取当前区块，浮层与画布永远一致。 */
  const hoveredIndex = hovered ? indexAt(hovered.pos) : -1;
  const hoveredBlock =
    hovered && hoveredIndex >= 0 ? (blocks[hoveredIndex] ?? hovered.block) : hovered?.block ?? null;

  const logoWidth = frame.logoWidth.trim();

  return (
    <EmailCanvasContext.Provider value={contextValue}>
      <EmailVariablesProvider variables={variables}>
      <div
        /* 画布固定按浅色令牌渲染：邮件本身是浅色的，暗色主题下不能让提示/分隔线翻成浅灰 */
        className="email-canvas-theme rounded-lg pb-8 pt-4"
        style={{ ...main, backgroundColor: frame.pageBackground }}
      >
        <div className="mx-auto mb-3 flex w-full max-w-[560px] items-center justify-between gap-2 px-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            邮件正文 · {frame.cardWidth || "560px"} · {editable ? "点哪里改哪里" : "只读浏览"}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {editable
              ? "拖动左侧 ⠿ 换位置 · + 在下方插入 · ⋯ 更多"
              : "其他部门的覆盖只能查看，切回自己的归属才能编辑"}
          </span>
        </div>

        <div
          style={{
            ...container,
            backgroundColor: frame.cardBackground,
            border: frame.cardBorder,
            borderRadius: frame.cardRadius,
            maxWidth: frame.cardWidth,
            overflow: "visible",
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
          }}
          className="mx-auto"
        >
          <div style={{ ...topBar, backgroundColor: theme.primary, borderRadius: "18px 18px 0 0" }} />

          <div style={{ ...header, backgroundColor: frame.cardBackground }}>
            {frame.logoUrl ? (
              <ElementPopover
                label="编辑 Logo"
                trigger={
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={frame.logoUrl}
                    alt="Logo"
                    width={/^\d+$/.test(logoWidth) ? logoWidth : undefined}
                    style={logo}
                    className="cursor-pointer rounded"
                  />
                }
              >
                <div className="grid gap-2">
                  <LabeledInput
                    label="Logo 图片地址"
                    value={frame.logoUrl}
                    onChange={(next) => onFrameChange({ ...frame, logoUrl: next })}
                  />
                  <LabeledInput
                    label="Logo 宽度（px）"
                    value={frame.logoWidth}
                    placeholder="64"
                    onChange={(next) => onFrameChange({ ...frame, logoWidth: next })}
                  />
                </div>
              </ElementPopover>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mb-3"
                onClick={() =>
                  onFrameChange({ ...frame, logoUrl: "https://storage.sast.fun/sast-logo.png" })
                }
              >
                <Plus data-icon="inline-start" />
                加 Logo
              </Button>
            )}

            <InlineEditableText
              ariaLabel="页眉眉标"
              placeholder="页眉眉标"
              value={frame.eyebrowText}
              onChange={(next) => onFrameChange({ ...frame, eyebrowText: next })}
              style={eyebrow}
            />
            <InlineEditableText
              ariaLabel="邮件主标题"
              placeholder="邮件主标题"
              value={title}
              onChange={onTitleChange}
              style={titleStyle}
            />
            {onSubtitleChange && (
              <InlineEditableText
                ariaLabel="邮件副标题"
                placeholder="邮件副标题（可留空）"
                value={subtitle ?? ""}
                onChange={onSubtitleChange}
                style={subtitleStyle}
              />
            )}
          </div>

          <div style={content}>
            <div className="relative">
              <EditorContent editor={editor} />
              {editor && <EmailBubbleMenu editor={editor} />}
              {editor && editable && (
                <DragHandle
                  editor={editor}
                  onNodeChange={({ node, pos }) =>
                    setHovered(
                      node && node.type.name === "emailBlock"
                        ? { pos, block: node.attrs.block as EmailBlock }
                        : null,
                    )
                  }
                >
                  <div className="flex h-6 items-center gap-0.5 rounded-md border bg-background px-0.5 shadow-sm">
                    <span
                      aria-hidden="true"
                      className="cursor-grab px-1 text-[11px] text-muted-foreground"
                    >
                      ⠿
                    </span>
                    {hovered && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton label="在这一块下面插入区块" className="size-5">
                            <Plus className="size-3.5" />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <BlockLibraryContent
                          onInsert={(kind) => insertBlockAt(indexAt(hovered.pos) + 1, kind)}
                        />
                      </DropdownMenu>
                    )}
                    {hovered && hoveredBlock && (
                      <BlockMenu
                        block={hoveredBlock}
                        index={indexAt(hovered.pos)}
                        total={blocks.length}
                        presets={presets}
                        onMove={(delta) => {
                          const index = indexAt(hovered.pos);
                          const target = index + delta;
                          if (index < 0 || target < 0 || target >= blocks.length) return;
                          const next = [...blocks];
                          [next[index], next[target]] = [next[target], next[index]];
                          onBlocksChange(next);
                        }}
                        onDuplicate={() => {
                          const index = indexAt(hovered.pos);
                          if (index < 0) return;
                          const [clone] = cloneEmailBlocksWithNewIds([blocks[index]]);
                          const next = [...blocks];
                          next.splice(index + 1, 0, clone);
                          onBlocksChange(next);
                        }}
                        onRemove={() => {
                          const index = indexAt(hovered.pos);
                          if (index < 0) return;
                          onBlocksChange(blocks.filter((_, i) => i !== index));
                        }}
                        onToggleEnabled={() =>
                          onBlocksChange(
                            blocks.map((item, i) =>
                              i === indexAt(hovered.pos)
                                ? { ...item, enabled: !item.enabled }
                                : item,
                            ),
                          )
                        }
                        onStyleChange={(style) =>
                          onBlocksChange(
                            blocks.map((item, i) =>
                              i === indexAt(hovered.pos) ? { ...item, style } : item,
                            ),
                          )
                        }
                        onSavePreset={onSavePreset}
                        onDeletePreset={onDeletePreset}
                      />
                    )}
                  </div>
                </DragHandle>
              )}
            </div>

            {blocks.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  正文还是空的。可以从「插入区块」挑一块组件，或者先把内置文案恢复回来。
                </p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm">
                      <Plus data-icon="inline-start" />
                      加第一块内容
                    </Button>
                  </DropdownMenuTrigger>
                  <BlockLibraryContent onInsert={insertBlock} />
                </DropdownMenu>
              </div>
            )}
          </div>

          <div style={{ ...footer, backgroundColor: frame.cardBackground }}>
            {frame.footerImageUrl ? (
              <ElementPopover
                label="编辑页脚图片"
                trigger={
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={frame.footerImageUrl}
                    alt="页脚图片"
                    width="180"
                    style={footerImage}
                    className="mx-auto cursor-pointer rounded"
                  />
                }
              >
                <LabeledInput
                  label="页脚图片地址"
                  value={frame.footerImageUrl}
                  onChange={(next) => onFrameChange({ ...frame, footerImageUrl: next })}
                />
              </ElementPopover>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mb-2"
                onClick={() =>
                  onFrameChange({
                    ...frame,
                    footerImageUrl: "https://storage.sast.fun/sast-email-header.png",
                  })
                }
              >
                <Plus data-icon="inline-start" />
                加页脚图片
              </Button>
            )}
            <InlineEditableText
              ariaLabel="页脚文案"
              placeholder="页脚文案"
              value={frame.footerText}
              onChange={(next) => onFrameChange({ ...frame, footerText: next })}
              style={footerText}
              className="text-center"
            />
          </div>
        </div>

        <div className="mx-auto mt-3 w-full max-w-[560px] px-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={!editable}
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-background/70 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="size-3.5" />
                在结尾加一块内容
              </button>
            </DropdownMenuTrigger>
            <BlockLibraryContent onInsert={insertBlock} />
          </DropdownMenu>
        </div>
      </div>
      </EmailVariablesProvider>
    </EmailCanvasContext.Provider>
  );
}
