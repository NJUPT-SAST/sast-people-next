import "server-only";

import { db } from "@/db/drizzle";
import { user } from "@/db/schema";
import { getLinkUserDetail, listLinkUsers } from "@/lib/link/admin";
import { getCurrentUserProfile } from "@/lib/link/user";
import {
  toPeopleUserFromLinkAdminItem,
  toPeopleUserFromLinkProfile,
} from "@/lib/link/people-user";
import {
  canUseLegacyUserFallback,
  getLinkAccessTokenFromSession,
  MissingLinkAccessTokenError,
} from "@/lib/link/session";
import type { userType } from "@/types/user";
import { eq, inArray } from "drizzle-orm";

type LookupOptions = {
  canViewSensitiveInfo?: boolean;
};

const normalizeStudentId = (studentId: string | null | undefined) =>
  studentId?.trim().toUpperCase() ?? "";

export const getPeopleUserByLinkId = async (
  id: number,
  { canViewSensitiveInfo = false }: LookupOptions = {},
): Promise<userType> => {
  try {
    const accessToken = await getLinkAccessTokenFromSession();
    const currentUser = await tryGetCurrentUserProfile(accessToken);

    if (currentUser?.id === id) {
      return toPeopleUserFromLinkProfile(currentUser, canViewSensitiveInfo);
    }

    const userInfo = await getLinkUserDetail(accessToken, id);
    return toPeopleUserFromLinkProfile(userInfo, canViewSensitiveInfo);
  } catch (err) {
    if (
      err instanceof MissingLinkAccessTokenError &&
      canUseLegacyUserFallback()
    ) {
      const userInfo = await getLegacyPeopleUserById(id);
      if (userInfo) {
        return canViewSensitiveInfo
          ? userInfo
          : { ...userInfo, phone: null, qq: null };
      }
    }
    throw err;
  }
};

export const findPeopleUserByStudentId = async (
  studentId: string,
  { canViewSensitiveInfo = false }: LookupOptions = {},
): Promise<userType | null> => {
  const normalizedStudentId = normalizeStudentId(studentId);
  if (!normalizedStudentId) {
    return null;
  }

  try {
    const accessToken = await getLinkAccessTokenFromSession();
    const currentUser = await tryGetCurrentUserProfile(accessToken);

    if (
      currentUser &&
      normalizeStudentId(currentUser.student_id) === normalizedStudentId &&
      currentUser.state !== "is_deleted"
    ) {
      return toPeopleUserFromLinkProfile(currentUser, canViewSensitiveInfo);
    }

    const result = await listLinkUsers(accessToken, {
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
  } catch (err) {
    if (
      err instanceof MissingLinkAccessTokenError &&
      canUseLegacyUserFallback()
    ) {
      const userInfo = await getLegacyPeopleUserByStudentId(normalizedStudentId);
      if (userInfo) {
        return canViewSensitiveInfo
          ? userInfo
          : { ...userInfo, phone: null, qq: null };
      }
      return null;
    }
    throw err;
  }
};

export const listPeopleUsersByLinkIds = async (
  ids: number[],
  { canViewSensitiveInfo = false }: LookupOptions = {},
): Promise<Map<number, userType>> => {
  const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isFinite(id))));
  if (uniqueIds.length === 0) {
    return new Map();
  }

  try {
    const accessToken = await getLinkAccessTokenFromSession();
    const users = await Promise.all(
      uniqueIds.map((id) => getLinkUserDetail(accessToken, id)),
    );
    return new Map(
      users.map((item) => [
        item.id,
        toPeopleUserFromLinkProfile(item, canViewSensitiveInfo),
      ]),
    );
  } catch (err) {
    if (
      err instanceof MissingLinkAccessTokenError &&
      canUseLegacyUserFallback()
    ) {
      const users = await db.select().from(user).where(inArray(user.id, uniqueIds));
      return new Map(
        users.map((item) => [
          item.id,
          canViewSensitiveInfo ? item : { ...item, phone: null, qq: null },
        ]),
      );
    }
    throw err;
  }
};

const tryGetCurrentUserProfile = async (accessToken: string) => {
  try {
    return await getCurrentUserProfile(accessToken);
  } catch {
    return null;
  }
};

const getLegacyPeopleUserById = async (id: number) => {
  return (
    await db.select().from(user).where(eq(user.id, id)).limit(1)
  )[0] ?? null;
};

const getLegacyPeopleUserByStudentId = async (studentId: string) => {
  return (
    await db
      .select()
      .from(user)
      .where(eq(user.studentId, studentId))
      .limit(1)
  )[0] ?? null;
};
