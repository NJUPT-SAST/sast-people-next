"use server";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { db } from "@/db/drizzle";
import {
  departmentKeySchema,
  flow,
  normalizeDepartmentKey,
  userFlow,
} from "@/db/schema";
import { verifyAdmin } from "@/lib/authz";
import { resolveUserFlowDepartment } from "@/lib/flow-access";
import { DEPARTMENT_KEYS, mergeDepartmentKeys } from "@/const/department";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";

/**
 * 部门管理控制台（仅管理员）：
 * - 部门概览：流程/报名记录按部门聚合；
 * - 归属纠正：把流程或报名记录改到某部门，或清空为全局（department = NULL）。
 */

const DEPARTMENTS_PATH = "/dashboard/departments";

export interface DepartmentOverviewRow {
  department: string;
  flowCount: number;
  candidateCount: number;
}

export interface DepartmentOverview {
  /** 部门目录 ∪ 现存部门，按流程数 + 报名数倒序（0 条的排后面） */
  departments: DepartmentOverviewRow[];
  /** 下拉候选项（Link 部门目录 ∪ 现存部门标识 + 组别映射值），字母序 */
  departmentKeys: string[];
  unassignedFlowCount: number;
  unassignedCandidateCount: number;
  totalFlowCount: number;
  totalCandidateCount: number;
}

export interface FlowDepartmentAssignment {
  id: number;
  title: string;
  type: (typeof flow.$inferSelect)["type"];
  department: string | null;
  groupDepartments: Record<string, string> | null;
  startedAt: Date;
  createdAt: Date;
  candidateCount: number;
}

export interface UserFlowDepartmentAssignment {
  id: number;
  fkFlowId: number;
  fkUserId: number;
  applyGroup: string | null;
  department: string | null;
  progressStatus: (typeof userFlow.$inferSelect)["progressStatus"];
  createdAt: Date;
  flowTitle: string;
  userName: string | null;
  userStudentId: string | null;
}

export interface UserFlowDepartmentAssignmentList {
  total: number;
  limit: number;
  items: UserFlowDepartmentAssignment[];
}

const flowIdSchema = z.number().int().positive("流程 ID 必须是正整数");
const userFlowIdSchema = z.number().int().positive("报名记录 ID 必须是正整数");
const listOptionsSchema = z.object({
  flowId: flowIdSchema.nullable().optional(),
  onlyUnassigned: z.boolean().optional(),
  limit: z.number().int().positive().max(500).optional(),
});

type UserProfile = { name: string | null; studentId: string | null };

/** Link 用户名只用于展示；Link 不可用时降级为仅显示用户 ID，不影响归属管理 */
const resolveUserProfiles = async (ids: number[]): Promise<Map<number, UserProfile>> => {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) return new Map();

  try {
    const users = await listPeopleUsersByLinkIds(uniqueIds);
    return new Map(
      uniqueIds.map((id) => [
        id,
        { name: users.get(id)?.name ?? null, studentId: users.get(id)?.studentId ?? null },
      ]),
    );
  } catch (error) {
    logServerError("department:resolve-user-profiles", error, {
      action: "resolve-department-user-profiles",
    });
    return new Map();
  }
};

const normalizeAssignableDepartment = (department: string | null) => {
  if (department === null) return null;

  const parsed = departmentKeySchema.safeParse(department);
  if (!parsed.success) {
    throw new Error("部门标识不合法：需为 1-64 字的非空字符串");
  }
  return normalizeDepartmentKey(parsed.data);
};

/**
 * 部门概览：按 flow.department / user_flow.department 聚合。
 * 行与下拉候选都是「Link 部门目录 ∪ 现存数据里出现过的标识」
 * （流程归属 + 报名记录归属 + 组别映射值）——目录里的部门即使 0 条数据也要列出来，
 * 否则刚上线、还没归属过任何数据时整个控制台是空的，也没有可选的部门。
 */
