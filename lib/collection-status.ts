/**
 * 收集表阶段：手动状态为 open 还不够，还要看开始/截止时间。
 * 开始时间未到 = upcoming；截止时间已过或手动关闭 = closed。
 */
export type CollectionFormTiming = {
  status: string;
  startsAt: Date | null;
  deadline: Date | null;
};

export type CollectionFormPhase = "upcoming" | "open" | "closed";

export const collectionFormPhase = (
  form: CollectionFormTiming,
  now = new Date(),
): CollectionFormPhase => {
  if (form.status !== "open") return "closed";
  if (form.startsAt && form.startsAt.getTime() > now.getTime()) return "upcoming";
  if (form.deadline && form.deadline.getTime() <= now.getTime()) return "closed";
  return "open";
};

export const isCollectionFormOpen = (
  form: CollectionFormTiming,
  now = new Date(),
): boolean => collectionFormPhase(form, now) === "open";