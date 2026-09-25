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
  const { counts, publication, templates, rows } = summary;
  const published = publication?.status === "published";
  const publicationInProgress = publication?.status === "publishing";
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
  const publicationBadge = published
    ? { label: "已发布", className: "border-primary/30 bg-primary/10 text-primary" }
    : publicationInProgress
      ? { label: "发布中", className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" }
      : counts.unfinished > 0
        ? { label: "有未完成结果", className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" }
        : { label: "可以发布", className: "border-primary/30 bg-primary/10 text-primary" };

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <LockKeyhole className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium">结果发布</span>
          <Badge variant="outline" className={publicationBadge.className}>
            {publicationBadge.label}
          </Badge>
        </div>
        <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
          {published
            ? "结果已发布，名单和结果已锁定。"
            : publicationInProgress
              ? "结果正在发布，请稍候。"
              : counts.unfinished > 0
                ? `还有 ${counts.unfinished} 人未完成最终结果，完成后才可发布。`
                : "所有人的最终结果已完成，可以发布。"}
        </p>
        <p className="text-xs leading-5 text-muted-foreground">通过模板 {templates.accepted.updatedAt ? "已配置" : "默认模板"}，不通过模板 {templates.rejected.updatedAt ? "已配置" : "默认模板"}。发布前请确认本年度文案。</p>
      </div>
      <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
        <Button className="w-full sm:w-auto" size="sm" variant="outline" onClick={() => setRosterOpen(true)} disabled={rows.length === 0}>
          <ClipboardList data-icon="inline-start" />查看完整名单
        </Button>
        {published && <Button className="w-full sm:w-auto" asChild size="sm" variant="outline"><a href={`/api/flow/result-export?flowId=${flowId}`}><Download data-icon="inline-start" />导出结果表</a></Button>}
        <Button className="w-full sm:w-auto" size="sm" onClick={openConfirmation} disabled={published || publicationInProgress || counts.unfinished > 0 || publishing}>
          <Send data-icon="inline-start" />{published ? "结果已发布" : publicationInProgress ? "发布中" : "确认并发布结果"}
        </Button>
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
                  <TableHead>组别</TableHead>
                  <TableHead>最终结果</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const status = row.status === "passed"
                    ? { label: "通过", className: "text-emerald-600" }
                    : row.status === "failed"
                      ? { label: "不通过", className: "text-destructive" }
                      : row.status === "withdrawn"
                      ? { label: "未参与", className: "text-muted-foreground" }
                        : { label: "未完成", className: "text-amber-600" };
                  return (
                    <TableRow key={row.userFlowId}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="font-mono text-xs">{row.studentId ?? "-"}</TableCell>
                      <TableCell>{row.applyGroup ?? "-"}</TableCell>
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
