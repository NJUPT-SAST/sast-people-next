'use server';

import {
  findPeopleUserByStudentId,
  getPeopleUserByLinkId,
} from '@/lib/link/user-lookup';

export const checkUserByStuID = async (data: string) => {
  const userInfo = await findPeopleUserByStudentId(data);
  return userInfo !== null;
};

export const findUserByUid = async (uid: number) => {
  try {
    return await getPeopleUserByLinkId(uid);
  } catch {
    throw new Error('错误的考生学号，请重新输入或扫描');
  }
};
