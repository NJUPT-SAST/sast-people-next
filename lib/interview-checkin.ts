/**
 * 办公类部门面试现场签到与叫号：状态口径与队列排序的唯一来源。
 *
 * 这里的状态只描述「当场」的物理进度（到场 → 叫号 → 进场 → 结束），
 * 与 `user_flow.progress_status`（流程结论：通过/不通过）正交，两套状态不要互相推导。
 * 控制台、大屏与后续通知都从这里取文案与可执行动作，避免各处各写一份。
 */

export type InterviewCheckinStatusKey =
  | "waiting"
  | "called"
  | "interviewing"
  | "done"
  | "skipped"
  | "cancelled";

/** 大屏与列表的展示顺序：正在进行的在前，其次等待，最后过号/已结束。 */
export const INTERVIEW_CHECKIN_STATUS_ORDER: InterviewCheckinStatusKey[] = [
  "interviewing",
  "called",
  "waiting",
  "skipped",
  "done",
  "cancelled",
];

export type InterviewCheckinStyleTone =
  | "attention"
  | "success"
  | "danger"
  | "muted";

/**
 * 每档状态一份固定配色：同一套 10% 填充 + 深色文字，浅色/深色成对出现，
 * 与 `lib/interview-status.ts` 的徽章保持同一视觉语言。
 */
const TINT = {
  amber:
    "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300",
  violet:
    "border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-300",
  emerald:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  orange:
    "border-orange-500/40 bg-orange-500/15 text-orange-800 dark:text-orange-300",
} as const;

export type InterviewCheckinStatusMeta = {
  label: string;
  /** 大屏上用的短词（列表徽章用 label） */
  displayLabel: string;
  tone: InterviewCheckinStyleTone;
  badgeClassName: string;
  description: string;
};

export const interviewCheckinStatusMeta: Record<
  InterviewCheckinStatusKey,
  InterviewCheckinStatusMeta
> = {
  waiting: {
    label: "等待叫号",
    displayLabel: "等待中",
    tone: "attention",
    badgeClassName: TINT.amber,
    description: "已签到，正在等待叫号。",
  },
  called: {
    label: "已叫号",
    displayLabel: "已叫号",
    tone: "attention",
    badgeClassName: TINT.sky,
    description: "已叫号，请候选人进场。",
  },
  interviewing: {
    label: "面试中",
    displayLabel: "面试中",
    tone: "attention",
    badgeClassName: TINT.violet,
    description: "候选人已进场，面试进行中。",
  },
  done: {
    label: "已完成",
    displayLabel: "已完成",
    tone: "success",
    badgeClassName: TINT.emerald,
    description: "面试已结束。",
  },
  skipped: {
    label: "已过号",
    displayLabel: "已过号",
    tone: "danger",
    badgeClassName: TINT.orange,
    description: "叫号后未到场，可重呼。",
  },
  cancelled: {
    label: "已取消",
    displayLabel: "已取消",
    tone: "muted",
    badgeClassName:
      "border-dashed border-muted-foreground/40 bg-transparent text-foreground/70 dark:text-muted-foreground",
    description: "签到已取消。",
  },
};

export const interviewCheckinStatusLabel = (
  status: InterviewCheckinStatusKey,
): string => interviewCheckinStatusMeta[status].label;

/** 签到方式（存库的 little enum 值）→ 展示名。 */
export const INTERVIEW_CHECKIN_METHOD_LABELS: Record<string, string> = {
  staff_scan: "扫码签到",
  manual: "手动签到",
};

export const interviewCheckinMethodLabel = (method: string): string =>
  INTERVIEW_CHECKIN_METHOD_LABELS[method] ?? method;

/** 面试位状态（存库值）→ 展示名。 */
export const INTERVIEW_STATION_STATUS_LABELS: Record<string, string> = {
  active: "启用",
  paused: "暂停",
};

export const interviewStationStatusLabel = (status: string): string =>
  INTERVIEW_STATION_STATUS_LABELS[status] ?? status;

export const isStationActive = (status: string): boolean => status === "active";

/** 新增面试位的默认名：取未被占用的最小「N 号位」。 */
export const nextStationLabel = (existingLabels: readonly string[]): string => {
  const used = new Set(existingLabels);
  for (let index = 1; index <= used.size + 1; index += 1) {
    const label = `${index} 号位`;
    if (!used.has(label)) return label;
  }
  return `${used.size + 1} 号位`;
};

/**
 * 排队的展示提示：
 * - `busy`：正在别部门面试 → 叫号会跳过（不阻塞队列，只是这一轮不叫他）；
 * - `await_first_choice`：第二志愿，但其第一志愿还没面完 → 只做「优先叫别人」的排序提示，不硬挡。
 */
export type CheckinBlock = {
  reason: "busy" | "await_first_choice";
  departmentLabel: string;
};

/** 被挡住的展示文案（控制台 / 大屏共用）。 */
export const checkinBlockNote = (block: CheckinBlock | null): string | null => {
  if (!block) return null;
  return block.reason === "busy"
    ? `正在${block.departmentLabel}面试`
    : `第一志愿（${block.departmentLabel}）未面完`;
};

