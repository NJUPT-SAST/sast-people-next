import { user } from '@/db/schema';
import type {
  LinkEmailType,
  LinkIdentity,
  LinkUserState,
} from '@/lib/link/types';
import { InferSelectModel } from 'drizzle-orm';

//用户管理相关的信息
export type userType = InferSelectModel<typeof user> & {
  nickname?: string | null;
  avatar?: string | null;
  emailType?: LinkEmailType | null;
  linkState?: LinkUserState | null;
  identities?: LinkIdentity[];
};
