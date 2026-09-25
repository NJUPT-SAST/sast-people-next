'use server';

import {
  findPeopleUserByStudentId,
  getPeopleUserByLinkId,
} from '@/lib/link/user-lookup';

export const checkUserByStuID = async (data: string) => {
  return (await findUserByStuID(data)) !== null;
};

export const findUserByStuID = async (data: string) =>
  findPeopleUserByStudentId(data);

export const findUserByUid = async (uid: number) => {
  try {
    return await getPeopleUserByLinkId(uid);
  } catch {
    throw new Error('错误的考生学号，请重新输入或扫描');
  }
};
