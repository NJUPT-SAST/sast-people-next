import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
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

export const progressStatusEnum = pgEnum("progress_status_enum", [
  "not_started",
  "ongoing",
  "passed",
  "failed",
]);

export const evaluationStatusEnum = pgEnum("evaluation_status_enum", [
  "pending",
  "approved",
  "rejected",
]);

export const emailBatchStatusEnum = pgEnum("email_batch_status_enum", [
  "draft",
  "queued",
  "completed",
  "failed",
]);

export const emailDeliveryStatusEnum = pgEnum("email_delivery_status_enum", [
  "pending",
  "sending",
  "sent",
  "failed",
]);

/** @deprecated v3.1: 用户资料由 SAST Link 维护，此表仅用于 legacy fallback。联调稳定后删除。 */
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
  qq: varchar("qq", { length: 20 }),
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
  /* Link 用户 ID */
  ownerId: integer("owner_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
  isDeleted: boolean("is_deleted").default(false),
});

export const flowStep = pgTable("flow_step", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 100 }).notNull(),
  description: varchar("description", { length: 1000 }),
  type: flowStepTypeEnum("type").notNull(),
  order: integer("order").notNull(),
  fkFlowId: integer("fk_flow_id")
    .references(() => flow.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
  isDeleted: boolean("is_deleted").default(false),
}, (table) => ({
  uniqueFlowOrder: unique().on(table.fkFlowId, table.order),
}));

export const userFlow = pgTable("user_flow", {
  id: serial("id").primaryKey(),
  progressStatus: progressStatusEnum("progress_status"),
  /* FK → flow_step.id。step 被物理删除时置 NULL */
  fkCurrentStepId: integer("fk_current_step_id")
    .references(() => flowStep.id, { onDelete: "set null" }),
  portfolioLink: text("portfolio_link"),
  fkFlowId: integer("fk_flow_id")
    .references(() => flow.id, { onDelete: "cascade" })
    .notNull(),
  /* Link 用户 ID */
  fkUserId: integer("fk_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
}, (table) => ({
  uniqueFlowUser: unique().on(table.fkFlowId, table.fkUserId),
}));

export const problem = pgTable("problem", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 100 }).notNull(),
  score: integer("score").notNull(),
  fkFlowStepId: integer("fk_flow_step_id")
    .references(() => flowStep.id, { onDelete: "cascade" })
    .notNull(),
});

export const emailBatch = pgTable("email_batch", {
  id: serial("id").primaryKey(),
  templateKey: varchar("template_key", { length: 80 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  accept: boolean("accept").notNull(),
  status: emailBatchStatusEnum("status").notNull().default("queued"),
  totalCount: integer("total_count").notNull().default(0),
  fkFlowId: integer("fk_flow_id")
    .references(() => flow.id, { onDelete: "restrict" })
    .notNull(),
  fkCreatedBy: integer("fk_created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
});

export const emailDelivery = pgTable("email_delivery", {
  id: serial("id").primaryKey(),
  toAddress: varchar("to_address", { length: 254 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  htmlSnapshot: text("html_snapshot").notNull(),
  status: emailDeliveryStatusEnum("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  providerMessageId: varchar("provider_message_id", { length: 255 }),
  fkEmailBatchId: integer("fk_email_batch_id")
    .references(() => emailBatch.id, { onDelete: "cascade" })
    .notNull(),
  fkUserFlowId: integer("fk_user_flow_id")
    .references(() => userFlow.id, { onDelete: "set null" }),
  fkUserId: integer("fk_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  sentAt: timestamp("sent_at"),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
});

export const emailTemplateSetting = pgTable("email_template_setting", {
  id: serial("id").primaryKey(),
  templateKey: varchar("template_key", { length: 80 }).notNull().unique(),
  subjectTemplate: varchar("subject_template", { length: 255 }).notNull(),
  memberInfoFormUrl: text("member_info_form_url").notNull(),
  feishuGroupUrl: text("feishu_group_url").notNull(),
  calendarUrl: text("calendar_url").notNull(),
  feishuRegisterHelpUrl: text("feishu_register_help_url").notNull(),
  contactEmail: varchar("contact_email", { length: 254 }).notNull(),
  memberFormLabel: varchar("member_form_label", { length: 100 }).notNull(),
  feishuGroupName: varchar("feishu_group_name", { length: 100 }).notNull(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
});

export const userPoint = pgTable("user_point", {
  id: serial("id").primaryKey(),
  fkUserFlowId: integer("fk_user_flow_id")
    .references(() => userFlow.id, { onDelete: "cascade" })
    .notNull(),
  fkProblemId: integer("fk_problem_id")
    .references(() => problem.id, { onDelete: "cascade" })
    .notNull(),
  points: integer("points").notNull(),
  /* Link 用户 ID — 阅卷人 */
  fkJudgerId: integer("fk_judger_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userFlowProblemUnique: unique().on(table.fkUserFlowId, table.fkProblemId),
}));

export const interviewEvaluation = pgTable("interview_evaluation", {
  id: serial("id").primaryKey(),
  fkUserFlowId: integer("fk_user_flow_id")
    .references(() => userFlow.id, { onDelete: "cascade" })
    .notNull(),
  content: text("content").notNull(),
  meetingLink: text("meeting_link"),
  status: evaluationStatusEnum("status").notNull().default("pending"),
  /* Link 用户 ID — 审批人 */
  fkReviewedBy: integer("fk_reviewed_by"),
  /* Link 用户 ID — 面评撰写人 */
  fkUserId: integer("fk_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
});

export const operationAudit = pgTable("operation_audit", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id").notNull(),
  action: varchar("action", { length: 80 }).notNull(),
  resourceType: varchar("resource_type", { length: 80 }).notNull(),
  resourceId: integer("resource_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  actorIdx: index("operation_audit_actor_id_idx").on(table.actorId),
  resourceIdx: index("operation_audit_resource_idx").on(
    table.resourceType,
    table.resourceId,
  ),
  createdAtIdx: index("operation_audit_created_at_idx").on(table.createdAt),
}));
