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
  if (evalStatus === "approved") return <Badge>已通过</Badge>;
  if (evalStatus === "rejected") return <Badge variant="destructive">面评已驳回</Badge>;
  if (evalStatus === "pending") return <Badge variant="secondary">待审核</Badge>;
  if (flowStatus === "rejected") return <Badge variant="destructive">不通过</Badge>;
  return <span className="text-muted-foreground text-sm">待评估</span>;
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
    <div className="rounded-md border bg-card">
      <div className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap px-4 py-3">学号</TableHead>
              <TableHead className="whitespace-nowrap px-4 py-3 text-center">姓名</TableHead>
              <TableHead className="whitespace-nowrap px-4 py-3">手机号</TableHead>
              <TableHead className="whitespace-nowrap px-4 py-3 text-center">状态</TableHead>
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
                  <TableCell className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                    {c.studentId}
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-4 py-3 text-center">
                    {c.name}
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-4 py-3">
                    {c.phoneNumber || "-"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-4 py-3 text-center">
                    {evalStatusBadge(c.evalStatus, c.status)}
                  </TableCell>
                  {role >= 2 && (
                    <TableCell className="whitespace-nowrap px-4 py-3">
                      {isEditing ? (
                        <div className="space-y-2">
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
                                variant="destructive"
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
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            待管理员审核
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEdit(c, "pass")}
                          >
                            修改
                          </Button>
                        </div>
                      ) : c.evalStatus === "approved" ? (
                        <span className="text-xs text-muted-foreground max-w-[200px] line-clamp-2">
                          {c.evalContent || ""}
                        </span>
                      ) : c.evalStatus === "rejected" ? (
                        <span className="text-xs text-muted-foreground">
                          面评已驳回
                        </span>
                      ) : isRejected ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(c, "reopen")}
                        >
                          改为通过
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => startEdit(c, "pass")}
                          >
                            通过
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
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
            <div key={c.userFlowId} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-muted-foreground text-xs ml-2 font-mono">
                    {c.studentId}
                  </span>
                </div>
                {evalStatusBadge(c.evalStatus, c.status)}
              </div>
              <div className="text-sm text-muted-foreground">
                手机: {c.phoneNumber || "-"}
              </div>
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
                          variant="destructive"
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
                    <p className="text-xs text-muted-foreground">待管理员审核</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startEdit(c, "pass")}
                    >
                      修改
                    </Button>
                  </div>
                ) : c.evalStatus === "approved" ? (
                  c.evalContent ? (
                    <p className="text-sm text-muted-foreground border-t pt-2 mt-2">
                      {c.evalContent}
                    </p>
                  ) : null
                ) : c.evalStatus === "rejected" ? (
                  <p className="text-xs text-muted-foreground pt-1">面评已驳回</p>
                ) : isRejected ? (
                  <div className="pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => startEdit(c, "reopen")}
                    >
                      改为通过
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={() => startEdit(c, "pass")}
                    >
                      通过
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
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
