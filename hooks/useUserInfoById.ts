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
  const canViewPhone = session.role >= 3;
  const canViewQq = session.role >= 2;

  try {
    const accessToken = await getLinkAccessTokenFromSession();
    const userInfo = await getLinkUserDetail(accessToken, id);
    if (!userInfo) {
      throw new Error('User not found');
    }
    return {
      ...toPeopleUserFromLinkProfile(userInfo, canViewPhone),
      qq: canViewQq ? userInfo.qq_number ?? null : null,
    };
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
      return {
        ...userInfo[0],
        phone: canViewPhone ? userInfo[0].phone : null,
        qq: canViewQq ? userInfo[0].qq : null,
      };
    }
    throw err;
  }
};
