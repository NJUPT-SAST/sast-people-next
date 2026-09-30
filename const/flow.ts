/**
 * 流程类型与「办公类部门面试招新」的共享常量。
 * 部门标识仍由 SAST Link 维护（见 const/department.ts），这里只放流程口径。
 */

export const OFFICE_INTERVIEW_FLOW_TYPE = "office_interview";

export const FLOW_TYPE_LABELS: Record<string, string> = {
  recruitment: "笔试招新",
  recruitment_exemption: "免试招新",
  woc: "WOC/WOD",
  soc: "SOC/SOD",
  office_interview: "办公类部门面试招新",
};

/* 面试时段的「时间冲突」特殊选项：不参加当天的集中面试，QQ 群另行约面 */
export const SLOT_CONFLICT_LABEL = "时间冲突，约面时间QQ群中另行通知";

export const isOfficeInterviewFlow = (type: string) =>
  type === OFFICE_INTERVIEW_FLOW_TYPE;

