"use client";

import { useEffect, useRef, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

/**
 * 画布上的单行可编辑文本：点进去就能改，失焦或回车提交。
 *
 * 刻意做成**非受控**：React 每次重渲染都写 `textContent` 会把光标打回开头，
 * 所以只在「外部值变了且当前没在编辑」时同步，输入过程完全交给浏览器。
 */
export function InlineEditableText({
  value,
  onChange,
  placeholder,
  ariaLabel,
  style,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  style?: CSSProperties;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (document.activeElement === element) return;
    if (element.textContent !== value) element.textContent = value;
  }, [value]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={ariaLabel}
      data-placeholder={placeholder}
      spellCheck={false}
      onBlur={(event) => {
        const next = event.currentTarget.textContent ?? "";
        if (next !== value) onChange(next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      style={style}
      className={cn(
        "rounded-sm outline-none transition-shadow focus:ring-2 focus:ring-sky-400/50",
        "empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]",
        className,
      )}
    />
  );
}
