"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getAllEvaluations,
  approveEvaluation,
  rejectEvaluation,
  reopenEvaluation,
} from "@/action/user-flow/evaluation";
import { InferSelectModel } from "drizzle-orm";
import { interviewEvaluation } from "@/db/schema";
import originalDayjs from "@/lib/dayjs";

type EvaluationRow = {
  evaluation: InferSelectModel<typeof interviewEvaluation>;
  meetingLink: string | null;
  authorName: string | null;
  candidateName: string | null;
  candidateStudentId: string | null;
  flowTitle: string | null;
  flowType: string | null;
};

const statusLabel: Record<string, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已驳回",
};

const flowTypeLabel: Record<string, string> = {
  recruitment: "招新",
  recruitment_exemption: "招新免试",
  woc: "WOC",
  soc: "SOC",
};

export const ApprovalsContent = () => {
  const [evaluations, setEvaluations] = useState<EvaluationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const fetchEvaluations = async () => {
    try {
      const data = await getAllEvaluations();
      setEvaluations(data);
    } catch {
      toast.error("加载审批列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvaluations();
  }, []);

  const handleApprove = async (id: number) => {
    setActionLoading(id);
    try {
      await approveEvaluation(id);
      toast.success("面评已通过");
      setEvaluations((prev) =>
        prev.map((e) =>
          e.evaluation.id === id
            ? { ...e, evaluation: { ...e.evaluation, status: "approved" } }
            : e,
        ),
      );
    } catch {
      toast.error("操作失败");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: number) => {
    setActionLoading(id);
    try {
      await rejectEvaluation(id);
      toast.success("面评已驳回");
      setEvaluations((prev) =>
        prev.map((e) =>
          e.evaluation.id === id
            ? { ...e, evaluation: { ...e.evaluation, status: "rejected" } }
            : e,
        ),
      );
    } catch {
      toast.error("操作失败");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReopen = async (id: number) => {
    setActionLoading(id);
    try {
      await reopenEvaluation(id);
      toast.success("已撤销驳回");
      setEvaluations((prev) =>
        prev.map((e) =>
          e.evaluation.id === id
            ? { ...e, evaluation: { ...e.evaluation, status: "pending" } }
            : e,
        ),
      );
    } catch {
      toast.error("操作失败");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground text-sm">加载中...</p>;
  }

  if (evaluations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">暂无待审批的面评</p>
      </div>
    );
  }

  const pending = evaluations.filter((e) => e.evaluation.status === "pending");
  const archived = evaluations.filter((e) => e.evaluation.status !== "pending");
  const displayed = showArchived ? archived : pending;

  if (loading) {
    return <p className="text-muted-foreground text-sm">加载中...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          共 {pending.length} 条待审批
        </p>
        {(archived.length > 0 || showArchived) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? "返回待审批" : `已归档 (${archived.length})`}
          </Button>
        )}
      </div>

      {displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p className="text-sm">
            {showArchived ? "暂无已归档面评" : "暂无待审批的面评"}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {displayed.map((row) => (
            <Card key={row.evaluation.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">
                    {row.candidateName ?? "未知用户"}
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      · {row.candidateStudentId ?? "-"}
                    </span>
                  </CardTitle>
                  <Badge
                    variant={
                      row.evaluation.status === "approved"
                        ? "default"
                        : row.evaluation.status === "rejected"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {statusLabel[row.evaluation.status] ?? row.evaluation.status}
                  </Badge>
                </div>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  {row.flowTitle && (
                    <Badge variant="outline" className="text-xs">
                      {flowTypeLabel[row.flowType ?? ""] ?? row.flowType}
                    </Badge>
                  )}
                  {row.flowTitle && <span>{row.flowTitle}</span>}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">
                  {row.evaluation.content}
                </p>
                {row.meetingLink && (
                  <a
                    href={row.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline break-all"
                  >
                    {row.meetingLink}
                  </a>
                )}
                <div className="flex items-center justify-between mt-3">
                  <div className="text-xs text-muted-foreground">
                    {row.authorName && <span>评价人：{row.authorName}</span>}
                    <span className="mx-2">·</span>
                    <span>
                      {originalDayjs(row.evaluation.createdAt).format(
                        "YYYY-MM-DD HH:mm",
                      )}
                    </span>
                  </div>
                  {row.evaluation.status === "pending" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(row.evaluation.id)}
                        loading={actionLoading === row.evaluation.id}
                      >
                        通过
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleReject(row.evaluation.id)}
                        loading={actionLoading === row.evaluation.id}
                      >
                        驳回
                      </Button>
                    </div>
                  )}
                  {row.evaluation.status === "approved" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleReject(row.evaluation.id)}
                      loading={actionLoading === row.evaluation.id}
                    >
                      撤销通过
                    </Button>
                  )}
                  {row.evaluation.status === "rejected" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleReopen(row.evaluation.id)}
                      loading={actionLoading === row.evaluation.id}
                    >
                      撤销驳回
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
