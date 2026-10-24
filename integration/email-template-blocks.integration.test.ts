/** @jest-environment node */

/**
 * 邮件正文区块落库 → 解析的端到端口径：
 * - `body_blocks`（jsonb）与 `theme_color` 原样进出，解析后区块类型/行结构不变；
 * - 没有落库区块时保持 null，渲染层据此回落到内置版式；
 * - 单个坏区块不影响同一行里其它区块（编辑器/历史数据都可能留下半截内容）。
 */

import { db } from "@/db/drizzle";
import { emailTemplateSetting } from "@/db/schema";
import { defaultResultEmailTemplateSettings } from "@/lib/email/template-settings";
import { readResultEmailTemplateSetting } from "@/lib/email-center/template-resolution";
import { defaultResultEmailBlocks, type EmailBlock } from "@/lib/email/blocks";
import { eq } from "drizzle-orm";

const TEMPLATE_KEY = "recruitment.result.accepted";

const baseValues = () => {
  const base = defaultResultEmailTemplateSettings.find(
    (item) => item.templateKey === TEMPLATE_KEY,
  )!;
  return {
    templateKey: TEMPLATE_KEY,
    subjectTemplate: base.subjectTemplate,
    titleTemplate: base.titleTemplate,
    subtitleTemplate: base.subtitleTemplate,
    resultBadgeTemplate: base.resultBadgeTemplate,
    resultTitleTemplate: base.resultTitleTemplate,
    resultSummaryTemplate: base.resultSummaryTemplate,
    bodyTemplate: base.bodyTemplate,
    memberInfoFormUrl: base.memberInfoFormUrl,
    feishuGroupUrl: base.feishuGroupUrl,
    calendarUrl: base.calendarUrl,
    feishuRegisterHelpUrl: base.feishuRegisterHelpUrl,
    contactEmail: base.contactEmail,
    memberFormLabel: base.memberFormLabel,
    feishuGroupName: base.feishuGroupName,
  };
};

const clearRows = () =>
  db
    .delete(emailTemplateSetting)
    .where(eq(emailTemplateSetting.templateKey, TEMPLATE_KEY));

const customBlocks: EmailBlock[] = [
  { id: "x1", type: "text", enabled: true, html: "自定义第一段" },
  {
    id: "x2",
    type: "card",
    enabled: true,
    tone: "warning",
    title: "【自定义卡片】",
    rows: [
      { id: "x2r1", kind: "text", html: "卡片里的说明" },
      {
        id: "x2r2",
        kind: "button",
        label: "点我加入",
        url: "https://example.com/join",
        variant: "dark",
      },
      { id: "x2r3", kind: "divider" },
    ],
  },
  {
    id: "x3",
    type: "code",
    enabled: true,
    html: '<div style="padding:12px;background-color:#fff1d6">自定义代码块</div>',
  },
];

describe("邮件模板区块落库到解析", () => {
  afterAll(async () => {
    await clearRows();
    await db.$client.end();
  });

  it("落库的区块与主题色原样解析回来", async () => {
    await clearRows();
    await db.insert(emailTemplateSetting).values({
      ...baseValues(),
      department: null,
      bodyBlocks: customBlocks,
      themeColor: "#1d4ed8",
    });

    const setting = await readResultEmailTemplateSetting(TEMPLATE_KEY, null);

    expect(setting.themeColor).toBe("#1d4ed8");
    expect(setting.bodyBlocks?.map((block) => block.type)).toEqual([
      "text",
      "card",
      "code",
    ]);
    const card = setting.bodyBlocks?.find((block) => block.type === "card");
    expect(card).toMatchObject({
      tone: "warning",
      title: "【自定义卡片】",
      rows: [
        { kind: "text", html: "卡片里的说明" },
        { kind: "button", label: "点我加入", variant: "dark" },
        { kind: "divider" },
      ],
    });
    expect(JSON.stringify(setting.bodyBlocks)).toContain("自定义代码块");
  });

  it("单个坏区块被丢掉，同行的其它区块照常解析", async () => {
    await clearRows();
    await db.insert(emailTemplateSetting).values({
      ...baseValues(),
      department: null,
      /* 混进一条不认识的区块类型（历史数据/手改都可能出现） */
      bodyBlocks: [
        { id: "y1", type: "text", enabled: true, html: "保留我" },
        { id: "y2", type: "somethingElse", html: "丢掉我" },
      ] as unknown as EmailBlock[],
      themeColor: "",
    });

    const setting = await readResultEmailTemplateSetting(TEMPLATE_KEY, null);

    expect(setting.bodyBlocks).toHaveLength(1);
    expect(setting.bodyBlocks?.[0]).toMatchObject({ type: "text", html: "保留我" });
    expect(setting.themeColor).toBe("");
  });

  it("没有落库区块时保持 null，渲染层据此回落到内置版式", async () => {
    await clearRows();
    await db
      .insert(emailTemplateSetting)
      .values({ ...baseValues(), department: null });

    const setting = await readResultEmailTemplateSetting(TEMPLATE_KEY, null);
    expect(setting.bodyBlocks).toBeNull();

    /* 内置版式里报名入口与日历卡与正文文案无关，一改正文也不会消失 */
    const blocks = defaultResultEmailBlocks({
      flowKind: "recruitment",
      accept: true,
      bodyTemplate: setting.bodyTemplate,
    });
    expect(blocks.filter((block) => block.type === "card")).toHaveLength(2);
  });
});
