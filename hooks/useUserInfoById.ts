'use server';
import { verifyRole } from '@/lib/dal';
import { getLinkUserDetail } from '@/lib/link/admin';
import { toPeopleUserFromLinkProfile } from '@/lib/link/people-user';
import { getLinkAdminAccessTokenFromSession } from '@/lib/link/session';

export const useUserInfoById = async (id: number) => {
  const session = await verifyRole(2);
  const canViewPhone = session.role >= 3;
  const canViewQq = session.role >= 2;

  try {
    const accessToken = await getLinkAdminAccessTokenFromSession();
    const userInfo = await getLinkUserDetail(accessToken, id);
    if (!userInfo) {
      throw new Error('User not found');
    }
    return {
      ...toPeopleUserFromLinkProfile(userInfo, canViewPhone),
      qq: canViewQq ? userInfo.qq_number ?? null : null,
    };
  } catch (error) {
    throw error;
  }
};
