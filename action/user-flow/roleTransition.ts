"use server";

import { db } from "@/db/drizzle";
import { flow, flowResultPublication, userFlow } from "@/db/schema";
import { updateLinkUserRoles } from "@/lib/link/admin";
import { MANAGER_ROLE, peopleRoleToLinkRole } from "@/lib/link/role";
import { OFFICE_INTERVIEW_FLOW_TYPE } from "@/const/flow";
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

export const syncUserRolesFromAcceptedFlows = async (uids: number[], publishingFlowId?: number) => {
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

  if (idsByRole.size === 0) return;

  const accessToken = await getLinkAdminAccessTokenFromSession();
  const failures: Array<{ id: number; reason: string }> = [];
  let changedRole = false;
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
            changedRole = true;
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

  if (changedRole) {
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/manage");
  }

  if (failures.length > 0) {
    throw new Error(
      `Link 批量更新用户角色失败：${failures.map(({ id, reason }) => `${id} (${reason})`).join(", ")}`,
    );
  }

};

export const syncUserRoleFromAcceptedFlows = async (uid: number) =>
  syncUserRolesFromAcceptedFlows([uid]);
