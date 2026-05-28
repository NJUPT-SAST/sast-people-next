"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { createEvaluation, rejectCandidate, reopenAndEvaluate } from "@/action/user-flow/evaluation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { externalHref } from "@/lib/link";

type Candidate = {
  userFlowId: number;
  uid: number;
  name: string;
  studentId: string | null;
  phoneNumber: string | null;
  status: string;
  portfolioLink: string | null;
  evalId: number | null;
  evalContent: string | null;
  evalMeetingLink: string | null;
  evalStatus: string | null;
};

const evalStatusBadge = (evalStatus: string | null, flowStatus: string) => {
  if (evalStatus === "approved") return <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">已通过</Badge>;
  if (evalStatus === "rejected") return <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">面评已驳回</Badge>;
  if (evalStatus === "pending") return <Badge variant="outline" className="border-chart-3/30 bg-chart-3/10 text-chart-3">待审核</Badge>;
  if (flowStatus === "rejected") return <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">不通过</Badge>;
  if (flowStatus === "accepted") return <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">已通过</Badge>;
  return <Badge variant="outline" className="border-muted-foreground/30 bg-muted text-muted-foreground">待评估</Badge>;
};

const passButtonClass =
  "h-8 rounded-lg border-primary/20 bg-primary/8 px-3 text-primary shadow-none hover:bg-primary/12 hover:text-primary";
const rejectButtonClass =
  "h-8 rounded-lg border-destructive/20 bg-destructive/8 px-3 text-destructive shadow-none hover:bg-destructive/12 hover:text-destructive";
const neutralButtonClass =
  "h-8 rounded-lg border-border bg-background px-3 shadow-none hover:bg-muted";

