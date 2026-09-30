"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, Download, LockKeyhole, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { publishFlowResults, getFlowResultPublicationSummary } from "@/action/flow/result-publication";
import { setOfficeFinalDestination } from "@/action/user-flow/office-final-destination";
import { closeOfficeRoundTwo } from "@/action/user-flow/office-rounds";
import { OfficeRosterDialog, type OfficeRosterRow } from "@/components/recruitment/officeRosterDialog";
import { departmentLabel } from "@/const/department";
import Link from "next/link";

type Summary = Awaited<ReturnType<typeof getFlowResultPublicationSummary>>;

export function ResultPublicationPanel({ flowId, onStatusChange }: { flowId: number; onStatusChange?: (status: string | null) => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [templateConfirmed, setTemplateConfirmed] = useState(false);
  const [recipientUserFlowIds, setRecipientUserFlowIds] = useState<number[]>([]);
  /* 办公类：名单确认弹窗（二面收口，决定通过/不通过与最终去向） */
  const [officeRosterOpen, setOfficeRosterOpen] = useState(false);
  const [officeDecisions, setOfficeDecisions] = useState<Record<number, boolean>>({});
  const [officeNotifyUserFlowIds, setOfficeNotifyUserFlowIds] = useState<number[]>([]);
  const [officeTemplateConfirmed, setOfficeTemplateConfirmed] = useState(false);
  const [officeSubmitting, setOfficeSubmitting] = useState(false);
  const activeFlowIdRef = useRef(flowId);
  const notificationCandidates = useMemo(
    () => (summary?.rows ?? []).filter(
      (row) => row.status === "passed" || row.status === "failed",
    ),
    [summary?.rows],
  );

  const refresh = async () => {
    setLoading(true);
    try {
      const nextSummary = await getFlowResultPublicationSummary(flowId);
      if (activeFlowIdRef.current !== flowId) return;
      setSummary(nextSummary);
      onStatusChange?.(nextSummary.publication?.status ?? null);
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "结果状态加载失败"); }
    finally {
      if (activeFlowIdRef.current === flowId) setLoading(false);
    }
  };

  useEffect(() => {
    activeFlowIdRef.current = flowId;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const nextSummary = await getFlowResultPublicationSummary(flowId);
        if (cancelled || activeFlowIdRef.current !== flowId) return;
        setSummary(nextSummary);
        onStatusChange?.(nextSummary.publication?.status ?? null);
      }
      catch (error) { toast.error(error instanceof Error ? error.message : "结果状态加载失败"); }
      finally {
        if (!cancelled && activeFlowIdRef.current === flowId) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [flowId, onStatusChange]);

  if (loading || !summary) return null;
  const { counts, publication, rows } = summary;
  const published = publication?.status === "published";
  const publicationInProgress = publication?.status === "publishing";
  /* 办公类：待部长在名单确认里决定结果的人（已进入二面且仍是进行中） */
  const officePendingRows = summary.isOfficeFlow
    ? rows.filter((row) => row.status === "ongoing" && row.round === 2)
    : [];
  const officeRosterRows: OfficeRosterRow[] = officePendingRows.map((row) => ({
    userFlowId: row.userFlowId,
    name: row.name,
    studentId: row.studentId,
    choice: row.choice,
    /* 同一候选人在另一个办公部门的报名（第一/第二志愿的另一条），用于冲突时选择归属 */
    siblingDepartment:
      row.officeChoices.find((choice) => choice.userFlowId !== row.userFlowId)
        ?.department ?? null,
    scores: row.scores,
    officeChoices: row.officeChoices.map((choice) => ({
      userFlowId: choice.userFlowId,
      choice: choice.choice,
      department: choice.department,
    })),
    finalDepartment: row.finalDepartment,
  }));
  /* 重试发布：名单已确认过，未发送通知的对象是已有最终结果的候选人 */
  const officePublishedUserFlowIds = rows
    .filter((row) => row.status === "passed" || row.status === "failed")
    .map((row) => row.userFlowId);

  /* 办公类名单确认：通过/不通过在此决定，确认即发布最终结果并发送通知 */
  const publishOfficeRoster = async (
    decisions: Array<{ userFlowId: number; passed: boolean }>,
    notifyUserFlowIds: number[],
  ) => {
    setOfficeSubmitting(true);
    try {
      const result = await closeOfficeRoundTwo(
        Number(flowId),
        decisions,
        notifyUserFlowIds,
        true,
      );
      if (!result.success) {
        /* 「名单已确认，但结果发布失败」等错误原样提示，便于部长重试 */
        toast.error(result.error.message);
        setOfficeRosterOpen(false);
        await refresh();
        return;
      }
      toast.success("最终结果已发布");
      setOfficeRosterOpen(false);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "最终结果发布失败");
    } finally {
      setOfficeSubmitting(false);
    }
  };
  const openOfficeRoster = () => {
    if (officeRosterRows.length === 0) {
      /* 名单已确认过（重试发布）：无需再确认，直接发布并通知已有结果的人 */
      void publishOfficeRoster([], officePublishedUserFlowIds);
      return;
    }
    setOfficeDecisions(
      Object.fromEntries(officeRosterRows.map((row) => [row.userFlowId, true])),
    );
    setOfficeNotifyUserFlowIds(officeRosterRows.map((row) => row.userFlowId));
    setOfficeTemplateConfirmed(false);
    setOfficeRosterOpen(true);
  };
  const confirmOfficeRoster = () => {
    void publishOfficeRoster(
      officeRosterRows.map((row) => ({
        userFlowId: row.userFlowId,
        passed: officeDecisions[row.userFlowId] ?? true,
      })),
      officeNotifyUserFlowIds,
    );
  };
  const publish = async () => {
    if (!templateConfirmed) return;
    setPublishing(true);
    try {
      await publishFlowResults(flowId, true, recipientUserFlowIds);
      toast.success("结果已发布，权限同步和邮件发送已启动");
      await refresh();
      setConfirmOpen(false);
      setTemplateConfirmed(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : "结果发布失败"); }
    finally { setPublishing(false); }
  };
  const openConfirmation = () => {
    setTemplateConfirmed(false);
    setRecipientUserFlowIds(notificationCandidates.map((row) => row.userFlowId));
    setConfirmOpen(true);
  };
  /* 部长团评议的最终去向：为空 = 自动（第一志愿优先）。只更新本地行，避免整面板刷新导致名单弹窗关闭 */
  const changeFinalDestination = async (
    userFlowId: number,
    value: string,
  ) => {
    try {
      const result = await setOfficeFinalDestination(
        userFlowId,
        value === "auto" ? null : value,
      );
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      setSummary((previous) =>
        previous
          ? {
              ...previous,
              rows: previous.rows.map((row) =>
                row.userFlowId === userFlowId
                  ? { ...row, finalDepartment: result.department }
                  : row,
              ),
            }
          : previous,
      );
      toast.success(
        result.department
          ? `最终去向已设为 ${departmentLabel(result.department)}`
          : "已恢复自动归属（第一志愿优先）",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "最终去向保存失败，请稍后重试",
      );
    }
  };
  const publicationBadge = published
    ? { label: "已发布", className: "border-primary/30 bg-primary/10 text-primary" }
    : publicationInProgress
      ? { label: "发布中", className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" }
      : summary.isOfficeFlow
        ? { label: `待确认名单（${officeRosterRows.length} 人）`, className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" }
        : counts.unfinished > 0
          ? { label: "有未完成结果", className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" }
          : { label: "可以发布", className: "border-primary/30 bg-primary/10 text-primary" };

  const statusSentence = published
    ? "结果已发布，名单和结果已锁定。"
    : publicationInProgress
      ? "结果正在发布，请稍候。"
      : summary.isOfficeFlow
        ? officeRosterRows.length > 0
          ? `还有 ${officeRosterRows.length} 人待确认最终结果，确认名单后即发布。`
          : "名单已确认，可重新发布最终结果。"
        : counts.unfinished > 0
          ? `还有 ${counts.unfinished} 人未完成最终结果，完成后才可发布。`
          : "所有人的最终结果已完成，可以发布。";

  return (
    // One line at desktop: this is a once-per-flow action, it should not take a
    // block of prime space above the list. The template reminder lives in the
    // confirmation dialog, where the decision is actually made.
    <section className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3 lg:flex-row lg:items-center lg:gap-4 lg:py-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <LockKeyhole className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium">结果发布</span>
        <Badge variant="outline" className={publicationBadge.className}>
          {publicationBadge.label}
        </Badge>
        <span className="text-xs leading-5 text-muted-foreground">
          {statusSentence}
        </span>
      </div>
      <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap lg:ml-auto lg:flex-none">
        <Button className="w-full sm:w-auto" size="sm" variant="outline" onClick={() => setRosterOpen(true)} disabled={rows.length === 0}>
          <ClipboardList data-icon="inline-start" />查看完整名单
        </Button>
        {published && <Button className="w-full sm:w-auto" asChild size="sm" variant="outline"><a href={`/api/flow/result-export?flowId=${flowId}`}><Download data-icon="inline-start" />导出结果表</a></Button>}
        {summary.isOfficeFlow ? (
          /* 办公类：通过/不通过由部长在名单确认时决定，确认即发布 */
          <Button className="w-full sm:w-auto" size="sm" onClick={openOfficeRoster} disabled={published || publicationInProgress || officeSubmitting}>
            <Send data-icon="inline-start" />{published ? "结果已发布" : publicationInProgress ? "发布中" : "确认名单并发布"}
          </Button>
        ) : (
          <Button className="w-full sm:w-auto" size="sm" onClick={openConfirmation} disabled={published || publicationInProgress || counts.unfinished > 0 || publishing}>
            <Send data-icon="inline-start" />{published ? "结果已发布" : publicationInProgress ? "发布中" : "确认并发布结果"}
          </Button>
        )}
      </div>
      <Dialog open={rosterOpen} onOpenChange={setRosterOpen}>
        <DialogContent className="max-h-[85dvh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>完整结果名单</DialogTitle>
            <DialogDescription>
              {summary.flow.title} · 共 {rows.length} 人。请在发布前快速核对名单和最终结果。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>通过 {counts.accepted}</span>
            <span>不通过 {counts.rejected}</span>
            <span>未参与 {counts.withdrawn}</span>
            <span>未完成 {counts.unfinished}</span>
          </div>
          <div className="max-h-[55vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>学号</TableHead>
                  {summary.isOfficeFlow ? (
                    <>
                      <TableHead>志愿</TableHead>
                      <TableHead>最终去向</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead>投递部门</TableHead>
                      <TableHead>组别</TableHead>
                    </>
                  )}
                  <TableHead>最终结果</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  // 投递部门由流程结果汇总行提供；未提供时按“未归属部门”展示，不阻断名单
                  const department =
                    "department" in row && typeof row.department === "string"
                      ? row.department
                      : null;
                  const status = row.status === "passed"
                    ? { label: "通过", className: "text-emerald-600" }
                    : row.status === "failed"
                      ? { label: "不通过", className: "text-destructive" }
                      : row.status === "withdrawn"
                      ? { label: "未参与", className: "text-muted-foreground" }
                        : { label: "未完成", className: "text-amber-600" };
                  const officeChoices = row.officeChoices ?? [];
                  const otherChoice = officeChoices.find(
                    (choice) => choice.choice !== row.choice,
                  );
                  /* 无评议结果时的自动归属：第一志愿优先 */
                  const autoDepartment =
                    officeChoices.find((choice) => choice.choice === 1)
                      ?.department ??
                    officeChoices[0]?.department ??
                    department;
                  const choiceLabel =
                    row.choice === 1
                      ? "第一志愿"
                      : row.choice === 2
                        ? "第二志愿"
                        : "-";
                  return (
                    <TableRow key={row.userFlowId}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="font-mono text-xs">{row.studentId ?? "-"}</TableCell>
                      {summary.isOfficeFlow ? (
                        <>
                          <TableCell className="whitespace-nowrap">
                            <span>{choiceLabel}</span>
                            {otherChoice?.department && (
                              <p className="text-xs text-muted-foreground">
                                另一志愿：{departmentLabel(otherChoice.department)}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            {/* 最终去向在「确认名单并发布」弹窗里设置，这里只做核对展示 */}
                            <span
                              className={
                                row.finalDepartment
                                  ? undefined
                                  : "text-muted-foreground"
                              }
                            >
                              {row.finalDepartment
                                ? departmentLabel(row.finalDepartment)
                                : `自动（${departmentLabel(autoDepartment)}）`}
                            </span>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="text-muted-foreground">{departmentLabel(department)}</TableCell>
                          <TableCell>{row.applyGroup ?? "-"}</TableCell>
                        </>
                      )}
                      <TableCell className={status.className}>{status.label}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRosterOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {summary.isOfficeFlow && (
        <OfficeRosterDialog
          open={officeRosterOpen}
          onOpenChange={setOfficeRosterOpen}
          mode="round2"
          flowTitle={summary.flow.title}
          rows={officeRosterRows}
          decisions={officeDecisions}
          onDecisionChange={(userFlowId, passed) =>
            setOfficeDecisions((current) => ({ ...current, [userFlowId]: passed }))
          }
          onSetAll={(passed) =>
            setOfficeDecisions(
              Object.fromEntries(
                officeRosterRows.map((row) => [row.userFlowId, passed]),
              ),
            )
          }
          templateConfirmed={officeTemplateConfirmed}
          onTemplateConfirmedChange={setOfficeTemplateConfirmed}
          onFinalDestinationChange={(userFlowId, department) =>
            void changeFinalDestination(userFlowId, department ?? "auto")
          }
          notifyUserFlowIds={officeNotifyUserFlowIds}
          onNotifyUserFlowIdsChange={setOfficeNotifyUserFlowIds}
          submitting={officeSubmitting}
          onConfirm={confirmOfficeRoster}
        />
      )}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认并发布流程结果</DialogTitle>
            <DialogDescription>
              发布后将锁定本流程名单和结果，按通过名单同步权限，并只向下方选中的人员创建结果邮件。
            </DialogDescription>
          </DialogHeader>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/dashboard/emails?tab=templates" target="_blank" rel="noreferrer">
              <ClipboardList data-icon="inline-start" />前往邮件中心核对模板
            </Link>
          </Button>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={templateConfirmed} onCheckedChange={(checked) => setTemplateConfirmed(checked === true)} />
            <span>我已在邮件中心核对本年度通过和不通过邮件模板，确认内容无误。</span>
          </label>
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">本次发送结果邮件</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRecipientUserFlowIds(
                  recipientUserFlowIds.length === notificationCandidates.length
                    ? []
                    : notificationCandidates.map((row) => row.userFlowId),
                )}
              >
                {recipientUserFlowIds.length === notificationCandidates.length ? "取消全选" : "全选"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              已选择 {recipientUserFlowIds.length} / {notificationCandidates.length} 人；未选人员会发布结果，但不会收到本次邮件。
            </p>
            <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
              {notificationCandidates.map((row) => {
                const checked = recipientUserFlowIds.includes(row.userFlowId);
                return (
                  <label key={row.userFlowId} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => setRecipientUserFlowIds((current) =>
                        next === true
                          ? [...current, row.userFlowId]
                          : current.filter((id) => id !== row.userFlowId),
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">{row.name} · {row.studentId ?? "无学号"}</span>
                    <span className={row.status === "passed" ? "text-primary" : "text-destructive"}>
                      {row.status === "passed" ? "通过" : "不通过"}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>取消</Button>
            <Button onClick={publish} disabled={!templateConfirmed || publishing} loading={publishing}>
              <Send data-icon="inline-start" />确认发布
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
