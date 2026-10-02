'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { flowTypeLabel, type FlowTypeOption } from '@/const/flow';

/** 「其他（自定义）」选项值：添加流程时管理员用它退回 raw type + 归属部门选择 */
export const CUSTOM_FLOW_TYPE_VALUE = '__custom__';

/** 编辑态当前组合不在标准列表内时的回落项值：选中表示不改动任何值 */
export const CURRENT_FLOW_TYPE_VALUE = '__current__';

/**
 * 语义化流程类型下拉：选项是「部门 × 阶段」组合（value = `部门:阶段`），
 * 选中即同时确定 type 与 department。
 * extraOption 用于两类回落项：添加流程的「其他（自定义）」、编辑态的「当前（非标准组合）」。
 */
export const FlowTypeSelect = ({
  value,
  options,
  extraOption,
  onChange,
  disabled = false,
  idPrefix,
  placeholder = '选择流程类型',
}: {
  value: string;
  options: FlowTypeOption[];
  extraOption?: { value: string; label: string };
  onChange: (value: string) => void;
  disabled?: boolean;
  idPrefix: string;
  placeholder?: string;
}) => (
  <Select value={value} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger id={`${idPrefix}-type`}>
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      {options.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.label}
        </SelectItem>
      ))}
      {extraOption ? (
        <SelectItem key={extraOption.value} value={extraOption.value}>
          {extraOption.label}
        </SelectItem>
      ) : null}
    </SelectContent>
  </Select>
);

/** 非管理员：流程类型只读展示（部门缺失时回落通用名称） */
export const FlowTypeReadonly = ({
  type,
  department,
}: {
  type: string;
  department?: string | null;
}) => (
  <p className="text-sm text-muted-foreground">
    {flowTypeLabel(type, department)}
  </p>
);
