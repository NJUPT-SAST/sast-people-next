import type {
  LinkAdminUserItem,
  LinkListUsersParams,
  LinkRole,
  LinkUserProfile,
  LinkUsersList,
} from "@/lib/link/types";

const mockUsers: LinkUserProfile[] = [
  {
    id: 1,
    name: "管理员",
    login_email: "admin@sast.fun",
    role: "admin",
    state: "on-sast",
    phone_number: "13800000000",
    qq_number: "100000",
    student_id: "B00000001",
    college: "计算机学院",
    major: "软件工程",
    profile: {
      nickname: "Admin",
      department: "software",
      intro: "SAST People 管理员",
      email: "admin@sast.fun",
      blog_url: "https://sast.fun",
      github_url: "https://github.com/NJUPT-SAST",
    },
    created_at: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  },
  {
    id: 2,
    name: "新同学",
    login_email: "student@njupt.edu.cn",
    role: "freshman",
    state: "njupter",
    phone_number: "13900000000",
    qq_number: "200000",
    student_id: "B00000002",
    college: "通信与信息工程学院",
    major: "通信工程",
    profile: {
      department: "software",
      intro: "准备报名招新",
      email: "student@njupt.edu.cn",
    },
    created_at: new Date("2026-01-02T00:00:00.000Z").toISOString(),
  },
];

const toAdminItem = (user: LinkUserProfile): LinkAdminUserItem => ({
  id: user.id,
  name: user.name,
  student_id: user.student_id,
  login_email: user.login_email,
  phone_number: user.phone_number,
  qq_number: user.qq_number,
  role: user.role,
  state: user.state,
  department: user.profile?.department,
  college: user.college,
  major: user.major,
  created_at: user.created_at,
});

export const getMockCurrentUserProfile = async () => mockUsers[0];

export const listMockUsers = async ({
  page = 1,
  pageSize = 20,
  role,
  state,
  department,
  keyword,
}: LinkListUsersParams = {}): Promise<LinkUsersList> => {
  const normalizedKeyword = keyword?.trim().toLowerCase();
  const filtered = mockUsers.filter((user) => {
    if (role && user.role !== role) return false;
    if (state && user.state !== state) return false;
    if (department && user.profile?.department !== department) return false;
    if (!normalizedKeyword) return true;
    return [user.name, user.student_id, user.login_email]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(normalizedKeyword));
  });

  const start = (page - 1) * pageSize;
  const users = filtered.slice(start, start + pageSize).map(toAdminItem);

  return {
    users,
    total: filtered.length,
    page,
    page_size: pageSize,
  };
};

export const getMockUserDetail = async (id: number) => {
  const user = mockUsers.find((item) => item.id === id);
  if (!user) throw new Error("Mock Link user not found");
  return user;
};

export const updateMockUserRole = async (id: number, role: LinkRole) => {
  const user = mockUsers.find((item) => item.id === id);
  if (!user) throw new Error("Mock Link user not found");
  user.role = role;
};

export const banMockUser = async (id: number) => {
  const user = mockUsers.find((item) => item.id === id);
  if (!user) throw new Error("Mock Link user not found");
  user.state = "is_deleted";
};
