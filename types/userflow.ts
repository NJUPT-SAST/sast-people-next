import type { InferSelectModel } from 'drizzle-orm';
import { userFlow } from '@/db/schema';
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
  /** 当前流程配置的投递组别选项 */
  groupOptions?: string[] | null;
  steps: fullStepType[];
};