const PortfolioLink = ({ value }: { value: string | null }) => {
  if (!value) return <span className="text-xs text-muted-foreground">未填写</span>;

  return (
    <a
      href={externalHref(value)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
    >
      <span className="truncate">作品链接</span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
    </a>
  );
};

export const EvaluationTable = ({
  candidates,
  role,
  onRefresh,
}: {
  candidates: Candidate[];
  role: number;
  onRefresh: () => void;
}) => {
  const [evaluatingId, setEvaluatingId] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState<"pass" | "reopen" | null>(null);

  const startEdit = (c: Candidate, mode: "pass" | "reopen") => {
    setEvaluatingId(c.userFlowId);
    setEditMode(mode);
    setContent(c.evalContent ?? "");
    setMeetingLink(c.evalMeetingLink ?? "");
  };

  const cancelEdit = () => {
    setEvaluatingId(null);
    setContent("");
    setMeetingLink("");
    setEditMode(null);
  };

  const editingCandidate =
    candidates.find((c) => c.userFlowId === evaluatingId) ?? null;

  const handlePass = async (userFlowId: number) => {
    if (!content.trim()) return;
    setLoadingId(userFlowId);
    try {
      const result = await createEvaluation(userFlowId, content, meetingLink);
      if (!result.success) {
        toast.error(result.error?.message ?? "提交失败");
        return;
      }
      toast.success("面评已提交，等待管理员审核");
      cancelEdit();
      onRefresh();
    } catch {
      toast.error("提交失败");
    } finally {
      setLoadingId(null);
    }
  };

  const handleReopen = async (userFlowId: number) => {
    if (!content.trim()) return;
    setLoadingId(userFlowId);
    try {
      await reopenAndEvaluate(userFlowId, content, meetingLink);
      toast.success("面评已提交，等待管理员审核");
      cancelEdit();
      onRefresh();
    } catch {
      toast.error("操作失败");
    } finally {
      setLoadingId(null);
    }
  };

  const handleReject = async (userFlowId: number) => {
    setLoadingId(userFlowId);
    try {
      await rejectCandidate(userFlowId);
      toast.success("已设为不通过");
      cancelEdit();
      onRefresh();
    } catch {
      toast.error("操作失败");
    } finally {
      setLoadingId(null);
    }
  };

  if (candidates.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center">
        <p className="text-sm font-medium">暂无可评估的候选人</p>
        <p className="mt-1 text-xs text-muted-foreground">
          当前流程还没有可处理的报名人员。
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="hidden md:block overflow-x-auto">
        <Table className="table-fixed min-w-[760px]">
          {role >= 3 ? (
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
              <col className="w-[16%]" />
              <col className="w-[14%]" />
              <col className="w-[20%]" />
            </colgroup>
          ) : (
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[24%]" />
              <col className="w-[20%]" />
              <col className="w-[18%]" />
              <col className="w-[20%]" />
            </colgroup>
          )}
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="whitespace-nowrap px-4 py-3">学号</TableHead>
              <TableHead className="whitespace-nowrap px-4 py-3">姓名</TableHead>
              {role >= 3 && (
                <TableHead className="whitespace-nowrap px-4 py-3">手机号</TableHead>
              )}
              <TableHead className="whitespace-nowrap px-4 py-3">作品</TableHead>
              <TableHead className="whitespace-nowrap px-4 py-3">状态</TableHead>
              {role >= 2 && (
                <TableHead className="whitespace-nowrap px-4 py-3">操作</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.map((c) => {
              const isEditing = evaluatingId === c.userFlowId;
              const isRejected = c.status === "rejected";
              const busy = loadingId === c.userFlowId;

              return (
                <TableRow key={c.userFlowId} className="hover:bg-muted/30">
                  <TableCell className="whitespace-nowrap px-4 py-4 font-mono text-xs text-muted-foreground">
                    {c.studentId}
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-4 py-4 font-medium">
                    {c.name}
                  </TableCell>
                  {role >= 3 && (
                    <TableCell className="whitespace-nowrap px-4 py-4 font-mono text-xs text-muted-foreground">
                      {c.phoneNumber || "-"}
                    </TableCell>
                  )}
                  <TableCell className="whitespace-nowrap px-4 py-4">
                    <PortfolioLink value={c.portfolioLink} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-4 py-4">
                    {evalStatusBadge(c.evalStatus, c.status)}
                  </TableCell>
                  {role >= 2 && (
                    <TableCell className="whitespace-normal px-4 py-4">
                      {isEditing ? (
                        <div className="text-sm text-muted-foreground">
                          正在编辑面评
                        </div>
                      ) : c.evalStatus === "pending" ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className={neutralButtonClass}
                            onClick={() => startEdit(c, "pass")}
                          >
                            修改
                          </Button>
                        </div>
                      ) : c.evalStatus === "approved" ? (
                        null
                      ) : c.evalStatus === "rejected" ? (
                        null
                      ) : isRejected ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className={passButtonClass}
                          onClick={() => startEdit(c, "reopen")}
                        >
                          改为通过
                        </Button>
                      ) : (
                        <div className="flex w-fit flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className={passButtonClass}
                            onClick={() => startEdit(c, "pass")}
                          >
                            通过
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className={rejectButtonClass}
                            onClick={() => handleReject(c.userFlowId)}
                            loading={busy}
                          >
                            不通过
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden flex flex-col divide-y divide-border">
        {candidates.map((c) => {
          const isEditing = evaluatingId === c.userFlowId;
          const isRejected = c.status === "rejected";
          const busy = loadingId === c.userFlowId;

          return (
            <div key={c.userFlowId} className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/40">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <span className="font-semibold">{c.name}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {c.studentId}
                  </span>
                </div>
                {evalStatusBadge(c.evalStatus, c.status)}
              </div>
              {role >= 3 && (
                <div className="font-mono text-xs text-muted-foreground">
                  手机: {c.phoneNumber || "-"}
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>作品</span>
                <PortfolioLink value={c.portfolioLink} />
              </div>
              {role >= 2 && (
                isEditing ? (
                  <div className="pt-1 text-sm text-muted-foreground">
                    正在编辑面评
                  </div>
                ) : c.evalStatus === "pending" ? (
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className={neutralButtonClass}
                      onClick={() => startEdit(c, "pass")}
                    >
                      修改
                    </Button>
                  </div>
                ) : c.evalStatus === "approved" ? (
                  null
                ) : c.evalStatus === "rejected" ? (
                  null
                ) : isRejected ? (
                  <div className="pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className={passButtonClass}
                      onClick={() => startEdit(c, "reopen")}
                    >
                      改为通过
                    </Button>
                  </div>
                ) : (
                  <div className="flex w-fit gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className={passButtonClass}
                      onClick={() => startEdit(c, "pass")}
                    >
                      通过
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className={rejectButtonClass}
                      onClick={() => handleReject(c.userFlowId)}
                      loading={busy}
                    >
                      不通过
                    </Button>
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
      <Dialog
        open={!!editingCandidate}
        onOpenChange={(open) => {
          if (!open) cancelEdit();
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>面评记录</DialogTitle>
            <DialogDescription>
              {editingCandidate
                ? `${editingCandidate.name}（${editingCandidate.studentId ?? "无学号"}）`
                : "填写评价内容，会议链接可选。"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {editingCandidate && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="mb-1 text-xs text-muted-foreground">作品链接</p>
                <PortfolioLink value={editingCandidate.portfolioLink} />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">面评内容</label>
              <Textarea
                placeholder="请输入面评内容..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[160px] resize-y"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">会议链接</label>
              <Input
                placeholder="https://..."
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                className="h-10"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={cancelEdit}>
              取消
            </Button>
            {editingCandidate && editingCandidate.status !== "rejected" && (
              <Button
                variant="outline"
                className={rejectButtonClass}
                onClick={() => handleReject(editingCandidate.userFlowId)}
                loading={loadingId === editingCandidate.userFlowId}
              >
                不通过
              </Button>
            )}
            <Button
              onClick={() => {
                if (!editingCandidate) return;
                return editMode === "reopen"
                  ? handleReopen(editingCandidate.userFlowId)
                  : handlePass(editingCandidate.userFlowId);
              }}
              loading={
                editingCandidate
                  ? loadingId === editingCandidate.userFlowId
                  : false
              }
            >
              提交面评
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
