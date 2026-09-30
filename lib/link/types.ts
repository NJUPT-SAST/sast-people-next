/* SAST Link 的 user_role_enum：freshman / member / manager(部长) / lecturer / admin */
export type LinkRole = "freshman" | "member" | "manager" | "lecturer" | "admin";

export type LinkUserState =
  | "njupter"
  | "on-sast"
  | "retired-sast"
  | "is_deleted";

/**
 * Link 部门标识由 SAST Link 维护（当前 software / media，扩展中的部门沿用 Link 原样返回的标识）。
 * People 不维护部门目录，因此这里按不透明字符串处理，避免 Link 扩展部门时被判为非法值。
 */
export type LinkDepartment = string;
export type LinkEmailType = "sast_email" | "njupt_email";
export type LinkLoginMethod = "github" | "lark" | "other_mail";

export type LinkResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type LinkProfile = {
  nickname?: string | null;
  department?: LinkDepartment | null;
  intro?: string | null;
  email?: string | null;
  avatar?: string | null;
  blog_url?: string | null;
  github_url?: string | null;
};

export type LinkIdentity = {
  id: number;
  provider: LinkLoginMethod;
  provider_id?: string | null;
  identity_data?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

export type LinkUserProfile = {
  id: number;
  name: string;
  login_email?: string | null;
  role: LinkRole;
  state: LinkUserState;
  email_type?: LinkEmailType;
  phone_number?: string | null;
  qq_number?: string | null;
  student_id?: string | null;
  college?: string | null;
  major?: string | null;
  profile?: LinkProfile | null;
  identities?: LinkIdentity[];
  created_at?: string;
  updated_at?: string;
};

export type LinkAdminUserItem = {
  id: number;
  name: string;
  student_id?: string | null;
  login_email?: string | null;
  phone_number?: string | null;
  qq_number?: string | null;
  role: LinkRole;
  state: LinkUserState;
  email_type?: LinkEmailType;
  department?: LinkDepartment | null;
  college?: string | null;
  major?: string | null;
  created_at?: string;
};

export type LinkUsersList = {
  users: LinkAdminUserItem[];
  total: number;
  page: number;
  page_size: number;
};

export type LinkBatchRoleUpdateResult = {
  id: number;
  success: boolean;
  role?: LinkRole;
  reason?: string;
};

export type LinkBatchRoleUpdateResponse = {
  results: LinkBatchRoleUpdateResult[];
};

export type LinkBatchDepartmentUpdateResult = {
  id: number;
  success: boolean;
  department?: LinkDepartment | null;
  reason?: string;
};

export type LinkBatchDepartmentUpdateResponse = {
  results: LinkBatchDepartmentUpdateResult[];
};

export type LinkListUsersParams = {
  page?: number;
  pageSize?: number;
  role?: LinkRole;
  state?: LinkUserState;
  department?: LinkDepartment;
  studentId?: string;
  keyword?: string;
};
