"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink, Eye, FileText, FileX2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateCandidateApplyGroup } from "@/action/user-flow/apply-group";
import { createEvaluation } from "@/action/user-flow/evaluation";
import {
  cancelInterviewSchedule,
  confirmInterviewScheduleEnded,
  createInterviewSchedule,
  previewInterviewScheduleEmail,
  returnInterviewCandidate,
} from "@/action/user-flow/interviewSchedule";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { externalHref } from "@/lib/link";
import { FeishuOAuthStatus } from "@/components/feishu-oauth-status";
import {
  getInterviewMeetingRoom,
  interviewMeetingRooms,
} from "@/lib/interview-meeting-rooms";

type Candidate = {
  userFlowId: number;
  uid: number;
  name: string;
  studentId: string | null;
  qq: string | null;
  status: string | null;
  portfolioLink: string | null;
  portfolioDescription: string | null;
  applyGroup: string | null;
  evalId: number | null;
  evalContent: string | null;
  evalMeetingLink: string | null;
  evalRecommendation: "passed" | "failed" | null;
  evalStatus: string | null;
  evalAuthorId: number | null;
  canEditEvaluation: boolean;
  canManageSchedule: boolean;
  scheduleId: number | null;
  scheduleOrganizerName: string | null;
  scheduleMeetingLink: string | null;
  scheduleLink: string | null;
  scheduleMeetingMinuteLink: string | null;
  scheduleLocation: string | null;
  scheduleMeetingRoomId: string | null;
  scheduleStartsAt: Date | string | null;
  scheduleEndsAt: Date | string | null;
  scheduleStatus: string | null;
  scheduleMeetingStatus: string | null;
  scheduleMeetingEndedAt: Date | string | null;
};

const evalStatusLabel = (
  evalStatus: string | null,
  flowStatus: string | null,
  scheduleMeetingLink: string | null,
  scheduleEnded: boolean,
) => {
  if (evalStatus === "approved" || flowStatus === "passed") {
    return {
      text: "已通过",
      className:
        "border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300",
    };
  }
  if (evalStatus === "rejected") {
    return {
      text: "不通过",
      className:
        "border-rose-600/30 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300",
    };
  }
  if (evalStatus === "submitted") {
    return {
      text: "待审核",
      className:
        "border-amber-600/30 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300",
    };
  }
  if (flowStatus === "failed") {
    return {
      text: "不通过",
      className:
        "border-rose-600/30 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300",
    };
  }
  if (!scheduleMeetingLink) {
    return {
      text: "待预约",
      className:
        "border-sky-600/30 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300",
    };
  }
  if (!scheduleEnded) {
    return {
      text: "待面试",
      className:
        "border-cyan-600/30 bg-cyan-50 text-cyan-700 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-300",
    };
  }
  return {
    text: "待评估",
    className:
      "border-orange-600/30 bg-orange-50 text-orange-700 dark:border-orange-400/30 dark:bg-orange-400/10 dark:text-orange-300",
  };
};

