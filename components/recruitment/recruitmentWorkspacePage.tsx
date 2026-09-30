import { getEvaluationCandidates } from "@/action/user-flow/evaluation";
import { calScore } from "@/action/user-flow/user-point/calScore";
import {
  listPendingSlotChangeRequests,
  listSecondChoiceCandidates,
} from "@/action/user-flow/office-interview";
import { OfficeInterviewPanels } from "@/components/recruitment/officeInterviewPanels";
import { RecruitmentContent } from "@/components/recruitment/recruitmentContent";
import { PageTitle } from "@/components/route";
import { db } from "@/db/drizzle";
import { flow } from "@/db/schema";
import { verifySession } from "@/lib/dal";
import { getDepartmentScope } from "@/lib/authz";
import { visibleFlowPredicate } from "@/lib/flow-access";
import { LECTURER_ROLE, MANAGER_ROLE } from "@/lib/link/role";
import { and, desc, eq, inArray } from "drizzle-orm";

const interviewFlowTypes = [
  "woc",
  "soc",
  "recruitment_exemption",
  "office_interview",
] as const;

export type RecruitmentWorkspaceMode = "written" | "interview";

type WorkspaceSearchParams = Promise<{
  flowId?: string;
  userFlowId?: string;
  scheduleId?: string;
}>;

const workspaceCopy: Record<
  RecruitmentWorkspaceMode,
  { description: string }
> = {
  written: {
    description: "按笔试流程查看成绩、筛选候选人并确认录取结果。",
  },
  interview: {
    description: "按面试流程安排日程、记录面评并跟进候选人状态。",
  },
};

function parsePositiveInteger(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export async function RecruitmentWorkspacePage({
  mode,
  searchParams,
}: {
  mode: RecruitmentWorkspaceMode;
  searchParams: WorkspaceSearchParams;
}) {
  const session = await verifySession();
  const scope = await getDepartmentScope();
  const params = await searchParams;
  const isInterviewWorkspace = mode === "interview";
  const flowTypes = await db
    .select({
      id: flow.id,
      title: flow.title,
      type: flow.type,
      groupOptions: flow.groupOptions,
    })
    .from(flow)
    .where(
      and(
        eq(flow.isDeleted, false),
        isInterviewWorkspace
          ? inArray(flow.type, interviewFlowTypes)
          : eq(flow.type, "recruitment"),
        /* 流程选择器只展示与本部门相关的流程（管理员不过滤） */
        visibleFlowPredicate(scope),
      ),
    )
    .orderBy(desc(flow.createdAt));
  const requestedFlowId = parsePositiveInteger(params.flowId);
  const defaultFlow =
    flowTypes.find((item) => item.id === requestedFlowId) ?? flowTypes[0];
  const defaultFlowId = defaultFlow?.id.toString();
  const [
    initialData,
    initialEvalData,
    secondChoiceCandidates,
    pendingSlotChanges,
  ] = await Promise.all([
    defaultFlowId && !isInterviewWorkspace
      ? calScore(Number(defaultFlowId))
      : Promise.resolve([]),
    defaultFlowId && isInterviewWorkspace
      ? getEvaluationCandidates(Number(defaultFlowId))
      : Promise.resolve([]),
    /* 办公类部门专属：非办公部门与无部门归属的账号由 action 返回空列表 */
    isInterviewWorkspace &&
    scope.kind !== "none" &&
    session.role >= LECTURER_ROLE
      ? listSecondChoiceCandidates()
      : Promise.resolve([]),
    /* 待审批列表仅部长及以上可读（action 内部会再次校验角色） */
    isInterviewWorkspace && scope.kind !== "none" && session.role >= MANAGER_ROLE
      ? listPendingSlotChangeRequests()
      : Promise.resolve([]),
  ]);

  return (
    <>
      <div className="flex flex-col gap-1 border-b pb-4">
        <PageTitle />
        <p className="text-sm text-muted-foreground">
          {workspaceCopy[mode].description}
        </p>
      </div>
      <div className="mt-5">
        <RecruitmentContent
          mode={mode}
          flowTypes={flowTypes}
          initialData={initialData}
          initialEvalData={initialEvalData}
          defaultFlowId={defaultFlowId}
          targetUserFlowId={parsePositiveInteger(params.userFlowId)}
          targetScheduleId={parsePositiveInteger(params.scheduleId)}
          role={session.role}
        />
      </div>
      {isInterviewWorkspace && (
        <OfficeInterviewPanels
          secondChoiceRows={secondChoiceCandidates}
          pendingSlotRows={pendingSlotChanges}
        />
      )}
    </>
  );
}
