import type { InferSelectModel } from 'drizzle-orm';
import { flow, userFlow } from '@/db/schema';
import { fullStepType } from '@/types/step';

export type UserFlowRow = InferSelectModel<typeof userFlow>;

/** progress_status → 兼容旧 status 字段 */
export function computeStatus(prog: string | null | undefined): string {
  return prog ?? "not_started";
}

// 用户关联的流程，用于展示层
export type displayUserFlow = UserFlowRow & {
  /** 退回当前面试流程时由讲师或管理员填写的理由 */
  withdrawReason: string | null;
  /** 兼容旧 status 字段，由 progressStatus 映射 */
  status: string;
  /** 兼容旧 currentStepOrder，由 fkCurrentStepId → flow_step.order 计算 */
  currentStepOrder: number | null;
  title: string;
  flowType?: string;
  publicationStatus?: string | null;
  /** 当前流程配置的投递组别选项 */
  groupOptions?: string[] | null;
  /** 当前流程配置的面试时段选项（办公类部门面试招新） */
  slotOptions?: InferSelectModel<typeof flow>["slotOptions"];
  /** 当前流程的归属部门（Link 部门标识） */
  flowDepartment?: string | null;
  /** 待审批的面试时间/时段变更申请 */
  pendingSlotChange?: {
    id: number;
    /** 办公类：申请改到的时段 */
    requestedSlot: string | null;
    /** 技术部门：申请改到的新时间 */
    requestedStartsAt: Date | null;
    requestedEndsAt: Date | null;
  } | null;
  /** 技术部门面试：当前生效的飞书面试日程 */
  interviewSchedule?: {
    id: number;
    startsAt: Date;
    endsAt: Date;
    location: string | null;
  } | null;
  steps: fullStepType[];
};
