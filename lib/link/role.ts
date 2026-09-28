import type { LinkRole } from "@/lib/link/types";

/**
 * People 角色阶梯（与 SAST Link 的 user_role_enum 一一对应）：
 * 0 新同学 freshman ｜ 1 部员 member ｜ 2 讲师 lecturer ｜ 3 部长 manager ｜ 4 管理员 admin
 *
 * 部门级能力（流程/报名/评分/面评/排期/邮件/审计）从 `MANAGER_ROLE` 起；
 * 跨部门与平台级能力（反馈、错误日志、邮件模板全局默认、封禁、部门分配）仅 `ADMIN_ROLE`。
 */
export const FRESHMAN_ROLE = 0;
export const MEMBER_ROLE = 1;
export const LECTURER_ROLE = 2;
export const MANAGER_ROLE = 3;
export const ADMIN_ROLE = 4;

const peopleRoleToLinkRoleMap: Record<number, LinkRole> = {
  [FRESHMAN_ROLE]: "freshman",
  [MEMBER_ROLE]: "member",
  [LECTURER_ROLE]: "lecturer",
  [MANAGER_ROLE]: "manager",
  [ADMIN_ROLE]: "admin",
};

const linkRoleToPeopleRoleMap: Record<LinkRole, number> = {
  freshman: FRESHMAN_ROLE,
  member: MEMBER_ROLE,
  lecturer: LECTURER_ROLE,
  manager: MANAGER_ROLE,
  admin: ADMIN_ROLE,
};

export const peopleRoleToLinkRole = (role: number): LinkRole => {
  const linkRole = peopleRoleToLinkRoleMap[role];
  if (!linkRole) {
    throw new Error(`Unknown People role: ${role}`);
  }
  return linkRole;
};

/** 未知角色一律按最低权限处理（避免 Link 新增角色时被当成高权限） */
export const linkRoleToPeopleRole = (role: string): number =>
  linkRoleToPeopleRoleMap[role as LinkRole] ?? FRESHMAN_ROLE;
