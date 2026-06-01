'use server';
import { db } from '@/db/drizzle';
import { user } from '@/db/schema';
import { verifyRole } from '@/lib/dal';
import { getLinkUserDetail } from '@/lib/link/admin';
import { toPeopleUserFromLinkProfile } from '@/lib/link/people-user';
import {
  canUseLegacyUserFallback,
  getLinkAccessTokenFromSession,
  MissingLinkAccessTokenError,
} from '@/lib/link/session';
import { eq } from 'drizzle-orm';

export const useUserInfoById = async (id: number) => {
  const session = await verifyRole(2);
  try {
    const accessToken = await getLinkAccessTokenFromSession();
    const userInfo = await getLinkUserDetail(accessToken, id);
    if (!userInfo) {
      throw new Error('User not found');
    }
    return toPeopleUserFromLinkProfile(userInfo, session.role >= 3);
  } catch (err) {
    if (
      err instanceof MissingLinkAccessTokenError &&
      canUseLegacyUserFallback()
    ) {
      const userInfo = await db
        .select()
        .from(user)
        .where(eq(user.id, id))
        .limit(1);
      if (userInfo.length === 0) {
        throw new Error('User not found');
      }
      return session.role >= 3
        ? userInfo[0]
        : { ...userInfo[0], phone: null, qq: null };
    }
    throw err;
  }
};
