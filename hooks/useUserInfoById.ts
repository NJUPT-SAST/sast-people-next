'use server';
import { verifyRole } from '@/lib/dal';
import { getLinkUserDetail } from '@/lib/link/admin';
import { toPeopleUserFromLinkProfile } from '@/lib/link/people-user';
import { getLinkAdminAccessTokenFromSession } from '@/lib/link/session';

/**
 * 成员详情：讲师及以上都能查看任意成员（与成员目录一致，Link 用户目录本身不限部门），
 * 敏感字段按角色收敛：手机号 role ≥ 3（部长/管理员），QQ role ≥ 2。
 */
export const useUserInfoById = async (id: number) => {
  const session = await verifyRole(2);
  const canViewPhone = session.role >= 3;
  const canViewQq = session.role >= 2;

  const accessToken = await getLinkAdminAccessTokenFromSession();
  const userInfo = await getLinkUserDetail(accessToken, id);
  if (!userInfo) {
    throw new Error('User not found');
  }

  return {
    ...toPeopleUserFromLinkProfile(userInfo, canViewPhone),
    qq: canViewQq ? userInfo.qq_number ?? null : null,
  };
};
