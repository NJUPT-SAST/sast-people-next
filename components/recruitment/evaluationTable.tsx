"use client";

import { useEffect, useState } from "react";
import {
  ExternalLink,
} from "lucide-react";
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
  cancelInterviewSchedule,
  createInterviewSchedule,
  generateInterviewMeetingMinute,
} from "@/action/user-flow/interviewSchedule";
import { getCurrentFeishuOAuthStatus, redirectFeishuOAuth } from "@/action/user/feishuOAuth";
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
  status: string | null;
  portfolioLink: string | null;
  evalId: number | null;
  evalContent: string | null;
  evalMeetingLink: string | null;
  evalStatus: string | null;
  scheduleId: number | null;
  scheduleMeetingLink: string | null;
  scheduleMeetingMinuteLink: string | null;
  scheduleStartsAt: Date | string | null;
  scheduleEndsAt: Date | string | null;
  scheduleStatus: string | null;
};

const evalStatusBadge = (
  evalStatus: string | null,
  flowStatus: string | null,
  scheduleMeetingLink: string | null,
  scheduleEnded: boolean,
) => {
  if (evalStatus === "approved") return <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">已通过</Badge>;
  if (evalStatus === "rejected") return <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">面评已驳回</Badge>;
  if (evalStatus === "submitted") return <Badge variant="outline" className="border-chart-3/30 bg-chart-3/10 text-chart-3">待审核</Badge>;
  if (flowStatus === "failed") return <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">不通过</Badge>;
  if (flowStatus === "passed") return <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">已通过</Badge>;
  if (!scheduleMeetingLink) return <Badge variant="outline" className="border-muted-foreground/30 bg-muted text-muted-foreground">待预约</Badge>;
  if (!scheduleEnded) return <Badge variant="outline" className="border-chart-2/30 bg-chart-2/10 text-chart-2">待面试</Badge>;
  return <Badge variant="outline" className="border-muted-foreground/30 bg-muted text-muted-foreground">待评估</Badge>;
};

const actionTextClass =
  "whitespace-nowrap text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50";

const getCandidateStatusKey = (candidate: Candidate) => {
  if (candidate.evalStatus === "approved" || candidate.status === "passed") return "accepted";
  if (candidate.evalStatus === "rejected") return "evalRejected";
  if (candidate.status === "failed") return "rejected";
  if (candidate.evalStatus === "submitted") return "pending";
  return "waiting";
};

const summaryItems = [
  { key: "waiting", label: "待评估" },
  { key: "pending", label: "待审核" },
  { key: "accepted", label: "已通过" },
  { key: "evalRejected", label: "面评驳回" },
  { key: "rejected", label: "不通过" },
];

const formatDateTimeLocal = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
};

const getDefaultScheduleRange = () => {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 30);
  return {
    startsAt: formatDateTimeLocal(start),
    endsAt: formatDateTimeLocal(end),
  };
};

const scheduleFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const formatScheduleTime = (value: Date | string | null) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return scheduleFormatter.format(date).replace(/\//g, "-");
};

const getTime = (value: Date | string | null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
};

