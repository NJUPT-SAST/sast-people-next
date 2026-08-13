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
