import "server-only";

import { getLinkUserDetail, listLinkUsers } from "@/lib/link/admin";
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

const LINK_DETAIL_CONCURRENCY = 8;

const normalizeStudentId = (studentId: string | null | undefined) =>
  studentId?.trim().toUpperCase() ?? "";

const mapWithConcurrency = async <T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await mapper(values[index]);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, worker),
  );
  return results;
};

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

export const listPeopleUsersByLinkIds = async (
  ids: number[],
  { canViewSensitiveInfo = false }: LookupOptions = {},
): Promise<Map<number, userType>> => {
  const idsKey = Array.from(new Set(ids.filter((id) => Number.isFinite(id))))
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
  const users = await mapWithConcurrency(
    uniqueIds,
    LINK_DETAIL_CONCURRENCY,
    (id) => getLinkUserDetail(accessToken, id),
  );
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
