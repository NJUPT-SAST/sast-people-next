import "server-only";

import type { VerifiedSession } from "@/lib/dal";
import { MANAGER_ROLE } from "@/lib/link/role";

type SessionIdentity = Pick<VerifiedSession, "role">;

export type CollectionFillRule = {
  allowedRoles: number[];
  allowedFlowIds: number[];
};

/**
 * 填写权限：身份与流程条件同时满足。
 * - 身份为空 = 不限制身份；流程为空 = 不限制流程。
 * - passedFlowIds 是当前用户最终通过（progress_status = passed）的流程 ID。
 */
export const canFillCollectionForm = (
  session: SessionIdentity,
  form: CollectionFillRule,
  passedFlowIds: number[] = [],
): boolean => {
  const identityAllowed =
    form.allowedRoles.length === 0 || form.allowedRoles.includes(session.role);
  const flowAllowed =
    form.allowedFlowIds.length === 0 ||
    form.allowedFlowIds.some((flowId) => passedFlowIds.includes(flowId));
  return identityAllowed && flowAllowed;
};

/**
 * 查看权限：部长及以上可以看全部；其他账号在可填写、或本人已提交过时可见。
 * 这样即使表单后来收紧身份/流程，填写过的人仍能查看自己的记录。
 */
export const canViewCollectionForm = (
  session: SessionIdentity,
  form: CollectionFillRule,
  hasSubmission = false,
  passedFlowIds: number[] = [],
): boolean =>
  session.role >= MANAGER_ROLE ||
  canFillCollectionForm(session, form, passedFlowIds) ||
  hasSubmission;

/** 管理与查看结果：部长及以上（管理员同权），不再按部门或发起人区分。 */
export const canManageCollectionForm = (session: SessionIdentity): boolean =>
  session.role >= MANAGER_ROLE;
