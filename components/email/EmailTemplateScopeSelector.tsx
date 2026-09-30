"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { departmentLabel } from "@/const/department";
import { useState } from "react";

import {
  normalizeTemplateDepartment,
  type TemplateScopeSummary,
} from "./emailDashboardUtils";

/* Radix Select 不接受空字符串选项值，用哨兵表示「全局默认」与「手填新部门标识」 */
const GLOBAL_VALUE = "__global__";
const CUSTOM_VALUE = "__custom__";

const optionLabel = (key: string) => {
  const label = departmentLabel(key);
  return label === key ? key : `${label}（${key}）`;
};

/**
 * 模板归属选择器：
 * - 管理员可切换「全局默认 / 任意部门（Link 部门目录 + 库中已有覆盖 + 手填新标识）」；
 * - 部长默认本部门，也可以切到其他部门只读浏览（保存按钮由只读逻辑隐藏）。
 */
export function EmailTemplateScopeSelector({
  value,
  departments,
  scope,
  onChange,
}: {
  /** 当前模板归属；null = 全局默认 */
  value: string | null;
  /** 服务端返回的可归属部门选项（Link 部门目录 ∪ 库中已有覆盖） */
  departments: string[];
  /** 当前账号可写范围 */
  scope: TemplateScopeSummary;
  onChange: (department: string | null) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const ownDepartment = normalizeTemplateDepartment(scope.department);
  const isAdmin = scope.kind === "all";
  const canChooseDepartment = scope.kind !== "none";
  /* 当前值与本部门可能不在服务端选项里，补齐避免下拉缺项被误改成第一项 */
  const baseOptions =
    value && !departments.includes(value) ? [value, ...departments] : departments;
  const options =
    ownDepartment && !baseOptions.includes(ownDepartment)
      ? [ownDepartment, ...baseOptions]
      : baseOptions;

  if (!canChooseDepartment) {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          模板归属
        </span>
        <span className="text-sm font-medium">未归属部门，只读全局默认</span>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        模板归属
      </span>
      <Select
        value={value ?? (isAdmin ? GLOBAL_VALUE : (ownDepartment ?? ""))}
        onValueChange={(next) => {
          if (!isAdmin) {
            onChange(next);
            return;
          }
          if (next === GLOBAL_VALUE) {
            setCustomOpen(false);
            onChange(null);
            return;
          }
          if (next === CUSTOM_VALUE) {
            setCustomOpen(true);
            return;
          }
          setCustomOpen(false);
          onChange(next);
        }}
      >
        <SelectTrigger className="min-w-56" aria-label="模板归属">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {isAdmin && (
            <SelectItem value={GLOBAL_VALUE}>全局默认（所有部门）</SelectItem>
          )}
          {options.map((key) => (
            <SelectItem key={key} value={key}>
              {optionLabel(key)}
            </SelectItem>
          ))}
          {isAdmin && <SelectItem value={CUSTOM_VALUE}>手填新部门标识…</SelectItem>}
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">
        {isAdmin
          ? "全局默认对所有部门生效；选择部门后只写该部门的覆盖，未覆盖的部门继续回落全局默认。下拉来自 Link 部门目录与已有覆盖行，也可手填其他标识。"
          : "下拉来自 Link 部门目录与已有覆盖行；本部门覆盖可编辑，其他部门只读浏览。"}
      </span>
      {isAdmin && customOpen && (
        <div className="flex min-w-0 items-center gap-2">
          <Input
            aria-label="手填部门标识"
            value={customValue}
            onChange={(event) => setCustomValue(event.target.value)}
            placeholder="部门标识，如 software"
            className="min-w-0"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const next = normalizeTemplateDepartment(customValue);
              if (!next) return;
              setCustomValue("");
              setCustomOpen(false);
              onChange(next);
            }}
          >
            使用
          </Button>
        </div>
      )}
    </div>
  );
}
