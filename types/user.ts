import type {
  LinkEmailType,
  LinkIdentity,
  LinkUserState,
} from '@/lib/link/types';
/** Link identity data exposed to People pages. It is not a People database row. */
export type userType = {
  id: number;
  name: string;
  studentId: string | null;
  email: string | null;
  phone: string | null;
  college: string | null;
  major: string | null;
  departments: string[];
  github: string | null;
  blog: string | null;
  personalStatement: string | null;
  qq: string | null;
  role: number | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean | null;
  /** true = 本次渲染时 Link 不可用，字段来自会话降级而非 Link 资料 */
  profileUnavailable?: boolean;
  nickname?: string | null;
  avatar?: string | null;
  emailType?: LinkEmailType | null;
  linkState?: LinkUserState | null;
  identities?: LinkIdentity[];
};
