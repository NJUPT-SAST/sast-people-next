import { db } from '@/db/drizzle';
import { verifySession } from '../lib/dal';
import { user } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { isNextControlFlowError, logServerError } from '@/lib/server-error-log';

export const useUserInfo = cache(async () => {
  try {
    const session = await verifySession();
    const userInfo = await db.select().from(user).where(eq(user.id, session.uid));
    if (!userInfo[0]) {
      redirect('/login');
    }
    return userInfo[0];
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