function StatusCountPill({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-md border bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground"
    >
      <span>{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

const PortfolioLink = ({ value }: { value: string | null }) => {
  if (!value) return <span className="text-xs text-muted-foreground">未填写</span>;

  return (
    <a
      href={externalHref(value)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1 text-sm text-muted-foreground hover:text-primary hover:underline"
    >
      <span className="truncate">查看作品</span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
    </a>
  );
};

const ScheduleInfo = ({ candidate }: { candidate: Candidate }) => {
  if (!candidate.scheduleMeetingLink) {
    return (
      <span className="text-xs text-muted-foreground">
        未预约
      </span>
    );
  }

  const startsAt = formatScheduleTime(candidate.scheduleStartsAt);
  const endsAt = formatScheduleTime(candidate.scheduleEndsAt);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <a
        href={externalHref(candidate.scheduleMeetingLink)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex max-w-full items-center gap-1.5 text-sm text-foreground hover:text-primary hover:underline"
      >
        <span className="truncate">进入会议</span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      </a>
      {(startsAt || endsAt) && (
        <span className="text-xs tabular-nums text-muted-foreground">
          {startsAt}{endsAt ? ` - ${endsAt}` : ""}
        </span>
      )}
    </div>
  );
};

function ActionTextButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={actionTextClass}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export const EvaluationTable = ({
  candidates,
  role,
  onRefresh,
}: {
  candidates: Candidate[];
  role: number;
  onRefresh: () => void;
}) => {
  const safeCandidates = Array.isArray(candidates) ? candidates : [];
  const [evaluatingId, setEvaluatingId] = useState<number | null>(null);
  const [schedulingId, setSchedulingId] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [scheduleStartsAt, setScheduleStartsAt] = useState("");
  const [scheduleEndsAt, setScheduleEndsAt] = useState("");
  const [scheduleNote, setScheduleNote] = useState("");
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [minuteLoading, setMinuteLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState<"pass" | "reopen" | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [feishuStatus, setFeishuStatus] = useState<{
    bound: boolean;
    accessTokenExpiresAt?: Date | string | null;
  } | null>(null);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  useEffect(() => {
    if (!schedulingId) return;
    let cancelled = false;
    getCurrentFeishuOAuthStatus()
      .then((status) => {
        if (!cancelled) setFeishuStatus(status);
      })
      .catch(() => {
        if (!cancelled) setFeishuStatus({ bound: false });
      });
    return () => {
      cancelled = true;
    };
  }, [schedulingId]);

  const startEdit = (c: Candidate, mode: "pass" | "reopen") => {
    setEvaluatingId(c.userFlowId);
    setEditMode(mode);
    setContent(c.evalContent ?? "");
    setMeetingLink(c.evalMeetingLink ?? c.scheduleMeetingMinuteLink ?? "");
  };

  const startSchedule = (c: Candidate) => {
    setSchedulingId(c.userFlowId);
    const range =
      c.scheduleStartsAt && c.scheduleEndsAt
        ? {
            startsAt: formatDateTimeLocal(new Date(c.scheduleStartsAt)),
            endsAt: formatDateTimeLocal(new Date(c.scheduleEndsAt)),
          }
        : getDefaultScheduleRange();
    setScheduleStartsAt(range.startsAt);
    setScheduleEndsAt(range.endsAt);
    setScheduleNote("");
  };

  const cancelEdit = () => {
    setEvaluatingId(null);
    setContent("");
    setMeetingLink("");
    setEditMode(null);
  };

  const cancelSchedule = () => {
    setSchedulingId(null);
    setFeishuStatus(null);
    setScheduleStartsAt("");
    setScheduleEndsAt("");
    setScheduleNote("");
    setScheduleLoading(false);
  };

  const editingCandidate =
    safeCandidates.find((c) => c.userFlowId === evaluatingId) ?? null;
  const schedulingCandidate =
    safeCandidates.find((c) => c.userFlowId === schedulingId) ?? null;

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

  const handleCreateSchedule = async (userFlowId: number) => {
    if (!scheduleStartsAt || !scheduleEndsAt) {
      toast.error("请填写面试开始和结束时间");
      return;
    }

    setScheduleLoading(true);
    try {
      const result = await createInterviewSchedule({
        userFlowId,
        startsAt: scheduleStartsAt,
        endsAt: scheduleEndsAt,
        note: scheduleNote,
      });
      if (!result.success) {
        toast.error(result.error?.message ?? "飞书日程创建失败");
        return;
      }
      toast.success("飞书会议和日程已创建，预约邮件已发送");
      cancelSchedule();
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "飞书日程创建失败");
    } finally {
      setScheduleLoading(false);
    }
  };

  const handleCancelSchedule = async (candidate: Candidate) => {
    if (!candidate.scheduleId) {
      toast.error("找不到可取消的面试预约");
      return;
    }

    setLoadingId(candidate.userFlowId);
    try {
      const result = await cancelInterviewSchedule(candidate.scheduleId);
      if (!result.success) {
        toast.error(result.error?.message ?? "取消预约失败");
        return;
      }
      toast.success("面试预约已取消");
      cancelSchedule();
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "取消预约失败");
    } finally {
      setLoadingId(null);
    }
  };

  const handleGenerateMeetingMinute = async (candidate: Candidate) => {
    if (!candidate.scheduleId) {
      toast.error("找不到可生成妙记的面试预约");
      return;
    }

    setMinuteLoading(true);
    try {
      const result = await generateInterviewMeetingMinute(candidate.scheduleId);
      if (!result.success) {
        toast.error(result.error?.message ?? "生成妙记失败");
        return;
      }
      setMeetingLink(result.data.docUrl);
      toast.success("妙记链接已生成");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成妙记失败");
    } finally {
      setMinuteLoading(false);
    }
  };

  if (safeCandidates.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center">
        <p className="text-sm font-medium">暂无可评估的候选人</p>
        <p className="mt-1 text-xs text-muted-foreground">
          当前流程还没有可处理的报名人员。
        </p>
      </div>
    );
  }

  const statusCounts = new Map<string, number>();
  for (const candidate of safeCandidates) {
    const key = getCandidateStatusKey(candidate);
    statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col gap-3 border-b bg-muted/20 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">面评候选人</p>
          <p className="text-xs text-muted-foreground">
            先为报名同学预约面试会议，面试结束后再提交面评结果。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {summaryItems.map((item) => (
            <StatusCountPill
              key={item.key}
              label={item.label}
              value={statusCounts.get(item.key) ?? 0}
            />
          ))}
        </div>
      </div>
      <div className="hidden md:block overflow-x-auto">
        <Table className="table-fixed min-w-[840px]">
          {role >= 3 ? (
            <colgroup>
              <col className="w-[12%]" />
              <col className="w-[15%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[20%]" />
              <col className="w-[12%]" />
              <col className="w-[19%]" />
            </colgroup>
          ) : (
            <colgroup>
              <col className="w-[15%]" />
              <col className="w-[20%]" />
              <col className="w-[16%]" />
              <col className="w-[22%]" />
              <col className="w-[12%]" />
              <col className="w-[15%]" />
            </colgroup>
          )}
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="whitespace-nowrap px-4 py-3 text-xs font-medium text-muted-foreground">学号</TableHead>
              <TableHead className="whitespace-nowrap px-4 py-3 text-xs font-medium text-muted-foreground">姓名</TableHead>
              {role >= 3 && (
                <TableHead className="whitespace-nowrap px-4 py-3 text-xs font-medium text-muted-foreground">手机号</TableHead>
              )}
              <TableHead className="whitespace-nowrap px-4 py-3 text-xs font-medium text-muted-foreground">作品</TableHead>
              <TableHead className="whitespace-nowrap px-4 py-3 text-xs font-medium text-muted-foreground">会议</TableHead>
              <TableHead className="whitespace-nowrap px-4 py-3 text-xs font-medium text-muted-foreground">状态</TableHead>
              {role >= 2 && (
                <TableHead className="whitespace-nowrap px-4 py-3 text-xs font-medium text-muted-foreground">操作</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {safeCandidates.map((c) => {
              const isEditing = evaluatingId === c.userFlowId;
              const isRejected = c.status === "failed";
              const busy = loadingId === c.userFlowId;
              const scheduleEnded =
                now !== null &&
                Boolean(c.scheduleMeetingLink) &&
                (getTime(c.scheduleEndsAt) ?? Number.POSITIVE_INFINITY) <= now;
              const canEvaluate = scheduleEnded || c.evalStatus !== null || isRejected;

              return (
                <TableRow key={c.userFlowId} className="hover:bg-muted/30">
                  <TableCell className="whitespace-nowrap px-4 py-3 text-sm tabular-nums">
                    {c.studentId}
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-4 py-3 text-sm font-medium">
                    {c.name}
                  </TableCell>
                  {role >= 3 && (
                    <TableCell className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-muted-foreground">
                      {c.phoneNumber || "-"}
                    </TableCell>
                  )}
                  <TableCell className="whitespace-nowrap px-4 py-3">
                    <PortfolioLink value={c.portfolioLink} />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <ScheduleInfo candidate={c} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-4 py-3">
                    {evalStatusBadge(c.evalStatus, c.status, c.scheduleMeetingLink, scheduleEnded)}
                  </TableCell>
                  {role >= 2 && (
                    <TableCell className="whitespace-nowrap px-4 py-3">
                      {!canEvaluate ? (
                        <div className="flex flex-nowrap items-center gap-3">
                          <ActionTextButton onClick={() => startSchedule(c)}>
                            {c.scheduleMeetingLink ? "改约" : "预约"}
                          </ActionTextButton>
                          {c.scheduleMeetingLink && (
                            <ActionTextButton
                              disabled={busy}
                              onClick={() => handleCancelSchedule(c)}
                            >
                              {busy ? "处理中" : "取消"}
                            </ActionTextButton>
                          )}
                        </div>
                      ) : isEditing ? (
                        <div className="text-sm text-muted-foreground">
                          正在编辑面评
                        </div>
                      ) : c.evalStatus === "submitted" ? (
                        <div className="flex flex-nowrap items-center gap-3">
                          <ActionTextButton onClick={() => startEdit(c, "pass")}>
                            修改
                          </ActionTextButton>
                        </div>
                      ) : c.evalStatus === "approved" ? (
                        <span className="text-sm text-muted-foreground">-</span>
                      ) : c.evalStatus === "rejected" ? (
                        <span className="text-sm text-muted-foreground">-</span>
                      ) : isRejected ? (
                        <ActionTextButton onClick={() => startEdit(c, "reopen")}>
                          改为通过
                        </ActionTextButton>
                      ) : (
                        <div className="flex flex-nowrap items-center gap-3">
                          <ActionTextButton onClick={() => startSchedule(c)}>
                            改约
                          </ActionTextButton>
                          <ActionTextButton onClick={() => startEdit(c, "pass")}>
                            通过
                          </ActionTextButton>
                          <ActionTextButton
                            disabled={busy}
                            onClick={() => handleReject(c.userFlowId)}
                          >
                            {busy ? "处理中" : "不通过"}
                          </ActionTextButton>
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
        {safeCandidates.map((c) => {
          const isEditing = evaluatingId === c.userFlowId;
          const isRejected = c.status === "failed";
          const busy = loadingId === c.userFlowId;
          const scheduleEnded =
            now !== null &&
            Boolean(c.scheduleMeetingLink) &&
            (getTime(c.scheduleEndsAt) ?? Number.POSITIVE_INFINITY) <= now;
          const canEvaluate = scheduleEnded || c.evalStatus !== null || isRejected;

          return (
            <div key={c.userFlowId} className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/40">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <span className="font-semibold">{c.name}</span>
                  <span className="ml-2 text-sm">
                    {c.studentId}
                  </span>
                </div>
                {evalStatusBadge(c.evalStatus, c.status, c.scheduleMeetingLink, scheduleEnded)}
              </div>
              {role >= 3 && (
                <div className="text-sm">
                  手机: {c.phoneNumber || "-"}
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>作品</span>
                <PortfolioLink value={c.portfolioLink} />
              </div>
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="pt-0.5">会议</span>
                <ScheduleInfo candidate={c} />
              </div>
              {role >= 2 && (
                !canEvaluate ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <ActionTextButton onClick={() => startSchedule(c)}>
                      {c.scheduleMeetingLink ? "改约" : "预约"}
                    </ActionTextButton>
                    {c.scheduleMeetingLink && (
                      <ActionTextButton
                        disabled={busy}
                        onClick={() => handleCancelSchedule(c)}
                      >
                        {busy ? "处理中" : "取消"}
                      </ActionTextButton>
                    )}
                  </div>
                ) : isEditing ? (
                  <div className="pt-1 text-sm text-muted-foreground">
                    正在编辑面评
                  </div>
                ) : c.evalStatus === "submitted" ? (
                  <div className="flex items-center gap-2 pt-1">
                    <ActionTextButton onClick={() => startEdit(c, "pass")}>
                      修改
                    </ActionTextButton>
                  </div>
                ) : c.evalStatus === "approved" ? (
                  <div className="pt-1 text-sm text-muted-foreground">已完成</div>
                ) : c.evalStatus === "rejected" ? (
                  <div className="pt-1 text-sm text-muted-foreground">已驳回</div>
                ) : isRejected ? (
                  <div className="pt-1">
                    <ActionTextButton onClick={() => startEdit(c, "reopen")}>
                      改为通过
                    </ActionTextButton>
                  </div>
                ) : (
                  <div className="flex w-fit gap-3">
                    <ActionTextButton onClick={() => startSchedule(c)}>
                      改约
                    </ActionTextButton>
                    <ActionTextButton onClick={() => startEdit(c, "pass")}>
                      通过
                    </ActionTextButton>
                    <ActionTextButton
                      disabled={busy}
                      onClick={() => handleReject(c.userFlowId)}
                    >
                      {busy ? "处理中" : "不通过"}
                    </ActionTextButton>
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
                : "面试结束后填写评价内容和妙记链接。"}
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
              <label className="text-sm font-medium">妙记链接</label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://..."
                  value={meetingLink}
                  onChange={(e) => setMeetingLink(e.target.value)}
                  className="h-10"
                />
                {editingCandidate?.scheduleId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleGenerateMeetingMinute(editingCandidate)}
                    loading={minuteLoading}
                    disabled={
                      minuteLoading ||
                      (getTime(editingCandidate.scheduleEndsAt) ?? Number.POSITIVE_INFINITY) > Date.now()
                    }
                  >
                    生成妙记
                  </Button>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="mt-2 border-t pt-4 sm:items-center sm:justify-between">
            <div className="min-h-9">
              {editingCandidate && editingCandidate.status !== "failed" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleReject(editingCandidate.userFlowId)}
                  loading={loadingId === editingCandidate.userFlowId}
                >
                  不通过
                </Button>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={cancelEdit}>
                取消
              </Button>
              <Button
                type="button"
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
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!schedulingCandidate}
        onOpenChange={(open) => {
          if (!open) cancelSchedule();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>预约面试会议</DialogTitle>
            <DialogDescription>
              {schedulingCandidate
                ? `${schedulingCandidate.name}（${schedulingCandidate.studentId ?? "无学号"}）`
                : "创建飞书会议和日程，并发送预约邮件。"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {schedulingCandidate?.scheduleMeetingLink && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="mb-1 text-xs text-muted-foreground">当前会议</p>
                <ScheduleInfo candidate={schedulingCandidate} />
              </div>
            )}
            <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 p-3">
              <div>
                <p className="text-sm font-medium">飞书授权</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {feishuStatus === null
                    ? "正在检查当前讲师的飞书绑定状态。"
                    : feishuStatus.bound
                      ? "已绑定飞书，日程会以当前讲师的飞书身份发起。"
                      : "未绑定飞书，发起日程前需要先完成授权。"}
                </p>
                {feishuStatus?.accessTokenExpiresAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    授权有效期至 {formatScheduleTime(feishuStatus.accessTokenExpiresAt)}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => redirectFeishuOAuth()}
              >
                {feishuStatus?.bound ? "重新绑定" : "绑定飞书"}
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">开始时间</label>
                <Input
                  type="datetime-local"
                  value={scheduleStartsAt}
                  onChange={(e) => setScheduleStartsAt(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">结束时间</label>
                <Input
                  type="datetime-local"
                  value={scheduleEndsAt}
                  onChange={(e) => setScheduleEndsAt(e.target.value)}
                  className="h-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">预约备注</label>
              <Input
                placeholder="例如：请提前准备作品介绍"
                value={scheduleNote}
                onChange={(e) => setScheduleNote(e.target.value)}
                className="h-10"
              />
            </div>
          </div>
          <DialogFooter className="mt-2 border-t pt-4">
            <div className="flex flex-1 justify-start">
              {schedulingCandidate?.scheduleMeetingLink && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleCancelSchedule(schedulingCandidate)}
                  loading={loadingId === schedulingCandidate.userFlowId}
                >
                  取消预约
                </Button>
              )}
            </div>
            <Button type="button" variant="outline" onClick={cancelSchedule}>
              关闭
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!schedulingCandidate) return;
                return handleCreateSchedule(schedulingCandidate.userFlowId);
              }}
              loading={scheduleLoading}
            >
              {schedulingCandidate?.scheduleMeetingLink ? "保存改约" : "发起飞书日程"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
