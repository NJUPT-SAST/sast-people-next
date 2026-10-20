/**
 * 结果邮件正文的区块模型。
 *
 * 邮件正文由**区块数组**驱动：区块可开关、排序、增删、复制，每个区块都能覆盖一组
 * 通用样式（内边距、外边距、背景、描边、圆角、对齐、宽度、字号…），卡片内部再按行
 * （文本 / 按钮 / 分隔线）自由组合，也可以整块贴自定义 HTML/CSS。
 *
 * 兼容：`bodyBlocks` 为 null 时回落到 `defaultResultEmailBlocks()` 生成的内置版式
 * （等价于历史上组件里那套硬编码文案 + 结构卡片），所以未自定义过的模板渲染结果不变。
 *
 * 本模块是纯数据 + 纯函数，客户端编辑器与服务端渲染共用；不要在这里 import server-only。
 */

import { z } from "zod";

import { RESULT_EMAIL_BODY_COPY, RESULT_EMAIL_PANEL_COPY } from "./result-email-copy";

export const RESULT_EMAIL_FLOW_KINDS = [
  "recruitment",
  "recruitment_exemption",
  "woc",
  "soc",
  "office_round1",
  "office_round2",
] as const;

export type ResultEmailFlowKind = (typeof RESULT_EMAIL_FLOW_KINDS)[number];

/** 卡片配色：通过用 success、提示用 warning、普通用 neutral */
export const EMAIL_CARD_TONES = ["success", "warning", "neutral"] as const;
export type EmailCardTone = (typeof EMAIL_CARD_TONES)[number];

export type EmailBlockButtonVariant = "primary" | "dark" | "plain";

export type EmailBlockTextAlign = "" | "left" | "center" | "right";

/**
 * 通用区块样式：全部是字符串，空串 = 不设置（回落渲染器默认）。
 * 值会原样进 React 的 `style` 对象（不进 HTML 字符串），因此不需要转义，只限长度。
 */
export type EmailBlockStyle = {
  padding: string;
  margin: string;
  backgroundColor: string;
  color: string;
  border: string;
  borderRadius: string;
  textAlign: EmailBlockTextAlign;
  maxWidth: string;
  fontSize: string;
  fontWeight: string;
  fontFamily: string;
  lineHeight: string;
  letterSpacing: string;
};

export const EMAIL_BLOCK_STYLE_KEYS = [
  "padding",
  "margin",
  "backgroundColor",
  "color",
  "border",
  "borderRadius",
  "textAlign",
  "maxWidth",
  "fontSize",
  "fontWeight",
  "fontFamily",
  "lineHeight",
  "letterSpacing",
] as const satisfies ReadonlyArray<keyof EmailBlockStyle>;

export const EMPTY_EMAIL_BLOCK_STYLE: EmailBlockStyle = {
  padding: "",
  margin: "",
  backgroundColor: "",
  color: "",
  border: "",
  borderRadius: "",
  textAlign: "",
  maxWidth: "",
  fontSize: "",
  fontWeight: "",
  fontFamily: "",
  lineHeight: "",
  letterSpacing: "",
};

export type EmailBlockTextRow = { id: string; kind: "text"; html: string };

export type EmailBlockButtonRow = {
  id: string;
  kind: "button";
  label: string;
  url: string;
  variant: EmailBlockButtonVariant;
};

export type EmailBlockDividerRow = { id: string; kind: "divider" };

export type EmailBlockRow =
  | EmailBlockTextRow
  | EmailBlockButtonRow
  | EmailBlockDividerRow;

type EmailBlockBase = {
  id: string;
  enabled: boolean;
  /** 未设置 = 全部走渲染器默认样式（解析落库数据时会补成完整对象） */
  style?: EmailBlockStyle;
};

/** 富文本段落：html 为内联样式化的 HTML（保存与渲染都会按邮件白名单清洗） */
export type EmailTextBlock = EmailBlockBase & { type: "text"; html: string };

