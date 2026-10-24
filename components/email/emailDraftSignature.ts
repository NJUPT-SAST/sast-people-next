"use client";

import { parseEmailBlocks, parseEmailFrame, type EmailBlock, type EmailFrameStyle } from "@/lib/email/blocks";

/**
 * 草稿的规范化签名，用来判断「有没有未保存的改动」。
 *
 * 不能直接 `JSON.stringify(draft)` 跟保存前的样子比：落库再读回时字段顺序、缺省值和区块
 * id 都会被 zod 补齐/重排（`parseEmailBlocks` 还会顺手丢掉空按钮行），同一个模板的两份
 * 等价数据序列化出来并不相等 —— 结果就是「点完保存仍然显示有未保存的改动」。
 * 两边都过一遍同一个解析器，再比字符串。
 */
export function emailDraftSignature(draft: {
  blocks: EmailBlock[];
  frame: EmailFrameStyle;
  themeColor: string;
  title: string;
  subtitle?: string;
}): string {
  return JSON.stringify({
    blocks: parseEmailBlocks(draft.blocks),
    frame: parseEmailFrame(draft.frame),
    themeColor: draft.themeColor,
    title: draft.title,
    subtitle: draft.subtitle ?? "",
  });
}
