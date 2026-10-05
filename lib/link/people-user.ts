import { linkRoleToPeopleRole } from "@/lib/link/role";
import type { LinkAdminUserItem, LinkUserProfile } from "@/lib/link/types";
import type { userType } from "@/types/user";

/**
 * 敏感字段可见性：按字段分别收敛，别用一个布尔值顺带放行手机号。
 * 口径与成员目录（`hooks/useUserList`）一致：手机号 role ≥ 3，QQ role ≥ 2（讲师及以上要能联系候选人）。
 */
export type SensitiveFieldVisibility = {
  canViewPhone: boolean;
  canViewQq: boolean;
};

export const toPeopleUserFromLinkProfile = (
  item: LinkUserProfile,
  { canViewPhone, canViewQq }: SensitiveFieldVisibility,
): userType => ({
  id: item.id,
  name: item.name,
  studentId: item.student_id ?? null,
  email: item.login_email ?? item.profile?.email ?? null,
  phone: canViewPhone ? item.phone_number ?? null : null,
  college: item.college ?? null,
  major: item.major ?? null,
  departments: item.profile?.department ? [item.profile.department] : [],
  github: item.profile?.github_url ?? null,
  blog: item.profile?.blog_url ?? null,
  personalStatement: item.profile?.intro ?? null,
  nickname: item.profile?.nickname ?? null,
  avatar: item.profile?.avatar ?? null,
  emailType: item.email_type ?? null,
  linkState: item.state,
  identities: item.identities ?? [],
  qq: canViewQq ? item.qq_number ?? null : null,
  role: linkRoleToPeopleRole(item.role),
  createdAt: item.created_at ? new Date(item.created_at) : new Date(),
  updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(),
  isDeleted: item.state === "is_deleted",
});

export const toPeopleUserFromLinkAdminItem = (
  item: LinkAdminUserItem,
  { canViewPhone, canViewQq }: SensitiveFieldVisibility,
): userType => ({
  id: item.id,
  name: item.name,
  studentId: item.student_id ?? null,
  email: item.login_email ?? null,
  phone: canViewPhone ? item.phone_number ?? null : null,
  college: item.college ?? null,
  major: item.major ?? null,
  departments: item.department ? [item.department] : [],
  github: null,
  blog: null,
  personalStatement: null,
  nickname: null,
  avatar: null,
  emailType: item.email_type ?? null,
  linkState: item.state,
  identities: [],
  qq: canViewQq ? item.qq_number ?? null : null,
  role: linkRoleToPeopleRole(item.role),
  createdAt: item.created_at ? new Date(item.created_at) : new Date(),
  updatedAt: new Date(),
  isDeleted: item.state === "is_deleted",
});
