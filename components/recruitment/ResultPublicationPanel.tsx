"use client";

import { useEffect, useState } from "react";
import { Download, LockKeyhole, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { publishFlowResults, getFlowResultPublicationSummary } from "@/action/flow/result-publication";

type Summary = Awaited<ReturnType<typeof getFlowResultPublicationSummary>>;

export function ResultPublicationPanel({ flowId }: { flowId: number }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
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
  const { counts, publication, templates } = summary;
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
          <p className="mt-1 text-xs text-muted-foreground">通过 {counts.accepted} · 不通过 {counts.rejected} · 撤回 {counts.withdrawn} · 未完成 {counts.unfinished}</p>
          <p className="mt-1 text-xs text-muted-foreground">通过模板 {templates.accepted.updatedAt ? "已配置" : "默认模板"}，不通过模板 {templates.rejected.updatedAt ? "已配置" : "默认模板"}。发布前请确认本年度文案。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {published && <Button asChild size="sm" variant="outline"><a href={`/api/flow/result-export?flowId=${flowId}`}><Download data-icon="inline-start" />导出结果表</a></Button>}
          <Button size="sm" onClick={() => { setTemplateConfirmed(false); setConfirmOpen(true); }} disabled={published || counts.unfinished > 0 || publishing}>
            <Send data-icon="inline-start" />{published ? "结果已发布" : "确认并发布结果"}
          </Button>
        </div>
      </div>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认并发布流程结果</DialogTitle>
            <DialogDescription>
              发布后将锁定本流程名单和结果，按通过与不通过名单同步权限并创建结果邮件。通过 {counts.accepted} 人，不通过 {counts.rejected} 人。
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-background p-3 text-sm">
            <p className="font-medium">本年度邮件模板</p>
            <p className="mt-1 text-xs text-muted-foreground">通过模板：{templates.accepted.needsReview ? "请重点核对，可能仍是旧年度配置" : "已配置"}</p>
            <p className="mt-1 text-xs text-muted-foreground">不通过模板：{templates.rejected.needsReview ? "请重点核对，可能仍是旧年度配置" : "已配置"}</p>
          </div>
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
