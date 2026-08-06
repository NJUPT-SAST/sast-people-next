import { db } from "@/db/drizzle";
import { user } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { listLinkUsers } from "@/lib/link/admin";
import {
  canUseLegacyUserFallback,
  getLinkAccessTokenFromSession,
  MissingLinkAccessTokenError,
} from "@/lib/link/session";
import { toPeopleUserFromLinkAdminItem } from "@/lib/link/people-user";
import { and, asc, count, desc, eq, ilike, or, SQL } from "drizzle-orm";

export type UserListParams = {
  page: number;
  pageSize: number;
  search?: string;
  sortBy?: keyof typeof user;
  sortOrder?: "asc" | "desc";
};

export const useUserList = async ({
  page,
  pageSize,
  search,
  sortBy = "createdAt",
  sortOrder = "desc",
}: UserListParams) => {
  const session = await verifyRole(2);
  const canViewPhone = session.role >= 3;
  const canViewQq = session.role >= 2;

  try {
    const accessToken = await getLinkAccessTokenFromSession();
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
  } catch (err) {
    if (
      err instanceof MissingLinkAccessTokenError &&
      canUseLegacyUserFallback()
    ) {
      return getLegacyUserList({
        page,
        pageSize,
        search,
        sortBy,
        sortOrder,
        canViewPhone,
        canViewQq,
      });
    }
    throw err;
  }
};

const getLegacyUserList = async ({
  page,
  pageSize,
  search,
  sortBy,
  sortOrder,
  canViewPhone,
  canViewQq,
}: Required<Pick<UserListParams, "page" | "pageSize" | "sortBy" | "sortOrder">> & {
  search?: string;
  canViewPhone: boolean;
  canViewQq: boolean;
}) => {
  const offset = (page - 1) * pageSize;
  let whereConditions: SQL<unknown> | undefined = eq(user.isDeleted, false);

  if (search) {
    whereConditions = and(
      whereConditions,
      or(
        ilike(user.name, `%${search}%`),
        ilike(user.studentId, `%${search}%`),
        ...(canViewPhone ? [ilike(user.phone, `%${search}%`)] : []),
        ...(canViewQq ? [ilike(user.qq, `%${search}%`)] : []),
        ilike(user.email, `%${search}%`),
      ),
    );
  }

  const totalCountResult = await db
    .select({ count: count() })
    .from(user)
    .where(whereConditions)
    .execute();
  const totalCount = Number(totalCountResult[0]?.count) || 0;

  const users = await db
    .select()
    .from(user)
    .where(whereConditions)
    .orderBy((column) =>
      sortOrder === "asc"
        ? asc(column[sortBy as keyof typeof column])
        : desc(column[sortBy as keyof typeof column]),
    )
    .limit(pageSize)
    .offset(offset)
    .execute();

  return {
    users: users.map((item) => ({
      ...item,
      phone: canViewPhone ? item.phone : null,
      qq: canViewQq ? item.qq : null,
    })),
    totalCount,
    totalPages: Math.ceil(totalCount / pageSize),
  };
};
