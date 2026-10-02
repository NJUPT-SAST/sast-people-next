'use client';

import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SLOT_CONFLICT_LABEL } from '@/const/flow';
import type { FlowSlotOption } from '@/db/schema';

/** 时段选项 → 文本框内容：每行一个标签，「时间冲突」由勾选框维护，不写进文本框 */
export const slotOptionsToText = (options?: FlowSlotOption[] | null) =>
  (options ?? [])
    .filter((option) => !option.isConflict)
    .map((option) => option.label)
    .join('\n');

/** 文本框 + 冲突勾选框 → 时段选项数组：按行拆分、去空行、去重，冲突项固定放在最后 */
export const parseSlotOptionsText = (
  text: string,
  includeConflict: boolean,
): FlowSlotOption[] => {
  const labels = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && line !== SLOT_CONFLICT_LABEL)
    .filter((line, index, lines) => lines.indexOf(line) === index);

  const options: FlowSlotOption[] = labels.map((label) => ({ label }));
  if (includeConflict) {
    options.push({ label: SLOT_CONFLICT_LABEL, isConflict: true });
  }
  return options;
};

/**
 * 面试时段编辑器：一个时段一行，可选提供「时间冲突」特殊选项。
 * 内部用文本保持自由换行，变更时立即回写为结构化的 slotOptions。
 */
export const SlotOptionsField = ({
  value,
  onChange,
  disabled = false,
  idPrefix,
}: {
  value?: FlowSlotOption[] | null;
  onChange: (value: FlowSlotOption[]) => void;
  disabled?: boolean;
  idPrefix: string;
}) => {
  const [text, setText] = useState(() => slotOptionsToText(value));
  const includeConflict = (value ?? []).some((option) => option.isConflict);

  const handleTextChange = (nextText: string) => {
    setText(nextText);
    onChange(parseSlotOptionsText(nextText, includeConflict));
  };

  const handleConflictChange = (checked: boolean) => {
    onChange(parseSlotOptionsText(text, checked));
  };

  return (
    <div className="grid gap-3">
      <Textarea
        id={`${idPrefix}-slots`}
        className="min-h-24 resize-y"
        disabled={disabled}
        value={text}
        onChange={(event) => handleTextChange(event.target.value)}
        placeholder={'每行一个时段，例如：\n13:00-14:00\n14:00-15:00'}
      />
      <p className="text-xs text-muted-foreground">
        每行一个面试时段，候选人报名时从中选择一个；留空表示不启用时段选择。
      </p>
      <div className="flex items-start gap-2">
        <Checkbox
          id={`${idPrefix}-slot-conflict`}
          checked={includeConflict}
          disabled={disabled}
          onCheckedChange={(checked) => handleConflictChange(checked === true)}
        />
        <Label
          htmlFor={`${idPrefix}-slot-conflict`}
          className="text-sm font-normal leading-5 text-muted-foreground"
        >
          提供「时间冲突」选项（约面时间QQ群中另行通知）
        </Label>
      </div>
    </div>
  );
};
