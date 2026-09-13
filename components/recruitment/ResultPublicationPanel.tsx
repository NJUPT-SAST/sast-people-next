"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Download, LockKeyhole, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { publishFlowResults, getFlowResultPublicationSummary } from "@/action/flow/result-publication";
import Link from "next/link";

type Summary = Awaited<ReturnType<typeof getFlowResultPublicationSummary>>;

export function ResultPublicationPanel({ flowId }: { flowId: number }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [templateConfirmed, setTemplateConfirmed] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try { setSummary(await getFlowResultPublicationSummary(flowId)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "结果状态加载失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try { setSummary(await getFlowResultPublicationSummary(flowId)); }
      catch (error) { toast.error(error instanceof Error ? error.message : "结果状态加载失败"); }
      finally { setLoading(false); }
    })();
  }, [flowId]);

  if (loading || !summary) return null;
  const { counts, publication, templates, rows } = summary;
  const published = publication?.status === "published";
  const publish = async () => {
    if (!templateConfirmed) return;
    setPublishing(true);
    try {
      await publishFlowResults(flowId, true);
      toast.success("结果已发布，权限同步和邮件发送已启动");
      await refresh();
      setConfirmOpen(false);
      setTemplateConfirmed(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : "结果发布失败"); }
    finally { setPublishing(false); }
  };

  return (
    <section className="border-y bg-muted/20 px-4 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium"><LockKeyhole className="size-4" />结果发布</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {published
              ? "结果已发布，名单和结果已锁定。"
              : counts.unfinished > 0
                ? `还有 ${counts.unfinished} 人未完成最终结果，完成后才可发布。`
                : "所有人的最终结果已完成，可以发布。"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">通过模板 {templates.accepted.updatedAt ? "已配置" : "默认模板"}，不通过模板 {templates.rejected.updatedAt ? "已配置" : "默认模板"}。发布前请确认本年度文案。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setRosterOpen(true)} disabled={rows.length === 0}>
            <ClipboardList data-icon="inline-start" />查看完整名单
          </Button>
          {published && <Button asChild size="sm" variant="outline"><a href={`/api/flow/result-export?flowId=${flowId}`}><Download data-icon="inline-start" />导出结果表</a></Button>}
          <Button size="sm" onClick={() => { setTemplateConfirmed(false); setConfirmOpen(true); }} disabled={published || counts.unfinished > 0 || publishing}>
            <Send data-icon="inline-start" />{published ? "结果已发布" : "确认并发布结果"}
          </Button>
        </div>
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
            <span>撤回 {counts.withdrawn}</span>
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
                        ? { label: "已撤回", className: "text-muted-foreground" }
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
              发布后将锁定本流程名单和结果，按通过与不通过名单同步权限并创建结果邮件。通过 {counts.accepted} 人，不通过 {counts.rejected} 人。
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
