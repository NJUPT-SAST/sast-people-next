import { db } from '@/db/drizzle';
import { verifySession } from '../lib/dal';
import { user } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import fs from 'node:fs';

export const useUserInfo = cache(async () => {
  try {
    const session = await verifySession();
    const userInfo = await db.select().from(user).where(eq(user.id, session.uid));
    if (!userInfo[0]) {
      redirect('/login');
    }
    return userInfo[0];
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    console.error("useUserInfo error:", err);
    try {
      fs.appendFileSync(
        "/tmp/sast-error-log.txt",
        `[${new Date().toISOString()}] useUserInfo error\n` +
        `name: ${err instanceof Error ? err.name : 'Unknown'}\n` +
        `message: ${err instanceof Error ? err.message : String(err)}\n` +
        `stack: ${err instanceof Error ? err.stack : 'none'}\n` +
        `---\n`
      );
    } catch {}
    throw err;
  }
});
