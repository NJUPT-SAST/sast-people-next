/**
 * 流程类型与「办公类部门面试招新」的共享常量。
 * 部门标识仍由 SAST Link 维护（见 const/department.ts），这里只放流程口径。
 */

import { departmentKey, departmentLabel } from "@/const/department";

export const OFFICE_INTERVIEW_FLOW_TYPE = "office_interview";

/* 面试类流程：免试 / 部员考核（WOC/WOD）/ 讲师考核（SOC/SOD）/ 办公类部门面试 */
export const INTERVIEW_FLOW_TYPES = [
  "recruitment_exemption",
  "woc",
  "soc",
  OFFICE_INTERVIEW_FLOW_TYPE,
] as const;

/* 技术部门面试流程：讲师预约飞书日程、提交面评；候选人可申请修改面试时间 */
export const TECH_INTERVIEW_FLOW_TYPES = [
  "recruitment_exemption",
  "woc",
  "soc",
] as const;

export const isInterviewFlow = (type: string): boolean =>
  (INTERVIEW_FLOW_TYPES as readonly string[]).includes(type);

export const isTechInterviewFlow = (type: string): boolean =>
  (TECH_INTERVIEW_FLOW_TYPES as readonly string[]).includes(type);

export const isOfficeInterviewFlow = (type: string) =>
  type === OFFICE_INTERVIEW_FLOW_TYPE;

/* 作品链接/作品简介只属于技术部门面试流程；办公类部门面试不收集作品 */
export const flowNeedsPortfolio = (type: string): boolean =>
  isTechInterviewFlow(type);

export const FLOW_TYPE_LABELS: Record<string, string> = {
  recruitment: "笔试招新",
  recruitment_exemption: "免试招新",
  woc: "WOC",
  soc: "SOC",
  office_interview: "办公类部门面试招新",
};

/**
 * 「部门 + 阶段」的流程口径名称：软件研发部WOC / 多媒体部WOD / 软件研发部免试 …
 * 阶段后缀由部门决定（软研 = C，多媒体 = D），未知部门回落到通用阶段名。
 */
const DEPARTMENT_STAGE_CODES: Record<string, Record<string, string>> = {
  woc: { software: "WOC", media: "WOD" },
  soc: { software: "SOC", media: "SOD" },
};

const STAGE_LABELS: Record<string, string> = {
  recruitment: "笔试",
  recruitment_exemption: "免试",
  woc: "WOC",
  soc: "SOC",
};

export const flowTypeLabel = (
  type: string,
  department?: string | null,
): string => {
  if (isOfficeInterviewFlow(type)) return FLOW_TYPE_LABELS[type];
  const base = FLOW_TYPE_LABELS[type] ?? type;
  const departmentName = departmentLabel(department, "");
  const key = departmentKey(department);
  if (!departmentName) return base;
  const stage =
    (key ? DEPARTMENT_STAGE_CODES[type]?.[key] : undefined) ??
    STAGE_LABELS[type] ??
    base;
  return `${departmentName}${stage}`;
};

/* 面试时段的「时间冲突」特殊选项：不参加当天的集中面试，QQ 群另行约面 */
export const SLOT_CONFLICT_LABEL = "时间冲突，约面时间QQ群中另行通知";
