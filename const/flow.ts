/**
 * 流程类型与「办公类部门面试招新」的共享常量。
 * 部门标识仍由 SAST Link 维护（见 const/department.ts），这里只放流程口径。
 */

import {
  OFFICE_DEPARTMENT_KEYS,
  departmentKey,
  departmentLabel,
} from "@/const/department";

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
 * 「部门 + 阶段」的流程口径名称：软件研发部WOC / 多媒体部WOD / 软件研发部免试 / 办公室面试 …
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
  const departmentName = departmentLabel(department, "");
  const key = departmentKey(department);
  if (isOfficeInterviewFlow(type)) {
    /* 办公类每个部门一条流程：部门名即类型名（办公室面试 / 科宣部面试 …） */
    return departmentName ? `${departmentName}面试` : FLOW_TYPE_LABELS[type];
  }
  const base = FLOW_TYPE_LABELS[type] ?? type;
  if (!departmentName) return base;
  const stage =
    (key ? DEPARTMENT_STAGE_CODES[type]?.[key] : undefined) ??
    STAGE_LABELS[type] ??
    base;
  return `${departmentName}${stage}`;
};

/**
 * 语义化流程类型 = 部门 × 阶段：
 * 软件研发部/多媒体部 = 免试 / 笔试 / WOC(WOD) / SOC(SOD)，办公类部门 = 面试。
 * 存储仍是 flow.type + flow.department 两列，这里只负责展示与选择的组合口径。
 */
export const TECH_SEMANTIC_DEPARTMENTS = ["software", "media"] as const;

const TECH_STAGE_TYPES = [
  "recruitment_exemption",
  "recruitment",
  "woc",
  "soc",
] as const;

export type FlowTypeOption = {
  /* 供表单受控使用的组合值：`部门:阶段` */
  value: string;
  label: string;
  type: string;
  department: string;
};

export const flowTypeOptionValue = (type: string, department: string) =>
  `${department}:${type}`;

export const SEMANTIC_FLOW_TYPE_OPTIONS: FlowTypeOption[] = [
  ...TECH_SEMANTIC_DEPARTMENTS.flatMap((department) =>
    TECH_STAGE_TYPES.map((type) => ({
      value: flowTypeOptionValue(type, department),
      label: flowTypeLabel(type, department),
      type,
      department,
    })),
  ),
  ...OFFICE_DEPARTMENT_KEYS.map((department) => ({
    value: flowTypeOptionValue(OFFICE_INTERVIEW_FLOW_TYPE, department),
    label: flowTypeLabel(OFFICE_INTERVIEW_FLOW_TYPE, department),
    type: OFFICE_INTERVIEW_FLOW_TYPE,
    department,
  })),
];

export const parseFlowTypeOptionValue = (
  value: string,
): { type: string; department: string } | null => {
  const index = value.indexOf(":");
  if (index <= 0) return null;
  const department = value.slice(0, index);
  const type = value.slice(index + 1);
  if (!department || !type) return null;
  return { type, department };
};

/** 当前账号可选的语义化类型：管理员见全部，部长只见本部门 */
export const flowTypeOptionsForDepartment = (department?: string | null) => {
  const key = departmentKey(department);
  return key
    ? SEMANTIC_FLOW_TYPE_OPTIONS.filter((option) => option.department === key)
    : SEMANTIC_FLOW_TYPE_OPTIONS;
};

/** 流程当前的（type, department）对应的语义化选项；非标准组合返回 null（界面回落为“自定义”） */
export const flowTypeOptionOf = (
  type: string,
  department?: string | null,
): FlowTypeOption | null => {
  const key = departmentKey(department);
  if (!key) return null;
  return (
    SEMANTIC_FLOW_TYPE_OPTIONS.find(
      (option) => option.type === type && option.department === key,
    ) ?? null
  );
};

/* 面试时段的「时间冲突」特殊选项：不参加当天的集中面试，QQ 群另行约面 */
export const SLOT_CONFLICT_LABEL = "时间冲突，约面时间QQ群中另行通知";
