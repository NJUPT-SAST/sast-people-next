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
 * 模板归属选择器：管理员可切换「全局默认 / 任意部门（含手填新标识）」，
 * 部长固定在本部门覆盖。
 */
export function EmailTemplateScopeSelector({
  value,
  departments,
  scope,
  onChange,
}: {
  /** 当前模板归属；null = 全局默认 */
  value: string | null;
  /** 服务端返回的可归属部门选项 */
  departments: string[];
  /** 当前账号可写范围 */
  scope: TemplateScopeSummary;
  onChange: (department: string | null) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const ownDepartment = normalizeTemplateDepartment(scope.department);
  const canChooseDepartment = scope.kind === "all";
  /* 当前值可能已不在选项里，仍要出现避免被误改 */
  const options =
    value && !departments.includes(value) ? [value, ...departments] : departments;

  if (!canChooseDepartment) {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          模板归属
        </span>
        <span className="text-sm font-medium">
          本部门覆盖：
          {ownDepartment ? optionLabel(ownDepartment) : "未归属部门"}
        </span>
        <span className="text-xs text-muted-foreground">
          未配置时回落全局默认；保存只影响本部门文案，全局默认保持只读。
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        模板归属
      </span>
      <Select
        value={value ?? GLOBAL_VALUE}
        onValueChange={(next) => {
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
          <SelectItem value={GLOBAL_VALUE}>全局默认（所有部门）</SelectItem>
          {options.map((key) => (
            <SelectItem key={key} value={key}>
              {optionLabel(key)}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_VALUE}>手填新部门标识…</SelectItem>
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">
        全局默认对所有部门生效；选择部门后只写该部门的覆盖，未覆盖的部门继续回落全局默认。
        {departments.length > 0
          ? `已配置过覆盖的部门：${departments.map((key) => optionLabel(key)).join("、")}。`
          : ""}
      </span>
      {customOpen && (
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
