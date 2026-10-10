import { db } from "@/db/drizzle";
import { displayFlow } from "@/types/flow";
import { flow, flowStep, problem } from "@/db/schema";
import { getDepartmentScope } from "@/lib/authz";
import { isDepartmentEnabled } from "@/const/department";
import { visibleFlowPredicate } from "@/lib/flow-access";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { isLinkAuthorizationError } from "@/lib/link/client";
import { MissingLinkAdminAccessTokenError } from "@/lib/link/session";
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";

/**
 * 全量流程列表：所有登录用户都能看到全部流程（流程管理列表、候选人报名入口使用），
 * 不做部门过滤；编辑权限由流程级断言（canEditFlow / assertFlowEditable）收敛到归属部门。
 * 暂不启用的部门（DISABLED_DEPARTMENT_KEYS）除外：业务界面不再出现，
 * 数据与归属仍可在部门管理里看到（见 action/department/manage.ts）。
 */
export const useFlowList = async (): Promise<displayFlow[]> =>
  (await loadFlowList(undefined)).filter((item) =>
    isDepartmentEnabled(item.department),
  );

/**
 * 与当前账号部门相关的流程列表：阅卷、笔试管理、面试管理等作业面使用，
 * 避免其他部门的流程出现在本部门讲师/部长的选择器里；管理员不过滤。
 */
export const useDepartmentFlowList = async (): Promise<displayFlow[]> => {
  const scope = await getDepartmentScope();
  return loadFlowList(visibleFlowPredicate(scope));
};

/**
 * 阅卷范围选择器专用：只保留**真的有题目**的流程（至少一个未删除步骤挂着题目）。
 * 否则讲师会在下拉里选到面试/WOC/免试这类没有笔试题的流程，勾完范围保存后才报
 * 「当前流程下没有可阅卷题目」，白跑一趟。
 */
export const useReviewableFlowList = async (): Promise<displayFlow[]> => {
  const scope = await getDepartmentScope();
  const flowList = await loadFlowList(visibleFlowPredicate(scope));
  const flowIds = flowList.map((item) => item.id);

  if (flowIds.length === 0) {
    return [];
  }

  const rows = await db
    .selectDistinct({ flowId: flowStep.fkFlowId })
    .from(flowStep)
    .innerJoin(problem, eq(problem.fkFlowStepId, flowStep.id))
    .where(
      and(inArray(flowStep.fkFlowId, flowIds), eq(flowStep.isDeleted, false)),
    );

  const gradeableFlowIds = new Set(rows.map((row) => row.flowId));
  return flowList.filter((item) => gradeableFlowIds.has(item.id));
};

const loadFlowList = async (
  visible: SQL<unknown> | undefined,
): Promise<displayFlow[]> => {
  const flowList = await db
    .select()
    .from(flow)
    .where(and(eq(flow.isDeleted, false), visible))
    .orderBy(desc(flow.createdAt));
  const flowIds = flowList.map((item) => item.id);
  const [ownerMap, steps] = await Promise.all([
    getFlowOwnerMap(flowList.map((item) => item.ownerId)),
    flowIds.length === 0
      ? Promise.resolve([])
      : db
          .select()
          .from(flowStep)
          .where(
            and(
              inArray(flowStep.fkFlowId, flowIds),
              eq(flowStep.isDeleted, false),
            ),
          )
          .orderBy(flowStep.fkFlowId, flowStep.order),
  ]);
  const stepsByFlowId = new Map<number, typeof steps>();
  for (const step of steps) {
    const flowSteps = stepsByFlowId.get(step.fkFlowId) ?? [];
    flowSteps.push(step);
    stepsByFlowId.set(step.fkFlowId, flowSteps);
  }

  return flowList.map((item) => (
    {
      ...item,
      owner: ownerMap.get(item.ownerId)?.name ?? "未知用户",
      steps: stepsByFlowId.get(item.id) ?? [],
    }
  ));
};

const getFlowOwnerMap = async (ownerIds: number[]) => {
  try {
    return await listPeopleUsersByLinkIds(ownerIds);
  } catch (error) {
    // Owner names are display metadata; missing admin scope must not block flow browsing.
    if (
      error instanceof MissingLinkAdminAccessTokenError ||
      isLinkAuthorizationError(error)
    ) {
      return new Map();
    }
    throw error;
  }
};
