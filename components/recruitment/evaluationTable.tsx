"use client";

import { useState } from "react";
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

type Candidate = {
  userFlowId: number;
  uid: number;
  name: string;
  studentId: string | null;
  phoneNumber: string | null;
  status: string;
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
  "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary";
const rejectButtonClass =
  "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 hover:text-destructive";

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
      <div className="rounded-md border bg-card p-8 text-center text-muted-foreground text-sm">
        暂无可评估的候选人
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <div className="hidden md:block overflow-x-auto">
        <Table className="table-fixed min-w-[760px]">
          {role >= 3 ? (
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[15%]" />
              <col className="w-[16%]" />
              <col className="w-[15%]" />
              <col className="w-[40%]" />
            </colgroup>
          ) : (
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[22%]" />
              <col className="w-[18%]" />
              <col className="w-[42%]" />
            </colgroup>
          )}
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="whitespace-nowrap px-4 py-3">学号</TableHead>
              <TableHead className="whitespace-nowrap px-4 py-3">姓名</TableHead>
              {role >= 3 && (
                <TableHead className="whitespace-nowrap px-4 py-3">手机号</TableHead>
              )}
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
                <TableRow key={c.userFlowId}>
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
                    {evalStatusBadge(c.evalStatus, c.status)}
                  </TableCell>
                  {role >= 2 && (
                    <TableCell className="whitespace-normal px-4 py-4">
                      {isEditing ? (
                        <div className="flex max-w-xl flex-col gap-2">
                          <Textarea
                            placeholder="请输入面评内容..."
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="min-h-[80px]"
                          />
                          <Input
                            placeholder="会议链接"
                            value={meetingLink}
                            onChange={(e) => setMeetingLink(e.target.value)}
                            className="h-8 text-xs"
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              onClick={() =>
                                editMode === "reopen"
                                  ? handleReopen(c.userFlowId)
                                  : handlePass(c.userFlowId)
                              }
                              loading={busy}
                            >
                              提交面评
                            </Button>
                            {!isRejected && (
                              <Button
                                size="sm"
                                variant="outline"
                                className={rejectButtonClass}
                                onClick={() => handleReject(c.userFlowId)}
                                loading={busy}
                              >
                                不通过
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={cancelEdit}>
                              取消
                            </Button>
                          </div>
                        </div>
                      ) : c.evalStatus === "pending" ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="shadow-xs"
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
                        <div className="flex flex-wrap gap-2">
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
            <div key={c.userFlowId} className="flex flex-col gap-3 p-4">
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
              {role >= 2 && (
                isEditing ? (
                  <div className="space-y-2 pt-1">
                    <Textarea
                      placeholder="请输入面评内容..."
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="min-h-[80px]"
                    />
                    <Input
                      placeholder="会议链接"
                      value={meetingLink}
                      onChange={(e) => setMeetingLink(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          editMode === "reopen"
                            ? handleReopen(c.userFlowId)
                            : handlePass(c.userFlowId)
                        }
                        loading={busy}
                      >
                        提交面评
                      </Button>
                      {!isRejected && (
                        <Button
                          size="sm"
                        variant="outline"
                        className={rejectButtonClass}
                          onClick={() => handleReject(c.userFlowId)}
                          loading={busy}
                        >
                          不通过
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={cancelEdit}>
                        取消
                      </Button>
                    </div>
                  </div>
                ) : c.evalStatus === "pending" ? (
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => startEdit(c, "pass")}>
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
                  <div className="flex gap-2 pt-1">
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
    </div>
  );
};
