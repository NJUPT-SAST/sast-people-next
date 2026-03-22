/**
 * Mock seed data for all database tables.
 * Provides realistic data covering all relationships and edge cases.
 */

// ==================== Users ====================
export const mockUsers = [
  {
    id: 1,
    name: "管理员",
    student_id: "B23010101",
    email: "admin@njupt.edu.cn",
    phone: "13800001111",
    college: "计算机学院、软件学院、网络空间安全学院",
    major: "软件工程",
    department: ["技术部", "运营部"],
    link_openid: "link_admin_001",
    feishu_openid: "feishu_admin_001",
    role: 2,
    created_at: new Date("2024-09-01T00:00:00Z"),
    updated_at: new Date("2024-09-01T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 2,
    name: "讲师",
    student_id: "B23010102",
    email: "interviewer@njupt.edu.cn",
    phone: "13800002222",
    college: "计算机学院、软件学院、网络空间安全学院",
    major: "计算机科学与技术",
    department: ["技术部"],
    link_openid: "link_mgr_002",
    feishu_openid: "feishu_mgr_002",
    role: 1,
    created_at: new Date("2024-09-01T00:00:00Z"),
    updated_at: new Date("2024-09-01T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 3,
    name: "王同学",
    student_id: "B24010201",
    email: "wangtongxue@njupt.edu.cn",
    phone: "13900003333",
    college: "通信与信息工程学院",
    major: "通信工程",
    department: [],
    link_openid: "link_stu_003",
    feishu_openid: null,
    role: 0,
    created_at: new Date("2024-10-01T00:00:00Z"),
    updated_at: new Date("2024-10-01T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 4,
    name: "陈同学",
    student_id: "B24010202",
    email: "chentongxue@njupt.edu.cn",
    phone: null,
    college: "电子与光学工程学院、柔性电子（未来技术）学院",
    major: "电子信息工程",
    department: [],
    link_openid: "link_stu_004",
    feishu_openid: null,
    role: 0,
    created_at: new Date("2024-10-02T00:00:00Z"),
    updated_at: new Date("2024-10-02T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 5,
    name: "刘同学",
    student_id: "B24010203",
    email: "liutongxue@njupt.edu.cn",
    phone: "13700005555",
    college: "自动化学院",
    major: "自动化",
    department: [],
    link_openid: "link_stu_005",
    feishu_openid: null,
    role: 0,
    created_at: new Date("2024-10-03T00:00:00Z"),
    updated_at: new Date("2024-10-03T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 6,
    name: "赵同学",
    student_id: "B24010204",
    email: "zhaotongxue@njupt.edu.cn",
    phone: "13600006666",
    college: "人工智能学院",
    major: "人工智能",
    department: [],
    link_openid: "link_stu_006",
    feishu_openid: null,
    role: 0,
    created_at: new Date("2024-10-04T00:00:00Z"),
    updated_at: new Date("2024-10-04T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 7,
    name: "已封禁用户",
    student_id: "B24010205",
    email: "banned@njupt.edu.cn",
    phone: "13500007777",
    college: "理学院",
    major: "数学",
    department: [],
    link_openid: "link_banned_007",
    feishu_openid: null,
    role: 0,
    created_at: new Date("2024-10-05T00:00:00Z"),
    updated_at: new Date("2024-10-05T00:00:00Z"),
    is_deleted: true,
  },
];

// ==================== Flows ====================
export const mockFlows = [
  {
    id: 1,
    title: "2024秋季招新",
    description: "SAST 2024年秋季学期招新流程，面向全校大一新生",
    owner_id: 1,
    created_at: new Date("2024-09-15T00:00:00Z"),
    started_at: new Date("2024-09-20T00:00:00Z"),
    ended_at: new Date("2026-12-31T23:59:59Z"),
    updated_at: new Date("2024-09-15T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 2,
    title: "2024春季招新",
    description: "SAST 2024年春季学期补充招新",
    owner_id: 2,
    created_at: new Date("2024-03-01T00:00:00Z"),
    started_at: new Date("2024-03-15T00:00:00Z"),
    ended_at: new Date("2024-06-30T23:59:59Z"),
    updated_at: new Date("2024-03-01T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 3,
    title: "已删除流程",
    description: "测试用已删除流程",
    owner_id: 1,
    created_at: new Date("2024-01-01T00:00:00Z"),
    started_at: new Date("2024-01-01T00:00:00Z"),
    ended_at: new Date("2024-02-01T00:00:00Z"),
    updated_at: new Date("2024-01-01T00:00:00Z"),
    is_deleted: true,
  },
];

// ==================== Flow Steps ====================
export const mockFlowSteps = [
  // Flow 1: 秋季招新 steps
  {
    id: 1,
    title: "报名阶段",
    description: "填写个人信息并提交报名",
    type: "registering",
    order: 1,
    fk_flow_id: 1,
    created_at: new Date("2024-09-15T00:00:00Z"),
    updated_at: new Date("2024-09-15T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 2,
    title: "笔试阶段",
    description: "完成在线笔试",
    type: "checking",
    order: 2,
    fk_flow_id: 1,
    created_at: new Date("2024-09-15T00:00:00Z"),
    updated_at: new Date("2024-09-15T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 3,
    title: "面试阶段",
    description: "参加部门面试",
    type: "judging",
    order: 3,
    fk_flow_id: 1,
    created_at: new Date("2024-09-15T00:00:00Z"),
    updated_at: new Date("2024-09-15T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 4,
    title: "通知阶段",
    description: "发送录取/拒绝邮件",
    type: "email",
    order: 4,
    fk_flow_id: 1,
    created_at: new Date("2024-09-15T00:00:00Z"),
    updated_at: new Date("2024-09-15T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 5,
    title: "结束",
    description: "招新流程结束",
    type: "finished",
    order: 5,
    fk_flow_id: 1,
    created_at: new Date("2024-09-15T00:00:00Z"),
    updated_at: new Date("2024-09-15T00:00:00Z"),
    is_deleted: false,
  },
  // Flow 2: 春季招新 steps
  {
    id: 6,
    title: "报名",
    description: "春季补充招新报名",
    type: "registering",
    order: 1,
    fk_flow_id: 2,
    created_at: new Date("2024-03-01T00:00:00Z"),
    updated_at: new Date("2024-03-01T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 7,
    title: "面试",
    description: "春季面试",
    type: "judging",
    order: 2,
    fk_flow_id: 2,
    created_at: new Date("2024-03-01T00:00:00Z"),
    updated_at: new Date("2024-03-01T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 8,
    title: "结束",
    description: "春季招新结束",
    type: "finished",
    order: 3,
    fk_flow_id: 2,
    created_at: new Date("2024-03-01T00:00:00Z"),
    updated_at: new Date("2024-03-01T00:00:00Z"),
    is_deleted: false,
  },
];

// ==================== User Flows ====================
export const mockUserFlows = [
  {
    id: 1,
    status: "ongoing",
    current_step_order: 2,
    fk_flow_id: 1,
    fk_user_id: 3, // 王同学 - in checking stage
  },
  {
    id: 2,
    status: "pending",
    current_step_order: 1,
    fk_flow_id: 1,
    fk_user_id: 5, // 刘同学 - just registered
  },
  {
    id: 3,
    status: "accepted",
    current_step_order: 5,
    fk_flow_id: 1,
    fk_user_id: 6, // 赵同学 - accepted
  },
  {
    id: 4,
    status: "rejected",
    current_step_order: 3,
    fk_flow_id: 2,
    fk_user_id: 3, // 王同学 - rejected in spring
  },
  {
    id: 5,
    status: "ongoing",
    current_step_order: 3,
    fk_flow_id: 1,
    fk_user_id: 4, // 陈同学 - in judging stage (no phone though)
  },
];

// ==================== Problems ====================
export const mockProblems = [
  // Flow 1, Step 2 (checking/笔试) problems
  {
    id: 1,
    title: "算法设计题",
    score: 30,
    fk_flow_step_id: 2,
  },
  {
    id: 2,
    title: "系统设计题",
    score: 40,
    fk_flow_step_id: 2,
  },
  {
    id: 3,
    title: "编程实践题",
    score: 30,
    fk_flow_step_id: 2,
  },
  // Flow 1, Step 3 (judging/面试) problems
  {
    id: 4,
    title: "技术面试评分",
    score: 50,
    fk_flow_step_id: 3,
  },
  {
    id: 5,
    title: "综合素质评分",
    score: 50,
    fk_flow_step_id: 3,
  },
  // Flow 2, Step 7 (judging/面试) problem
  {
    id: 6,
    title: "春季面试评分",
    score: 100,
    fk_flow_step_id: 7,
  },
];

// ==================== User Points ====================
export const mockUserPoints = [
  // 王同学 (userFlow 1) - checking stage scores
  { id: 1, fk_user_flow_id: 1, fk_problem_id: 1, points: 25 },
  { id: 2, fk_user_flow_id: 1, fk_problem_id: 2, points: 35 },
  { id: 3, fk_user_flow_id: 1, fk_problem_id: 3, points: 22 },
  // 赵同学 (userFlow 3) - all stages scored
  { id: 4, fk_user_flow_id: 3, fk_problem_id: 1, points: 28 },
  { id: 5, fk_user_flow_id: 3, fk_problem_id: 2, points: 38 },
  { id: 6, fk_user_flow_id: 3, fk_problem_id: 3, points: 27 },
  { id: 7, fk_user_flow_id: 3, fk_problem_id: 4, points: 45 },
  { id: 8, fk_user_flow_id: 3, fk_problem_id: 5, points: 42 },
  // 刘同学 (userFlow 2) - no scores yet (just registered)
  // 陈同学 (userFlow 5) - partial scores
  { id: 9, fk_user_flow_id: 5, fk_problem_id: 1, points: 20 },
  { id: 10, fk_user_flow_id: 5, fk_problem_id: 2, points: 30 },
];

// ==================== Emails ====================
export const mockEmails = [
  {
    id: 1,
    subject: "恭喜您通过SAST 2024秋季招新！",
    content:
      "亲爱的同学，恭喜您通过了SAST 2024年秋季招新的所有考核环节，欢迎加入SAST大家庭！",
    fk_flow_step_id: 4,
  },
  {
    id: 2,
    subject: "SAST 2024秋季招新结果通知",
    content:
      "亲爱的同学，感谢您参加SAST 2024年秋季招新。很遗憾，您未能通过本次考核，期待您下次再来！",
    fk_flow_step_id: 4,
  },
];
