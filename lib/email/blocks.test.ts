import {
  DEFAULT_EMAIL_FRAME,
  EMAIL_BLOCK_LIMITS,
  cloneEmailBlocksWithNewIds,
  defaultResultEmailBlocks,
  parseEmailBlocks,
  parseEmailFrame,
  validateEmailBlocks,
  type EmailBlock,
} from "@/lib/email/blocks";

describe("parseEmailBlocks", () => {
  it("returns null for anything that is not a block array", () => {
    expect(parseEmailBlocks(null)).toBeNull();
    expect(parseEmailBlocks(undefined)).toBeNull();
    expect(parseEmailBlocks({ type: "text" })).toBeNull();
    expect(parseEmailBlocks([])).toBeNull();
  });

  it("keeps known blocks, drops unknown ones and repairs fields", () => {
    const parsed = parseEmailBlocks([
      { type: "text", enabled: true, html: "<p>正文</p>" },
      { type: "unsupported", html: "丢掉" },
      { type: "card", enabled: true, tone: "不存在的配色", title: "标题", rows: [] },
      { type: "card", tone: "warning", title: "提示", rows: [{ kind: "text", html: "行" }] },
    ]);

    expect(parsed).not.toBeNull();
    expect(parsed).toHaveLength(3);
    /* 未知配色回落到 neutral，缺 enabled 默认启用，id 按顺序重排 */
    expect(parsed?.[1]).toMatchObject({ id: "b2", type: "card", tone: "neutral", enabled: true });
    expect(parsed?.[2]).toMatchObject({
      id: "b3",
      type: "card",
      tone: "warning",
      rows: [{ id: "b3r1", kind: "text", html: "行" }],
    });
  });

  it("drops button rows that have neither label nor url", () => {
    const parsed = parseEmailBlocks([
      {
        type: "card",
        tone: "success",
        title: "",
        rows: [
          { kind: "button", label: "", url: "" },
          { kind: "button", label: "加入飞书群", url: "{feishuGroupUrl}", variant: "dark" },
        ],
      },
    ]);

    expect(parsed?.[0]).toMatchObject({
      type: "card",
      rows: [{ kind: "button", label: "加入飞书群", variant: "dark" }],
    });
  });
});

describe("validateEmailBlocks", () => {
  it("rejects oversized fields", () => {
    const tooLong: EmailBlock[] = [
      { id: "b1", type: "text", enabled: true, html: "x".repeat(20_001) },
    ];
    expect(validateEmailBlocks(tooLong)).toContain("不能超过");

    const ok: EmailBlock[] = [
      { id: "b1", type: "text", enabled: true, html: "正常正文" },
      { id: "b2", type: "divider", enabled: true },
    ];
    expect(validateEmailBlocks(ok)).toBeNull();
  });

  it("keeps an over-limit block list for validation instead of dropping the layout", () => {
    const many: EmailBlock[] = Array.from(
      { length: EMAIL_BLOCK_LIMITS.blocks + 1 },
      (_, index) => ({ id: `b${index + 1}`, type: "divider" as const, enabled: true }),
    );
    expect(parseEmailBlocks(many)).toHaveLength(EMAIL_BLOCK_LIMITS.blocks + 1);
    expect(validateEmailBlocks(many)).toContain(String(EMAIL_BLOCK_LIMITS.blocks));
  });
});

describe("parseEmailFrame", () => {
  it("only keeps http(s) image URLs and falls back to the default frame otherwise", () => {
    const frame = parseEmailFrame({
      logoUrl: "javascript:alert(1)",
      footerImageUrl: "//evil.example/x.png",
    });
    expect(frame.logoUrl).toBe(DEFAULT_EMAIL_FRAME.logoUrl);
    expect(frame.footerImageUrl).toBe(DEFAULT_EMAIL_FRAME.footerImageUrl);

    const kept = parseEmailFrame({
      logoUrl: "https://example.com/logo.png",
      footerImageUrl: "http://example.com/footer.png",
    });
    expect(kept.logoUrl).toBe("https://example.com/logo.png");
    expect(kept.footerImageUrl).toBe("http://example.com/footer.png");
  });
});

