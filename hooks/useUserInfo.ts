import { db } from '@/db/drizzle';
import { verifySession } from '../lib/dal';
import { user } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { redirect } from 'next/navigation';

export const useUserInfo = cache(async () => {
  const session = await verifySession();
  const userInfo = await db.select().from(user).where(eq(user.id, session.uid));
  if (!userInfo[0]) {
    redirect('/login');
  }
  return userInfo[0];
});
