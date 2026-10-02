"use client";

import { DEPARTMENT_LABELS } from "@/const/department";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* 下拉里代表“全局流程 / 不映射”的哨兵值，避免与真实部门标识冲突 */
const GLOBAL_VALUE = "__flow_global__";
const NONE_VALUE = "__flow_none__";

/** 已知部门选项（清单由 SAST Link 维护） */
export const departmentOptions = Object.entries(DEPARTMENT_LABELS).map(
  ([value, label]) => ({ value, label }),
);

/**
 * 归属部门选择：
 * - 管理员可选任意已知部门或“全局流程”（null）；
 * - 部长只能看到固定的本部门（禁用状态）。
 */
export const DepartmentSelect = ({
  value,
  onChange,
  disabled = false,
  allowGlobal,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  allowGlobal: boolean;
}) => {
  const options = allowGlobal
    ? [{ value: GLOBAL_VALUE, label: "全局流程（所有部门共用）" }, ...departmentOptions]
    : [{ value: NONE_VALUE, label: "不映射" }, ...departmentOptions];
  const current = value ?? (allowGlobal ? GLOBAL_VALUE : NONE_VALUE);
  const hasCurrent = options.some((option) => option.value === current);
  const selectedLabel =
    options.find((option) => option.value === current)?.label ?? current;

  return (
    <Select
      value={current}
      disabled={disabled}
      onValueChange={(next) => onChange(next === GLOBAL_VALUE || next === NONE_VALUE ? null : next)}
    >
      <SelectTrigger>
        {/* 显式传入选中项文案：受控值来自服务端时，弹层未挂载也能正确展示 */}
        <SelectValue placeholder="选择归属部门">{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
        {/* Link 提供的未知部门标识原样保留，不猜测展示名 */}
        {!hasCurrent && <SelectItem value={current}>{current}</SelectItem>}
      </SelectContent>
    </Select>
  );
};

/**
 * 组别 → 部门 映射：键固定为流程已配置的组别。
 */
export const GroupDepartmentMapping = ({
  groupOptions,
  value,
  onChange,
  disabled = false,
}: {
  groupOptions: string[];
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  disabled?: boolean;
}) => {
  if (groupOptions.length === 0) return null;

  return (
    <div className="grid gap-3">
      <div>
        <Label>组别 → 部门</Label>
        <p className="text-xs text-muted-foreground">
          报名该组别的候选人将归属到对应部门；不映射时按流程归属部门处理。
        </p>
      </div>
      <div className="grid gap-2">
        {groupOptions.map((group) => (
          <div key={group} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm">{group}</span>
            <div className="w-44 shrink-0">
              <DepartmentSelect
                allowGlobal={false}
                disabled={disabled}
                value={value[group] ?? null}
                onChange={(next) => {
                  const nextValue = { ...value };
                  if (next) {
                    nextValue[group] = next;
                  } else {
                    delete nextValue[group];
                  }
                  onChange(nextValue);
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/** 保存前剔除已不存在的组别键与空值 */
export const pickGroupDepartments = (
  groupOptions: string[],
  mapping: Record<string, string>,
): Record<string, string> => {
  const entries = groupOptions
    .map((group) => [group, mapping[group]?.trim() ?? ""] as const)
    .filter((entry) => entry[1].length > 0);
  return Object.fromEntries(entries) as Record<string, string>;
};
