"use client";

/**
 * 把刚插入的区块滚进可视区。
 *
 * 「插入区块」是追加到正文末尾的：正文长的时候新块落在折叠线以下，点完看起来毫无反应。
 * 文档重排要等 EmailCanvas 把 blocks 同步进编辑器（同一轮 commit 内的 effect），
 * 所以用两帧后再找节点；找不到就安静退出（不影响插入本身）。
 */
export function scrollToEmailBlock(blockId: string) {
  if (typeof window === "undefined") return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const target = document.querySelector(
        `[data-block-id="${window.CSS?.escape ? window.CSS.escape(blockId) : blockId}"]`,
      );
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  });
}
