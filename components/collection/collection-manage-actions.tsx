"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, CopyPlus, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteCollectionForm,
  duplicateCollectionForm,
  setCollectionFormStatus,
} from "@/action/collection";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CollectionManageActions({
  formId,
  status,
  phase,
  deadlinePassed,
  exportHref,
  shareToken,
}: {
  formId: number;
  status: string;
  /** 展示口径的阶段：手动状态为 open 也可能因截止时间已过而结束 */
  phase: "upcoming" | "open" | "closed";
  deadlinePassed: boolean;
  exportHref: string;
  shareToken: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState(`/collect/${shareToken}`);
  const isOpen = status === "open";
  /* 截止时间已过时「恢复收集」是空操作：status 仍是 open，但 phase 仍为 closed。
     按钮直接禁用并说明必须先延长截止时间，避免 toast 成功但表单依旧不可填。 */
  const deadlineEnded = phase !== "open" && deadlinePassed;

  useEffect(() => {
    setShareUrl(`${window.location.origin}/collect/${shareToken}`);
  }, [shareToken]);

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("分享链接已复制");
    } catch {
      toast.error(`复制失败，请手动复制：${shareUrl}`);
    }
  }

  async function toggleStatus() {
    setPending(true);
    try {
      const result = await setCollectionFormStatus(formId, isOpen ? "closed" : "open");
      if (!result.success) throw new Error(result.message);
      toast.success(isOpen ? "已结束收集" : "已恢复收集");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  async function duplicate() {
    setPending(true);
    try {
      const result = await duplicateCollectionForm(formId);
      if (!result.success) throw new Error(result.message);
      setDuplicateOpen(false);
      toast.success("已复制收集表");
      router.push(`/dashboard/collection/${result.data?.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "复制失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setPending(true);
    try {
      const result = await deleteCollectionForm(formId);
      if (!result.success) throw new Error(result.message);
      toast.success("收集表已删除");
      setDeleteOpen(false);
      router.push("/dashboard/collection");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="collection-share-link">分享链接</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="collection-share-link"
            value={shareUrl}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 font-mono text-xs"
          />
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" onClick={copyShareLink}>
              <Copy /> 复制
            </Button>
            <Button variant="outline" asChild>
              <a href={shareUrl} target="_blank" rel="noreferrer">
                <ExternalLink /> 打开
              </a>
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          收到链接的成员登录后即可填写；未登录会先登录再回到本表。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-3">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setDuplicateOpen(true)}
          loading={pending}
        >
          <CopyPlus /> 复制表单
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={toggleStatus}
          loading={pending}
          disabled={deadlineEnded}
        >
          {deadlineEnded ? "已截止" : isOpen ? "结束收集" : "恢复收集"}
        </Button>
        <Button variant="outline" className="w-full" asChild>
          <a href={exportHref}>导出数据</a>
        </Button>
        <Button
          variant="ghost"
          className="w-full text-destructive hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 /> 删除
        </Button>
      </div>

      {deadlineEnded && (
        <p className="text-xs leading-5 text-warning-foreground">
          截止时间已过，请先编辑收集表延长截止时间
          {isOpen ? "（保存后会自动恢复接收）" : "，再点「恢复收集」"}。
        </p>
      )}

      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>复制这张收集表？</DialogTitle>
            <DialogDescription>
              副本会沿用原表的填写身份、收集项与开始/截止时间；如果原表正在收集，副本也会立即出现在成员的列表里。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDuplicateOpen(false)}
            >
              取消
            </Button>
            <Button type="button" loading={pending} onClick={duplicate}>
              确认复制
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除收集表？</DialogTitle>
            <DialogDescription>
              删除后该收集表及其全部填写记录都会被删除，且不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={pending}
              onClick={remove}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