/** 卡片：标题 + 有序的行（文本 / 按钮 / 分隔线） */
export type EmailCardBlock = EmailBlockBase & {
  type: "card";
  tone: EmailCardTone;
  title: string;
  rows: EmailBlockRow[];
};

/** 自定义代码：直接写 HTML/CSS（保存与渲染都会按邮件白名单清洗） */
export type EmailCodeBlock = EmailBlockBase & { type: "code"; html: string };

export type EmailDividerBlock = EmailBlockBase & { type: "divider" };

export type EmailImageBlock = EmailBlockBase & {
  type: "image";
  src: string;
  alt: string;
  width: string;
  href: string;
};

export type EmailButtonBlock = EmailBlockBase & {
  type: "button";
  label: string;
  url: string;
  variant: EmailBlockButtonVariant;
  align: EmailBlockTextAlign;
};

export type EmailSpacerBlock = EmailBlockBase & { type: "spacer"; height: string };

/** 分栏的一格：一段富文本 + 可选按钮 */
export type EmailColumnCell = { html: string; buttonLabel: string; buttonUrl: string };

/** 双栏：邮件里用表格实现（Outlook 不认 flex/grid） */
export type EmailColumnsBlock = EmailBlockBase & {
  type: "columns";
  left: EmailColumnCell;
  right: EmailColumnCell;
};

/** 结果面板：标签 + 结果标题 + 摘要，配色跟随模板主题色 */
export type EmailResultPanelBlock = EmailBlockBase & {
  type: "resultPanel";
  badge: string;
  title: string;
  summary: string;
};

/** 状态徽章：一个胶囊标签（面试通知的状态、自定义强调） */
export type EmailBadgeBlock = EmailBlockBase & { type: "badge"; text: string };

export type EmailBlock =
  | EmailTextBlock
  | EmailCardBlock
  | EmailCodeBlock
  | EmailDividerBlock
  | EmailImageBlock
  | EmailButtonBlock
  | EmailSpacerBlock
  | EmailColumnsBlock
  | EmailResultPanelBlock
  | EmailBadgeBlock;

export type EmailBlockType = EmailBlock["type"];

/** 编辑器「添加区块」菜单项：几个预填内容的卡片也算一种插入项 */
export type EmailBlockInsertKind =
  | EmailBlockType
  | "stepsCard"
  | "calendarCard"
  | "activityCard"
  | "groupCard";

/** 邮件外框（顶部/底部与内容卡）：不改就是当前的内置外观 */
export type EmailFrameStyle = {
  pageBackground: string;
  cardBackground: string;
  cardBorder: string;
  cardRadius: string;
  cardWidth: string;
  logoUrl: string;
  logoWidth: string;
  eyebrowText: string;
  footerImageUrl: string;
  footerText: string;
};

export const DEFAULT_EMAIL_FRAME: EmailFrameStyle = {
  pageBackground: "#eef3f1",
  cardBackground: "#fffdfa",
  cardBorder: "1px solid #d9e2dc",
  cardRadius: "18px",
  cardWidth: "560px",
  logoUrl: "https://storage.sast.fun/sast-logo.png",
  logoWidth: "64",
  eyebrowText: "SAST People",
  footerImageUrl: "https://storage.sast.fun/sast-email-header.png",
  footerText: "南京邮电大学大学生科学技术协会",
};

/** 单个模板的数量与长度上限：邮件不是网页，超长内容只会被收件箱截断 */
export const EMAIL_BLOCK_LIMITS = {
  blocks: 60,
  rows: 30,
  html: 20_000,
  title: 200,
  label: 100,
  url: 2_000,
  styleValue: 60,
  shortText: 200,
} as const;

const idSchema = z.string().min(1).max(64).catch("b");

const styleValue = z.string().max(EMAIL_BLOCK_LIMITS.styleValue).catch("");

const styleSchema = z
  .object({
    padding: styleValue,
    margin: styleValue,
    backgroundColor: styleValue,
    color: styleValue,
    border: styleValue,
    borderRadius: styleValue,
    textAlign: z.enum(["left", "center", "right"]).or(z.literal("")).catch(""),
    maxWidth: styleValue,
    fontSize: styleValue,
    fontWeight: styleValue,
    fontFamily: styleValue,
    lineHeight: styleValue,
    letterSpacing: styleValue,
  })
  .catch(EMPTY_EMAIL_BLOCK_STYLE);

