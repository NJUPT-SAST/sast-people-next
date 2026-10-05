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
  type SensitiveFieldVisibility,
} from "@/lib/link/people-user";
import {
  getLinkAdminAccessTokenFromSession,
  getLinkAccessTokenFromSession,
} from "@/lib/link/session";
import { isLinkAuthorizationError } from "@/lib/link/client";
import type { userType } from "@/types/user";
import { cache } from "react";

type LookupOptions = {
  /** 手机号：role ≥ 3（部长/管理员） */
  canViewSensitiveInfo?: boolean;
  /** QQ：role ≥ 2（讲师及以上）；不传时跟随 canViewSensitiveInfo */
  canViewQq?: boolean;
};

/** 敏感信息按字段收敛：QQ 的门槛比手机号低（讲师要能联系候选人） */
const toFieldVisibility = ({
  canViewSensitiveInfo = false,
  canViewQq,
}: LookupOptions = {}): SensitiveFieldVisibility => ({
  canViewPhone: canViewSensitiveInfo,
  canViewQq: canViewQq ?? canViewSensitiveInfo,
});

const LINK_BATCH_USER_READ_LIMIT = 100;
const LINK_KEYWORD_SEARCH_PAGE_SIZE = 100;

const normalizeStudentId = (studentId: string | null | undefined) =>
  studentId?.trim().toUpperCase() ?? "";

const studentIdQueryVariants = (studentId: string) =>
  Array.from(new Set([
    studentId.trim(),
    studentId.trim().toUpperCase(),
    studentId.trim().toLowerCase(),
  ].filter(Boolean)));

const chunk = <T,>(values: T[], size: number) =>
  Array.from(
    { length: Math.ceil(values.length / size) },
    (_, index) => values.slice(index * size, (index + 1) * size),
  );

const findMatchingStudentInPages = async (
  accessToken: string,
  params: { studentId?: string; keyword?: string },
  normalizedStudentId: string,
) => {
  const findMatch = (page: Awaited<ReturnType<typeof listLinkUsers>>) =>
    page.users.find(
      (item) =>
        normalizeStudentId(item.student_id) === normalizedStudentId &&
        item.state !== "is_deleted",
    );
  const firstPage = await listLinkUsers(accessToken, {
    ...params,
    page: 1,
    pageSize: 100,
  });
  const firstMatch = findMatch(firstPage);
  if (firstMatch) return firstMatch;

  const totalPages = Math.ceil(firstPage.total / firstPage.page_size);

  for (let page = 2; page <= totalPages; page += 1) {
    const pageResult = await listLinkUsers(accessToken, {
      ...params,
      page,
      pageSize: 100,
    });
    const match = findMatch(pageResult);
    if (match) return match;
  }

  return undefined;
};

export const getPeopleUserByLinkId = async (
  id: number,
  options: LookupOptions = {},
): Promise<userType> => {
  const visibility = toFieldVisibility(options);
  const accessToken = await getLinkAccessTokenFromSession();
  const currentUser = await tryGetCurrentUserProfile(accessToken);

  if (currentUser?.id === id) {
    return toPeopleUserFromLinkProfile(currentUser, visibility);
  }

  const adminAccessToken = await getLinkAdminAccessTokenFromSession();
  const userInfo = await getLinkUserDetail(adminAccessToken, id);
  return toPeopleUserFromLinkProfile(userInfo, visibility);
};

export const findPeopleUserByStudentId = async (
  studentId: string,
  options: LookupOptions = {},
): Promise<userType | null> => {
  const visibility = toFieldVisibility(options);
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
    return toPeopleUserFromLinkProfile(currentUser, visibility);
  }

  const adminAccessToken = await getLinkAdminAccessTokenFromSession();
  let matchedUser;
  for (const queryStudentId of studentIdQueryVariants(studentId)) {
    matchedUser = await findMatchingStudentInPages(
      adminAccessToken,
      { studentId: queryStudentId },
      normalizedStudentId,
    );
    if (matchedUser) break;
  }

  // Some Link deployments apply the student_id filter byte-for-byte. Retry
  // with keyword search so casing/whitespace differences do not hide a user
  // whose ID is already shown elsewhere by ID-based lookups.
  if (!matchedUser) {
    matchedUser = await findMatchingStudentInPages(
      adminAccessToken,
      { keyword: normalizedStudentId },
      normalizedStudentId,
    );
  }

  return matchedUser
    ? toPeopleUserFromLinkAdminItem(matchedUser, visibility)
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
  options: LookupOptions = {},
): Promise<Map<number, userType>> => {
  const { canViewPhone, canViewQq } = toFieldVisibility(options);
  const idsKey = Array.from(
    new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0)),
  )
    .sort((a, b) => a - b)
    .join(",");
  return listPeopleUsersByLinkIdsCached(idsKey, canViewPhone, canViewQq);
};

const listPeopleUsersByLinkIdsCached = cache(async (
  idsKey: string,
  canViewPhone: boolean,
  canViewQq: boolean,
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
      toPeopleUserFromLinkProfile(item, { canViewPhone, canViewQq }),
    ]),
  );
});

const tryGetCurrentUserProfile = async (accessToken: string) => {
  try {
    return await getCurrentUserProfile(accessToken);
  } catch (error) {
    if (isLinkAuthorizationError(error)) throw error;
    return null;
  }
};
