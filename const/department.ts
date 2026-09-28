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