const rowSchema = z.discriminatedUnion("kind", [
  z.object({
    id: idSchema,
    kind: z.literal("text"),
    html: z.string().catch(""),
  }),
  z.object({
    id: idSchema,
    kind: z.literal("button"),
    label: z.string().catch(""),
    url: z.string().catch(""),
    variant: z.enum(["primary", "dark", "plain"]).catch("primary"),
  }),
  z.object({ id: idSchema, kind: z.literal("divider") }),
]);

/**
 * 单行解析失败只丢这一行：判别联合里有一项对不上会让整个数组校验失败，
 * 直接 `z.array(rowSchema)` 会把整张卡片的行都清空。
 */
const tolerantRows = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.filter((row) => rowSchema.safeParse(row).success)
      : [],
  z.array(rowSchema),
);

const blockBase = {
  id: idSchema,
  enabled: z.boolean().catch(true),
  style: styleSchema,
};

const columnCellSchema = z
  .object({
    html: z.string().catch(""),
    buttonLabel: z.string().catch(""),
    buttonUrl: z.string().catch(""),
  })
  .catch({ html: "", buttonLabel: "", buttonUrl: "" });

const blockSchema = z.discriminatedUnion("type", [
  z.object({ ...blockBase, type: z.literal("text"), html: z.string().catch("") }),
  z.object({ ...blockBase, type: z.literal("code"), html: z.string().catch("") }),
  z.object({ ...blockBase, type: z.literal("divider") }),
  z.object({
    ...blockBase,
    type: z.literal("card"),
    tone: z.enum(EMAIL_CARD_TONES).catch("neutral"),
    title: z.string().catch(""),
    rows: tolerantRows,
  }),
  z.object({
    ...blockBase,
    type: z.literal("image"),
    src: z.string().catch(""),
    alt: z.string().catch(""),
    width: z.string().catch(""),
    href: z.string().catch(""),
  }),
  z.object({
    ...blockBase,
    type: z.literal("button"),
    label: z.string().catch(""),
    url: z.string().catch(""),
    variant: z.enum(["primary", "dark", "plain"]).catch("primary"),
    align: z.enum(["left", "center", "right"]).or(z.literal("")).catch(""),
  }),
  z.object({
    ...blockBase,
    type: z.literal("spacer"),
    height: z.string().catch(""),
  }),
  z.object({
    ...blockBase,
    type: z.literal("columns"),
    left: columnCellSchema,
    right: columnCellSchema,
  }),
  z.object({
    ...blockBase,
    type: z.literal("resultPanel"),
    badge: z.string().catch(""),
    title: z.string().catch(""),
    summary: z.string().catch(""),
  }),
  z.object({
    ...blockBase,
    type: z.literal("badge"),
    text: z.string().catch(""),
  }),
]);

/** 同理：一个坏区块不该让整个模板的版式消失，只丢掉它自己 */
const tolerantBlocks = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.filter((block) => blockSchema.safeParse(block).success)
      : null,
  z.array(blockSchema).max(EMAIL_BLOCK_LIMITS.blocks),
);

const frameSchema = z
  .object({
    pageBackground: z.string().catch(""),
    cardBackground: z.string().catch(""),
    cardBorder: z.string().catch(""),
    cardRadius: z.string().catch(""),
    cardWidth: z.string().catch(""),
    logoUrl: z.string().catch(""),
    logoWidth: z.string().catch(""),
    eyebrowText: z.string().catch(""),
    footerImageUrl: z.string().catch(""),
    footerText: z.string().catch(""),
  })
  .catch(DEFAULT_EMAIL_FRAME);

