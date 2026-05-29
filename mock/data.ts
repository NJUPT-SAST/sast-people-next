/**
 * Mock seed data for all database tables.
 * Provides realistic data covering all relationships and edge cases.
 */

// ==================== Users ====================
export const mockUsers = [
  {
    id: 1,
    name: "管理员账号",
    student_id: "001",
    email: "admin@njupt.edu.cn",
    qq: "10001",
    phone: "13800001111",
    college: "计算机学院、软件学院、网络空间安全学院",
    major: "软件工程",
    department: [],
    link_openid: "link_admin_001",
    feishu_openid: "feishu_admin_001",
    role: 3,
    created_at: new Date("2024-09-01T00:00:00Z"),
    updated_at: new Date("2024-09-01T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 2,
    name: "讲师账号",
    student_id: "002",
    email: "interviewer@njupt.edu.cn",
    qq: null,
    phone: "13800002222",
    college: "计算机学院、软件学院、网络空间安全学院",
    major: "计算机科学与技术",
    department: [],
    link_openid: "link_mgr_002",
    feishu_openid: "feishu_mgr_002",
    role: 2,
    created_at: new Date("2024-09-01T00:00:00Z"),
    updated_at: new Date("2024-09-01T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 3,
    name: "新同学 A",
    student_id: "101",
    email: "candidate-a@njupt.edu.cn",
    qq: null,
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
    name: "新同学 B",
    student_id: "102",
    email: "candidate-b@njupt.edu.cn",
    qq: null,
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
    name: "新同学 C",
    student_id: "103",
    email: "candidate-c@njupt.edu.cn",
    qq: null,
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
    name: "新同学 D",
    student_id: "104",
    email: "candidate-d@njupt.edu.cn",
    qq: null,
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
    name: "停用账号",
    student_id: "999",
    email: "banned@njupt.edu.cn",
    qq: null,
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
  {
    id: 8,
    name: "部员账号",
    student_id: "003",
    email: "member@njupt.edu.cn",
    qq: null,
    phone: "13800008888",
    college: "计算机学院、软件学院、网络空间安全学院",
    major: "软件工程",
    department: [],
    link_openid: "link_member_008",
    feishu_openid: null,
    role: 1,
    created_at: new Date("2024-09-15T00:00:00Z"),
    updated_at: new Date("2024-09-15T00:00:00Z"),
    is_deleted: false,
  },
];

// ==================== Flows ====================
export const mockFlows = [
  {
    id: 1,
    title: "2024秋季招新",
    description: "SAST 2024年秋季学期招新流程，面向全校大一新生",
    type: "recruitment",
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
    type: "recruitment",
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
    type: "recruitment",
    owner_id: 1,
    created_at: new Date("2024-01-01T00:00:00Z"),
    started_at: new Date("2024-01-01T00:00:00Z"),
    ended_at: new Date("2024-02-01T00:00:00Z"),
    updated_at: new Date("2024-01-01T00:00:00Z"),
    is_deleted: true,
  },
  {
    id: 4,
    title: "2024 WOC",
    description: "SAST 2024年度 WOC 换选流程",
    type: "woc",
    owner_id: 1,
    created_at: new Date("2024-10-01T00:00:00Z"),
    started_at: new Date("2024-10-15T00:00:00Z"),
    ended_at: new Date("2026-12-31T23:59:59Z"),
    updated_at: new Date("2024-10-01T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 5,
    title: "2024 SOC",
    description: "SAST 2024年度 SOC 换选流程",
    type: "soc",
    owner_id: 1,
    created_at: new Date("2024-11-01T00:00:00Z"),
    started_at: new Date("2024-11-15T00:00:00Z"),
    ended_at: new Date("2026-12-31T23:59:59Z"),
    updated_at: new Date("2024-11-01T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 6,
    title: "2025秋季免试招新",
    description: "SAST 2025年秋季免试招新（仅面试）",
    type: "recruitment_exemption",
    owner_id: 1,
    created_at: new Date("2025-09-01T00:00:00Z"),
    started_at: new Date("2025-09-10T00:00:00Z"),
    ended_at: new Date("2026-12-31T23:59:59Z"),
    updated_at: new Date("2025-09-01T00:00:00Z"),
    is_deleted: false,
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
    title: "批卷",
    description: "讲师批改笔试题目",
    type: "judging",
    order: 2,
    fk_flow_id: 1,
    created_at: new Date("2024-09-15T00:00:00Z"),
    updated_at: new Date("2024-09-15T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 3,
    title: "录取确认",
    description: "按分数线确认最终通过名单",
    type: "finished",
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
    title: "批卷",
    description: "春季笔试批卷",
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
  // Flow 4: WOC steps
  {
    id: 9,
    title: "报名阶段",
    description: "WOC 报名",
    type: "registering",
    order: 1,
    fk_flow_id: 4,
    created_at: new Date("2024-10-01T00:00:00Z"),
    updated_at: new Date("2024-10-01T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 10,
    title: "面试阶段",
    description: "WOC 面试",
    type: "judging",
    order: 2,
    fk_flow_id: 4,
    created_at: new Date("2024-10-01T00:00:00Z"),
    updated_at: new Date("2024-10-01T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 11,
    title: "结束",
    description: "WOC流程结束",
    type: "finished",
    order: 3,
    fk_flow_id: 4,
    created_at: new Date("2024-10-01T00:00:00Z"),
    updated_at: new Date("2024-10-01T00:00:00Z"),
    is_deleted: false,
  },
  // Flow 5: SOC steps
  {
    id: 12,
    title: "报名阶段",
    description: "SOC 报名",
    type: "registering",
    order: 1,
    fk_flow_id: 5,
    created_at: new Date("2024-11-01T00:00:00Z"),
    updated_at: new Date("2024-11-01T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 13,
    title: "面试阶段",
    description: "SOC 面试",
    type: "judging",
    order: 2,
    fk_flow_id: 5,
    created_at: new Date("2024-11-01T00:00:00Z"),
    updated_at: new Date("2024-11-01T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 14,
    title: "结束",
    description: "SOC流程结束",
    type: "finished",
    order: 3,
    fk_flow_id: 5,
    created_at: new Date("2024-11-01T00:00:00Z"),
    updated_at: new Date("2024-11-01T00:00:00Z"),
    is_deleted: false,
  },
  // Flow 6: recruitment_exemption steps
  {
    id: 15,
    title: "报名阶段",
    description: "免试招新报名",
    type: "registering",
    order: 1,
    fk_flow_id: 6,
    created_at: new Date("2025-09-01T00:00:00Z"),
    updated_at: new Date("2025-09-01T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 16,
    title: "面试阶段",
    description: "免试招新面试",
    type: "judging",
    order: 2,
    fk_flow_id: 6,
    created_at: new Date("2025-09-01T00:00:00Z"),
    updated_at: new Date("2025-09-01T00:00:00Z"),
    is_deleted: false,
  },
  {
    id: 17,
    title: "结束",
    description: "免试招新结束",
    type: "finished",
    order: 3,
    fk_flow_id: 6,
    created_at: new Date("2025-09-01T00:00:00Z"),
    updated_at: new Date("2025-09-01T00:00:00Z"),
    is_deleted: false,
  },
];

// ==================== User Flows ====================
export const mockUserFlows = [
  {
    id: 1,
    status: "passed",
    current_step_order: 2,
    fk_flow_id: 1,
    fk_user_id: 3, // 新同学 A - in checking stage
    portfolio_link: null,
  },
  {
    id: 2,
    status: "pending",
    current_step_order: 1,
    fk_flow_id: 1,
    fk_user_id: 5, // 新同学 C - just registered
    portfolio_link: null,
  },
  {
    id: 3,
    status: "accepted",
    current_step_order: 5,
    fk_flow_id: 1,
    fk_user_id: 6, // 新同学 D - accepted
    portfolio_link: null,
  },
  {
    id: 4,
    status: "rejected",
    current_step_order: 3,
    fk_flow_id: 2,
    fk_user_id: 3, // 新同学 A - rejected in spring
    portfolio_link: null,
  },
  {
    id: 5,
    status: "failed",
    current_step_order: 3,
    fk_flow_id: 1,
    fk_user_id: 4, // 新同学 B - in judging stage (no phone though)
    portfolio_link: null,
  },
  // WOC flow (id=4)
  {
    id: 6,
    status: "ongoing",
    current_step_order: 2,
    fk_flow_id: 4,
    fk_user_id: 2, // 讲师账号 - WOC candidate
    portfolio_link: "https://github.com/sast-demo/woc-work",
  },
  {
    id: 7,
    status: "ongoing",
    current_step_order: 2,
    fk_flow_id: 4,
    fk_user_id: 8, // 部员账号 - WOC candidate
    portfolio_link: "https://example.com/portfolio/woc",
  },
  // SOC flow (id=5)
  {
    id: 8,
    status: "ongoing",
    current_step_order: 2,
    fk_flow_id: 5,
    fk_user_id: 8, // 部员账号 - SOC candidate
    portfolio_link: "https://github.com/sast-demo/soc-work",
  },
  // recruitment_exemption flow (id=6)
  {
    id: 9,
    status: "ongoing",
    current_step_order: 2,
    fk_flow_id: 6,
    fk_user_id: 3, // 新同学 A - exemption candidate
    portfolio_link: "https://example.com/exemption-demo",
  },
  {
    id: 10,
    status: "ongoing",
    current_step_order: 2,
    fk_flow_id: 6,
    fk_user_id: 5, // 新同学 C - exemption candidate
    portfolio_link: null,
  },
];

// ==================== Problems ====================
export const mockProblems = [
  // Flow 1, Step 2 (judging/批卷) problems
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
  // Flow 1 legacy Step 3 problems
  {
    id: 4,
    title: "笔试批卷评分",
    score: 50,
    fk_flow_step_id: 3,
  },
  {
    id: 5,
    title: "综合素质评分",
    score: 50,
    fk_flow_step_id: 3,
  },
  // Flow 2, Step 7 (judging/批卷) problem
  {
    id: 6,
    title: "春季笔试批卷评分",
    score: 100,
    fk_flow_step_id: 7,
  },
];

// ==================== User Points ====================
export const mockUserPoints = [
  // 新同学 A (userFlow 1) - checking stage scores
  { id: 1, fk_user_flow_id: 1, fk_problem_id: 1, points: 25 },
  { id: 2, fk_user_flow_id: 1, fk_problem_id: 2, points: 35 },
  { id: 3, fk_user_flow_id: 1, fk_problem_id: 3, points: 22 },
  // 新同学 D (userFlow 3) - all stages scored
  { id: 4, fk_user_flow_id: 3, fk_problem_id: 1, points: 28 },
  { id: 5, fk_user_flow_id: 3, fk_problem_id: 2, points: 38 },
  { id: 6, fk_user_flow_id: 3, fk_problem_id: 3, points: 27 },
  { id: 7, fk_user_flow_id: 3, fk_problem_id: 4, points: 45 },
  { id: 8, fk_user_flow_id: 3, fk_problem_id: 5, points: 42 },
  // 新同学 C (userFlow 2) - no scores yet (just registered)
  // 新同学 B (userFlow 5) - partial scores
  { id: 9, fk_user_flow_id: 5, fk_problem_id: 1, points: 20 },
  { id: 10, fk_user_flow_id: 5, fk_problem_id: 2, points: 30 },
];

// ==================== Interview Evaluations ====================
export const mockInterviewEvaluations = [
  {
    id: 1,
    fk_user_flow_id: 5,
    fk_user_id: 2, // 讲师账号 evaluated
    content: "新同学 B 面试表现优秀，技术基础扎实，沟通能力强，建议通过。综合评价：对前端框架理解深入，有实际项目经验。",
    meeting_link: "https://meeting.tencent.com/dm/abc123",
    status: "pending",
    fk_reviewed_by: null,
    created_at: new Date("2024-10-20T00:00:00Z"),
    updated_at: new Date("2024-10-20T00:00:00Z"),
  },
  {
    id: 2,
    fk_user_flow_id: 6,
    fk_user_id: 8, // 部员账号 evaluated
    content: "讲师账号在 WOC 面试中展现出良好的领导能力和技术视野，推荐通过。",
    meeting_link: null,
    status: "pending",
    fk_reviewed_by: null,
    created_at: new Date("2024-10-20T00:00:00Z"),
    updated_at: new Date("2024-10-20T00:00:00Z"),
  },
  {
    id: 3,
    fk_user_flow_id: 7,
    fk_user_id: 2, // 讲师账号 evaluated
    content: "部员账号在 WOC 面试中表现一般，技术能力有待提升，建议考察后再决定。",
    meeting_link: null,
    status: "approved",
    fk_reviewed_by: 1,
    created_at: new Date("2024-10-21T00:00:00Z"),
    updated_at: new Date("2024-10-21T00:00:00Z"),
  },
  {
    id: 4,
    fk_user_flow_id: 9,
    fk_user_id: 2, // 讲师账号 evaluated
    content: "新同学 A 免试面试表现突出，有丰富的开源项目经验，强烈推荐通过。",
    meeting_link: "https://meeting.feishu.cn/room/xyz789",
    status: "pending",
    fk_reviewed_by: null,
    created_at: new Date("2025-09-15T00:00:00Z"),
    updated_at: new Date("2025-09-15T00:00:00Z"),
  },
  {
    id: 5,
    fk_user_flow_id: 10,
    fk_user_id: 2, // 讲师账号 evaluated
    content: "新同学 C 免试面试表现良好，基础扎实态度端正，建议通过。",
    meeting_link: null,
    status: "rejected",
    fk_reviewed_by: 1,
    created_at: new Date("2025-09-15T00:00:00Z"),
    updated_at: new Date("2025-09-15T00:00:00Z"),
  },
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

export const mockEmailBatches = [
  {
    id: 1,
    template_key: "recruitment.result.accepted",
    subject: "2024秋季招新 结果通知",
    accept: true,
    status: "draft",
    total_count: 1,
    fk_flow_id: 1,
    fk_created_by: 1,
    created_at: new Date("2024-10-25T10:00:00Z"),
    updated_at: new Date("2024-10-25T10:00:00Z"),
  },
];

export const mockEmailDeliveries = [
  {
    id: 1,
    to_address: "104@njupt.edu.cn",
    subject: "2024秋季招新 结果通知",
    html_snapshot:
      '<html><body style="margin:0;background:#f6f9fc;font-family:Arial,sans-serif;color:#404040"><div style="max-width:640px;margin:24px auto;background:#fff;border:1px solid #eee;padding:40px"><img src="https://storage.sast.fun/sast-email-header.png" width="300" alt="SAST" /><p style="margin-top:40px;font-size:16px;line-height:26px">Hi 新同学 D,</p><p style="font-size:16px;line-height:26px">恭喜你顺利通过 2024秋季招新，正式成为南京邮电大学大学生科学技术协会的一员。</p><p style="font-size:16px;line-height:26px">我们欣赏你对技术的热情和积极的态度。未来，让我们在这条路上共同学习、进步。</p><a href="https://njupt-sast.feishu.cn/share/base/form/shrcnfwRMIhYP8N2I1i4YaTNg9b" style="display:inline-block;margin:12px 0;padding:12px 14px;border-radius:12px;background:#17A34A;color:#fff;text-decoration:none">点击填写 成员信息收集表</a><p style="font-size:16px;line-height:26px">如果你有更多疑问，请联系 recruitment@sast.fun</p></div></body></html>',
    status: "pending",
    error_message: null,
    provider_message_id: "mock-message-1",
    fk_email_batch_id: 1,
    fk_user_flow_id: 3,
    fk_user_id: 6,
    created_at: new Date("2024-10-25T10:00:00Z"),
    sent_at: null,
    updated_at: new Date("2024-10-25T10:00:00Z"),
  },
];

export const mockEmailTemplateSettings = [
  {
    id: 1,
    template_key: "recruitment.result.accepted",
    subject_template: "{flowName} 结果通知",
    member_info_form_url:
      "https://njupt-sast.feishu.cn/share/base/form/shrcnfwRMIhYP8N2I1i4YaTNg9b",
    feishu_group_url:
      "https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=1ack8f0f-dea7-494a-9d11-09873f28d150",
    calendar_url:
      "https://www.feishu.cn/calendar/share/calendar?token=18E3hIfkra9WK2xhrs__6dsQmLD-cvf59shJz8ZEWoNQzRsv5VNz4ssCMIEaYP-yGTlM_or_eg==",
    feishu_register_help_url:
      "https://www.feishu.cn/hc/zh-CN/articles/360045688853-%E6%B3%A8%E5%86%8C%E8%B4%A6%E5%8F%B7",
    contact_email: "recruitment@sast.fun",
    member_form_label: "成员信息收集表",
    feishu_group_name: "SAST.2025 软多Family",
    updated_at: new Date("2024-10-25T10:00:00Z"),
  },
];
