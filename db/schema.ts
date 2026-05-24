import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar
} from "drizzle-orm/pg-core";

export const flowStepTypeEnum = pgEnum("flow_step_type_enum", [
  "registering",
  "checking",
  "judging",
  "email",
  "finished",
]);

export const flowTypeEnum = pgEnum("flow_type_enum", [
  "recruitment",
  "recruitment_exemption",
  "woc",
  "soc",
]);

export const userFlowStatusEnum = pgEnum("user_flow_status_enum", [
  "pending",
  "accepted",
  "rejected",
  "ongoing",
]);

export const evaluationStatusEnum = pgEnum("evaluation_status_enum", [
  "pending",
  "approved",
  "rejected",
]);

export const user = pgTable("user", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 30 }).notNull(),
  studentId: varchar("student_id", { length: 16 }).unique(),
  email: varchar("email", { length: 254 }),
  phone: varchar("phone", { length: 16 }),
  college: varchar("college", { length: 50 }),
  major: varchar("major", { length: 50 }),
  departments: varchar("department", { length: 50 })
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  github: text("github"),
  blog: text("blog"),
  personalStatement: text("personal_statement"),
  linkOpenid: varchar("link_openid", { length: 255 }).unique(),
  feishuOpenid: varchar("feishu_openid", { length: 255 }).unique(),
  role: integer("role").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
  isDeleted: boolean("is_deleted").default(false),
});

export const flow = pgTable("flow", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 100 }).notNull(),
  description: varchar("description", { length: 1000 }),
  type: flowTypeEnum("type").notNull().default("recruitment"),
  ownerId: integer("owner_id")
    .references(() => user.id)
    .notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
  isDeleted: boolean("is_deleted").default(false),
});

// TODO: v2 db 删除 FlowType 表
// export const flowType = pgTable("flow_type", {
//   id: serial("id").primaryKey(),
//   name: varchar("name", { length: 100}).notNull(),
//   description: varchar("description", { length: 100 }),
//   createdAt: timestamp("created_at").notNull(),
//   updatedAt: timestamp("updated_at").notNull(),
//   isDeleted: boolean("is_deleted").default(false),
//   createBy: integer("create_by")
//     .references(() => user.id)
//     .notNull(),
// });

// TODO: v2 db
// export const step = pgTable("step", {
//     id: serial("id").primaryKey(),
//     flowTypeId: integer("flow_type_id")
//       // .references(() => flowType.id)
//       .notNull(),
//     order: integer("order").notNull(),
//     label: text("label").notNull(),
//     name: text("name").notNull(),
//     description: text("description"),
//   },
//   (steps) => {
//     return {
//       uniqueFlowTypeOrder: uniqueIndex("unique_flow_type_order_index").on(
//         steps.flowTypeId,
//         steps.order
//       ),
//     };
//   }
// );

export const flowStep = pgTable("flow_step", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 100 }).notNull(),
  description: varchar("description", { length: 1000 }),
  type: flowStepTypeEnum("type").notNull(),
  order: integer("order").notNull(),
  fkFlowId: integer("fk_flow_id")
    .references(() => flow.id)
    .notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
  isDeleted: boolean("is_deleted").default(false),
});

export const userFlow = pgTable("user_flow", {
  id: serial("id").primaryKey(),
  status: userFlowStatusEnum("status").notNull().default("pending"),
  currentStepOrder: integer("current_step_order").notNull(),
  fkFlowId: integer("fk_flow_id")
    .references(() => flow.id)
    .notNull(),
  fkUserId: integer("fk_user_id")
    .references(() => user.id)
    .notNull(),
});

export const problem = pgTable("problem", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 100 }).notNull(),
  score: integer("score").notNull(),
  fkFlowStepId: integer("fk_flow_step_id")
    .references(() => flowStep.id)
    .notNull(),
});

export const email = pgTable("email", {
  id: serial("id").primaryKey(),
  subject: varchar("subject", { length: 255 }).notNull(),
  content: text("content").notNull(),
  fkFlowStepId: integer("fk_flow_step_id")
    .references(() => flowStep.id)
    .notNull(),
});

export const userPoint = pgTable("user_point", {
  id: serial("id").primaryKey(),
  fkUserFlowId: integer("fk_user_flow_id")
    .references(() => userFlow.id)
    .notNull(),
  fkProblemId: integer("fk_problem_id")
    .references(() => problem.id)
    .notNull(),
  points: integer("points").notNull(),
}, (table) => ({
  userFlowProblemUnique: unique().on(table.fkUserFlowId, table.fkProblemId),
}));

export const interviewEvaluation = pgTable("interview_evaluation", {
  id: serial("id").primaryKey(),
  fkUserFlowId: integer("fk_user_flow_id")
    .references(() => userFlow.id)
    .notNull(),
  fkUserId: integer("fk_user_id")
    .references(() => user.id)
    .notNull(),
  content: text("content").notNull(),
  meetingLink: text("meeting_link"),
  status: evaluationStatusEnum("status").notNull().default("pending"),
  fkReviewedBy: integer("fk_reviewed_by").references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
});

// TODO: v2 db
// export const examMap = pgTable(
//   "exam_map",
//   {
//     id: serial("id").primaryKey(),
//     flowStepId: integer("flow_step_id").references(() => flowStep.id), // 外键关联 FlowSteps 表
//     problemId: integer("problem_id").references(() => problem.id), // 问题 ID
//     score: integer("score").notNull(), // 评分
//     judgerId: integer("judger_id").notNull(), // 评审者 ID
//     judgeTime: timestamp("judge_time").notNull(), // 评审时间
//   },
//   (examMap) => {
//     return {
//       uniqueFlowStepProblem: uniqueIndex("unique_flow_step_problem_index").on(
//         examMap.flowStepId,
//         examMap.problemId
//       ),
//     };
//   }
// );

// TODO: v2 db
// // CollegeList 表
// export const college = pgTable("college", {
//   id: serial("id").primaryKey(), // 学院的唯一标识
//   name: text("name").notNull(), // 学院名称
// });

// TODO: v2 db
// // MajorList 表
// export const major = pgTable("major", {
//   id: serial("id").primaryKey(), // 专业的唯一标识
//   name: text("name").notNull(), // 专业名称
// });

// TODO: v2 db
// // DepartmentList 表
// export const department = pgTable("department", {
//   id: serial("id").primaryKey(), // 部门的唯一标识
//   name: text("name").notNull(), // 部门名称
// });

// TODO: v2 db
// // GroupList 表
// export const group = pgTable("group", {
//   id: serial("id").primaryKey(), // 组的唯一标识
//   name: text("name").notNull(), // 组名称
// });