/** 校验/归一化后的区块：区块与行都按数组顺序重新编号，避免客户端 id 冲突 */
function resequenceEmailBlocks(blocks: EmailBlock[]): EmailBlock[] {
  return blocks.map((block, index) => {
    const id = `b${index + 1}`;
    if (block.type !== "card") return { ...block, id };
    return {
      ...block,
      id,
      rows: block.rows.map((row, rowIndex) => ({ ...row, id: `${id}r${rowIndex + 1}` })),
    };
  });
}

/**
 * 把库里 / 客户端传来的任意 JSON 归一化成区块数组。
 * 不是数组、解析后为空时返回 null，调用方据此回落到内置版式。
 */
export function parseEmailBlocks(value: unknown): EmailBlock[] | null {
  const parsed = tolerantBlocks.safeParse(value);
  if (!parsed.success || parsed.data.length === 0) return null;
  /* 编辑器里新加的空按钮行既没有文案也没有链接，渲染时会整行消失——不如不入库 */
  const blocks = parsed.data.map((block) =>
    block.type === "card"
      ? {
          ...block,
          rows: block.rows.filter(
            (row) =>
              row.kind !== "button" || row.label.trim().length > 0 || row.url.trim().length > 0,
          ),
        }
      : block,
  );
  return resequenceEmailBlocks(blocks);
}

/** 邮件外框：空字段回落内置外观，整体解析失败也回落 */
export function parseEmailFrame(value: unknown): EmailFrameStyle {
  const parsed = frameSchema.safeParse(value);
  if (!parsed.success) return DEFAULT_EMAIL_FRAME;
  const result = parsed.data;
  return Object.fromEntries(
    Object.entries(DEFAULT_EMAIL_FRAME).map(([key, fallback]) => [
      key,
      (result as Record<string, string>)[key]?.trim() || fallback,
    ]),
  ) as EmailFrameStyle;
}

/** 写入前的硬性校验：返回首条错误文案，通过则返回 null */
export function validateEmailBlocks(blocks: EmailBlock[]): string | null {
  for (const block of blocks) {
    const styleError = EMAIL_BLOCK_STYLE_KEYS.find(
      (key) => (block.style?.[key] ?? "").length > EMAIL_BLOCK_LIMITS.styleValue,
    );
    if (styleError) return `样式值不能超过 ${EMAIL_BLOCK_LIMITS.styleValue} 字`;

    if (block.type === "card") {
      if (block.title.length > EMAIL_BLOCK_LIMITS.title) {
        return `卡片标题不能超过 ${EMAIL_BLOCK_LIMITS.title} 字`;
      }
      if (block.rows.length > EMAIL_BLOCK_LIMITS.rows) {
        return `单张卡片最多 ${EMAIL_BLOCK_LIMITS.rows} 行`;
      }
      for (const row of block.rows) {
        if (row.kind === "text" && row.html.length > EMAIL_BLOCK_LIMITS.html) {
          return `单行文本不能超过 ${EMAIL_BLOCK_LIMITS.html} 字`;
        }
        if (row.kind === "button") {
          if (row.label.length > EMAIL_BLOCK_LIMITS.label) {
            return `按钮文案不能超过 ${EMAIL_BLOCK_LIMITS.label} 字`;
          }
          if (row.url.length > EMAIL_BLOCK_LIMITS.url) {
            return `按钮链接不能超过 ${EMAIL_BLOCK_LIMITS.url} 字`;
          }
        }
      }
      continue;
    }

    if (block.type === "divider") continue;

    if (block.type === "columns") {
      for (const cell of [block.left, block.right]) {
        if (cell.html.length > EMAIL_BLOCK_LIMITS.html) {
          return `分栏内容不能超过 ${EMAIL_BLOCK_LIMITS.html} 字`;
        }
        if (cell.buttonLabel.length > EMAIL_BLOCK_LIMITS.label) {
          return `按钮文案不能超过 ${EMAIL_BLOCK_LIMITS.label} 字`;
        }
        if (cell.buttonUrl.length > EMAIL_BLOCK_LIMITS.url) {
          return `按钮链接不能超过 ${EMAIL_BLOCK_LIMITS.url} 字`;
        }
      }
      continue;
    }

    if (block.type === "image") {
      if (block.src.length > EMAIL_BLOCK_LIMITS.url) return "图片地址过长";
      if (block.href.length > EMAIL_BLOCK_LIMITS.url) return "图片链接过长";
      if (block.alt.length > EMAIL_BLOCK_LIMITS.shortText) return "图片说明过长";
      if (block.width.length > EMAIL_BLOCK_LIMITS.styleValue) return "图片宽度过长";
      continue;
    }

    if (block.type === "button") {
      if (block.label.length > EMAIL_BLOCK_LIMITS.label) {
        return `按钮文案不能超过 ${EMAIL_BLOCK_LIMITS.label} 字`;
      }
      if (block.url.length > EMAIL_BLOCK_LIMITS.url) return "按钮链接过长";
      continue;
    }

    if (block.type === "spacer") {
      if (block.height.length > EMAIL_BLOCK_LIMITS.styleValue) return "间距值过长";
      continue;
    }

    if (block.type === "resultPanel") {
      for (const value of [block.badge, block.title, block.summary]) {
        if (value.length > EMAIL_BLOCK_LIMITS.title) {
          return `结果面板文案不能超过 ${EMAIL_BLOCK_LIMITS.title} 字`;
        }
      }
      continue;
    }

    if (block.type === "badge") {
      if (block.text.length > EMAIL_BLOCK_LIMITS.title) {
        return `徽章文案不能超过 ${EMAIL_BLOCK_LIMITS.title} 字`;
      }
      continue;
    }

    if (block.html.length > EMAIL_BLOCK_LIMITS.html) {
      return `单个区块内容不能超过 ${EMAIL_BLOCK_LIMITS.html} 字`;
    }
  }
  return null;
}

