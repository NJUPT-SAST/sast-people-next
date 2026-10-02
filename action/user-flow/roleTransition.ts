import "server-only";

import { db } from "@/db/drizzle";
import { flow, flowResultPublication, normalizeDepartmentKey, userFlow } from "@/db/schema";
import { updateLinkUserDepartments, updateLinkUserRoles } from "@/lib/link/admin";
import { MANAGER_ROLE, peopleRoleToLinkRole } from "@/lib/link/role";
import { verifyManager } from "@/lib/authz";
import { OFFICE_INTERVIEW_FLOW_TYPE } from "@/const/flow";
import { resolveLatestPassedDepartments } from "@/lib/flow-result-department";
import { getLinkAdminAccessTokenFromSession } from "@/lib/link/session";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { and, eq, inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const LINK_BATCH_ROLE_UPDATE_LIMIT = 500;

const roleGrantedByFlow = (flowType: string) => {
  if (flowType === "soc") return 2;
  if (
    flowType === "recruitment" ||
    flowType === "recruitment_exemption" ||
    flowType === "woc"
  ) {
    return 1;
  }
  /* 办公类部门面试招新：一个流程内两轮都通过后才会 passed，通过即部员 */
  if (flowType === OFFICE_INTERVIEW_FLOW_TYPE) return 1;
  return 0;
};

const chunk = <T,>(values: T[], size: number) =>
  Array.from(
    { length: Math.ceil(values.length / size) },
    (_, index) => values.slice(index * size, (index + 1) * size),
  );

/**
 * 已发布流程结果 → Link 身份同步：
 * 1) 角色：通过技术部门流程即部员、SoC 通过为讲师、办公类流程两轮都过后为部员；
 * 2) 部门归属：通过某部门流程后自动归属到该部门，多次通过以最后一次通过的部门为准（可覆盖）。
 * 不会改动管理员/部长角色，也不会改动部长及以上账号的部门。
 *
 * 本模块不是 server action（`server-only`）：只允许服务端内部链路调用，
 * 且入口再做一次部长级校验，避免被当作公开 action 直接调用。
 */
export const syncUserIdentityFromAcceptedFlows = async (uids: number[], publishingFlowId?: number) => {
  await verifyManager();
  const uniqueUids = Array.from(
    new Set(uids.filter((uid) => Number.isSafeInteger(uid) && uid > 0)),
  );
  if (uniqueUids.length === 0) return;

  const [users, acceptedFlows] = await Promise.all([
    listPeopleUsersByLinkIds(uniqueUids),
    db
    .select({
      uid: userFlow.fkUserId,
      type: flow.type,
      choice: userFlow.choice,
      finalDepartment: userFlow.finalDepartment,
      flowDepartment: flow.department,
      rowDepartment: userFlow.department,
      publishedAt: flowResultPublication.publishedAt,
      updatedAt: userFlow.updatedAt,
    })
    .from(userFlow)
    .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
    .leftJoin(flowResultPublication, eq(flowResultPublication.fkFlowId, flow.id))
    .where(
      and(
        inArray(userFlow.fkUserId, uniqueUids),
        eq(userFlow.progressStatus, "passed"),
        eq(flow.isDeleted, false),
        publishingFlowId
          ? or(eq(flowResultPublication.status, "published"), eq(userFlow.fkFlowId, publishingFlowId))
          : eq(flowResultPublication.status, "published"),
      ),
    ),
  ]);

  /* 只有真正授予角色的通过记录才参与计算：无授予（如办公类未通过）不动 Link 角色，避免降级 */
  const calculatedRoles = new Map<number, number>();
  for (const acceptedFlow of acceptedFlows) {
    const grantedRole = roleGrantedByFlow(acceptedFlow.type);
    if (grantedRole <= 0) continue;
    calculatedRoles.set(
      acceptedFlow.uid,
      Math.max(calculatedRoles.get(acceptedFlow.uid) ?? 0, grantedRole),
    );
  }

  const idsByRole = new Map<number, number[]>();
  for (const uid of uniqueUids) {
    const user = users.get(uid);
    const calculatedRole = calculatedRoles.get(uid);
    if (calculatedRole === undefined) continue;
    // People must never automatically change an administrator role.
    if (!user || user.role === null || user.role >= MANAGER_ROLE || user.role === calculatedRole) {
      continue;
    }
    const ids = idsByRole.get(calculatedRole) ?? [];
    ids.push(uid);
    idsByRole.set(calculatedRole, ids);
  }

  /* 部门归属：多次通过以最后一次为准；部长及以上账号不改动，已是目标部门的跳过。
     办公类需要 flowType/choice/finalDepartment：部长团评议的「最终去向」优先，
     否则按「第一志愿优先」——三者必须一并传给解析器，否则办公类分支不会生效。 */
  const latestDepartments = resolveLatestPassedDepartments(
    acceptedFlows.map((row) => ({
      uid: row.uid,
      flowType: row.type,
      choice: row.choice,
      finalDepartment: row.finalDepartment,
      flowDepartment: row.flowDepartment,
      rowDepartment: row.rowDepartment,
      passedAt: row.publishedAt ?? row.updatedAt,
    })),
  );
  const idsByDepartment = new Map<string, number[]>();
  for (const [uid, department] of latestDepartments) {
    const user = users.get(uid);
    if (!user || user.role === null || user.role >= MANAGER_ROLE) continue;
    if (normalizeDepartmentKey(user.departments[0] ?? null) === department) continue;
    const ids = idsByDepartment.get(department) ?? [];
    ids.push(uid);
    idsByDepartment.set(department, ids);
  }

  if (idsByRole.size === 0 && idsByDepartment.size === 0) return;

  const accessToken = await getLinkAdminAccessTokenFromSession();
  const failures: Array<{ id: number; reason: string }> = [];
  let changedIdentity = false;
  for (const [role, ids] of idsByRole) {
    for (const batch of chunk(ids, LINK_BATCH_ROLE_UPDATE_LIMIT)) {
      try {
        const result = await updateLinkUserRoles(
          accessToken,
          batch,
          peopleRoleToLinkRole(role),
        );
        const returnedIds = new Set(result.results.map((item) => item.id));
        for (const item of result.results) {
          if (!item.success) {
            failures.push({ id: item.id, reason: item.reason ?? "未知错误" });
          } else {
            changedIdentity = true;
          }
        }
        for (const id of batch) {
          if (!returnedIds.has(id)) {
            failures.push({ id, reason: "Link 未返回该用户的更新结果" });
          }
        }
      } catch (error) {
        for (const id of batch) {
          failures.push({ id, reason: error instanceof Error ? error.message : "未知错误" });
        }
      }
    }
  }

  for (const [department, ids] of idsByDepartment) {
    for (const batch of chunk(ids, LINK_BATCH_ROLE_UPDATE_LIMIT)) {
      try {
        const result = await updateLinkUserDepartments(
          accessToken,
          batch,
          department,
        );
        const returnedIds = new Set(result.results.map((item) => item.id));
        for (const item of result.results) {
          if (!item.success) {
            failures.push({
              id: item.id,
              reason: item.reason ?? "部门更新失败",
            });
          } else {
            changedIdentity = true;
          }
        }
        for (const id of batch) {
          if (!returnedIds.has(id)) {
            failures.push({ id, reason: "Link 未返回该用户的部门更新结果" });
          }
        }
      } catch (error) {
        for (const id of batch) {
          failures.push({
            id,
            reason: error instanceof Error ? error.message : "未知错误",
          });
        }
      }
    }
  }

  if (changedIdentity) {
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/manage");
  }

  if (failures.length > 0) {
    throw new Error(
      `Link 批量同步用户身份失败：${failures.map(({ id, reason }) => `${id} (${reason})`).join(", ")}`,
    );
  }

};

/** 单个用户的身份同步（角色 + 部门） */
export const syncUserIdentityFromAcceptedFlow = async (uid: number) =>
  syncUserIdentityFromAcceptedFlows([uid]);
