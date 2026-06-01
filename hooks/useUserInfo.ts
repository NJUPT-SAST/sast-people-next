import { verifySession } from '../lib/dal';
import { db } from '@/db/drizzle';
import { user } from '@/db/schema';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { isNextControlFlowError, logServerError } from '@/lib/server-error-log';
import { getCurrentUserProfile } from '@/lib/link/user';
import {
  canUseLegacyUserFallback,
  getLinkAccessTokenFromSession,
  MissingLinkAccessTokenError,
} from '@/lib/link/session';
import { toPeopleUserFromLinkProfile } from '@/lib/link/people-user';
import { eq } from 'drizzle-orm';

export const useUserInfo = cache(async () => {
  try {
    const session = await verifySession();
    try {
      const accessToken = await getLinkAccessTokenFromSession();
      const userInfo = await getCurrentUserProfile(accessToken);
      if (!userInfo) {
        redirect('/login');
      }
      return toPeopleUserFromLinkProfile(userInfo, true);
    } catch (err) {
      if (
        err instanceof MissingLinkAccessTokenError &&
        canUseLegacyUserFallback()
      ) {
        const userInfo = await db
          .select()
          .from(user)
          .where(eq(user.id, session.uid))
          .limit(1);
        if (!userInfo[0]) {
          redirect('/login');
        }
        return userInfo[0];
      }
      if (err instanceof MissingLinkAccessTokenError) {
        redirect('/login');
      }
      throw err;
    }
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    console.error("useUserInfo error:", err);
    logServerError('dashboard:useUserInfo', err, {
      path: '/dashboard',
      action: 'load-current-user',
    });
    throw err;
  }
});
