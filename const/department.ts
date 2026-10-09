import { normalizeDepartmentKey } from "@/db/schema";

/**
 * Link 部门标识 → 展示名。
 * 部门清单由 SAST Link 维护（People 不落库部门目录），未知标识直接原样展示，
 * 不猜测 Link 尚未提供的键名。
 */
export const DEPARTMENT_LABELS: Record<string, string> = {
  software: "软件研发部",
  media: "多媒体部",
  electronics: "电子部",
  office: "办公室",
  liaison: "外联部",
  publicity: "科宣部",
  competition: "赛事部",
};

export const departmentLabel = (
  value: string | null | undefined,
  fallback = "未归属部门",
): string => {
  const key = normalizeDepartmentKey(value);
  if (!key) return fallback;
  return DEPARTMENT_LABELS[key] ?? key;
};

/** Link 部门标识的规范化形式（null/空串 → null），用于按部门取常量表 */
export const departmentKey = (
  value: string | null | undefined,
): string | null => normalizeDepartmentKey(value);

/**
 * 部门大类：招新限制「技术部门内部互斥、办公部门内部互斥，
 * 但可以同时参加一个技术部门和一个办公部门」。
 * Link 新增的未知部门按 unknown 处理（按最保守的互斥规则）。
 */
export type DepartmentCategory = "tech" | "office" | "unknown";

export const DEPARTMENT_CATEGORIES: Record<string, DepartmentCategory> = {
  software: "tech",
  media: "tech",
  electronics: "tech",
  office: "office",
  publicity: "office",
  liaison: "office",
  competition: "office",
};

/* 办公类部门标识（第一/第二志愿的可选项顺序） */
export const OFFICE_DEPARTMENT_KEYS = [
  "office",
  "publicity",
  "liaison",
  "competition",
] as const;

/**
 * 叫号号段前缀：按部门中文名拼音首字母，一个部门一个号段，
 * 现场一眼就能对上部门（办公室 B / 科宣部 K / 外联部 W / 赛事部 S）。
 * 未知部门回落 `D`，保证号码仍然唯一可读。
 */
export const DEPARTMENT_QUEUE_PREFIX: Record<string, string> = {
  office: "B",
  publicity: "K",
  liaison: "W",
  competition: "S",
};

export const departmentQueuePrefix = (
  value: string | null | undefined,
): string => {
  const key = normalizeDepartmentKey(value);
  return (key ? DEPARTMENT_QUEUE_PREFIX[key] : undefined) ?? "D";
};

/**
 * 暂不启用的部门：这些部门的流程不会出现在招新工作台（面试管理 / 笔试管理）的
 * 流程选择器与页签里。数据保留——流程、报名记录、模板都不动，
 * 以后要启用时把这个键从清单里去掉即可。
 */
export const DISABLED_DEPARTMENT_KEYS = ["electronics"] as const;

/** 该部门是否在当前启用范围内（null / 未知部门一律视为启用） */
export const isDepartmentEnabled = (
  value: string | null | undefined,
): boolean => {
  const key = normalizeDepartmentKey(value);
  if (!key) return true;
  return !(DISABLED_DEPARTMENT_KEYS as readonly string[]).includes(key);
};

export const departmentCategory = (
  value: string | null | undefined,
): DepartmentCategory => {
  const key = normalizeDepartmentKey(value);
  if (!key) return "unknown";
  return DEPARTMENT_CATEGORIES[key] ?? "unknown";
};

/** 部门清单（Link 目录的本地副本），顺序即目录顺序 */
export const DEPARTMENT_KEYS: string[] = Object.keys(DEPARTMENT_LABELS);

/** 当前启用的部门标识（目录里去掉暂时下线的部门） */
export const ENABLED_DEPARTMENT_KEYS: string[] =
  DEPARTMENT_KEYS.filter(isDepartmentEnabled);

/**
 * 候选部门标识：目录 ∪ 库中已出现的标识。
 * 只依赖库内已有值会让「还一个部门都没归属过时」无从选择，
 * 所以目录里的部门始终列出；库里的历史/未知标识也要保留，
 * 免得存量数据变成下拉里选不到、只能手填才对得上的孤儿行。
 */
export const mergeDepartmentKeys = (
  catalogue: readonly string[],
  stored: Iterable<string | null | undefined>,
): string[] => {
  const keys = new Set<string>(catalogue);
  for (const value of stored) {
    const key = normalizeDepartmentKey(value);
    if (key) keys.add(key);
  }
  return [...keys].sort((a, b) => a.localeCompare(b, "zh-CN"));
};
