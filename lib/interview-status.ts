/**
 * Single source of truth for interview candidate status and per-row actions.
 *
 * `components/recruitment/evaluationTable.tsx` used to derive the row badge
 * (`evalStatusLabel`) and the toolbar summary (`getCandidateStatusKey`) from two
 * different models, so the numbers disagreed with the badges next to them. The
 * desktop table and the mobile cards also each re-implemented the same action
 * gates, which is how the two views drifted apart. Both now read from here.
 */

export type InterviewStatusKey =
  | "unscheduled"
  | "scheduled"
  | "ready"
  | "returned"
  | "pending"
  | "accepted"
  | "rejected"
  | "withdrawn";

/** Flow order — drives chip order, sort order and the empty-state copy. */
export const INTERVIEW_STATUS_ORDER: InterviewStatusKey[] = [
  "unscheduled",
  "scheduled",
  "ready",
  "returned",
  "pending",
  "accepted",
  "rejected",
  "withdrawn",
];

export const interviewStatusMeta: Record<
  InterviewStatusKey,
  { label: string; className: string; description: string }
> = {
  unscheduled: {
    label: "待预约",
    className:
      "border-slate-600/30 bg-slate-50 text-slate-700 dark:border-slate-400/30 dark:bg-slate-400/10 dark:text-slate-300",
    description: "还没有预约面试时间。",
  },
  scheduled: {
    label: "待面试",
    className:
      "border-sky-600/30 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300",
    description: "面试已预约，等待面试结束。",
  },
  ready: {
    label: "待评估",
    className:
      "border-amber-600/30 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300",
    description: "面试已结束，等待提交面评。",
  },
  returned: {
    label: "退回重写",
    className:
      "border-orange-600/30 bg-orange-50 text-orange-700 dark:border-orange-400/30 dark:bg-orange-400/10 dark:text-orange-300",
    description: "面评被管理员退回，需要重写。",
  },
  pending: {
    label: "待终审",
    className:
      "border-violet-600/30 bg-violet-50 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-300",
    description: "面评已提交，等待管理员终审。",
  },
  accepted: {
    label: "已通过",
    className:
      "border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300",
    description: "已通过终审。",
  },
  rejected: {
    label: "不通过",
    className:
      "border-rose-600/30 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300",
    description: "未通过。",
  },
  withdrawn: {
    label: "已退回",
    className:
      "border-dashed border-muted-foreground/40 bg-muted text-muted-foreground",
    description: "报名已被退回，候选人需重新报名。",
  },
};

/** The subset of a candidate row these helpers read. */
export type InterviewCandidateLike = {
  status: string | null;
  evalStatus: string | null;
  scheduleMeetingLink: string | null;
  scheduleMeetingStatus: string | null;
  scheduleStartsAt: Date | string | null;
  scheduleOrganizerName?: string | null;
  /* whether the current user may manage this row's schedule (server-computed) */
  canManageSchedule: boolean;
  /* whether the current user may write/edit this row's evaluation */
  canEditEvaluation: boolean;
};

/**
 * Resolve the row's status. The branch order is the priority order and must not
 * be reordered: a withdrawn candidate that was also approved still reads as
 * withdrawn, and an explicit evaluation status outranks the flow status.
 */
export function getInterviewStatus(
  candidate: InterviewCandidateLike,
): InterviewStatusKey {
  const { evalStatus, status } = candidate;
  if (status === "withdrawn") return "withdrawn";
  if (evalStatus === "approved" || status === "passed") return "accepted";
  if (evalStatus === "rejected") return "rejected";
  if (evalStatus === "submitted") return "pending";
  if (evalStatus === "returned") return "returned";
  if (status === "failed") return "rejected";
  if (!candidate.scheduleMeetingLink) return "unscheduled";
  if (candidate.scheduleMeetingStatus !== "ended") return "scheduled";
  return "ready";
}

export type InterviewStatusCounts = Record<InterviewStatusKey, number> & {
  total: number;
};

/**
 * Count every candidate into exactly one bucket. `total` always equals the
 * input length, so the chips can never disagree with the list.
 */
export function countInterviewStatuses(
  candidates: InterviewCandidateLike[],
): InterviewStatusCounts {
  const counts = {
    unscheduled: 0,
    scheduled: 0,
    ready: 0,
    returned: 0,
    pending: 0,
    accepted: 0,
    rejected: 0,
    withdrawn: 0,
    total: candidates.length,
  };
  for (const candidate of candidates) {
    counts[getInterviewStatus(candidate)] += 1;
  }
  return counts;
}

export type InterviewActionId =
  | "schedule"
  | "cancel-schedule"
  | "confirm-ended"
  | "evaluation"
  | "return";

export type InterviewAction = {
  id: InterviewActionId;
  label: string;
  destructive?: boolean;
};

