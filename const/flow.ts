/**
 * 流程类型与「办公类部门面试招新」的共享常量。
 * 部门标识仍由 SAST Link 维护（见 const/department.ts），这里只放流程口径。
 */

import {
  OFFICE_DEPARTMENT_KEYS,
  departmentKey,
  departmentLabel,
  type DepartmentCategory,
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
 * 只含阶段的短名（免试 / 笔试 / WOC(WOD) / SOC(SOD) / 面试）。
 * 同一部门下有多个阶段时，页签与标签不必反复重复部门名。
 */
export const flowStageLabel = (
  type: string,
  department?: string | null,
): string => {
  if (isOfficeInterviewFlow(type)) return "面试";
  const key = departmentKey(department);
  const stage =
    (key ? DEPARTMENT_STAGE_CODES[type]?.[key] : undefined) ??
    STAGE_LABELS[type];
  return stage ?? flowTypeLabel(type, department);
};

/* 结果通知模板键 → 招新阶段：与流程页签共用同一套「部门 × 阶段」口径 */
const EMAIL_TEMPLATE_STAGES: Record<
  string,
  { flowType: string; /* 部门无关的通用阶段名；办公类按轮次拼接 */ generic: string; round?: string }
> = {
  "recruitment.result": { flowType: "recruitment", generic: "笔试招新" },
  "recruitment_exemption.result": {
    flowType: "recruitment_exemption",
    generic: "免试招新",
  },
  "woc.result": { flowType: "woc", generic: "WOC/WOD" },
  "soc.result": { flowType: "soc", generic: "SOC/SOD" },
  "office_round1.result": {
    flowType: OFFICE_INTERVIEW_FLOW_TYPE,
    generic: "部门面试",
    round: "一面",
  },
  "office_round2.result": {
    flowType: OFFICE_INTERVIEW_FLOW_TYPE,
    generic: "部门面试",
    round: "二面",
  },
};

/** 中英混排时补一个空格：「软件研发部WOC 通过结果通知」比连写更好读 */
const joinCjkAndLatin = (head: string, tail: string) =>
  /[A-Za-z0-9]$/.test(head) ? `${head} ${tail}` : `${head}${tail}`;

const EMAIL_TEMPLATE_STAGE_ORDER = Object.keys(EMAIL_TEMPLATE_STAGES);

/** 结果通知模板的阶段序号：模板板块按它排序（笔试 → 免试 → WOC/WOD → SOC/SOD → 一面 → 二面） */
export const emailTemplateStageIndex = (templateKey: string): number => {
  const separator = templateKey.lastIndexOf(".");
  const index =
    separator > 0
      ? EMAIL_TEMPLATE_STAGE_ORDER.indexOf(templateKey.slice(0, separator))
      : -1;
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
};

/** 面试通知模板里只服务技术部门的那几条：办公类是时段制，没有飞书日程可预约/改约/取消 */
const TECH_ONLY_INTERVIEW_TEMPLATES = [
  "interview.schedule.created",
  "interview.schedule.rescheduled",
  "interview.schedule.cancelled",
  "interview.schedule.change.rejected",
] as const;

/**
 * 模板属于哪一类部门：
 * - 技术部门：笔试 / 免试 / WOC / SOC 结果通知 + 飞书日程类面试通知；
 * - 办公部门：一面 / 二面结果通知（报名退回通知两边都用，返回 null 表示不过滤）。
 * 认不出的模板返回 null（两边都显示）。
 */
export const emailTemplateStageCategory = (
  templateKey: string,
): DepartmentCategory | null => {
  if ((TECH_ONLY_INTERVIEW_TEMPLATES as readonly string[]).includes(templateKey)) {
    return "tech";
  }
  const separator = templateKey.lastIndexOf(".");
  const stage =
    separator > 0 ? EMAIL_TEMPLATE_STAGES[templateKey.slice(0, separator)] : undefined;
  if (!stage) return null;
  return isOfficeInterviewFlow(stage.flowType) ? "office" : "tech";
};

export type EmailTemplateLabelOptions = {
  /** 模板归属部门标识；null / 未提供 = 全局默认 */
  department?: string | null;
  /** notification = 通知名（卡片标题、发送记录）；template = 「…模板」按钮与弹窗标题 */
  variant?: "notification" | "template";
};

/**
 * 结果通知模板的展示名。口径与 flowTypeLabel 一致：
 * 归属到具体部门就写部门名（软件研发部WOC / 多媒体部WOD / 办公室一面），
 * 全局默认才用通用阶段名（WOC/WOD / 部门面试一面）。
 * 面试通知类模板与流程无关，返回 null 交给调用方回落到模板自带的名称。
 */
export const emailTemplateLabel = (
  templateKey: string,
  { department, variant = "notification" }: EmailTemplateLabelOptions = {},
): string | null => {
  const separator = templateKey.lastIndexOf(".");
  if (separator <= 0) return null;
  const stage = EMAIL_TEMPLATE_STAGES[templateKey.slice(0, separator)];
  if (!stage) return null;
  const accepted = templateKey.slice(separator + 1) === "accepted";
  const outcome = accepted ? "通过" : "不通过";
  const key = departmentKey(department);
  const departmentName = key ? departmentLabel(key, "") : "";
  /* 办公类模板按「部门 + 轮次」读：办公室一面 / 部门面试二面 */
  const head = departmentName
    ? isOfficeInterviewFlow(stage.flowType)
      ? `${departmentName}${stage.round ?? ""}`
      : flowTypeLabel(stage.flowType, key)
    : `${stage.generic}${stage.round ?? ""}`;
  const tail =
    variant === "template"
      ? `${outcome}模板`
      : `${outcome}${
          isOfficeInterviewFlow(stage.flowType) ? "通知" : "结果通知"
        }`;
  return joinCjkAndLatin(head, tail);
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
