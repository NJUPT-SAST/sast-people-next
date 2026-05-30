export type LinkRole = "freshman" | "member" | "lecturer" | "admin";

export type LinkUserState =
  | "njupter"
  | "on-sast"
  | "retired-sast"
  | "is_deleted";

export type LinkDepartment = "software" | "media";

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

export type LinkUserProfile = {
  id: number;
  name: string;
  login_email?: string | null;
  role: LinkRole;
  state: LinkUserState;
  email_type?: "sast_email" | "njupt_email";
  phone_number?: string | null;
  qq_number?: string | null;
  student_id?: string | null;
  college?: string | null;
  major?: string | null;
  profile?: LinkProfile | null;
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

export type LinkListUsersParams = {
  page?: number;
  pageSize?: number;
  role?: LinkRole;
  state?: LinkUserState;
  department?: LinkDepartment;
  keyword?: string;
};