export type InterviewActionPlan = {
  status: InterviewStatusKey;
  /** The one action worth showing as a button. */
  primary: InterviewAction | null;
  /** Everything else, folded into the `⋯` menu. */
  overflow: InterviewAction[];
  /** Why nothing is actionable here, phrased for the current user. */
  lockedReason: string | null;
};

function toTime(value: Date | string | null): number | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}

function organizerPhrase(candidate: InterviewCandidateLike) {
  const name = candidate.scheduleOrganizerName;
  return name ? `由 ${name} 预约，仅其本人可操作` : "仅预约讲师可操作";
}

/**
 * Resolve the actions available on one row, mirroring the server-side gates in
 * `action/user-flow/evaluation.ts` (`canManageSchedule` / `canEditEvaluation`)
 * and the schedule timing rules.
 *
 * `now` is milliseconds; pass `null` before it has been measured so that
 * time-dependent actions stay hidden rather than flashing in.
 */
export function deriveInterviewActions(
  candidate: InterviewCandidateLike,
  role: number,
  now: number | null,
): InterviewActionPlan {
  const status = getInterviewStatus(candidate);
  const isWithdrawn = candidate.status === "withdrawn";
  const isRejected = candidate.status === "failed";
  const scheduleEnded = candidate.scheduleMeetingStatus === "ended";
  const hasSchedule = Boolean(candidate.scheduleMeetingLink);
  const startsAt = toTime(candidate.scheduleStartsAt);
  const canConfirmEnded =
    now !== null && hasSchedule && !scheduleEnded && (startsAt ?? Infinity) <= now;
  const canEvaluate = scheduleEnded || candidate.evalStatus !== null || isRejected;
  const canManageSchedule =
    !isWithdrawn && (!hasSchedule || candidate.canManageSchedule);
  const canReturn = !isWithdrawn && (!hasSchedule || candidate.canManageSchedule || role >= 3);
  const canSubmitEvaluation =
    candidate.canEditEvaluation && (!hasSchedule || candidate.canManageSchedule);

  if (!canEvaluate) {
    const scheduleAction: InterviewAction = {
      id: "schedule",
      label: hasSchedule ? "改约" : "预约",
    };
    const primary = canConfirmEnded && canManageSchedule
      ? { id: "confirm-ended" as const, label: "确认结束" }
      : canManageSchedule
        ? scheduleAction
        : null;
    const overflow: InterviewAction[] = [];
    if (canManageSchedule && primary?.id !== "schedule") {
      overflow.push(scheduleAction);
    }
    if (canManageSchedule && hasSchedule) {
      overflow.push({
        id: "cancel-schedule",
        label: "取消预约",
        destructive: true,
      });
    }
    if (canReturn) {
      overflow.push({ id: "return", label: "退回", destructive: true });
    }
    // A withdrawn row has nothing to do and the badge already says why, so it
    // gets no explanation. Everyone else who is locked out gets told who owns
    // the row instead of the old bare "等待预约讲师面试".
    const lockedReason =
      !primary && overflow.length === 0 && role < 3 && !isWithdrawn
        ? organizerPhrase(candidate)
        : null;
    return { status, primary, overflow, lockedReason };
  }

  if (candidate.evalStatus === "submitted" || candidate.evalStatus === "returned") {
    const returned = candidate.evalStatus === "returned";
    if (candidate.canEditEvaluation) {
      return {
        status,
        primary: {
          id: "evaluation",
          label: returned ? "重写面评" : "修改",
        },
        overflow: [],
        lockedReason: null,
      };
    }
    return {
      status,
      primary: null,
      overflow: [],
      lockedReason: returned
        ? role >= 3
          ? "等待讲师重写面评"
          : "面评已退回，等待讲师重写"
        : role >= 3
          ? "待面评审批"
          : "面评已提交，等待管理员终审",
    };
  }

  if (candidate.evalStatus === "approved" || candidate.evalStatus === "rejected") {
    return {
      status,
      primary: null,
      overflow: [],
      lockedReason: "已归档",
    };
  }

  if (isRejected) {
    return { status, primary: null, overflow: [], lockedReason: "已结束" };
  }

  // Interview finished, nothing written yet. Rescheduling stays reachable even
  // when the evaluation itself is not this user's to write.
  return {
    status,
    primary: canSubmitEvaluation
      ? { id: "evaluation", label: "填写面评" }
      : null,
    overflow: canManageSchedule ? [{ id: "schedule", label: "改约" }] : [],
    lockedReason: canSubmitEvaluation
      ? null
      : candidate.scheduleOrganizerName
        ? `由 ${candidate.scheduleOrganizerName} 预约，待其提交面评`
        : "等待预约讲师提交面评",
  };
}
