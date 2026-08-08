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
    name: "Local Admin",
    login_email: "admin@sast.fun",
    role: "admin",
    state: "on-sast",
    phone_number: "13800001111",
    qq_number: "100000",
    student_id: "001",
    college: "计算机学院、软件学院、网络空间安全学院",
    major: "软件工程",
    profile: {
      nickname: "Admin",
      department: "software",
      intro: "本地管理员账号",
      email: "admin@sast.fun",
      blog_url: "https://sast.fun",
      github_url: "https://github.com/NJUPT-SAST",
    },
    identities: [
      {
        id: 1001,
        provider: "lark",
        provider_id: "mock-admin-lark",
        created_at: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      },
      {
        id: 1002,
        provider: "github",
        provider_id: "NJUPT-SAST",
        created_at: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      },
    ],
    created_at: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  },
  {
    id: 2,
    name: "Demo Lecturer",
    login_email: "lecturer@njupt.edu.cn",
    role: "lecturer",
    state: "on-sast",
    phone_number: "13800002222",
    qq_number: "200000",
    student_id: "002",
    college: "计算机学院、软件学院、网络空间安全学院",
    major: "网络空间安全",
    profile: {
      department: "software",
      intro: "负责阅卷和面评的讲师账号",
      email: "lecturer@njupt.edu.cn",
      blog_url: "https://lecturer.example.com",
      github_url: "https://github.com/demo-lecturer",
    },
    identities: [
      {
        id: 2001,
        provider: "lark",
        provider_id: "mock-lecturer-lark",
        created_at: new Date("2026-01-02T00:00:00.000Z").toISOString(),
      },
    ],
    created_at: new Date("2026-01-02T00:00:00.000Z").toISOString(),
  },
  {
    id: 3,
    name: "Demo Member",
    login_email: "member@njupt.edu.cn",
    role: "member",
    state: "on-sast",
    phone_number: "13800003333",
    qq_number: "300000",
    student_id: "003",
    college: "通信与信息工程学院",
    major: "通信工程",
    profile: {
      department: "media",
      intro: "在读成员账号",
      email: "member@njupt.edu.cn",
      blog_url: "https://member.example.com",
      github_url: "https://github.com/demo-member",
    },
    created_at: new Date("2026-01-03T00:00:00.000Z").toISOString(),
  },
  {
    id: 4,
    name: "Demo Freshman A",
    login_email: "freshman-a@njupt.edu.cn",
    role: "freshman",
    state: "njupter",
    phone_number: "13800004444",
    qq_number: "400000",
    student_id: "B260001",
    college: "计算机学院、软件学院、网络空间安全学院",
    major: "软件工程",
    profile: {
      intro: "喜欢 Web 开发和工程化",
      email: "freshman-a@njupt.edu.cn",
      blog_url: "https://portfolio-a.example.com",
    },
    created_at: new Date("2026-01-04T00:00:00.000Z").toISOString(),
  },
  {
    id: 5,
    name: "Demo Freshman B",
    login_email: "freshman-b@njupt.edu.cn",
    role: "freshman",
    state: "njupter",
    phone_number: "13800005555",
    qq_number: "500000",
    student_id: "B260002",
    college: "人工智能学院",
    major: "人工智能",
    profile: {
      intro: "做过一些机器学习小项目",
      email: "freshman-b@njupt.edu.cn",
      blog_url: "https://portfolio-b.example.com",
      github_url: "https://github.com/demo-b",
    },
    created_at: new Date("2026-01-05T00:00:00.000Z").toISOString(),
  },
  {
    id: 6,
    name: "Demo Freshman C",
    login_email: "freshman-c@njupt.edu.cn",
    role: "freshman",
    state: "njupter",
    phone_number: "13800006666",
    qq_number: "600000",
    student_id: "B260003",
    college: "传媒与艺术学院",
    major: "数字媒体艺术",
    profile: {
      intro: "偏设计和视觉表达",
      email: "freshman-c@njupt.edu.cn",
      blog_url: "https://portfolio-c.example.com",
    },
    created_at: new Date("2026-01-06T00:00:00.000Z").toISOString(),
  },
  {
    id: 7,
    name: "Demo Freshman D",
    login_email: "freshman-d@njupt.edu.cn",
    role: "freshman",
    state: "njupter",
    phone_number: "13800007777",
    qq_number: "700000",
    student_id: "B260004",
    college: "物联网学院",
    major: "物联网工程",
    profile: {
      intro: "喜欢硬件和嵌入式",
      email: "freshman-d@njupt.edu.cn",
      blog_url: "https://portfolio-d.example.com",
      github_url: "https://github.com/demo-d",
    },
    created_at: new Date("2026-01-07T00:00:00.000Z").toISOString(),
  },
  {
    id: 8,
    name: "Demo Freshman E",
    login_email: "freshman-e@njupt.edu.cn",
    role: "freshman",
    state: "njupter",
    phone_number: "13800008888",
    qq_number: "800000",
    student_id: "B260005",
    college: "外国语学院",
    major: "英语",
    profile: {
      intro: "希望参与社团运营和内容工作",
      email: "freshman-e@njupt.edu.cn",
      blog_url: "https://portfolio-e.example.com",
    },
    created_at: new Date("2026-01-08T00:00:00.000Z").toISOString(),
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
  studentId,
  keyword,
}: LinkListUsersParams = {}): Promise<LinkUsersList> => {
  const normalizedKeyword = keyword?.trim().toLowerCase();
  const filtered = mockUsers.filter((user) => {
    if (role && user.role !== role) return false;
    if (state && user.state !== state) return false;
    if (department && user.profile?.department !== department) return false;
    if (studentId && user.student_id !== studentId) return false;
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
