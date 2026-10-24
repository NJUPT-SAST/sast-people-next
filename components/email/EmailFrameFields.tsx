"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_EMAIL_FRAME, type EmailFrameStyle } from "@/lib/email/blocks";
import { EMAIL_THEME_PRESETS } from "@/lib/email/theme";
import { cn } from "@/lib/utils";
import { Undo2 } from "lucide-react";

import { TemplateField } from "./EmailTemplateField";

/** 邮件外框字段：结果模板与面试模板共用同一套外观字段 */
const FRAME_FIELDS: Array<{
  key: keyof EmailFrameStyle;
  label: string;
  placeholder?: string;
  className?: string;
}> = [
  { key: "pageBackground", label: "页面背景色", placeholder: "#eef3f1" },
  { key: "cardBackground", label: "内容卡背景色", placeholder: "#fffdfa" },
  { key: "cardBorder", label: "内容卡描边", placeholder: "1px solid #d9e2dc" },
  { key: "cardRadius", label: "内容卡圆角", placeholder: "18px" },
  { key: "cardWidth", label: "内容卡宽度", placeholder: "560px" },
  { key: "eyebrowText", label: "页眉眉标", placeholder: "SAST People" },
  { key: "logoUrl", label: "Logo 图片地址", className: "sm:col-span-2" },
  { key: "logoWidth", label: "Logo 宽度（px）", placeholder: "64" },
  { key: "footerImageUrl", label: "页脚图片地址", className: "sm:col-span-2" },
  { key: "footerText", label: "页脚文案", className: "sm:col-span-2" },
];

export function EmailFrameFields({
  idPrefix,
  frame,
  onChange,
  extraFields,
}: {
  idPrefix: string;
  frame: EmailFrameStyle;
  onChange: (frame: EmailFrameStyle) => void;
  /** 插在页眉字段之前的模板自有字段（如邮件主标题 / 副标题） */
  extraFields?: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-4">
      <p className="text-xs font-medium text-foreground">
        邮件外观（页眉 / 内容卡 / 页脚）
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {extraFields}
        {FRAME_FIELDS.map((field) => (
          <TemplateField
            key={field.key}
            id={`${idPrefix}-frame-${field.key}`}
            label={field.label}
            placeholder={field.placeholder}
            value={frame[field.key]}
            onValueChange={(next) => onChange({ ...frame, [field.key]: next })}
            className={field.className}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          留空的字段回落内置外观；颜色写 #RRGGBB，尺寸写 560px / 18px 这类 CSS 值。
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => onChange(DEFAULT_EMAIL_FRAME)}
        >
          <Undo2 data-icon="inline-start" />
          恢复内置外观
        </Button>
      </div>
    </div>
  );
}

/** 主题色：内置色板 + 任意 hex；空值 = 沿用模板类型的内置配色 */
export function EmailThemeColorField({
  value,
  onChange,
  autoLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  autoLabel: string;
}) {
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-foreground">主题色</p>
        <span className="text-xs text-muted-foreground">
          {value || `自动（${autoLabel}）`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange("")}>
          自动
        </Button>
        {EMAIL_THEME_PRESETS.map((preset) => (
          <button
            key={preset.color}
            type="button"
            aria-label={`主题色 ${preset.label}`}
            title={preset.label}
            onClick={() => onChange(preset.color)}
            className={cn(
              "size-7 rounded-full border-2 transition-transform",
              value === preset.color
                ? "scale-110 border-foreground"
                : "border-transparent hover:scale-105",
            )}
            style={{ backgroundColor: preset.color }}
          />
        ))}
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#157347"
          aria-label="自定义主题色"
          className="h-8 w-28 font-mono text-xs"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        顶部色条、结果面板、标签、徽章与主题色按钮都用它；留空则用内置配色。
      </p>
    </div>
  );
}