/** 队列里仍然「在场」的状态：等待 / 已叫 / 面试中 / 过号。 */
const ACTIVE_STATUSES: InterviewCheckinStatusKey[] = [
  "waiting",
  "called",
  "interviewing",
  "skipped",
];

export const isActiveCheckin = (
  status: InterviewCheckinStatusKey,
): boolean => ACTIVE_STATUSES.includes(status);

export const isTerminalCheckin = (
  status: InterviewCheckinStatusKey,
): boolean => status === "done" || status === "cancelled";

/** 状态机：只允许这些迁移，越界一律拒绝（服务端各动作都先过这里）。 */
const TRANSITIONS: Record<
  InterviewCheckinStatusKey,
  InterviewCheckinStatusKey[]
> = {
  waiting: ["called", "cancelled"],
  called: ["interviewing", "skipped"],
  skipped: ["called", "cancelled"],
  interviewing: ["done"],
  done: [],
  cancelled: [],
};

export const canTransitionCheckin = (
  from: InterviewCheckinStatusKey,
  to: InterviewCheckinStatusKey,
): boolean => TRANSITIONS[from].includes(to);

export type InterviewCheckinActionVariant = "default" | "outline" | "destructive";

export type InterviewCheckinAction = {
  to: InterviewCheckinStatusKey;
  label: string;
  variant: InterviewCheckinActionVariant;
};

/**
 * 控制台行内按钮：由当前状态推导。
 * 叫号不在这里——每次叫号都必须落到具体面试位（部长在自己的位上叫），
 * 队列行只提供「叫到某个位」的下拉与收尾动作。
 */
export const checkinActionsFor = (
  status: InterviewCheckinStatusKey,
): InterviewCheckinAction[] => {
  switch (status) {
    case "waiting":
    case "skipped":
      return [{ to: "cancelled", label: "取消签到", variant: "destructive" }];
    case "called":
      return [
        { to: "interviewing", label: "开始面试", variant: "default" },
        { to: "skipped", label: "过号", variant: "outline" },
      ];
    case "interviewing":
      return [{ to: "done", label: "结束面试", variant: "default" }];
    default:
      return [];
  }
};

/**
 * 叫号显示：部门号段前缀（B/K/W/S，见 `departmentQueuePrefix`）+ 序号补零到三位。
 * 序号是「本人这一轮在该部门第几个签到的」，因此同一部门同一轮内不重号；
 * 一面/二面各自从头编号，靠界面上的轮次区分。
 */
export const formatQueueNo = (prefix: string, seq: number): string => {
  const n = Math.max(1, Math.trunc(seq));
  return `${prefix}${String(n).padStart(3, "0")}`;
};

/** 过号后允许被自动叫回来的次数：只用一次，避免人不到场被反复叫。 */
export const MAX_QUEUE_SKIPS = 1;

/** 过号后往后顺延的位置数（不足则排到队尾）。 */
export const QUEUE_SKIP_BACKOFF = 3;

/** 该状态/次数下会不会被「叫下一位」自动叫到。 */
export const isAutoCallable = (
  status: InterviewCheckinStatusKey,
  skipCount: number,
): boolean =>
  status === "waiting" ||
  (status === "skipped" && skipCount <= MAX_QUEUE_SKIPS);

/** 过号提示：顺延说明 + 不再自动叫号。 */
export const checkinSkipNote = (skipCount: number): string | null => {
  if (skipCount <= 0) return null;
  return skipCount > MAX_QUEUE_SKIPS
    ? `已过号 ${skipCount} 次，不再自动叫号`
    : `已过号 ${skipCount} 次，已往后顺延 ${QUEUE_SKIP_BACKOFF} 位`;
};

/** 一个可排序的队列行（控制台/大屏都用它，避免两处各写一套排序）。 */
export type CheckinQueueRow = {
  status: InterviewCheckinStatusKey;
  queueSeq: number;
};

const statusPriority = (status: InterviewCheckinStatusKey): number => {
  const index = INTERVIEW_CHECKIN_STATUS_ORDER.indexOf(status);
  return index === -1 ? INTERVIEW_CHECKIN_STATUS_ORDER.length : index;
};

/** 展示排序：状态优先级优先，同状态内按签到序号升序（先到先叫）。 */
export const compareCheckinQueue = (
  a: CheckinQueueRow,
  b: CheckinQueueRow,
): number => {
  const byStatus = statusPriority(a.status) - statusPriority(b.status);
  if (byStatus !== 0) return byStatus;
  return a.queueSeq - b.queueSeq;
};

export type CheckinQueueCounts = {
  waiting: number;
  called: number;
  interviewing: number;
  done: number;
  skipped: number;
  cancelled: number;
  total: number;
};

export const countCheckinQueue = (
  rows: readonly { status: InterviewCheckinStatusKey }[],
): CheckinQueueCounts => {
  const counts: CheckinQueueCounts = {
    waiting: 0,
    called: 0,
    interviewing: 0,
    done: 0,
    skipped: 0,
    cancelled: 0,
    total: rows.length,
  };
  for (const row of rows) {
    counts[row.status] += 1;
  }
  return counts;
};
