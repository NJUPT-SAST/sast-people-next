import type {
  LinkAdminUserItem,
  LinkDepartment,
  LinkListUsersParams,
  LinkRole,
  LinkUserProfile,
  LinkUsersList,
} from "@/lib/link/types";

/**
 * Local Link fixtures.
 *
 * Shapes deliberately match production so screens can be tuned against them: a
 * name is two to four characters, a student id is one letter plus eight digits,
 * a QQ number runs five to ten digits, and a phone number is eleven. Names are
 * fictional; earlier versions used "Demo Freshman A" and six-digit ids, which
 * made every candidate column render wider than it does for real users.
 */
const mockBaseUsers: LinkUserProfile[] = [
  {
    id: 1,
    name: "管理员",
    login_email: "admin@sast.fun",
    role: "admin",
    state: "on-sast",
    phone_number: "13800001111",
    qq_number: "3812047",
    student_id: "B00040001",
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
    name: "讲师",
    login_email: "B00040002@njupt.edu.cn",
    role: "lecturer",
    state: "on-sast",
    phone_number: "13800002222",
    qq_number: "92741053",
    student_id: "B00040002",
    college: "计算机学院、软件学院、网络空间安全学院",
    major: "网络空间安全",
    profile: {
      department: "software",
      intro: "负责阅卷和面评的讲师账号",
      email: "B00040002@njupt.edu.cn",
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
    name: "沈亦舟",
    login_email: "B00040003@njupt.edu.cn",
    role: "member",
    state: "on-sast",
    phone_number: "13800003333",
    qq_number: "551208",
    student_id: "B00040003",
    college: "通信与信息工程学院",
    major: "通信工程",
    profile: {
      department: "media",
      intro: "在读成员账号",
      email: "B00040003@njupt.edu.cn",
      blog_url: "https://member.example.com",
      github_url: "https://github.com/demo-member",
    },
    created_at: new Date("2026-01-03T00:00:00.000Z").toISOString(),
  },
  {
    id: 4,
    name: "王思远",
    login_email: "B00040004@njupt.edu.cn",
    role: "freshman",
    state: "njupter",
    phone_number: "13800004444",
    qq_number: "1024563",
    student_id: "B00040004",
    college: "计算机学院、软件学院、网络空间安全学院",
    major: "软件工程",
    profile: {
      intro: "喜欢 Web 开发和工程化",
      email: "B00040004@njupt.edu.cn",
      blog_url: "https://portfolio-a.example.com",
    },
    created_at: new Date("2026-01-04T00:00:00.000Z").toISOString(),
  },
  {
    id: 5,
    name: "李瑶",
    login_email: "B00040005@njupt.edu.cn",
    role: "freshman",
    state: "njupter",
    phone_number: "13800005555",
    qq_number: "84627",
    student_id: "B00040005",
    college: "人工智能学院",
    major: "人工智能",
    profile: {
      intro: "做过一些机器学习小项目",
      email: "B00040005@njupt.edu.cn",
      blog_url: "https://portfolio-b.example.com",
      github_url: "https://github.com/demo-b",
    },
    created_at: new Date("2026-01-05T00:00:00.000Z").toISOString(),
  },
  {
    id: 6,
    name: "张昊然",
    login_email: "B00040006@njupt.edu.cn",
    role: "freshman",
    state: "njupter",
    phone_number: "13800006666",
    qq_number: "1937405289",
    student_id: "B00040006",
    college: "传媒与艺术学院",
    major: "数字媒体艺术",
    profile: {
      intro: "偏设计和视觉表达",
      email: "B00040006@njupt.edu.cn",
      blog_url: "https://portfolio-c.example.com",
    },
    created_at: new Date("2026-01-06T00:00:00.000Z").toISOString(),
  },
  {
    id: 7,
    name: "欧阳文博",
    login_email: "B00040007@njupt.edu.cn",
    role: "freshman",
    state: "njupter",
    phone_number: "13800007777",
    qq_number: "7741026",
    student_id: "B00040007",
    college: "物联网学院",
    major: "物联网工程",
    profile: {
      intro: "喜欢硬件和嵌入式",
      email: "B00040007@njupt.edu.cn",
      blog_url: "https://portfolio-d.example.com",
      github_url: "https://github.com/demo-d",
    },
    created_at: new Date("2026-01-07T00:00:00.000Z").toISOString(),
  },
  {
    id: 8,
    name: "吴承宇",
    login_email: "B00040008@njupt.edu.cn",
    role: "freshman",
    state: "njupter",
    phone_number: "13800008888",
    qq_number: "203891",
    student_id: "B00040008",
    college: "外国语学院",
    major: "英语",
    profile: {
      intro: "希望参与社团运营和内容工作",
      email: "B00040008@njupt.edu.cn",
      blog_url: "https://portfolio-e.example.com",
    },
    created_at: new Date("2026-01-08T00:00:00.000Z").toISOString(),
  },
  {
    // The demo seed schedules candidates 9 and 10 in a third flow, so they need
    // to exist here or the list renders them as 未知用户.
    id: 9,
    name: "郑一凡",
    login_email: "B00040009@njupt.edu.cn",
    role: "freshman",
    state: "njupter",
    phone_number: "13800009909",
    qq_number: "415820",
    student_id: "B00040009",
    college: "自动化学院、人工智能学院",
    major: "自动化",
    profile: {
      intro: "对后端和数据库感兴趣",
      email: "B00040009@njupt.edu.cn",
      blog_url: "https://portfolio-f.example.com",
    },
    created_at: new Date("2026-01-09T00:00:00.000Z").toISOString(),
  },
  {
    id: 10,
    name: "苏若彤",
    login_email: "B00040010@njupt.edu.cn",
    role: "freshman",
    state: "njupter",
    phone_number: "13800001010",
    qq_number: "3091847",
    student_id: "B00040010",
    college: "计算机学院、软件学院、网络空间安全学院",
    major: "计算机科学与技术",
    profile: {
      intro: "写过一些前端小工具",
      email: "B00040010@njupt.edu.cn",
      blog_url: "https://portfolio-g.example.com",
    },
    created_at: new Date("2026-01-10T00:00:00.000Z").toISOString(),
  },
  {
    // A second lecturer, so the demo has more than one interview organiser and
    // the list exercises the "only the organiser may act" copy.
    id: 11,
    name: "讲师二",
    login_email: "B00040011@njupt.edu.cn",
    role: "lecturer",
    state: "on-sast",
    phone_number: "13800009999",
    qq_number: "6284015",
    student_id: "B00040011",
    college: "计算机学院、软件学院、网络空间安全学院",
    major: "计算机科学与技术",
    profile: {
      department: "software",
      intro: "第二位讲师账号，用于演示多人面试排期",
      email: "B00040011@njupt.edu.cn",
      blog_url: "https://lecturer-2.example.com",
      github_url: "https://github.com/demo-lecturer-2",
    },
    identities: [
      {
        id: 2002,
        provider: "lark",
        provider_id: "mock-lecturer-2-lark",
        created_at: new Date("2026-01-09T00:00:00.000Z").toISOString(),
      },
    ],
    created_at: new Date("2026-01-09T00:00:00.000Z").toISOString(),
  },
];

/**
 * 本地 mock 的部门演示账号：管理员 `B00000000`、各部门部长 `B<d>1111111`、
 * 讲师 `B<d>0000001`、成员 `B<d>0000002` / `B<d>0000003`（d = 部门序号 1-7）。
 * 部门标识与 Link 保持同一风格（software / media 为 Link 现有值，其余为本地演示标识）。
 */
const mockDepartmentSeeds = [
  { index: 1, department: "software", label: "软件研发部", college: "计算机学院、软件学院、网络空间安全学院", major: "软件工程", names: ["陈屹", "周礼", "方雨桐", "何书宁"] },
  { index: 2, department: "media", label: "多媒体部", college: "传媒与艺术学院", major: "数字媒体艺术", names: ["江之南", "秦朗", "叶知秋", "唐棠"] },
  { index: 3, department: "electronics", label: "电子部", college: "电子与光学工程学院", major: "电子科学与技术", names: ["顾岩", "范晓", "卢星野", "段沐"] },
  { index: 4, department: "office", label: "办公室", college: "管理学院", major: "工商管理", names: ["邵晨", "邹文", "崔宁", "万清"] },
  { index: 5, department: "liaison", label: "外联部", college: "经济学院", major: "国际经济与贸易", names: ["傅斯白", "石川", "龙映", "洪奕"] },
  { index: 6, department: "publicity", label: "科宣部", college: "传媒与艺术学院", major: "广告学", names: ["白予安", "舒亦", "纪云舒", "高子期"] },
  { index: 7, department: "competition", label: "赛事部", college: "计算机学院、软件学院、网络空间安全学院", major: "计算机科学与技术", names: ["蒋澜", "尹茉", "程叙", "温言"] },
] as const;

/* 学号 = B + 部门序号 + 7 位后缀（部长为重复序号，讲师/成员为顺序编号） */
const mockStudentId = (index: number, suffix: string) => `B${index}${suffix}`;

const mockDepartmentAccounts: LinkUserProfile[] = [
  {
    id: 101,
    name: "管理员",
    login_email: "root@sast.fun",
    role: "admin",
    state: "on-sast",
    phone_number: "13800000000",
    qq_number: "100000",
    student_id: "B00000000",
    college: "计算机学院、软件学院、网络空间安全学院",
    major: "软件工程",
    profile: {
      nickname: "Admin",
      department: null,
      intro: "本地管理员账号（跨部门）",
      email: "root@sast.fun",
    },
    created_at: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  },
  ...mockDepartmentSeeds.flatMap(({ index, department, label, college, major, names }) => {
    const [managerName, lecturerName, ...memberNames] = names;
    const accounts: Array<{
      suffix: string;
      role: LinkRole;
      name: string;
      intro: string;
    }> = [
      {
        suffix: String(index).repeat(7),
        role: "manager",
        name: managerName,
        intro: `${label}部长账号`,
      },
      { suffix: "0000001", role: "lecturer", name: lecturerName, intro: `${label}讲师账号` },
      ...memberNames.map((name, position) => ({
        suffix: `000000${position + 2}`,
        role: "member" as LinkRole,
        name,
        intro: `${label}成员账号`,
      })),
    ];

    return accounts.map(({ suffix, role, name, intro }, position) => {
      const id = 200 + (index - 1) * accounts.length + position + 1;
      const studentId = mockStudentId(index, suffix);

      return {
        id,
        name,
        login_email: `${studentId}@njupt.edu.cn`,
        role,
        state: "on-sast",
        phone_number: `138${String(10000000 + id).slice(-8)}`,
        qq_number: String(200000 + id * 7),
        student_id: studentId,
        college,
        major,
        profile: {
          nickname: role === "manager" ? "DeptManager" : undefined,
          department,
          intro,
          email: `${studentId}@njupt.edu.cn`,
        },
        created_at: new Date(`2026-02-${String((index % 27) + 1).padStart(2, "0")}T00:00:00.000Z`).toISOString(),
      } satisfies LinkUserProfile;
    });
  }),
];

/**
 * 本地 mock 的办公类面试候选人：办公室/科宣部/外联部/赛事部招新时的报名者，
 * 尚未归属部门（department: null），学号用 `B24xxxxxx` 前缀与部门演示账号区分
 * （`mock.test.ts` 按 `B<部门序号>0…` 过滤部门账号，不会受这批影响）。
 */
const mockApplicantNames = [
  "许清和",
  "裴知远",
  "岑星野",
  "康宁",
  "施语",
  "郗望",
  "盛嘉",
  "常宁",
  "钟灵",
  "黎川",
  "骆书",
  "简宁",
] as const;

const mockApplicantUsers: LinkUserProfile[] = mockApplicantNames.map(
  (name, index) => {
    const id = 301 + index;
    const studentId = `B24${String(index + 1).padStart(6, "0")}`;

    return {
      id,
      name,
      login_email: `${studentId}@njupt.edu.cn`,
      role: "member",
      state: "on-sast",
      phone_number: `139${String(20000000 + id).slice(-8)}`,
      qq_number: String(300000 + id * 11),
      student_id: studentId,
      college: "通信与信息工程学院",
      major: "通信工程",
      profile: {
        department: null,
        intro: "办公类面试候选人（本地演示）",
        email: `${studentId}@njupt.edu.cn`,
      },
      created_at: new Date(
        `2026-03-${String((index % 27) + 1).padStart(2, "0")}T00:00:00.000Z`,
      ).toISOString(),
    } satisfies LinkUserProfile;
  },
);

const mockUsers: LinkUserProfile[] = [
  ...mockBaseUsers,
  ...mockDepartmentAccounts,
  ...mockApplicantUsers,
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

/* 本地 mock 会话里用 access token 标记当前用户：mock-access-token:<Link 用户 ID> */
export const mockAccessTokenFor = (userId: number) => `mock-access-token:${userId}`;

export const getMockCurrentUserProfile = async (
  accessToken?: string | null,
): Promise<LinkUserProfile> => {
  const userId = Number(accessToken?.split(":").pop());
  return mockUsers.find((user) => user.id === userId) ?? mockBaseUsers[0];
};

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

/* 本地登录页的测试账号清单（管理员、部长、讲师、成员） */
export const listMockLoginAccounts = () =>
  mockUsers
    .filter((user) => user.student_id)
    .map((user) => ({
      studentId: user.student_id as string,
      name: user.name,
      role: user.role,
      department: user.profile?.department ?? null,
    }))
    .sort((a, b) => a.studentId.localeCompare(b.studentId));

export const getMockUserDetail = async (id: number) => {
  const user = mockUsers.find((item) => item.id === id);
  if (!user) throw new Error("Mock Link user not found");
  return user;
};

export const getMockUsersByIds = async (ids: number[]) => {
  const usersById = new Map(mockUsers.map((user) => [user.id, user]));
  const seen = new Set<number>();
  return ids.flatMap((id) => {
    if (seen.has(id)) return [];
    seen.add(id);
    const user = usersById.get(id);
    return user ? [user] : [];
  });
};

export const updateMockUserRoles = async (ids: number[], role: LinkRole) => {
  const results = [] as Array<{
    id: number;
    success: boolean;
    role?: LinkRole;
    reason?: string;
  }>;

  for (const id of new Set(ids)) {
    const user = mockUsers.find((item) => item.id === id);
    if (!user) {
      results.push({ id, success: false, reason: "用户不存在" });
      continue;
    }
    user.role = role;
    results.push({ id, success: true, role });
  }

  return { results };
};

export const updateMockUserDepartments = async (
  ids: number[],
  department: LinkDepartment | null,
) => {
  const results = [] as Array<{
    id: number;
    success: boolean;
    department?: LinkDepartment | null;
    reason?: string;
  }>;

  for (const id of new Set(ids)) {
    const user = mockUsers.find((item) => item.id === id);
    if (!user) {
      results.push({ id, success: false, reason: "用户不存在" });
      continue;
    }
    user.profile = { ...(user.profile ?? {}), department };
    results.push({ id, success: true, department });
  }

  return { results };
};

export const banMockUser = async (id: number) => {
  const user = mockUsers.find((item) => item.id === id);
  if (!user) throw new Error("Mock Link user not found");
  user.state = "is_deleted";
};