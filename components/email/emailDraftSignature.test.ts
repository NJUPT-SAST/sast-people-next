import { DEFAULT_EMAIL_FRAME, parseEmailBlocks, parseEmailFrame, type EmailBlock } from "@/lib/email/blocks";

import { emailDraftSignature } from "./emailDraftSignature";

const baseBlocks: EmailBlock[] = [
  { id: "b1", type: "text", enabled: true, html: "<p>亲爱的{name}同学，</p>" },
  {
    id: "b2",
    type: "card",
    enabled: true,
    tone: "success",
    title: "【重要步骤】",
    rows: [{ id: "b2r1", kind: "button", label: "点击加入飞书群", url: "{feishuGroupUrl}", variant: "primary" }],
  },
];

const draft = (overrides: Partial<Parameters<typeof emailDraftSignature>[0]> = {}) => ({
  blocks: baseBlocks,
  frame: DEFAULT_EMAIL_FRAME,
  themeColor: "",
  title: "主标题",
  subtitle: "",
  ...overrides,
});

describe("emailDraftSignature", () => {
  it("落库再读回（字段顺序、缺省值、区块 id 被归一化）后签名不变", () => {
    const before = emailDraftSignature(draft());
    /* 读回路：jsonb 往返后由 parseEmailBlocks / parseEmailFrame 归一化 */
    const roundTripped = draft({
      blocks: parseEmailBlocks(JSON.parse(JSON.stringify(baseBlocks))) as EmailBlock[],
      frame: parseEmailFrame(JSON.parse(JSON.stringify(DEFAULT_EMAIL_FRAME))),
    });

    expect(emailDraftSignature(roundTripped)).toBe(before);
  });

  it("改了样式或文案就算改过", () => {
    const before = emailDraftSignature(draft());
    const styled = draft({
      blocks: baseBlocks.map((block, index) =>
        index === 0 ? { ...block, style: { ...parseEmailBlocks(baseBlocks)![0].style!, textAlign: "center" } } : block,
      ),
    });

    expect(emailDraftSignature(styled)).not.toBe(before);
    expect(emailDraftSignature(draft({ themeColor: "#1d4ed8" }))).not.toBe(before);
    expect(emailDraftSignature(draft({ title: "换了标题" }))).not.toBe(before);
  });
});
