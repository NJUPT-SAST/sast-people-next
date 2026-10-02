'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { departmentLabel } from '@/const/department';

/** Radix Select 不接受空字符串作为选项值，用哨兵表示「全局/未归属」与「手填」 */
export const GLOBAL_DEPARTMENT_VALUE = '__global__';
export const CUSTOM_DEPARTMENT_VALUE = '__custom__';

const optionLabel = (key: string) => {
  const label = departmentLabel(key);
  return label === key ? key : `${label}（${key}）`;
};

interface DepartmentAssignerProps {
  /** 当前归属部门标识；null = 全局/未归属 */
  value: string | null;
  /** 现存部门标识（来自 flow.user_flow 数据 + 组别映射），用于下拉候选项 */
  departmentKeys: string[];
  disabled?: boolean;
  onChange: (department: string | null) => Promise<void>;
}

/**
 * 部门归属选择器：现存标识下拉 + 手填新标识 + 清空为全局。
 * 部门清单由 SAST Link 维护，这里不硬编码部门名。
 */
export function DepartmentAssigner({
  value,
  departmentKeys,
  disabled,
  onChange,
}: DepartmentAssignerProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [saving, setSaving] = useState(false);

  /* 当前值可能已不在现存清单里，仍要出现在候选中避免被误改 */
  const options = value && !departmentKeys.includes(value)
    ? [value, ...departmentKeys]
    : departmentKeys;

  async function submit(next: string | null) {
    setSaving(true);
    try {
      await onChange(next);
      setCustomOpen(false);
      setCustomValue('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  }

  function handleSelect(next: string) {
    if (next === CUSTOM_DEPARTMENT_VALUE) {
      setCustomValue('');
      setCustomOpen(true);
      return;
    }
    void submit(next === GLOBAL_DEPARTMENT_VALUE ? null : next);
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Select
        value={customOpen ? CUSTOM_DEPARTMENT_VALUE : value ?? GLOBAL_DEPARTMENT_VALUE}
        onValueChange={handleSelect}
        disabled={disabled || saving}
      >
        <SelectTrigger size="sm" className="w-full min-w-[9rem]">
          {/* Radix 的默认值为空时不会回填文案，这里显式渲染当前归属 */}
          <SelectValue>
            {customOpen
              ? '手填新部门标识…'
              : value
                ? optionLabel(value)
                : '全局（未归属部门）'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={GLOBAL_DEPARTMENT_VALUE}>全局（未归属部门）</SelectItem>
          {options.map((key) => (
            <SelectItem key={key} value={key}>
              {optionLabel(key)}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_DEPARTMENT_VALUE}>手填新部门标识…</SelectItem>
        </SelectContent>
      </Select>
      {customOpen ? (
        <div className="flex items-center gap-1.5">
          <Input
            value={customValue}
            onChange={(event) => setCustomValue(event.target.value)}
            placeholder="部门标识（如 software）"
            maxLength={64}
            className="h-8 min-w-0 text-sm"
            aria-label="手填部门标识"
          />
          <Button
            type="button"
            size="sm"
            disabled={saving || customValue.trim().length === 0}
            onClick={() => void submit(customValue.trim())}
          >
            保存
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => setCustomOpen(false)}
          >
            取消
          </Button>
        </div>
      ) : null}
    </div>
  );
}