const EvalStatusText = ({
  evalStatus,
  flowStatus,
  scheduleMeetingLink,
  scheduleEnded,
}: {
  evalStatus: string | null;
  flowStatus: string | null;
  scheduleMeetingLink: string | null;
  scheduleEnded: boolean;
}) => {
  const status = evalStatusLabel(
    evalStatus,
    flowStatus,
    scheduleMeetingLink,
    scheduleEnded,
  );
  return (
    <div className="min-w-0 space-y-1">
      <span
        className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-medium ${status.className}`}
      >
        {status.text}
      </span>
    </div>
  );
};



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
  { key: "evalRejected", label: "不通过" },
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

function CandidateIdentity({
  name,
  studentId,
  qq,
}: {
  name: string;
  studentId: string | null;
  qq: string | null;
}) {
  const meta = [studentId || null, qq ? `QQ ${qq}` : null].filter(Boolean);

  return (
    <div className="min-w-0 space-y-0.5">
      <p className="truncate text-sm font-medium leading-5 text-foreground" title={name}>
        {name}
      </p>
      {meta.length > 0 && (
        <p className="truncate text-xs tabular-nums text-muted-foreground" title={meta.join(" · ")}>
          {meta.join(" · ")}
        </p>
      )}
    </div>
  );
}

const ApplyGroupText = ({
  value,
  editable,
  onEdit,
  editLabel,
}: {
  value: string | null;
  editable?: boolean;
  onEdit?: () => void;
  editLabel?: string;
}) => {
  if (editable && onEdit) {
    return (
      <button
        type="button"
        aria-label={editLabel ?? "修改投递组别"}
        title={value ? `投递组别：${value}，点击修改` : "未填写，点击标记投递组别"}
        className="truncate text-sm text-foreground/85 transition-colors hover:text-foreground hover:underline"
        onClick={onEdit}
      >
        {value || <span className="text-muted-foreground">未填写</span>}
      </button>
    );
  }
  return (
    <span className="truncate text-sm text-foreground/85" title={value ?? undefined}>
      {value || "未填写"}
    </span>
  );
};

const PortfolioDetails = ({
  value,
  description,
}: {
  value: string | null;
  description?: string | null;
}) => {
  const href = externalHref(value ?? "");
  return (
    <div className="min-w-0 space-y-1">
      {value && href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-1 text-sm text-primary hover:underline"
        >
          <span className="truncate">{value}</span>
          <ExternalLink className="size-3.5 shrink-0" />
        </a>
      ) : (
        <span className="text-sm text-muted-foreground">未提供</span>
      )}
      {description && (
        <p className="max-w-[28rem] whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
};

const PortfolioLink = ({
  value,
  description,
  onOpen,
}: {
  value: string | null;
  description?: string | null;
  onOpen: () => void;
}) => {
  if (!value && !description) {
    return (
      <span className="inline-flex h-8 items-center gap-2 text-xs text-muted-foreground">
        <span className="flex size-6 items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/20">
          <FileX2 className="size-3.5 opacity-70" />
        </span>
        未提供
      </span>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onOpen}
      className="group h-8 max-w-full gap-2 border-border/70 bg-transparent px-2 text-xs font-medium text-foreground/80 shadow-none hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
    >
      <span className="flex size-5 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
        <FileText className="size-3.5" />
      </span>
      <span className="truncate">查看作品</span>
      <Eye className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </Button>
  );
};
const ScheduleInfo = ({ candidate }: { candidate: Candidate }) => {
  if (!candidate.scheduleMeetingLink) {
    return <span className="text-sm text-muted-foreground">未预约</span>;
  }

  const startsAt = formatScheduleTime(candidate.scheduleStartsAt);
  const endsAt = formatScheduleTime(candidate.scheduleEndsAt);
  const timeRange = startsAt
    ? `${startsAt}${endsAt ? ` – ${endsAt}` : ""}`
    : endsAt;
  const hasDistinctScheduleLink =
    Boolean(candidate.scheduleLink) &&
    candidate.scheduleLink !== candidate.scheduleMeetingLink;

  return (
    <div className="min-w-0 space-y-0.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
        <a
          href={externalHref(candidate.scheduleMeetingLink)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-foreground/80 hover:text-foreground"
        >
          留档会议
          <ExternalLink className="size-3.5 shrink-0 opacity-50" />
        </a>
        {hasDistinctScheduleLink && candidate.scheduleLink && (
          <a
            href={externalHref(candidate.scheduleLink)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            日程
            <ExternalLink className="size-3.5 shrink-0 opacity-50" />
          </a>
        )}
      </div>
      {timeRange && (
        <p className="text-xs tabular-nums text-muted-foreground">{timeRange}</p>
      )}
      {candidate.scheduleLocation && (
        <p
          className="truncate text-xs text-muted-foreground"
          title={candidate.scheduleLocation}
        >
          {candidate.scheduleLocation}
        </p>
      )}
      {candidate.scheduleOrganizerName && (
        <p className="truncate text-xs text-muted-foreground" title={`预约讲师：${candidate.scheduleOrganizerName}`}>
          预约讲师：{candidate.scheduleOrganizerName}
        </p>
      )}
    </div>
  );
};

function ActionButton({
  children,
  disabled,
  onClick,
  tone = "default",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  tone?: "default" | "primary" | "danger";
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary hover:text-primary"
      : tone === "danger"
        ? "text-destructive hover:text-destructive"
        : "text-foreground hover:text-foreground";

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      className={`h-8 px-2 text-sm font-normal shadow-none ${toneClass}`}
    >
      {children}
    </Button>
  );
}

export const EvaluationTable = ({
  candidates,
  groupOptions,
  role,
  targetUserFlowId,
  targetScheduleId,
  onRefresh,
}: {
  candidates: Candidate[];
  groupOptions: string[];
  role: number;
  targetUserFlowId?: number;
  targetScheduleId?: number;
  onRefresh: () => void;
}) => {
  const safeCandidates = Array.isArray(candidates) ? candidates : [];
  const [evaluatingId, setEvaluatingId] = useState<number | null>(null);
  const [portfolioCandidate, setPortfolioCandidate] = useState<Candidate | null>(null);
  const [schedulingId, setSchedulingId] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [recommendation, setRecommendation] = useState<"passed" | "failed">("passed");
  const [scheduleStartsAt, setScheduleStartsAt] = useState("");
  const [scheduleEndsAt, setScheduleEndsAt] = useState("");
  const [scheduleLocation, setScheduleLocation] = useState("");
  const [scheduleMeetingRoomId, setScheduleMeetingRoomId] = useState("");
  const [scheduleNote, setScheduleNote] = useState("");
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [emailPreviewLoading, setEmailPreviewLoading] = useState(false);
  const [emailPreview, setEmailPreview] = useState<{
    subject: string;
    to: string;
    html: string;
  } | null>(null);
  const [feishuBound, setFeishuBound] = useState<boolean | null>(null);
  const [feishuStatusFailed, setFeishuStatusFailed] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [groupEditingCandidate, setGroupEditingCandidate] = useState<Candidate | null>(null);
  const [groupDraft, setGroupDraft] = useState("");
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [applyGroupFilter, setApplyGroupFilter] = useState<string | null>(null);

  useEffect(() => {
    // Reset the filter when the flow changes so a stale group value
    // cannot hide every candidate under the new flow.
    setApplyGroupFilter(null);
  }, [groupOptions]);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  const startEdit = (c: Candidate) => {
    setEvaluatingId(c.userFlowId);
    setContent(c.evalContent ?? "");
    setMeetingLink(c.scheduleMeetingMinuteLink ?? c.evalMeetingLink ?? "");
    setRecommendation(c.evalRecommendation ?? "passed");
    setEvaluationError(null);
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
    setScheduleLocation(c.scheduleLocation ?? "");
    setScheduleMeetingRoomId(c.scheduleMeetingRoomId ?? "");
    setScheduleNote("");
  };

  const cancelEdit = () => {
    setEvaluatingId(null);
    setContent("");
    setMeetingLink("");
    setRecommendation("passed");
    setEvaluationError(null);
  };

  const cancelSchedule = () => {
    setSchedulingId(null);
    setScheduleStartsAt("");
    setScheduleEndsAt("");
    setScheduleLocation("");
    setScheduleMeetingRoomId("");
    setScheduleNote("");
    setScheduleLoading(false);
    setFeishuBound(null);
    setFeishuStatusFailed(false);
  };

  const canEditApplyGroup = role >= 2 && groupOptions.length > 0;
  const safeGroupOptions = Array.isArray(groupOptions) ? groupOptions : [];
  const visibleCandidates = applyGroupFilter
    ? safeCandidates.filter((candidate) => candidate.applyGroup === applyGroupFilter)
    : safeCandidates;

  const startGroupEdit = (c: Candidate) => {
    setGroupEditingCandidate(c);
    setGroupDraft(c.applyGroup ?? "");
    setGroupError(null);
  };

  const cancelGroupEdit = () => {
    setGroupEditingCandidate(null);
    setGroupDraft("");
    setGroupError(null);
    setGroupSaving(false);
  };

  const handleSaveCandidateGroup = async () => {
    if (!groupEditingCandidate) return;
    if (!groupDraft) {
      setGroupError("请选择投递组别");
      return;
    }
    setGroupError(null);
    setGroupSaving(true);
    try {
      const result = await updateCandidateApplyGroup(
        groupEditingCandidate.userFlowId,
        groupDraft,
      );
      if (!result.success) {
        setGroupError(result.error?.message ?? "保存失败");
        return;
      }
      cancelGroupEdit();
      toast.success("投递组别已更新");
      onRefresh();
    } catch {
      toast.error("保存失败");
    } finally {
      setGroupSaving(false);
    }
  };

  const editingCandidate =
    safeCandidates.find((c) => c.userFlowId === evaluatingId) ?? null;
  const schedulingCandidate =
    safeCandidates.find((c) => c.userFlowId === schedulingId) ?? null;

  const handlePass = async (userFlowId: number) => {
    if (!content.trim()) {
      setEvaluationError("请填写面评内容后再提交。");
      return;
    }
    setLoadingId(userFlowId);
    try {
      const result = await createEvaluation(
        userFlowId,
        content,
        recommendation,
        meetingLink,
      );
      if (!result.success) {
        const message = result.error?.message ?? "提交失败";
        setEvaluationError(message);
        toast.error(message);
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

  const handleConfirmScheduleEnded = async (candidate: Candidate) => {
    if (!candidate.scheduleId) return;
    setLoadingId(candidate.userFlowId);
    try {
      const result = await confirmInterviewScheduleEnded(candidate.scheduleId);
      if (!result.success) {
        toast.error(result.error?.message ?? "确认面试结束失败");
        return;
      }
      toast.success("已确认面试结束，可以提交面评");
      onRefresh();
    } catch {
      toast.error("确认面试结束失败");
    } finally {
      setLoadingId(null);
    }
  };

  const handleCreateSchedule = async (userFlowId: number) => {
    if (!scheduleStartsAt || !scheduleEndsAt) {
      toast.error("请填写面试开始和结束时间");
      return;
    }
    if (feishuBound !== true) {
      toast.error(
        feishuStatusFailed
          ? "飞书授权状态检查失败，请先在上方重新绑定飞书后再发起日程。"
          : "请先绑定飞书账号后再发起面试日程。",
      );
      return;
    }

    setScheduleLoading(true);
    try {
      const result = await createInterviewSchedule({
        userFlowId,
        startsAt: scheduleStartsAt,
        endsAt: scheduleEndsAt,
        location: scheduleLocation,
        meetingRoomId: scheduleMeetingRoomId || undefined,
        note: scheduleNote,
      });
      if (!result.success) {
        toast.error(result.error?.message ?? "飞书日程创建失败");
        return;
      }
      if (result.data.emailWarning) {
        toast.warning(result.data.emailWarning);
      } else {
        toast.success("线下面试日程已创建，预约邮件已发送");
      }
      cancelSchedule();
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "飞书日程创建失败");
    } finally {
      setScheduleLoading(false);
    }
  };

  const handlePreviewScheduleEmail = async (userFlowId: number) => {
    if (!scheduleStartsAt || !scheduleEndsAt) {
      toast.error("请先填写面试开始和结束时间");
      return;
    }

    setEmailPreviewLoading(true);
    try {
      const result = await previewInterviewScheduleEmail({
        userFlowId,
        startsAt: scheduleStartsAt,
        endsAt: scheduleEndsAt,
        location: scheduleLocation,
        meetingRoomId: scheduleMeetingRoomId || undefined,
        note: scheduleNote,
      });
      if (!result.success) {
        toast.error(result.error?.message ?? "邮件预览生成失败");
        return;
      }
      setEmailPreview(result.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "邮件预览生成失败");
    } finally {
      setEmailPreviewLoading(false);
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
      if (result.emailWarning) {
        toast.warning(result.emailWarning);
      } else {
        toast.success("面试预约已取消，取消邮件已发送");
      }
      cancelSchedule();
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "取消预约失败");
    } finally {
      setLoadingId(null);
    }
  };

  const handleReturnCandidate = async (candidate: Candidate) => {
    setLoadingId(candidate.userFlowId);
    try {
      const result = await returnInterviewCandidate(candidate.userFlowId);
      if (!result.success) {
        toast.error(result.error?.message ?? "退回失败");
        return;
      }
      toast.success("已退回该报名，候选人可以重新选择流程");
      cancelSchedule();
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "退回失败");
    } finally {
      setLoadingId(null);
    }
  };

  if (safeCandidates.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-10 text-center">
        <p className="text-sm font-medium">暂无可评估的候选人</p>
        <p className="mt-1 text-xs text-muted-foreground">
          当前流程还没有可处理的报名人员。
        </p>
      </div>
    );
  }

  const statusCounts = new Map<string, number>();
  for (const candidate of visibleCandidates) {
    const key = getCandidateStatusKey(candidate);
    statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
  }
  const isTargetCandidate = (candidate: Candidate) =>
    Boolean(
      (targetUserFlowId && candidate.userFlowId === targetUserFlowId) ||
        (targetScheduleId && candidate.scheduleId === targetScheduleId),
    );

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border bg-card">
      <div className="hidden items-center border-b border-border/60 py-3 lg:flex">
        <div className={`${role >= 2 ? "w-[22%]" : "w-[26%]"} min-w-0 px-4`}>
          <p className="text-sm font-medium">面评候选人</p>
          <p className="text-xs text-muted-foreground">
            预约面试后提交面评结果
          </p>
        </div>
        {safeGroupOptions.length > 0 && (
          <div className={`${role >= 2 ? "w-[12%]" : "w-[14%]"} pl-3`}>
            <Select
              value={applyGroupFilter ?? "all"}
              onValueChange={(value) =>
                setApplyGroupFilter(value === "all" ? null : value)
              }
            >
              <SelectTrigger
                className="h-8 w-full text-xs"
                aria-label="按投递组别筛选候选人"
              >
                <SelectValue placeholder="全部组别" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部组别</SelectItem>
                {safeGroupOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <p className="ml-auto pr-4 text-xs text-muted-foreground">
          {summaryItems
            .map(
              (item) =>
                `${item.label} ${statusCounts.get(item.key) ?? 0}`,
            )
            .join(" · ")}
        </p>
      </div>
      <div className="flex flex-col gap-2 border-b border-border/60 px-4 py-3 lg:hidden">
        <div className="space-y-1">
          <p className="text-sm font-medium">面评候选人</p>
          <p className="text-xs text-muted-foreground">
            预约面试后提交面评结果
          </p>
        </div>
        {safeGroupOptions.length > 0 && (
          <Select
            value={applyGroupFilter ?? "all"}
            onValueChange={(value) =>
              setApplyGroupFilter(value === "all" ? null : value)
            }
          >
            <SelectTrigger
              className="h-8 w-full text-xs"
              aria-label="按投递组别筛选候选人"
            >
              <SelectValue placeholder="全部组别" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部组别</SelectItem>
              {safeGroupOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-xs text-muted-foreground">
          {summaryItems
            .map(
              (item) =>
                `${item.label} ${statusCounts.get(item.key) ?? 0}`,
            )
            .join(" · ")}
        </p>
      </div>
      <div className="hidden min-w-0 lg:block">
        <Table className="w-full table-fixed" containerClassName="overflow-x-auto">
          {role >= 2 ? (
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[12%]" />
              <col className="w-[19%]" />
              <col className="w-[17%]" />
              <col className="w-[13%]" />
              <col className="w-[17%]" />
            </colgroup>
          ) : (
            <colgroup>
              <col className="w-[26%]" />
              <col className="w-[14%]" />
              <col className="w-[23%]" />
              <col className="w-[19%]" />
              <col className="w-[18%]" />
            </colgroup>
          )}
          <TableHeader>
            <TableRow className="border-b border-border/60 hover:bg-transparent">
              <TableHead className="h-10 px-4 text-xs font-medium text-muted-foreground">候选人</TableHead>
              <TableHead className="h-10 px-3 text-xs font-medium text-muted-foreground">投递组别</TableHead>
              <TableHead className="h-10 px-3 text-xs font-medium text-muted-foreground">作品</TableHead>
              <TableHead className="h-10 px-3 text-xs font-medium text-muted-foreground">会议</TableHead>
              <TableHead className="h-10 px-3 text-xs font-medium text-muted-foreground">状态</TableHead>
              {role >= 2 && (
                <TableHead className="h-10 px-4 text-right text-xs font-medium text-muted-foreground">操作</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleCandidates.length === 0 && (
              <TableRow className="border-b-0">
                <TableCell
                  colSpan={role >= 2 ? 6 : 5}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  该组别暂无候选人
                </TableCell>
              </TableRow>
            )}
            {visibleCandidates.map((c) => {
              const isEditing = evaluatingId === c.userFlowId;
              const isRejected = c.status === "failed";
              const busy = loadingId === c.userFlowId;
              const scheduleEnded = c.scheduleMeetingStatus === "ended";
              const canConfirmScheduleEnded =
                now !== null &&
                Boolean(c.scheduleMeetingLink) &&
                !scheduleEnded &&
                (getTime(c.scheduleStartsAt) ?? Number.POSITIVE_INFINITY) <= now;
              const canEvaluate = scheduleEnded || c.evalStatus !== null || isRejected;
              const canManageSchedule = !c.scheduleMeetingLink || c.canManageSchedule;
              const canReturnCandidate =
                !c.scheduleMeetingLink || c.canManageSchedule || role >= 3;
              const canSubmitEvaluation =
                c.canEditEvaluation && (!c.scheduleMeetingLink || c.canManageSchedule);

              return (
                <TableRow
                  key={c.userFlowId}
                  id={
                    isTargetCandidate(c)
                      ? `user-flow-${c.userFlowId}-desktop`
                      : undefined
                  }
                  className={
                    isTargetCandidate(c)
                      ? "scroll-mt-24 bg-muted/40 hover:bg-muted/40"
                      : "border-b border-border/40 last:border-0 hover:bg-muted/15"
                  }
                >
                  <TableCell className="px-4 py-3 align-middle">
                    <CandidateIdentity
                      name={c.name}
                      studentId={c.studentId}
                      qq={c.qq}
                    />
                  </TableCell>
                  <TableCell className="px-3 py-3 align-middle">
                    <ApplyGroupText
                      value={c.applyGroup}
                      editable={canEditApplyGroup}
                      onEdit={() => startGroupEdit(c)}
                      editLabel={`修改${c.name}的投递组别`}
                    />
                  </TableCell>
                  <TableCell className="px-3 py-3 align-middle">
                    <PortfolioLink
                      value={c.portfolioLink}
                      description={c.portfolioDescription}
                      onOpen={() => setPortfolioCandidate(c)}
                    />
                  </TableCell>
                  <TableCell className="px-3 py-3 align-middle">
                    <ScheduleInfo candidate={c} />
                  </TableCell>
                  <TableCell className="px-3 py-3 align-middle">
                    <EvalStatusText evalStatus={c.evalStatus} flowStatus={c.status} scheduleMeetingLink={c.scheduleMeetingLink} scheduleEnded={scheduleEnded} />
                  </TableCell>
                  {role >= 2 && (
                    <TableCell className="px-4 py-3 align-middle text-right">
                      {!canEvaluate ? (
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {canManageSchedule && (
                            <ActionButton onClick={() => startSchedule(c)}>
                              {c.scheduleMeetingLink ? "改约" : "预约"}
                            </ActionButton>
                          )}
                          {c.scheduleMeetingLink && canManageSchedule && (
                            <ActionButton
                              disabled={busy}
                              onClick={() => handleCancelSchedule(c)}
                            >
                              {busy ? "处理中" : "取消"}
                            </ActionButton>
                          )}
                          {canReturnCandidate && (
                            <ActionButton
                              disabled={busy}
                              onClick={() => handleReturnCandidate(c)}
                            >
                              {busy ? "处理中" : "退回"}
                            </ActionButton>
                          )}
                          {canConfirmScheduleEnded && canManageSchedule && (
                            <ActionButton
                              disabled={busy}
                              onClick={() => handleConfirmScheduleEnded(c)}
                            >
                              {busy ? "处理中" : "确认结束"}
                            </ActionButton>
                          )}
                          {!canManageSchedule && role < 3 && (
                            <span className="text-sm text-muted-foreground">
                              等待预约讲师面试
                            </span>
                          )}
                        </div>
                      ) : isEditing ? (
                        <span className="text-sm text-muted-foreground">正在编辑…</span>
                      ) : c.evalStatus === "submitted" ? (
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {c.canEditEvaluation ? (
                            <ActionButton onClick={() => startEdit(c)}>修改</ActionButton>
                          ) : role >= 3 ? (
                            <span className="text-sm text-muted-foreground">待面评审批</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              预约讲师已提交面评
                            </span>
                          )}
                        </div>
                      ) : c.evalStatus === "approved" || c.evalStatus === "rejected" ? (
                        <span className="text-sm text-muted-foreground">已归档</span>
                      ) : isRejected ? (
                        <span className="text-sm text-muted-foreground">已结束</span>
                      ) : (
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {canManageSchedule && (
                            <ActionButton onClick={() => startSchedule(c)}>改约</ActionButton>
                          )}
                          {canSubmitEvaluation ? (
                            <ActionButton tone="primary" onClick={() => startEdit(c)}>填写面评</ActionButton>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              等待预约讲师提交面评
                            </span>
                          )}
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
      <div className="flex flex-col divide-y divide-border lg:hidden">
        {visibleCandidates.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            该组别暂无候选人
          </div>
        ) : (
          visibleCandidates.map((c) => {
          const isEditing = evaluatingId === c.userFlowId;
          const isRejected = c.status === "failed";
          const busy = loadingId === c.userFlowId;
          const scheduleEnded = c.scheduleMeetingStatus === "ended";
          const canConfirmScheduleEnded =
            now !== null &&
            Boolean(c.scheduleMeetingLink) &&
            !scheduleEnded &&
            (getTime(c.scheduleStartsAt) ?? Number.POSITIVE_INFINITY) <= now;
          const canEvaluate = scheduleEnded || c.evalStatus !== null || isRejected;
          const canManageSchedule = !c.scheduleMeetingLink || c.canManageSchedule;
          const canReturnCandidate =
            !c.scheduleMeetingLink || c.canManageSchedule || role >= 3;
          const canSubmitEvaluation =
            c.canEditEvaluation && (!c.scheduleMeetingLink || c.canManageSchedule);

          return (
            <div
              key={c.userFlowId}
              id={
                isTargetCandidate(c)
                  ? `user-flow-${c.userFlowId}-mobile`
                  : undefined
              }
              className={
                isTargetCandidate(c)
                  ? "flex scroll-mt-24 flex-col gap-3 bg-muted/30 p-4"
                  : "flex flex-col gap-3 p-4 transition-colors hover:bg-muted/40"
              }
            >
              <div className="flex items-start justify-between gap-3">
                <CandidateIdentity
                  name={c.name}
                  studentId={c.studentId}
                  qq={c.qq}
                />
                <EvalStatusText evalStatus={c.evalStatus} flowStatus={c.status} scheduleMeetingLink={c.scheduleMeetingLink} scheduleEnded={scheduleEnded} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ApplyGroupText
                  value={c.applyGroup}
                  editable={canEditApplyGroup}
                  onEdit={() => startGroupEdit(c)}
                  editLabel={`修改${c.name}的投递组别`}
                />
                <PortfolioLink
                  value={c.portfolioLink}
                  description={c.portfolioDescription}
                  onOpen={() => setPortfolioCandidate(c)}
                />
              </div>
              <ScheduleInfo candidate={c} />
              {role >= 2 && (
                !canEvaluate ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {canManageSchedule && (
                      <ActionButton onClick={() => startSchedule(c)}>
                        {c.scheduleMeetingLink ? "改约" : "预约"}
                      </ActionButton>
                    )}
                    {c.scheduleMeetingLink && canManageSchedule && (
                      <ActionButton
                        disabled={busy}
                        onClick={() => handleCancelSchedule(c)}
                      >
                        {busy ? "处理中" : "取消"}
                      </ActionButton>
                    )}
                    {canReturnCandidate && (
                      <ActionButton
                        disabled={busy}
                        onClick={() => handleReturnCandidate(c)}
                      >
                        {busy ? "处理中" : "退回"}
                      </ActionButton>
                    )}
                    {canConfirmScheduleEnded && canManageSchedule && (
                      <ActionButton
                        disabled={busy}
                        onClick={() => handleConfirmScheduleEnded(c)}
                      >
                        {busy ? "处理中" : "确认结束"}
                      </ActionButton>
                    )}
                    {!canManageSchedule && role < 3 && (
                      <span className="text-sm text-muted-foreground">
                        等待预约讲师面试
                      </span>
                    )}
                  </div>
                ) : isEditing ? (
                  <div className="pt-1 text-sm text-muted-foreground">
                    正在编辑面评
                  </div>
                ) : c.evalStatus === "submitted" ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {c.canEditEvaluation ? (
                      <ActionButton onClick={() => startEdit(c)}>修改</ActionButton>
                    ) : role >= 3 ? (
                      <span className="text-sm text-muted-foreground">待面评审批</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        预约讲师已提交面评
                      </span>
                    )}
                  </div>
                ) : c.evalStatus === "approved" || c.evalStatus === "rejected" ? (
                  <div className="pt-1 text-sm text-muted-foreground">已归档</div>
                ) : isRejected ? (
                  <div className="pt-1 text-sm text-muted-foreground">已结束</div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {canManageSchedule && (
                      <ActionButton onClick={() => startSchedule(c)}>改约</ActionButton>
                    )}
                    {canSubmitEvaluation ? (
                      <ActionButton tone="primary" onClick={() => startEdit(c)}>填写面评</ActionButton>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        等待预约讲师提交面评
                      </span>
                    )}
                  </div>
                )
              )}
            </div>
          );
          })
        )}
      </div>
      <Dialog
        open={Boolean(portfolioCandidate)}
        onOpenChange={(open) => {
          if (!open) setPortfolioCandidate(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>作品信息</DialogTitle>
            <DialogDescription>
              {portfolioCandidate
                ? `${portfolioCandidate.name} 的作品链接和简介`
                : "查看候选人提交的作品信息。"}
            </DialogDescription>
          </DialogHeader>
          {portfolioCandidate && (
            <div className="rounded-lg border bg-muted/20 p-4">
              <PortfolioDetails
                value={portfolioCandidate.portfolioLink}
                description={portfolioCandidate.portfolioDescription}
              />
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPortfolioCandidate(null)}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
                <PortfolioDetails
                  value={editingCandidate.portfolioLink}
                  description={editingCandidate.portfolioDescription}
                />
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="evaluation-content" className="text-sm font-medium">
                面评内容 <span className="text-destructive">*</span>
              </label>
              <p className="text-xs leading-5 text-muted-foreground">
                面评内容必填，讲师建议不能替代面评正文。
              </p>
              <Textarea
                id="evaluation-content"
                placeholder="请输入面评内容..."
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  if (evaluationError) setEvaluationError(null);
                }}
                aria-invalid={Boolean(evaluationError)}
                aria-describedby={
                  evaluationError ? "evaluation-content-error" : undefined
                }
                required
                className="min-h-[160px] resize-y"
              />
              {evaluationError && (
                <p id="evaluation-content-error" role="alert" className="text-sm text-destructive">
                  {evaluationError}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">讲师建议</label>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="讲师建议">
                <Button
                  type="button"
                  variant={recommendation === "passed" ? "default" : "outline"}
                  aria-pressed={recommendation === "passed"}
                  onClick={() => setRecommendation("passed")}
                >
                  建议通过
                </Button>
                <Button
                  type="button"
                  variant={recommendation === "failed" ? "destructive" : "outline"}
                  aria-pressed={recommendation === "failed"}
                  onClick={() => setRecommendation("failed")}
                >
                  建议不通过
                </Button>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                此为讲师意见，最终结果由管理员结合面评审核决定。
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">妙记链接</label>
              {meetingLink ? (
                <a
                  href={externalHref(meetingLink)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 text-sm text-foreground hover:text-primary hover:underline"
                >
                  <span className="truncate">查看妙记</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">
                  飞书生成妙记后会自动同步到这里。
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="mt-2 border-t pt-4 sm:items-center sm:justify-between">
            <div className="min-h-9">
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={cancelEdit}>
                取消
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!editingCandidate) return;
                  return handlePass(editingCandidate.userFlowId);
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
            <DialogTitle>安排线下面试</DialogTitle>
            <DialogDescription>
              {schedulingCandidate
                ? `${schedulingCandidate.name}（${schedulingCandidate.studentId ?? "无学号"}）`
                : "创建内部飞书日程和留档会议，并发送线下面试预约邮件。"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <FeishuOAuthStatus
              role={role}
              onStatusChange={(status, meta) => {
                setFeishuBound(status?.bound ?? null);
                setFeishuStatusFailed(meta.failed);
              }}
            />
            {feishuBound === false && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-900 dark:text-amber-100">
                发起飞书会议和日程前需要先绑定飞书授权。点击上方「绑定飞书」完成授权后，再填写时间并发起日程。
              </p>
            )}
            <p className="text-xs leading-5 text-muted-foreground">
              飞书会议仅用于录制与妙记留档；候选人邮件只包含线下面试时间、地点和备注。
            </p>
            {feishuStatusFailed && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
                飞书授权状态检查失败。可尝试重新绑定，或刷新页面后再试。
              </p>
            )}
            {schedulingCandidate?.scheduleMeetingLink && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="mb-1 text-xs text-muted-foreground">当前留档会议</p>
                <ScheduleInfo candidate={schedulingCandidate} />
              </div>
            )}
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
              <label className="text-sm font-medium">会议室</label>
              <Select
                value={scheduleMeetingRoomId || "none"}
                onValueChange={(value) => {
                  const roomId = value === "none" ? "" : value;
                  setScheduleMeetingRoomId(roomId);
                  const room = getInterviewMeetingRoom(roomId);
                  setScheduleLocation(room?.name ?? "");
                }}
              >
                <SelectTrigger className="h-10" aria-label="会议室">
                  <SelectValue placeholder="不预约会议室" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不预约会议室</SelectItem>
                  {interviewMeetingRooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs leading-5 text-muted-foreground">
                选择后会在飞书日程中预约该会议室，冲突时无法创建日程。
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">地点</label>
              <Input
                placeholder="例如：仙林校区大学生活动中心 101"
                value={scheduleLocation}
                onChange={(e) => setScheduleLocation(e.target.value)}
                className="h-10"
                disabled={Boolean(scheduleMeetingRoomId)}
              />
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
              {schedulingCandidate?.scheduleMeetingLink && schedulingCandidate.canManageSchedule && (
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
              variant="outline"
              onClick={() => {
                if (!schedulingCandidate) return;
                return handlePreviewScheduleEmail(schedulingCandidate.userFlowId);
              }}
              loading={emailPreviewLoading}
            >
              预览邮件
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!schedulingCandidate) return;
                return handleCreateSchedule(schedulingCandidate.userFlowId);
              }}
              loading={scheduleLoading}
              disabled={feishuBound !== true}
              title={
                feishuBound === true
                  ? undefined
                  : "请先绑定飞书账号后再发起面试日程"
              }
            >
              {schedulingCandidate?.scheduleMeetingLink ? "保存改约" : "创建线下面试日程"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(groupEditingCandidate)}
        onOpenChange={(open) => {
          if (!open) cancelGroupEdit();
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>修改投递组别</DialogTitle>
            <DialogDescription>
              {groupEditingCandidate
                ? `${groupEditingCandidate.name}（${groupEditingCandidate.studentId ?? "无学号"}）`
                : "为候选人标记或修改投递组别。"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="candidate-apply-group">投递组别</Label>
            <Select
              value={groupDraft}
              onValueChange={(value) => {
                setGroupDraft(value);
                if (groupError) setGroupError(null);
              }}
            >
              <SelectTrigger
                id="candidate-apply-group"
                className="w-full text-left [&_[data-slot=select-value]]:flex-1 [&_[data-slot=select-value]]:justify-start [&_[data-slot=select-value]]:text-left"
              >
                <SelectValue placeholder="选择投递组别" />
              </SelectTrigger>
              <SelectContent>
                {groupOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {groupError && (
              <p role="alert" className="text-sm text-destructive">
                {groupError}
              </p>
            )}
          </div>
          <DialogFooter className="mt-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={cancelGroupEdit}
              disabled={groupSaving}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleSaveCandidateGroup}
              loading={groupSaving}
              disabled={groupSaving}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(emailPreview)}
        onOpenChange={(open) => {
          if (!open) setEmailPreview(null);
        }}
      >
        <DialogContent className="flex max-h-[85dvh] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-4 overflow-hidden sm:max-w-3xl">
          <DialogHeader className="shrink-0">
            <DialogTitle>预约邮件预览</DialogTitle>
            <DialogDescription className="line-clamp-2">
              {emailPreview
                ? `收件人：${emailPreview.to}；主题：${emailPreview.subject}`
                : "预览将使用当前填写的时间和备注。"}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted/20">
            <iframe
              title="预约邮件预览"
              srcDoc={emailPreview?.html ?? ""}
              sandbox=""
              className="h-[min(55dvh,520px)] w-full bg-white"
            />
          </div>
          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" onClick={() => setEmailPreview(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