describe("defaultResultEmailBlocks", () => {
  it("makes the whole body editable: panel, greeting, contact and sign-off are blocks too", () => {
    const blocks = defaultResultEmailBlocks({ flowKind: "recruitment", accept: true });

    expect(blocks[0]).toMatchObject({ type: "resultPanel" });
    expect(blocks[1]).toMatchObject({ type: "text", html: "亲爱的{name}同学，" });
    /* 落款与联系行同样是区块，能被改样式或删掉 */
    expect(blocks.at(-1)).toMatchObject({
      type: "text",
      html: "祝心想事成!",
      style: { fontSize: "17px" },
    });
    expect(blocks.at(-2)).toMatchObject({
      type: "text",
      html: "如果你有更多疑问，请联系 {contactEmail}",
    });
  });

  it("seeds the result panel from the template setting", () => {
    const blocks = defaultResultEmailBlocks({
      flowKind: "recruitment",
      accept: true,
      panel: {
        resultBadgeTemplate: "自定义标签",
        resultTitleTemplate: "自定义结果标题",
        resultSummaryTemplate: "自定义摘要",
      },
    });

    expect(blocks[0]).toMatchObject({
      type: "resultPanel",
      badge: "自定义标签",
      title: "自定义结果标题",
      summary: "自定义摘要",
    });
  });

  it("keeps the structural cards for the recruitment family", () => {
    const accepted = defaultResultEmailBlocks({ flowKind: "recruitment", accept: true });
    const rejected = defaultResultEmailBlocks({
      flowKind: "recruitment_exemption",
      accept: false,
    });

    /* 报名入口（成员信息表 + 飞书群）与日历卡与正文无关，永远在 */
    expect(accepted.filter((block) => block.type === "card")).toHaveLength(2);
    expect(JSON.stringify(accepted)).toContain("{memberInfoFormUrl}");
    expect(JSON.stringify(accepted)).toContain("{calendarUrl}");
    expect(JSON.stringify(rejected)).toContain("{calendarUrl}");
    /* 不通过没有报名入口 */
    expect(JSON.stringify(rejected)).not.toContain("{memberInfoFormUrl}");
  });

  it("uses the template body for flow kinds that keep their copy there", () => {
    const blocks = defaultResultEmailBlocks({
      flowKind: "office_round1",
      accept: true,
      bodyTemplate: "第一段\n第二段",
    });

    expect(JSON.stringify(blocks)).toContain("第一段");
    expect(JSON.stringify(blocks)).toContain("第二段");
    /* 办公类没有结构卡片，正文段落之外只有面板/称呼/联系/落款 */
    expect(blocks.some((block) => block.type === "card")).toBe(false);
  });

  it("adds the internal group card for accepted SoC candidates", () => {
    const blocks = defaultResultEmailBlocks({
      flowKind: "soc",
      accept: true,
      bodyTemplate: "正文",
    });

    expect(
      blocks.some((block) => block.type === "card" && block.tone === "neutral"),
    ).toBe(true);
  });
});

describe("cloneEmailBlocksWithNewIds", () => {
  it("gives the clone fresh block and row ids", () => {
    const source = defaultResultEmailBlocks({ flowKind: "recruitment", accept: true });
    const clone = cloneEmailBlocksWithNewIds(source);

    expect(clone.map((block) => block.id)).not.toEqual(source.map((block) => block.id));
    const sourceRows = source.flatMap((block) =>
      block.type === "card" ? block.rows.map((row) => row.id) : [],
    );
    const cloneRows = clone.flatMap((block) =>
      block.type === "card" ? block.rows.map((row) => row.id) : [],
    );
    expect(cloneRows).not.toEqual(sourceRows);
    expect(clone).toHaveLength(source.length);
  });
});
