"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getAllEvaluations,
  approveEvaluation,
  rejectEvaluation,
  returnEvaluation,
} from "@/action/user-flow/evaluation";
import type { InferSelectModel } from "drizzle-orm";
import type { interviewEvaluation } from "@/db/schema";
import originalDayjs from "@/lib/dayjs";
import { externalHref } from "@/lib/link";

export type EvaluationRow = {
  evaluation: Omit<InferSelectModel<typeof interviewEvaluation>, "returnReason"> & {
    returnReason?: string | null;
  };
  meetingLink: string | null;
  portfolioLink: string | null;
  portfolioDescription: string | null;
  applyGroup: string | null;
  scheduleMeetingLink: string | null;
  meetingMinuteLink: string | null;
  authorName: string | null;
  reviewerName: string | null;
  candidateName: string | null;
  candidateStudentId: string | null;
  flowTitle: string | null;
  flowType: string | null;
};

const statusLabel: Record<string, string> = {
  submitted: "待终审",
  returned: "已退回重写",
  approved: "已通过",
  rejected: "不通过",
};

const flowTypeLabel: Record<string, string> = {
  recruitment: "笔试招新",
  recruitment_exemption: "免试招新",
  woc: "WOC/WOD",
  soc: "SOC/SOD",
};

const recommendationLabel: Record<string, string> = {
  passed: "讲师建议通过",
  failed: "讲师建议不通过",
};

const ARCHIVE_PAGE_SIZE = 20;

const InlineLink = ({ label, value }: { label: string; value: string }) => (
  <a
    href={externalHref(value)}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={`${label}：${value}`}
    title={value}
    className="block max-w-full break-all text-sm leading-5 text-blue-600 line-clamp-2 hover:underline dark:text-blue-400"
  >
    {value}
  </a>
);

const ReviewReference = ({
  label,
  value,
  asText = false,
}: {
  label: string;
  value: string | null;
  asText?: boolean;
}) => (
  <div className="min-w-0 space-y-1">
    <p className="text-xs text-muted-foreground">{label}</p>
    {value ? (
      asText ? (
        <p className="block max-w-full break-all text-sm leading-5 line-clamp-2">
          {value}
        </p>
      ) : (
        <InlineLink label={label} value={value} />
      )
    ) : (
      <p className="text-xs text-muted-foreground/70">未提供</p>
    )}
  </div>
);