export async function listDepartmentOverview(): Promise<DepartmentOverview> {
  await verifyAdmin();

  const [flowRows, candidateStats] = await Promise.all([
    db
      .select({ department: flow.department, groupDepartments: flow.groupDepartments })
      .from(flow)
      .where(eq(flow.isDeleted, false)),
    db
      .select({ department: userFlow.department, count: sql<number>`count(*)::int` })
      .from(userFlow)
      .groupBy(userFlow.department),
  ]);

  const byDepartment = new Map<
    string,
    { department: string; flowCount: number; candidateCount: number }
  >();
  const collect = (value: string | null | undefined) => {
    const key = normalizeDepartmentKey(value);
    if (!key) return null;
    const existing = byDepartment.get(key);
    if (existing) return existing;
    const created = { department: key, flowCount: 0, candidateCount: 0 };
    byDepartment.set(key, created);
    return created;
  };

  let unassignedFlowCount = 0;
  for (const row of flowRows) {
    const entry = collect(row.department);
    if (entry) {
      entry.flowCount += 1;
    } else {
      unassignedFlowCount += 1;
    }
    /* 组别映射里的部门标识也算现存标识，未产生数据前也能在下拉里选到 */
    for (const mapped of Object.values(row.groupDepartments ?? {})) collect(mapped);
  }
  let unassignedCandidateCount = 0;
  for (const row of candidateStats) {
    const entry = collect(row.department);
    if (entry) {
      entry.candidateCount += row.count;
    } else {
      unassignedCandidateCount += row.count;
    }
  }

  /* 先记下库里已有的标识（含未知/历史值），再把目录补进来，目录部门即使 0 条也占一行 */
  const storedKeys = Array.from(byDepartment.keys());
  for (const key of DEPARTMENT_KEYS) collect(key);

  const departments = Array.from(byDepartment.values());
  return {
    departments: departments
      .sort(
        (a, b) =>
          b.flowCount + b.candidateCount - (a.flowCount + a.candidateCount) ||
          a.department.localeCompare(b.department),
      ),
    /* 下拉候选项用字母序，避免聚合排序变化造成选项跳动 */
    departmentKeys: mergeDepartmentKeys(DEPARTMENT_KEYS, storedKeys),
    unassignedFlowCount,
    unassignedCandidateCount,
    totalFlowCount: flowRows.length,
    totalCandidateCount: candidateStats.reduce((sum, row) => sum + row.count, 0),
  };
}

/** 流程归属分配表：未删除流程 + 候选人数 + 组别映射 */
export async function listFlowDepartmentAssignments(): Promise<FlowDepartmentAssignment[]> {
  await verifyAdmin();

  return db
    .select({
      id: flow.id,
      title: flow.title,
      type: flow.type,
      department: flow.department,
      groupDepartments: flow.groupDepartments,
      startedAt: flow.startedAt,
      createdAt: flow.createdAt,
      candidateCount: sql<number>`count(${userFlow.id})::int`,
    })
    .from(flow)
    .leftJoin(userFlow, eq(userFlow.fkFlowId, flow.id))
    .where(eq(flow.isDeleted, false))
    .groupBy(flow.id)
    .orderBy(desc(flow.createdAt));
}

/** 报名记录归属表：按流程过滤，默认只看未归属（department IS NULL） */
export async function listUserFlowDepartmentAssignments(options?: {
  flowId?: number | null;
  onlyUnassigned?: boolean;
  limit?: number;
}): Promise<UserFlowDepartmentAssignmentList> {
  await verifyAdmin();
  const parsed = listOptionsSchema.parse(options ?? {});
  const targetFlowId = parsed.flowId ?? null;
  const onlyUnassigned = parsed.onlyUnassigned ?? false;
  const limit = parsed.limit ?? 100;

  const filters = [
    targetFlowId === null ? undefined : eq(userFlow.fkFlowId, targetFlowId),
    onlyUnassigned ? isNull(userFlow.department) : undefined,
  ].filter((value) => value !== undefined);
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: userFlow.id,
        fkFlowId: userFlow.fkFlowId,
        fkUserId: userFlow.fkUserId,
        applyGroup: userFlow.applyGroup,
        department: userFlow.department,
        progressStatus: userFlow.progressStatus,
        createdAt: userFlow.createdAt,
        flowTitle: flow.title,
      })
      .from(userFlow)
      .innerJoin(flow, eq(flow.id, userFlow.fkFlowId))
      .where(where)
      .orderBy(desc(userFlow.createdAt))
      .limit(limit),
    db.select({ count: sql<number>`count(*)::int` }).from(userFlow).where(where),
  ]);

  const profiles = await resolveUserProfiles(rows.map((row) => row.fkUserId));
  return {
    total: countResult[0]?.count ?? 0,
    limit,
    items: rows.map((row) => ({
      ...row,
      userName: profiles.get(row.fkUserId)?.name ?? null,
      userStudentId: profiles.get(row.fkUserId)?.studentId ?? null,
    })),
  };
}

type ResolvableUserFlow = {
  id: number;
  applyGroup: string | null;
  groupDepartments: Record<string, string> | null;
  flowDepartment: string | null;
};

/**
 * 把解析结果写回未归属的报名记录：组别映射优先，其次流程归属部门。
 * 解析与报名路径共用 `resolveUserFlowDepartment`，避免两份语义；
 * 解析不出的（流程自己也没归属、组别没映射到部门）保持未归属，留给人工纠正。
 */
const writeResolvedFlowDepartments = async (
  rows: ResolvableUserFlow[],
): Promise<number> => {
  const byDepartment = new Map<string, number[]>();
  for (const row of rows) {
    const department = resolveUserFlowDepartment(
      row.groupDepartments,
      row.applyGroup,
      row.flowDepartment,
    );
    if (!department) continue;
    const ids = byDepartment.get(department);
    if (ids) {
      ids.push(row.id);
    } else {
      byDepartment.set(department, [row.id]);
    }
  }

  let updated = 0;
  for (const [department, ids] of byDepartment) {
    await db.update(userFlow).set({ department }).where(inArray(userFlow.id, ids));
    updated += ids.length;
  }
  return updated;
};

