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

export const departmentCategory = (
  value: string | null | undefined,
): DepartmentCategory => {
  const key = normalizeDepartmentKey(value);
  if (!key) return "unknown";
  return DEPARTMENT_CATEGORIES[key] ?? "unknown";
};