let blockIdCounter = 0;

/** 编辑器里新增区块/行时用的临时 id（服务端保存时会按顺序重新编号） */
function createEmailBlockId(prefix = "b"): string {
  blockIdCounter += 1;
  return `${prefix}${Date.now().toString(36)}${blockIdCounter.toString(36)}`;
}

/** 复制一份内置卡片并换上新 id：默认版式与「插入卡片」共用同一份内容 */
function withFreshIds(block: EmailCardBlock, id: string): EmailCardBlock {
  return {
    ...block,
    id,
    style: { ...EMPTY_EMAIL_BLOCK_STYLE },
    rows: block.rows.map((row, index) => ({ ...row, id: `${id}r${index + 1}` })),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 内置卡片内容：默认版式与编辑器「插入卡片」菜单共用的唯一来源。
 * 文案里的 {变量} 由渲染器的 copyVariables 在渲染时替换。
 */
export const EMAIL_CARD_PRESETS: Record<
  "stepsCard" | "calendarCard" | "activityCard" | "groupCard",
  EmailCardBlock
> = {
  stepsCard: {
    id: "seed.steps",
    type: "card",
    enabled: true,
    style: EMPTY_EMAIL_BLOCK_STYLE,
    tone: "success",
    title: "【重要步骤】<br />请注意：以下信息请勿向其他人分享",
    rows: [
      {
        id: "seed.steps.r1",
        kind: "text",
        html: "1. 为完善你的成员信息，请务必在今日内填写社团管理系统成员信息收集表",
      },
      {
        id: "seed.steps.r2",
        kind: "button",
        label: "{memberFormLabel}",
        url: "{memberInfoFormUrl}",
        variant: "primary",
      },
      { id: "seed.steps.r3", kind: "divider" },
      {
        id: "seed.steps.r4",
        kind: "text",
        html: '2. 请注册个人飞书账号（<a href="{feishuRegisterHelpUrl}">注册说明</a>）并加入“{feishuGroupName}”飞书群，和学长及其他新成员一起交流',
      },
      {
        id: "seed.steps.r5",
        kind: "button",
        label: "点击加入飞书群",
        url: "{feishuGroupUrl}",
        variant: "dark",
      },
    ],
  },
  calendarCard: {
    id: "seed.calendar",
    type: "card",
    enabled: true,
    style: EMPTY_EMAIL_BLOCK_STYLE,
    tone: "warning",
    title: "【查看授课日历】",
    rows: [
      {
        id: "seed.calendar.r1",
        kind: "text",
        html: '通过个人飞书账号，订阅<a href="{calendarUrl}">科协公开活动</a>，获取最新授课日历',
      },
    ],
  },
  activityCard: {
    id: "seed.activity",
    type: "card",
    enabled: true,
    style: EMPTY_EMAIL_BLOCK_STYLE,
    tone: "warning",
    title: "【后续活动】",
    rows: [
      {
        id: "seed.activity.r1",
        kind: "text",
        html: '后续公开课、技术分享和项目活动请关注<a href="{calendarUrl}">科协活动日历</a>。',
      },
    ],
  },
  groupCard: {
    id: "seed.group",
    type: "card",
    enabled: true,
    style: EMPTY_EMAIL_BLOCK_STYLE,
    tone: "neutral",
    title: "",
    rows: [
      {
        id: "seed.group.r1",
        kind: "text",
        html: '内部飞书群　<a href="{feishuGroupUrl}">{feishuGroupName}</a>',
      },
      {
        id: "seed.group.r2",
        kind: "text",
        html: '后续安排　<a href="{calendarUrl}">关注飞书日历</a>',
      },
    ],
  },
};

/** 落款样式：内置版式里「祝心想事成!」的字体与字号 */
const SIGN_OFF_STYLE: EmailBlockStyle = {
  ...EMPTY_EMAIL_BLOCK_STYLE,
  color: "#111827",
  fontFamily: "Georgia, Times New Roman, serif",
  fontSize: "17px",
  fontWeight: "700",
  lineHeight: "26px",
  margin: "4px 0 0",
};

function textBlock(id: string, html: string, style?: Partial<EmailBlockStyle>): EmailTextBlock {
  return {
    id,
    type: "text",
    enabled: true,
    style: { ...EMPTY_EMAIL_BLOCK_STYLE, ...style },
    html,
  };
}

/**
 * 内置版式（= `bodyBlocks` 为空时的渲染结果）。**整封正文都是区块**，
 * 因此结果面板、称呼、联系与落款都能被移动、改样式或删掉：
 *
 * - 结果面板：文案取模板设置（部门覆盖过的值优先），没有就用 `RESULT_EMAIL_PANEL_COPY`；
 * - 散文段落：优先用模板自己的 `bodyTemplate`（历史字段），没有就用内置文案；
 * - 结构卡片：按流程类型补上报名入口 / 日历 / 内部群，**与正文文案无关**，
 *   因此「一改正文，下面的框就没了」不会再发生。
 */
export function defaultResultEmailBlocks(input: {
  flowKind: ResultEmailFlowKind;
  accept: boolean;
  bodyTemplate?: string | null;
  /** 已解析的结果面板文案（标签 / 结果标题 / 结果摘要），空则取内置默认 */
  panel?: {
    resultBadgeTemplate?: string;
    resultTitleTemplate?: string;
    resultSummaryTemplate?: string;
  };
}): EmailBlock[] {
  const { flowKind, accept, bodyTemplate } = input;
  const templateKey = `${flowKind}.result.${accept ? "accepted" : "rejected"}`;
  const panelFallback = RESULT_EMAIL_PANEL_COPY[templateKey];
  const isRecruitmentFlow =
    flowKind === "recruitment" || flowKind === "recruitment_exemption";

  const blocks: EmailBlock[] = [
    {
      id: "seed.panel",
      type: "resultPanel",
      enabled: true,
      style: { ...EMPTY_EMAIL_BLOCK_STYLE },
      badge: input.panel?.resultBadgeTemplate?.trim() || panelFallback.resultBadgeTemplate,
      title: input.panel?.resultTitleTemplate?.trim() || panelFallback.resultTitleTemplate,
      summary: input.panel?.resultSummaryTemplate?.trim() || panelFallback.resultSummaryTemplate,
    },
    textBlock("seed.greeting", "亲爱的{name}同学，"),
  ];

  const prose =
    bodyTemplate?.trim() ||
    RESULT_EMAIL_BODY_COPY[flowKind][accept ? "accepted" : "rejected"];
  prose
    .split(/\n+/)
    .filter(Boolean)
    .forEach((paragraph, index) => {
      blocks.push(textBlock(`seed.p${index + 1}`, escapeHtml(paragraph)));
    });

  if (isRecruitmentFlow) {
    if (accept) {
      blocks.push(
        withFreshIds(EMAIL_CARD_PRESETS.stepsCard, "seed.steps"),
        withFreshIds(EMAIL_CARD_PRESETS.calendarCard, "seed.calendar"),
        textBlock("seed.tail", escapeHtml("我们真诚地欢迎你的加入！")),
      );
    } else {
      blocks.push(
        withFreshIds(EMAIL_CARD_PRESETS.calendarCard, "seed.calendar"),
        textBlock("seed.tail", escapeHtml("再次感谢你的参与！")),
      );
    }
  }

  if (accept && flowKind === "soc") {
    blocks.push(withFreshIds(EMAIL_CARD_PRESETS.groupCard, "seed.group"));
  }
  if (accept && flowKind === "woc") {
    blocks.push(withFreshIds(EMAIL_CARD_PRESETS.activityCard, "seed.activity"));
  }

  blocks.push(
    { id: "seed.divider", type: "divider", enabled: true, style: { ...EMPTY_EMAIL_BLOCK_STYLE } },
    textBlock("seed.contact", escapeHtml("如果你有更多疑问，请联系 {contactEmail}")),
    textBlock("seed.signoff", escapeHtml("祝心想事成!"), SIGN_OFF_STYLE),
  );

  return resequenceEmailBlocks(blocks);
}

/** 复制一组区块并换上新 id：复制区块、插入样式预设时用 */
export function cloneEmailBlocksWithNewIds(blocks: EmailBlock[]): EmailBlock[] {
  return blocks.map((block) => {
    const id = createEmailBlockId();
    if (block.type !== "card") {
      return { ...block, id, style: { ...EMPTY_EMAIL_BLOCK_STYLE, ...block.style } };
    }
    return {
      ...block,
      id,
      style: { ...EMPTY_EMAIL_BLOCK_STYLE, ...block.style },
      rows: block.rows.map((row, index) => ({ ...row, id: `${id}r${index + 1}` })),
    };
  });
}

/** 编辑器「添加区块」菜单：返回新块的初始内容 */
export function createEmailBlockTemplate(kind: EmailBlockInsertKind): EmailBlock {
  const id = createEmailBlockId();
  const base = { id, enabled: true, style: { ...EMPTY_EMAIL_BLOCK_STYLE } };

  if (kind === "stepsCard" || kind === "calendarCard" || kind === "activityCard" || kind === "groupCard") {
    return withFreshIds(EMAIL_CARD_PRESETS[kind], id);
  }

  switch (kind) {
    case "card":
      return {
        ...base,
        type: "card",
        tone: "neutral",
        title: "",
        rows: [{ id: `${id}r1`, kind: "text", html: "" }],
      };
    case "code":
      return { ...base, type: "code", html: "" };
    case "divider":
      return { ...base, type: "divider" };
    case "image":
      return { ...base, type: "image", src: "", alt: "", width: "", href: "" };
    case "button":
      return {
        ...base,
        type: "button",
        label: "按钮文案",
        url: "",
        variant: "primary",
        align: "left",
      };
    case "spacer":
      return { ...base, type: "spacer", height: "20px" };
    case "resultPanel":
      return {
        ...base,
        type: "resultPanel",
        badge: "通过通知",
        title: "恭喜你顺利通过",
        summary: "本次结果已确认。",
      };
    case "badge":
      return { ...base, type: "badge", text: "面试日程" };
    case "columns":
      return {
        ...base,
        type: "columns",
        left: { html: "", buttonLabel: "", buttonUrl: "" },
        right: { html: "", buttonLabel: "", buttonUrl: "" },
      };
    default:
      return { ...base, type: "text", html: "" };
  }
}
