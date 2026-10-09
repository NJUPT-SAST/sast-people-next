/**
 * 大屏语音播报的调度规则。
 *
 * 现场可能同时多人被叫号，直接“来一个念一个”会互相打断（`speechSynthesis.cancel` 会切掉上一条），
 * 攒在队列里又会把旧号念成一条长长的过期队列。这里给出三条规则：
 * 1. **串行**：每条播报念完再念下一条（由调用方用 `onend` 驱动，不 cancel）；
 * 2. **重复**：同一个号最多念 `ANNOUNCE_MAX_REPEATS` 次、间隔 `ANNOUNCE_REPEAT_INTERVAL_MS`，
 *    人到场（状态不再是“已叫号”）就自然停止重复；
 * 3. **限流 + 过期**：一拍最多挑 `ANNOUNCE_BATCH_LIMIT` 条，超过 `ANNOUNCE_STALE_MS` 的旧叫号不补念
 *    （否则刷新/切回大屏会把历史叫号全念一遍），一拍多于一条时合并成一句话。
 */

export type AnnounceTarget = {
  /** 同一候选人的同一次叫号：checkinId + calledAt，重新叫号会得到新的 key */
  key: string;
  departmentLabel: string;
  queueNo: string;
  name: string;
  stationLabel: string;
  /** 叫号时间（ISO），用于判断是否已过期 */
  calledAt: string;
};

export type AnnounceRecord = {
  spokenCount: number;
  lastSpokenAt: number;
};

export type AnnounceState = Record<string, AnnounceRecord>;

export const ANNOUNCE_MAX_REPEATS = 3;
export const ANNOUNCE_REPEAT_INTERVAL_MS = 12_000;
export const ANNOUNCE_STALE_MS = 120_000;
export const ANNOUNCE_BATCH_LIMIT = 3;
/** 待播队列上限：超出时丢掉最旧的待播项，避免念到已经过号的旧号。 */
export const ANNOUNCE_QUEUE_LIMIT = 4;

const parseTime = (value: string): number | null => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * 选出这一拍该播报的叫号，并返回更新后的状态。
 * `state` 里不在 `targets` 中的记录会被清掉（候选人已进场/过号，不再重复）。
 */
export const selectAnnouncements = (
  targets: readonly AnnounceTarget[],
  state: AnnounceState,
  now: number,
): { batch: AnnounceTarget[]; state: AnnounceState } => {
  const nextState: AnnounceState = {};
  const batch: AnnounceTarget[] = [];

  const ordered = [...targets].sort(
    (a, b) => (parseTime(a.calledAt) ?? 0) - (parseTime(b.calledAt) ?? 0),
  );

  for (const target of ordered) {
    const calledAt = parseTime(target.calledAt);
    if (calledAt === null || now - calledAt > ANNOUNCE_STALE_MS) continue;

    const record = state[target.key] ?? { spokenCount: 0, lastSpokenAt: 0 };
    const due =
      record.spokenCount < ANNOUNCE_MAX_REPEATS &&
      now - record.lastSpokenAt >= ANNOUNCE_REPEAT_INTERVAL_MS;

    if (due && batch.length < ANNOUNCE_BATCH_LIMIT) {
      batch.push(target);
      nextState[target.key] = {
        spokenCount: record.spokenCount + 1,
        lastSpokenAt: now,
      };
    } else {
      nextState[target.key] = record;
    }
  }

  return { batch, state: nextState };
};

/** 一条播报：`请 办公室 A003 号，许清和 同学，到 1 号位` */
export const announcementText = (target: AnnounceTarget): string =>
  `请 ${target.departmentLabel} ${target.queueNo} 号，${target.name} 同学，到 ${target.stationLabel}`;

/** 一拍多条时合并成一句，避免连着念好几句。 */
export const batchAnnouncementText = (
  targets: readonly AnnounceTarget[],
): string | null => {
  if (targets.length === 0) return null;
  if (targets.length === 1) return announcementText(targets[0]);

  const list = targets
    .map((target) => `${target.departmentLabel} ${target.queueNo} 号 ${target.name}`)
    .join("、");
  return `请 ${list} 同学，到各自的面试位`;
};
