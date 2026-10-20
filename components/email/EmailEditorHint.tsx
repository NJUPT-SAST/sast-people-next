"use client";

import { Info, X } from "lucide-react";
import { useState } from "react";

/**
 * 画布上方的使用提示：编辑器是「直接改邮件」而不是表单，第一次打开必须有一句话说清
 * 哪些地方能点、左侧那三个图标是什么、改动什么时候落库。可手动收起。
 */
export function EmailEditorHint() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  return (
    <div className="flex items-start gap-2 border-b bg-primary/[0.06] px-4 py-2 text-xs leading-5 text-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        直接点邮件里的文字就能改；<span className="font-medium">按钮 / 图片</span>点一下改它的字段；
        悬停区块左侧：<span className="font-medium">⠿ 拖动</span>、
        <span className="font-medium">＋ 在下方插入</span>、
        <span className="font-medium">调色板</span>改这个区块的样式、
        <span className="font-medium">⋯</span> 复制/隐藏/删除；选中文字会浮出格式工具条
        （里面的 <span className="font-medium">{"{}"}</span> 可以插入变量）。改动先不落库，
        点右下角「保存」（或 ⌘/Ctrl+S）才生效。
      </p>
      <button
        type="button"
        aria-label="收起使用提示"
        title="收起"
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={() => setVisible(false)}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
