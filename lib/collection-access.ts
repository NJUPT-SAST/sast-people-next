import "server-only";

import type { VerifiedSession } from "@/lib/dal";
import { MANAGER_ROLE } from "@/lib/link/role";

type SessionIdentity = Pick<VerifiedSession, "role">;

export type CollectionFillRule = { allowedRoles: number[] };

/** 填写权限：身份在允许列表内；空列表 = 不限制。 */
export const canFillCollectionForm = (
  session: SessionIdentity,
  form: CollectionFillRule,
): boolean =>
  form.allowedRoles.length === 0 || form.allowedRoles.includes(session.role);

/**
 * 查看权限：部长及以上可以看全部；其他账号在允许列表内、或本人已提交过时可见。
 * 这样即使表单后来收紧身份，填写过的人仍能查看自己的记录。
 */
export const canViewCollectionForm = (
  session: SessionIdentity,
  form: CollectionFillRule,
  hasSubmission = false,
): boolean =>
  session.role >= MANAGER_ROLE ||
  canFillCollectionForm(session, form) ||
  hasSubmission;

/** 管理与查看结果：部长及以上（管理员同权），不再按部门或发起人区分。 */
export const canManageCollectionForm = (session: SessionIdentity): boolean =>
  session.role >= MANAGER_ROLE;
