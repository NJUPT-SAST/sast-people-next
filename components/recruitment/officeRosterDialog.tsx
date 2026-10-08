"use client";

import { AlertTriangle, Check, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { departmentLabel } from "@/const/department";
import { cn } from "@/lib/utils";

export type OfficeRosterRow = {
  userFlowId: number;
  name: string;
  studentId: string | null;
  /** 志愿类型：1=第一志愿、2=第二志愿 */
  choice: number | null;
  /** 该候选人另一条办公类报名的部门（可能为空） */
  siblingDepartment: string | null;
  /** 当前轮已记录的面试分数 */
  scores: number[];
  /**
   * 一面（单人终评）均分与份数：由结果快照提供。
   * 旧快照 / 旧调用方可能没有这两个字段，缺失时回退到 scores。
   */
  round1Average?: number | null;
  round1Count?: number | null;
  /** 同一候选人的办公类报名（用于冲突时选择最终去向） */
  officeChoices: Array<{
    userFlowId: number;
    choice: number | null;
    department: string | null;
  }>;
  finalDepartment: string | null;
};

const choiceLabel = (choice: number | null) =>
  choice === 1 ? "第一志愿" : choice === 2 ? "第二志愿" : "未填写";

const averageScore = (scores: number[]) =>
  scores.length === 0
    ? null
    : Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;

/**
 * 办公类部门面试的名单确认弹窗：一面结束与二面结束共用。
 * 部长在这里逐人确认通过/不通过（通过后进入下一轮 / 作为最终结果），
 * 二面还会展示同一候选人通过多个部门时的「最终去向」，并选择本次发送结果邮件的人员。
 */
export function OfficeRosterDialog({
  open,
  onOpenChange,
  mode,
  flowTitle,
  rows,
  decisions,
  onDecisionChange,
  onSetAll,
  templateConfirmed,
  onTemplateConfirmedChange,
  templateHref,
  onFinalDestinationChange,
  notifyUserFlowIds,
  onNotifyUserFlowIdsChange,
  submitting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "round1" | "round2";
  flowTitle: string;
  rows: OfficeRosterRow[];
  decisions: Record<number, boolean>;
  onDecisionChange: (userFlowId: number, passed: boolean) => void;
  onSetAll: (passed: boolean) => void;
  templateConfirmed: boolean;
  onTemplateConfirmedChange: (confirmed: boolean) => void;
  /** 「打开邮件模板页核对」的跳转地址（缺省则不显示该按钮） */
  templateHref?: string;
  onFinalDestinationChange?: (userFlowId: number, department: string | null) => void;
  /** 二面：本次发送结果邮件的人员（缺省 = 全部） */
  notifyUserFlowIds?: number[];
  onNotifyUserFlowIdsChange?: (ids: number[]) => void;
  submitting: boolean;
  onConfirm: () => void;
}) {
  const isFinal = mode === "round2";
  const passCount = rows.filter((row) => decisions[row.userFlowId] !== false).length;
  const rejectCount = rows.length - passCount;
  const missingRecords = rows.filter(
    (row) => decisions[row.userFlowId] !== false && row.scores.length === 0,
  ).length;
  const notifySelection = notifyUserFlowIds ?? rows.map((row) => row.userFlowId);

  const decisionButton = (row: OfficeRosterRow, passed: boolean) => {
    const active = (decisions[row.userFlowId] ?? true) === passed;
    return (
      <Button
        type="button"
        size="sm"
        variant={active ? (passed ? "default" : "destructive") : "outline"}
        className={cn("h-8 px-3", !active && "text-muted-foreground")}
        onClick={() => onDecisionChange(row.userFlowId, passed)}
        aria-pressed={active}
        aria-label={`${row.name} ${passed ? "通过" : "不通过"}`}
      >
        {passed ? "通过" : "不通过"}
      </Button>
    );
  };

  const finalDestinationSelect = (row: OfficeRosterRow) => {
    if (row.officeChoices.length < 2) {
      return (
        <span className="text-sm text-muted-foreground">
          {departmentLabel(
            row.officeChoices[0]?.department ??
              (row.choice === 2 ? row.siblingDepartment : null),
          )}
        </span>
      );
    }
    const autoDepartment =
      row.officeChoices.find((choice) => choice.choice === 1)?.department ??
      row.officeChoices[0]?.department ??
      null;
    return (
      <Select
        value={row.finalDepartment ?? "auto"}
        onValueChange={(value) =>
          onFinalDestinationChange?.(row.userFlowId, value === "auto" ? null : value)
        }
        disabled={submitting}
      >
        <SelectTrigger className="h-8 w-full min-w-0" aria-label={`设置 ${row.name} 的最终去向`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">自动（{departmentLabel(autoDepartment)}）</SelectItem>
          {row.officeChoices.map((choice) => (
            <SelectItem
              key={choice.userFlowId}
              value={choice.department ?? ""}
              disabled={!choice.department}
            >
              {departmentLabel(choice.department)}（
              {choice.choice === 1 ? "第一志愿" : "第二志愿"}）
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  /**
   * 每行成绩：一面=单人终评、二面=2-3 位部长均分，两轮分开展示。
   * 一面分优先取结果快照的分轮字段，旧数据缺失时回退到当前轮 scores（一面模式下就是一面分）。
   */
  const recordCell = (row: OfficeRosterRow) => {
    const roundTwoAverage = isFinal ? averageScore(row.scores) : null;
    const roundOneAverage = isFinal
      ? row.round1Average ?? null
      : row.round1Average ?? averageScore(row.scores);
    const roundOneCount = isFinal
      ? row.round1Count ?? null
      : row.round1Count ?? row.scores.length;
    if (roundOneAverage === null && roundTwoAverage === null) {
      return (
        <span className="inline-flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
          无面试记录
        </span>
      );
    }
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-1 text-sm">
        {roundOneAverage !== null && (
          <span className="whitespace-nowrap">
            <span className="text-xs text-muted-foreground">一面均分</span>
            <span className="ml-1 font-medium tabular-nums">{roundOneAverage}</span>
            {roundOneCount !== null && roundOneCount > 1 && (
              <span className="ml-1 text-xs text-muted-foreground">
                （{roundOneCount} 份）
              </span>
            )}
          </span>
        )}
        {roundOneAverage !== null && roundTwoAverage !== null && (
          <span className="text-muted-foreground" aria-hidden="true">
            ·
          </span>
        )}
        {roundTwoAverage !== null && (
          <span className="whitespace-nowrap">
            <span className="text-xs text-muted-foreground">二面均分</span>
            <span className="ml-1 font-medium tabular-nums">{roundTwoAverage}</span>
            <span className="ml-1 text-xs text-muted-foreground">
              （{row.scores.length} 份）
            </span>
          </span>
        )}
      </span>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-3xl lg:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{isFinal ? "确认最终名单并发布" : "结束一面并发送通知"}</DialogTitle>
          <DialogDescription>
            {flowTitle} ·{" "}
            {isFinal
              ? "同一人通过多个部门时请在「最终去向」里选择归属部门（冲突由双方部门讨论决定）。"
              : "通过者进入二面，未通过者结束流程。"}
            确认后邮件发出无法撤回。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            通过 {passCount}
          </Badge>
          <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
            不通过 {rejectCount}
          </Badge>
          {missingRecords > 0 && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              其中 {missingRecords} 人没有面试记录
            </span>
          )}
          {rows.length - notifySelection.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {rows.length - notifySelection.length} 人本次不发邮件
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onSetAll(true)}>
              全部通过
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onSetAll(false)}>
              全部不通过
            </Button>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            没有需要确认的候选人。
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            {/* 桌面：固定列宽，不横向滚动 */}
            <table className="hidden w-full table-fixed text-sm md:table">
              <colgroup>
                <col className={isFinal ? "w-[22%]" : "w-[24%]"} />
                <col className="w-[14%]" />
                <col className={isFinal ? "w-[24%]" : "w-[22%]"} />
                {isFinal && <col className="w-[16%]" />}
                <col className={isFinal ? "w-[14%]" : "w-[26%]"} />
                <col className="w-[10%]" />
              </colgroup>
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">候选人</th>
                  <th className="px-3 py-2 text-left font-medium">志愿</th>
                  <th className="px-3 py-2 text-left font-medium">
                    {isFinal ? "面评均分（一面 / 二面）" : "一面记录"}
                  </th>
                  {isFinal && <th className="px-3 py-2 text-left font-medium">最终去向</th>}
                  <th className="px-3 py-2 text-left font-medium">结果</th>
                  <th className="px-3 py-2 text-left font-medium">邮件</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.userFlowId} className="align-middle">
                    <td className="px-3 py-2">
                      <div className="truncate font-medium">{row.name}</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        {row.studentId ?? "无学号"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div>{choiceLabel(row.choice)}</div>
                      {row.siblingDepartment && (
                        <div className="truncate text-xs text-muted-foreground">
                          另一志愿：{departmentLabel(row.siblingDepartment)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {recordCell(row)}
                    </td>
                    {isFinal && (
                      <td className="px-3 py-2">{finalDestinationSelect(row)}</td>
                    )}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {decisionButton(row, true)}
                        {decisionButton(row, false)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Checkbox
                        checked={notifySelection.includes(row.userFlowId)}
                        disabled={submitting}
                        onCheckedChange={(checked) =>
                          onNotifyUserFlowIdsChange?.(
                            checked === true
                              ? [...notifySelection, row.userFlowId]
                              : notifySelection.filter((id) => id !== row.userFlowId),
                          )
                        }
                        aria-label={`向 ${row.name} 发送${isFinal ? "结果邮件" : "一面结果通知"}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 移动端：卡片，不横向滚动 */}
            <div className="divide-y md:hidden">
              {rows.map((row) => (
                <div key={row.userFlowId} className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{row.name}</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        {row.studentId ?? "无学号"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-muted-foreground">
                        {choiceLabel(row.choice)}
                        {row.siblingDepartment
                          ? `（另一志愿：${departmentLabel(row.siblingDepartment)}）`
                          : ""}
                      </div>
                      {recordCell(row)}
                    </div>
                  </div>
                  {isFinal && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">最终去向</p>
                      {finalDestinationSelect(row)}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {decisionButton(row, true)}
                    {decisionButton(row, false)}
                    <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Checkbox
                        checked={notifySelection.includes(row.userFlowId)}
                        disabled={submitting}
                        onCheckedChange={(checked) =>
                          onNotifyUserFlowIdsChange?.(
                            checked === true
                              ? [...notifySelection, row.userFlowId]
                              : notifySelection.filter((id) => id !== row.userFlowId),
                          )
                        }
                        aria-label={`向 ${row.name} 发送${isFinal ? "结果邮件" : "一面结果通知"}`}
                      />
                      发送邮件
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 勾选说明与「去核对模板」同一行：按钮不再独占一行，也不再重复「未勾选不发邮件」长句 */}
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={templateConfirmed}
              onCheckedChange={(checked) => onTemplateConfirmedChange(checked === true)}
              aria-label="确认邮件模板"
            />
            <span>
              已核对本年度{isFinal ? "结果" : "一面结果"}通过和不通过邮件模板
            </span>
          </label>
          {templateHref && (
            /* 新标签页打开：名单勾选状态留在当前页，核对完模板回来直接确认 */
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-9 w-full shrink-0 sm:w-auto"
            >
              <a href={templateHref} target="_blank" rel="noopener noreferrer">
                <ExternalLink data-icon="inline-start" />
                打开邮件模板页核对
              </a>
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            loading={submitting}
            disabled={submitting || !templateConfirmed || (rows.length === 0 && isFinal)}
            onClick={onConfirm}
          >
            {isFinal ? (
              <>
                <Check data-icon="inline-start" />
                确认名单并发布（通过 {passCount} 人）
              </>
            ) : (
              <>
                <Check data-icon="inline-start" />
                确认名单并发送（通过 {passCount} 人）
              </>
            )}
          </Button>
          {!isFinal && rows.length === 0 && (
            <span className="text-xs text-muted-foreground">
              名单均已确认，可重发未发送的通知
            </span>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
