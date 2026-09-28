import { verifyRole } from "@/lib/dal";
import { listLinkUsers } from "@/lib/link/admin";
import { getLinkAdminAccessTokenFromSession } from "@/lib/link/session";
import { toPeopleUserFromLinkAdminItem } from "@/lib/link/people-user";

export type UserListParams = {
  page: number;
  pageSize: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};

/**
 * 成员目录：讲师及以上都能查看全部成员（Link 的用户目录本身也不限部门），
 * 只按角色收敛敏感字段：手机号 role ≥ 3（部长/管理员），QQ role ≥ 2。
 * 部门隔离作用于业务数据（流程/报名/评分/面评/排期/邮件/审计），不作用于成员目录。
 */
export const useUserList = async ({
  page,
  pageSize,
  search,
  sortBy: _sortBy = "createdAt",
  sortOrder: _sortOrder = "desc",
}: UserListParams) => {
  const session = await verifyRole(2);
  const canViewPhone = session.role >= 3;
  const canViewQq = session.role >= 2;

  const accessToken = await getLinkAdminAccessTokenFromSession();
  const result = await listLinkUsers(accessToken, {
    page,
    pageSize,
    keyword: search,
  });

  return {
    users: result.users.map((item) => ({
      ...toPeopleUserFromLinkAdminItem(item, canViewPhone),
      qq: canViewQq ? item.qq_number ?? null : null,
    })),
    totalCount: result.total,
    totalPages: Math.ceil(result.total / pageSize),
  };
};
