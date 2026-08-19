import "server-only";

import {
  getLinkUserDetail,
  getLinkUsersByIds,
  listLinkUsers,
} from "@/lib/link/admin";
import { getCurrentUserProfile } from "@/lib/link/user";
import {
  toPeopleUserFromLinkAdminItem,
  toPeopleUserFromLinkProfile,
} from "@/lib/link/people-user";
import {
  getLinkAdminAccessTokenFromSession,
  getLinkAccessTokenFromSession,
} from "@/lib/link/session";
import type { userType } from "@/types/user";
import { cache } from "react";

type LookupOptions = {
  canViewSensitiveInfo?: boolean;
};

const LINK_BATCH_USER_READ_LIMIT = 100;
const LINK_KEYWORD_SEARCH_PAGE_SIZE = 100;

const normalizeStudentId = (studentId: string | null | undefined) =>
  studentId?.trim().toUpperCase() ?? "";

const chunk = <T,>(values: T[], size: number) =>
  Array.from(
    { length: Math.ceil(values.length / size) },
    (_, index) => values.slice(index * size, (index + 1) * size),
  );

export const getPeopleUserByLinkId = async (
  id: number,
  { canViewSensitiveInfo = false }: LookupOptions = {},
): Promise<userType> => {
  const accessToken = await getLinkAccessTokenFromSession();
  const currentUser = await tryGetCurrentUserProfile(accessToken);

  if (currentUser?.id === id) {
    return toPeopleUserFromLinkProfile(currentUser, canViewSensitiveInfo);
  }

  const adminAccessToken = await getLinkAdminAccessTokenFromSession();
  const userInfo = await getLinkUserDetail(adminAccessToken, id);
  return toPeopleUserFromLinkProfile(userInfo, canViewSensitiveInfo);
};

export const findPeopleUserByStudentId = async (
  studentId: string,
  { canViewSensitiveInfo = false }: LookupOptions = {},
): Promise<userType | null> => {
  const normalizedStudentId = normalizeStudentId(studentId);
  if (!normalizedStudentId) {
    return null;
  }

  const accessToken = await getLinkAccessTokenFromSession();
  const currentUser = await tryGetCurrentUserProfile(accessToken);

  if (
    currentUser &&
    normalizeStudentId(currentUser.student_id) === normalizedStudentId &&
    currentUser.state !== "is_deleted"
  ) {
    return toPeopleUserFromLinkProfile(currentUser, canViewSensitiveInfo);
  }

  const adminAccessToken = await getLinkAdminAccessTokenFromSession();
  const result = await listLinkUsers(adminAccessToken, {
    page: 1,
    pageSize: 100,
    studentId: normalizedStudentId,
  });
  const matchedUser = result.users.find(
    (item) =>
      normalizeStudentId(item.student_id) === normalizedStudentId &&
      item.state !== "is_deleted",
  );

  return matchedUser
    ? toPeopleUserFromLinkAdminItem(matchedUser, canViewSensitiveInfo)
    : null;
};

/**
 * Resolve a Link keyword to user IDs for database-backed feature searches.
 * Link matches names, student IDs, and login emails through its admin API.
 */
export const findPeopleUserIdsByKeyword = async (
  keyword: string,
): Promise<number[]> => {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) return [];

  const accessToken = await getLinkAdminAccessTokenFromSession();
  const firstPage = await listLinkUsers(accessToken, {
    page: 1,
    pageSize: LINK_KEYWORD_SEARCH_PAGE_SIZE,
    keyword: normalizedKeyword,
  });
  const totalPages = Math.ceil(
    firstPage.total / LINK_KEYWORD_SEARCH_PAGE_SIZE,
  );
  const remainingPages = [];

  for (let page = 2; page <= totalPages; page += 1) {
    remainingPages.push(
      await listLinkUsers(accessToken, {
        page,
        pageSize: LINK_KEYWORD_SEARCH_PAGE_SIZE,
        keyword: normalizedKeyword,
      }),
    );
  }

  return Array.from(
    new Set(
      [firstPage, ...remainingPages]
        .flatMap((page) => page.users)
        .map((user) => user.id),
    ),
  );
};

export const listPeopleUsersByLinkIds = async (
  ids: number[],
  { canViewSensitiveInfo = false }: LookupOptions = {},
): Promise<Map<number, userType>> => {
  const idsKey = Array.from(
    new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0)),
  )
    .sort((a, b) => a - b)
    .join(",");
  return listPeopleUsersByLinkIdsCached(idsKey, canViewSensitiveInfo);
};

const listPeopleUsersByLinkIdsCached = cache(async (
  idsKey: string,
  canViewSensitiveInfo: boolean,
): Promise<Map<number, userType>> => {
  const uniqueIds = idsKey
    ? idsKey.split(",").map(Number)
    : [];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const accessToken = await getLinkAdminAccessTokenFromSession();
  const batches = chunk(uniqueIds, LINK_BATCH_USER_READ_LIMIT);
  const userBatches = [];
  for (const ids of batches) {
    const batch = await getLinkUsersByIds(accessToken, ids);
    userBatches.push(batch);
  }
  const users = userBatches.flat();
  return new Map(
    users.map((item) => [
      item.id,
      toPeopleUserFromLinkProfile(item, canViewSensitiveInfo),
    ]),
  );
});

const tryGetCurrentUserProfile = async (accessToken: string) => {
  try {
    return await getCurrentUserProfile(accessToken);
  } catch {
    return null;
  }
};
