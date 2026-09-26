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

/**
 * What kind of state this is, for anything that needs to reason about the
 * column beyond its colour: `neutral` states are the ones a candidate simply
 * passes through, `attention` ones need somebody to intervene, and the rest are
 * outcomes.
 */
export type InterviewStatusTone =
  | "neutral"
  | "attention"
  | "success"
  | "danger"
  | "muted";

/**
 * One tint recipe, one entry per hue. Every badge is built from this table, so
 * a new status cannot drift into its own hand-matched light/dark pair.
 *
 * Text keeps a `-700` value in light and a `-300` value in dark against the same
 * 10% fill, which is what makes eight hues read as one set rather than eight
 * separate decisions.
 */
const TINT = {
  slate:
    "border-slate-500/30 bg-slate-500/10 text-slate-800 dark:text-slate-300",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300",
  amber:
    "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  /* Amber and orange sit next to each other, so "needs rework" is separated by
     weight rather than by hue: a denser fill reads as escalated. */
  orange:
    "border-orange-500/40 bg-orange-500/15 text-orange-800 dark:text-orange-300",
  violet:
    "border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-300",
  emerald:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  rose: "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300",
} as const;

export type InterviewStatusMeta = {
  label: string;
  description: string;
  tone: InterviewStatusTone;
  badgeClassName: string;
};

export const interviewStatusMeta: Record<
  InterviewStatusKey,
  InterviewStatusMeta
> = {
  unscheduled: {
    label: "待预约",
    tone: "neutral",
    badgeClassName: TINT.slate,
    description: "还没有预约面试时间。",
  },
  scheduled: {
    label: "待面试",
    tone: "neutral",
    badgeClassName: TINT.sky,
    description: "面试已预约，等待面试结束。",
  },
  ready: {
    label: "待评估",
    tone: "neutral",
    badgeClassName: TINT.amber,
    description: "面试已结束，等待提交面评。",
  },
  returned: {
    label: "退回重写",
    tone: "attention",
    badgeClassName: TINT.orange,
    description: "面评被管理员退回，需要重写。",
  },
  pending: {
    label: "待终审",
    tone: "attention",
    badgeClassName: TINT.violet,
    description: "面评已提交，等待管理员终审。",
  },
  accepted: {
    label: "已通过",
    tone: "success",
    badgeClassName: TINT.emerald,
    description: "已通过终审。",
  },
  rejected: {
    label: "不通过",
    tone: "danger",
    badgeClassName: TINT.rose,
    description: "未通过。",
  },
  withdrawn: {
    label: "已退回",
    tone: "muted",
    // The dashed border and empty fill already mute this; the label still has to
    // clear 4.5:1, which `text-muted-foreground` does not in light mode.
    badgeClassName:
      "border-dashed border-muted-foreground/40 bg-transparent text-foreground/70 dark:text-muted-foreground",
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
  /**
   * The row's next step in the flow. Never a destructive action: 退回 is an
   * escape hatch, not a recommended next move, so naming it here would
   * overstate it (and on a phone it became a full-width destructive bar).
   */
  primary: InterviewAction | null;
  /** Everything else, listed in the row's menu. */
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
    if (candidate.canEditEvaluation) {
      return {
        status,
        primary: {
          id: "evaluation",
          label: candidate.evalStatus === "returned" ? "重写面评" : "修改",
        },
        overflow: [],
        lockedReason: null,
      };
    }
    // "待面评审批" / "等待讲师重写面评" only restated the badge next to them, so
    // the action column stays empty instead of repeating it in words.
    return { status, primary: null, overflow: [], lockedReason: null };
  }

  if (candidate.evalStatus === "approved" || candidate.evalStatus === "rejected") {
    // Decided and archived. "已归档" here just restated the badge next to it.
    return { status, primary: null, overflow: [], lockedReason: null };
  }

  if (isRejected) {
    return { status, primary: null, overflow: [], lockedReason: null };
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