export const ApprovalsContent = ({
  initialEvaluations,
  initialLoadError = false,
}: {
  initialEvaluations?: EvaluationRow[];
  initialLoadError?: boolean;
}) => {
  const [evaluations, setEvaluations] = useState<EvaluationRow[]>(
    Array.isArray(initialEvaluations) ? initialEvaluations : [],
  );
  const [loading, setLoading] = useState(!initialEvaluations);
  const [loadError, setLoadError] = useState(initialLoadError);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveQuery, setArchiveQuery] = useState("");
  const [archiveFlowType, setArchiveFlowType] = useState("all");
  const [archiveDecision, setArchiveDecision] = useState("all");
  const [archivePage, setArchivePage] = useState(1);
  const [returnTarget, setReturnTarget] = useState<number | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [returnError, setReturnError] = useState<string | null>(null);

  const fetchEvaluations = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getAllEvaluations();
      setEvaluations(Array.isArray(data) ? data : []);
    } catch {
      setLoadError(true);
      toast.error("加载审批列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialEvaluations) {
      fetchEvaluations();
    }
  }, [initialEvaluations]);

  const handleApprove = async (id: number) => {
    setActionLoading(id);
    try {
      await approveEvaluation(id);
      toast.success("面评已通过");
      await fetchEvaluations();
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
      toast.success("面评已判定不通过");
      await fetchEvaluations();
    } catch {
      toast.error("操作失败");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReturn = async () => {
    if (!returnTarget) return;
    if (!returnReason.trim()) {
      setReturnError("请填写退回理由");
      return;
    }
    setActionLoading(returnTarget);
    try {
      await returnEvaluation(returnTarget, returnReason);
      toast.success("面评已退回，已提醒讲师重写");
      setReturnTarget(null);
      setReturnReason("");
      setReturnError(null);
      await fetchEvaluations();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground text-sm">加载中...</p>;
  }

  if (loadError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">审批列表加载失败</p>
            <p className="text-sm text-muted-foreground">
              请确认生产数据库迁移已执行完成后重试。
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={fetchEvaluations}>
            重试
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (evaluations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">暂无待审批的面评</p>
      </div>
    );
  }

  const pending = evaluations.filter((e) => e.evaluation.status === "submitted");
  const archived = evaluations.filter((e) => e.evaluation.status !== "submitted");
  const normalizedArchiveQuery = archiveQuery.trim().toLocaleLowerCase();
  const filteredArchived = archived.filter((row) => {
    const matchesQuery = !normalizedArchiveQuery || [
      row.candidateName,
      row.candidateStudentId,
      row.authorName,
      row.reviewerName,
      row.flowTitle,
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedArchiveQuery));
    const matchesFlow =
      archiveFlowType === "all" || row.flowType === archiveFlowType;
    const matchesDecision =
      archiveDecision === "all" || row.evaluation.status === archiveDecision;
    return matchesQuery && matchesFlow && matchesDecision;
  });
  const archiveTotalPages = Math.max(
    1,
    Math.ceil(filteredArchived.length / ARCHIVE_PAGE_SIZE),
  );
  const archivePageRows = filteredArchived.slice(
    (archivePage - 1) * ARCHIVE_PAGE_SIZE,
    archivePage * ARCHIVE_PAGE_SIZE,
  );
  const displayed = showArchived ? archivePageRows : pending;

  if (loading) {
    return <p className="text-muted-foreground text-sm">加载中...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
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

      {showArchived && (
        <div className="space-y-2 border-y py-3">
            <p className="text-xs text-muted-foreground">
            已处理的面评会保留在这里；退回重写的记录会在讲师重新提交后回到待审批列表。
          </p>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]">
          <Input
            value={archiveQuery}
            onChange={(event) => {
              setArchiveQuery(event.target.value);
              setArchivePage(1);
            }}
            placeholder="搜索候选人、学号、面评人、审批人或流程"
            aria-label="搜索归档面评"
          />
          <Select
            value={archiveFlowType}
            onValueChange={(value) => {
              setArchiveFlowType(value);
              setArchivePage(1);
            }}
          >
            <SelectTrigger aria-label="筛选归档流程">
              <SelectValue placeholder="全部流程" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部流程</SelectItem>
              <SelectItem value="recruitment_exemption">免试招新</SelectItem>
              <SelectItem value="woc">WOC/WOD</SelectItem>
              <SelectItem value="soc">SOC/SOD</SelectItem>
              <SelectItem value="recruitment">笔试招新</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={archiveDecision}
            onValueChange={(value) => {
              setArchiveDecision(value);
              setArchivePage(1);
            }}
          >
            <SelectTrigger aria-label="筛选最终结果">
              <SelectValue placeholder="全部结果" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部结果</SelectItem>
              <SelectItem value="approved">通过</SelectItem>
              <SelectItem value="rejected">不通过</SelectItem>
              <SelectItem value="returned">退回重写</SelectItem>
            </SelectContent>
          </Select>
          </div>
        </div>
      )}

      {displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p className="text-sm">
            {showArchived ? "暂无已归档面评" : "暂无待审批的面评"}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4">
          {displayed.map((row) => (
            <Card key={row.evaluation.id}>
              <CardHeader className="space-y-3 pb-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <CardTitle className="min-w-0 text-base leading-6 sm:text-sm">
                    {row.candidateName ?? "未知用户"}
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      · {row.candidateStudentId ?? "-"}
                    </span>
                  </CardTitle>
                  <Badge
                    className="w-fit shrink-0"
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
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {row.flowTitle && (
                    <Badge variant="outline" className="text-xs">
                      {flowTypeLabel[row.flowType ?? ""] ?? row.flowType}
                    </Badge>
                  )}
                  {row.flowTitle && <span>{row.flowTitle}</span>}
                  {row.evaluation.recommendation && (
                    <Badge variant="outline" className="text-xs">
                      {recommendationLabel[row.evaluation.recommendation]}
                    </Badge>
                  )}
                  <span className="ml-auto inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
                    <span className="text-muted-foreground">投递组别</span>
                    {row.applyGroup ? (
                      <span className="min-w-0 break-words font-medium text-foreground">
                        {row.applyGroup}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/70">未提供</span>
                    )}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-6 whitespace-pre-wrap">
                  {row.evaluation.content}
                </p>
                {row.evaluation.status === "returned" && row.evaluation.returnReason && (
                  <div className="border-l-2 border-orange-500/60 pl-3 text-sm leading-6 text-orange-700 dark:text-orange-300">
                    退回理由：{row.evaluation.returnReason}
                  </div>
                )}
                <div className="grid gap-x-8 gap-y-3 pt-1 sm:grid-cols-3">
                  <ReviewReference label="作品链接" value={row.portfolioLink} />
                  <ReviewReference label="会议链接" value={row.scheduleMeetingLink} />
                  <ReviewReference label="妙记链接" value={row.meetingMinuteLink ?? row.meetingLink} />
                </div>
                <div className="space-y-1 pt-1">
                  <p className="text-xs text-muted-foreground">作品简介</p>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/85">
                    {row.portfolioDescription || "未提供"}
                  </p>
                </div>
                <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>面评人：{row.authorName ?? "历史记录未保存面评人"}</span>
                    <span className="hidden sm:inline">·</span>
                    {row.evaluation.status !== "submitted" && (
                      <>
                        <span>
                          审批人：{row.reviewerName ?? "历史记录未保存审批人"}
                        </span>
                        <span className="hidden sm:inline">·</span>
                      </>
                    )}
                    <span>
                      {row.evaluation.status === "submitted"
                        ? "提交"
                        : row.evaluation.status === "returned"
                          ? "退回"
                          : "终审"}
                      {" "}
                      {originalDayjs(
                        row.evaluation.status === "submitted"
                          ? row.evaluation.createdAt
                          : row.evaluation.updatedAt,
                      ).format("YYYY-MM-DD HH:mm")}
                    </span>
                  </div>
                  {row.evaluation.status === "submitted" && (
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                      <Button
                        size="sm"
                        className="h-10 w-full border-emerald-600 bg-emerald-600 text-white hover:border-emerald-700 hover:bg-emerald-700 sm:h-8 sm:w-auto dark:border-emerald-900 dark:bg-emerald-900 dark:hover:border-emerald-800 dark:hover:bg-emerald-800"
                        onClick={() => handleApprove(row.evaluation.id)}
                        loading={actionLoading === row.evaluation.id}
                      >
                        通过
                      </Button>
                      <Button
                        size="sm"
                        className="h-10 w-full border-rose-600 bg-rose-600 text-white hover:border-rose-700 hover:bg-rose-700 sm:h-8 sm:w-auto dark:border-rose-900 dark:bg-rose-900 dark:hover:border-rose-800 dark:hover:bg-rose-800"
                        onClick={() => handleReject(row.evaluation.id)}
                        loading={actionLoading === row.evaluation.id}
                      >
                        不通过
                      </Button>
                      <Button
                        size="sm"
                        className="h-10 w-full border-amber-700 bg-amber-700 text-white hover:border-amber-800 hover:bg-amber-800 sm:h-8 sm:w-auto dark:border-amber-900 dark:bg-amber-900 dark:hover:border-amber-800 dark:hover:bg-amber-800"
                        onClick={() => {
                          setReturnTarget(row.evaluation.id);
                          setReturnReason("");
                          setReturnError(null);
                        }}
                        loading={actionLoading === row.evaluation.id}
                      >
                        退回重写
                      </Button>
                    </div>
                  )}
                  {row.evaluation.status === "approved" && (
                    <span className="text-xs text-muted-foreground">已归档，不可修改</span>
                  )}
                  {row.evaluation.status === "rejected" && (
                    <span className="text-xs text-muted-foreground">已归档，不可修改</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {showArchived && filteredArchived.length > ARCHIVE_PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm text-muted-foreground">
          <span>
            第 {archivePage} / {archiveTotalPages} 页，共 {filteredArchived.length} 条
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={archivePage === 1}
              onClick={() => setArchivePage((page) => Math.max(1, page - 1))}
            >
              上一页
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={archivePage === archiveTotalPages}
              onClick={() => setArchivePage((page) => Math.min(archiveTotalPages, page + 1))}
            >
              下一页
            </Button>
          </div>
        </div>
      )}
      <Dialog open={returnTarget !== null} onOpenChange={(open) => !open && setReturnTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>退回面评重写</DialogTitle>
            <DialogDescription>请填写具体原因，讲师会收到飞书机器人提醒。</DialogDescription>
          </DialogHeader>
          <Textarea
            value={returnReason}
            onChange={(event) => { setReturnReason(event.target.value); setReturnError(null); }}
            placeholder="例如：面评过于简短，请补充面试表现和录用判断依据。"
            className="min-h-28"
            aria-label="退回理由"
          />
          {returnError && <p className="text-sm text-destructive" role="alert">{returnError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnTarget(null)}>取消</Button>
            <Button onClick={handleReturn} loading={returnTarget !== null && actionLoading === returnTarget}>退回并通知</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
