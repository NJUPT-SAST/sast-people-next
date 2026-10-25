"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Search, Users } from "lucide-react";
import { toast } from "sonner";
import {
  searchCollectionInviteCandidates,
  sendCollectionInvitations,
  type CollectionInviteCandidate,
} from "@/action/collection-invite";
import { collectionFillRoleLabel, type CollectionFlowOption } from "@/const/collection";
import { departmentLabel } from "@/const/department";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function CollectionInviteDialog({
  formId,
  flows,
  disabled = false,
}: {
  formId: number;
  flows: CollectionFlowOption[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [flowIds, setFlowIds] = useState<number[]>([]);
  const [cohort, setCohort] = useState("");
  const [keyword, setKeyword] = useState("");
  const [candidates, setCandidates] = useState<CollectionInviteCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [sendEmail, setSendEmail] = useState(true);
  const [message, setMessage] = useState("");
  const [searched, setSearched] = useState(false);
  const [truncated, setTruncated] = useState(false);

  async function runSearch(filters: {
    flowIds: number[];
    cohort: string;
    keyword: string;
  }) {
    setSearching(true);
    try {
      const result = await searchCollectionInviteCandidates({
        formId,
        ...filters,
      });
      if (!result.success) throw new Error(result.message);
      setCandidates(result.data?.candidates ?? []);
      setTruncated(result.data?.truncated ?? false);
      setSearched(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "筛选失败，请稍后重试");
    } finally {
      setSearching(false);
    }
  }

  const search = () => runSearch({ flowIds, cohort, keyword });

  const toggleFlow = (flowId: number, checked: boolean) => {
    setFlowIds((current) =>
      checked
        ? Array.from(new Set([...current, flowId]))
        : current.filter((value) => value !== flowId),
    );
  };

  const toggleCandidate = (id: number, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const allVisibleSelected =
    candidates.length > 0 &&
    candidates.every((candidate) => selectedIds.has(candidate.id));

  /* 换了筛选条件后，之前选中但不在当前结果里的人仍会被邀请；必须显式告诉操作者 */
  const hiddenSelectedCount = useMemo(() => {
    if (selectedIds.size === 0) return 0;
    const visibleIds = new Set(candidates.map((candidate) => candidate.id));
    let hidden = 0;
    for (const id of selectedIds) {
      if (!visibleIds.has(id)) hidden += 1;
    }
    return hidden;
  }, [selectedIds, candidates]);

  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const candidate of candidates) next.delete(candidate.id);
      } else {
        for (const candidate of candidates) next.add(candidate.id);
      }
      return next;
    });
  };

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setFlowIds([]);
      setCohort("");
      setKeyword("");
      setCandidates([]);
      setSelectedIds(new Set());
      setSendEmail(true);
      setMessage("");
      setSearched(false);
      void runSearch({ flowIds: [], cohort: "", keyword: "" });
    }
    setOpen(next);
  };

  async function send() {
    if (selectedIds.size === 0) {
      toast.error("请先选择要邀请的成员");
      return;
    }

    setSending(true);
    try {
      const result = await sendCollectionInvitations({
        formId,
        userIds: Array.from(selectedIds),
        sendEmail,
        message,
      });
      if (!result.success) throw new Error(result.message);
      const { invited, emailed, failed, skipped } = result.data ?? {
        invited: 0,
        emailed: 0,
        failed: 0,
        skipped: 0,
      };
      if (sendEmail && failed > 0) {
        toast.warning(`已邀请 ${invited} 人，成功发送 ${emailed} 封，失败 ${failed} 封`);
      } else if (sendEmail) {
        toast.success(`已邀请 ${invited} 人，并发送 ${emailed} 封邮件`);
      } else {
        toast.success(`已记录 ${invited} 人的邀请（未发送邮件）`);
      }
      if (skipped > 0) {
        toast.info(`有 ${skipped} 人不在填写范围内，已自动跳过`);
      }
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "邀请失败，请稍后重试");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="w-full"
          disabled={disabled}
          title={disabled ? "仅在收集期间可以邀请成员" : undefined}
        >
          <Mail /> 邀请填写
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>邀请成员填写</DialogTitle>
          <DialogDescription>
            按流程、届别与关键词筛选成员，批量勾选后发送邀请；邀请邮件可选。
            不在填写范围内的人会自动排除，已填写的人会标记出来但仍可邀请。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 rounded-lg border border-border/70 p-4 lg:grid-cols-[1fr_1fr_1fr]">
            <div className="space-y-2">
              <Label>流程（最终通过）</Label>
              {flows.length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无可选流程。</p>
              ) : (
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-border/60 p-2">
                  {flows.map((flow) => {
                    const optionId = `invite-flow-${flow.id}`;
                    return (
                      <div key={flow.id} className="flex items-start gap-2">
                        <Checkbox
                          id={optionId}
                          checked={flowIds.includes(flow.id)}
                          onCheckedChange={(checked) =>
                            toggleFlow(flow.id, checked === true)
                          }
                        />
                        <Label
                          htmlFor={optionId}
                          className="cursor-pointer font-normal leading-5"
                        >
                          {flow.label}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-cohort">届别</Label>
              <Input
                id="invite-cohort"
                value={cohort}
                onChange={(event) => setCohort(event.target.value)}
                placeholder="学号含 23 / 2023"
              />
              <p className="text-xs text-muted-foreground">
                按学号中的年份筛选。
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-keyword">姓名 / 学号 / 手机号</Label>
              <Input
                id="invite-keyword"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="输入关键词"
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                loading={searching}
                onClick={search}
              >
                <Search /> 筛选成员
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="invite-select-all"
                checked={allVisibleSelected}
                disabled={candidates.length === 0}
                onCheckedChange={toggleAllVisible}
              />
              <Label htmlFor="invite-select-all" className="cursor-pointer font-normal">
                全选当前结果
              </Label>
            </div>
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setSelectedIds(new Set())}
                >
                  清空已选
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                已选 {selectedIds.size} 人
                {hiddenSelectedCount > 0
                  ? `（其中 ${hiddenSelectedCount} 人不在当前筛选结果中）`
                  : ""}
              </p>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border border-border/70">
            {searching ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                正在筛选…
              </p>
            ) : !searched ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                设置筛选条件后点击「筛选成员」。
              </p>
            ) : candidates.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                没有符合条件的成员（已自动排除不在填写范围内的人）。
              </p>
            ) : (
              <div className="divide-y divide-border/60">
                {candidates.map((candidate) => (
                  <div
                    key={candidate.id}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30"
                  >
                    <Checkbox
                      id={`invite-candidate-${candidate.id}`}
                      checked={selectedIds.has(candidate.id)}
                      onCheckedChange={(checked) =>
                        toggleCandidate(candidate.id, checked === true)
                      }
                      className="mt-0.5"
                    />
                    <label
                      htmlFor={`invite-candidate-${candidate.id}`}
                      className="grid min-w-0 flex-1 cursor-pointer gap-1 text-sm sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {candidate.name}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {candidate.studentId ?? "无学号"}
                          </span>
                          {candidate.submitted && (
                            <span className="ml-2 rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[11px] font-normal text-warning-foreground">
                              已填写
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {candidate.email ?? "无邮箱"}
                          {candidate.phone ? ` · ${candidate.phone}` : ""}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {collectionFillRoleLabel([candidate.role])}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {departmentLabel(candidate.department)}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {candidate.college ?? ""}
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="size-3.5" />
            共 {candidates.length} 位候选成员
            {truncated && "；结果较多，仅展示部分候选，请用筛选条件缩小范围"}
          </p>

          <div className="grid gap-4 rounded-lg border border-border/70 p-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="invite-message">邀请留言（可选）</Label>
              <Textarea
                id="invite-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={4}
                maxLength={500}
                placeholder="例如：请在周五前完成填写，谢谢！"
              />
            </div>
            <div className="space-y-3">
              <label className="flex w-fit items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={sendEmail}
                  onCheckedChange={(checked) => setSendEmail(checked === true)}
                />
                发送邮件通知
              </label>
              <p className="text-xs leading-5 text-muted-foreground">
                开启后会向成员邮箱发送邀请链接；关闭时只记录邀请，不发送邮件。
                邮件服务未配置时，邀请仍会记录并标记为失败。
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="sticky bottom-0 border-t border-border/70 bg-background pt-3">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            type="button"
            loading={sending}
            disabled={selectedIds.size === 0}
            onClick={send}
          >
            邀请 {selectedIds.size > 0 ? `${selectedIds.size} 人` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