/**
 * 按流程归属回填全部未归属报名记录（存量数据一次性纠偏）。
 * 流程与组别映射都解析不出的记录保持未归属，返回的 remaining 就是这些条数。
 */
export async function backfillUserFlowDepartments(): Promise<{
  updated: number;
  remaining: number;
}> {
  const session = await verifyAdmin();

  const rows = await db
    .select({
      id: userFlow.id,
      applyGroup: userFlow.applyGroup,
      groupDepartments: flow.groupDepartments,
      flowDepartment: flow.department,
    })
    .from(userFlow)
    .innerJoin(flow, eq(flow.id, userFlow.fkFlowId))
    .where(isNull(userFlow.department));

  const updated = await writeResolvedFlowDepartments(rows);

  await writeOperationAudit({
    actorId: session.uid,
    actorRole: session.realRole,
    action: "department.user_flow.backfill",
    resourceType: "user_flow",
    metadata: { updated, remaining: rows.length - updated },
  });
  revalidatePath(DEPARTMENTS_PATH);

  return { updated, remaining: rows.length - updated };
}

/** 管理员手动纠正流程归属；null = 清空为全局流程（仅管理员可见可改） */
export async function assignFlowDepartment(
  flowId: number,
  department: string | null,
): Promise<{ flowId: number; department: string | null }> {
  const session = await verifyAdmin();
  const targetFlowId = flowIdSchema.parse(flowId);
  const nextDepartment = normalizeAssignableDepartment(department);

  const [existing] = await db
    .select({
      department: flow.department,
      title: flow.title,
      groupDepartments: flow.groupDepartments,
    })
    .from(flow)
    .where(eq(flow.id, targetFlowId))
    .limit(1);
  if (!existing) throw new Error("流程不存在或已被删除");

  const previousDepartment = existing.department ?? null;
  if (previousDepartment === nextDepartment) {
    return { flowId: targetFlowId, department: nextDepartment };
  }

  await db
    .update(flow)
    .set({ department: nextDepartment })
    .where(eq(flow.id, targetFlowId));

  /* 流程定了归属，本流程仍未归属的报名记录跟着走（组别映射优先），
     否则存量报名只能一条条手改 */
  const backfilledUserFlows = await writeResolvedFlowDepartments(
    (
      await db
        .select({ id: userFlow.id, applyGroup: userFlow.applyGroup })
        .from(userFlow)
        .where(and(eq(userFlow.fkFlowId, targetFlowId), isNull(userFlow.department)))
    ).map((row) => ({
      ...row,
      groupDepartments: existing.groupDepartments ?? null,
      flowDepartment: nextDepartment,
    })),
  );

  await writeOperationAudit({
    actorId: session.uid,
    actorRole: session.realRole,
    action: "department.flow.assign",
    resourceType: "flow",
    resourceId: targetFlowId,
    department: nextDepartment,
    metadata: {
      department: nextDepartment,
      previousDepartment,
      title: existing.title,
      backfilledUserFlows,
    },
  });
  revalidatePath(DEPARTMENTS_PATH);

  return { flowId: targetFlowId, department: nextDepartment };
}

/** 管理员手动纠正报名记录归属；null = 清空为未归属（仅管理员可见） */
export async function assignUserFlowDepartment(
  userFlowId: number,
  department: string | null,
): Promise<{ userFlowId: number; department: string | null }> {
  const session = await verifyAdmin();
  const targetId = userFlowIdSchema.parse(userFlowId);
  const nextDepartment = normalizeAssignableDepartment(department);

  const [existing] = await db
    .select({
      department: userFlow.department,
      fkFlowId: userFlow.fkFlowId,
      fkUserId: userFlow.fkUserId,
    })
    .from(userFlow)
    .where(eq(userFlow.id, targetId))
    .limit(1);
  if (!existing) throw new Error("报名记录不存在");

  const previousDepartment = existing.department ?? null;
  if (previousDepartment === nextDepartment) {
    return { userFlowId: targetId, department: nextDepartment };
  }

  await db
    .update(userFlow)
    .set({ department: nextDepartment })
    .where(eq(userFlow.id, targetId));

  await writeOperationAudit({
    actorId: session.uid,
    actorRole: session.realRole,
    action: "department.user_flow.assign",
    resourceType: "user_flow",
    resourceId: targetId,
    department: nextDepartment,
    metadata: {
      department: nextDepartment,
      previousDepartment,
      flowId: existing.fkFlowId,
      userId: existing.fkUserId,
    },
  });
  revalidatePath(DEPARTMENTS_PATH);

  return { userFlowId: targetId, department: nextDepartment };
}
