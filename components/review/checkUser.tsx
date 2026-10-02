'use server';

import { verifyScopedRole } from '@/lib/authz';
import {
  findPeopleUserByStudentId,
  getPeopleUserByLinkId,
} from '@/lib/link/user-lookup';

/**
 * 阅卷用的考生查询。这些函数是 server action（被 `'use client'` 的阅卷组件直接调用），
 * 因此必须在服务端校验身份：只有讲师及以上（阅卷岗位）才能按学号 / uid 查到考生资料，
 * 否则任何人都能枚举成员信息。
 */
export const findUserByStuID = async (data: string) => {
  await verifyScopedRole(2);
  return findPeopleUserByStudentId(data);
};

export const findUserByUid = async (uid: number) => {
  await verifyScopedRole(2);
  try {
    return await getPeopleUserByLinkId(uid);
  } catch {
    throw new Error('错误的考生学号，请重新输入或扫描');
  }
};