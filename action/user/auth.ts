'use server';
import { db } from '@/db/drizzle';
import { user } from '@/db/schema';
import { eq, or } from 'drizzle-orm';
import { createSession, deleteSession } from '@/lib/session';
import { logServerError } from '@/lib/server-error-log';

import { userType } from '@/types/user';

const assertLegacyAuthAllowed = () => {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.PEOPLE_ALLOW_LEGACY_AUTH !== 'true'
  ) {
    throw new Error('旧 People 登录已关闭，请使用 SAST Link 登录。');
  }
};

export async function loginFromX(
  openid: string,
  userIdentifier: string,
  type: 'feishu' | 'link',
) {
  try {
    assertLegacyAuthAllowed();
    let uidList: Partial<userType>[] | null = null;
    // check if openid exists
    if (type === 'feishu') {
      uidList = await db.select().from(user).where(eq(user.feishuOpenid, openid));
      if (!uidList || uidList.length === 0) {
        uidList = await db
          .insert(user)
          .values({
            feishuOpenid: openid,
            name: userIdentifier,
            role: 2,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning({
            id: user.id,
            name: user.name,
            isDeleted: user.isDeleted,
            role: user.role,
          });
      }
    } else if (type === 'link') {
      uidList = await db
        .select({
          id: user.id,
          name: user.name,
          linkOpenid: user.linkOpenid,
          isDeleted: user.isDeleted,
          role: user.role,
        })
        .from(user)
        .where(
          or(eq(user.linkOpenid, openid), eq(user.studentId, userIdentifier)),
        )
        .limit(1);
      if (!uidList || uidList.length === 0) {
        uidList = await db
          .insert(user)
          .values({
            linkOpenid: openid,
            name: userIdentifier,
            studentId: userIdentifier,
            role: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning({
            id: user.id,
            name: user.name,
            isDeleted: user.isDeleted,
            role: user.role,
          });
      } else {
        if (uidList[0].linkOpenid !== openid) {
          await db
            .update(user)
            .set({
              linkOpenid: openid,
              updatedAt: new Date(),
            })
            .where(eq(user.id, uidList[0].id as number));
        }
      }
    }
    if (uidList && uidList.length > 0 && !uidList[0].isDeleted) {
      await createSession(
        uidList[0].id as number,
        uidList[0].name || userIdentifier,
        uidList[0].role || 0,
      );
    } else {
      throw new Error('login failed');
    }
  } catch (error) {
    logServerError('auth:loginFromX', error, {
      path: '/login',
      action: 'login-from-oauth',
      metadata: { type },
    });
    throw error;
  }
}

export async function loginFromTest(formData: FormData) {
  const studentId = formData.get('studentId') as string;
  try {
    assertLegacyAuthAllowed();
    const uidList = await db
      .select({
        uid: user.id,
        name: user.name,
        role: user.role,
      })
      .from(user)
      .where(eq(user.studentId, studentId));
    if (uidList && uidList.length > 0) {
      await createSession(uidList[0].uid, uidList[0].name || studentId, uidList[0].role || 0);
      return uidList[0].uid;
    } else {
      throw new Error('login failed');
    }
  } catch (error) {
    logServerError('auth:loginFromTest', error, {
      path: '/login',
      action: 'login-from-test',
    });
    throw error;
  }
}

export async function logout() {
  await deleteSession();
}
