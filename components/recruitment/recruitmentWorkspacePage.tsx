import { getEvaluationCandidates } from "@/action/user-flow/evaluation";
import { calScore } from "@/action/user-flow/user-point/calScore";
import { RecruitmentContent } from "@/components/recruitment/recruitmentContent";
import { PageTitle } from "@/components/route";
import { isDepartmentEnabled } from "@/const/department";
import { db } from "@/db/drizzle";
import { flow } from "@/db/schema";
import { verifySession } from "@/lib/dal";
import { getDepartmentScope } from "@/lib/authz";
import { visibleFlowPredicate } from "@/lib/flow-access";
import { MANAGER_ROLE } from "@/lib/link/role";
import {
  parseWorkspaceFlowPreference,
  resolveWorkspaceFlowId,
  workspaceFlowPreferenceCookieName,
} from "@/lib/workspace-flow-preference";
import { and, desc, eq, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { INTERVIEW_FLOW_TYPES, OFFICE_INTERVIEW_FLOW_TYPE } from "@/const/flow";

/* 面试类流程：免试 / WOC-WOD / SOC-SOD / 办公类部门面试 */
const interviewFlowTypes = [...INTERVIEW_FLOW_TYPES];

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
      department: flow.department,
      /* 办公类面试时段选项：工作台的面评表要据此做行内改时段与时段筛选 */
      slotOptions: flow.slotOptions,
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
  /* 暂不启用的部门（电子部）不出现在流程选择器与页签里；数据与流程本身保留 */
  const selectableFlows = flowTypes.filter((item) =>
    isDepartmentEnabled(item.department),
  );
  const requestedFlowId = parsePositiveInteger(params.flowId);
  /* 「上次使用的流程」：显式 flowId 链接优先，其次本浏览器上次点选的流程（Cookie），
     否则回落最新流程；记忆的 id 也要在本次会话可见的流程里才算数 */
  const cookieStore = await cookies();
  const rememberedFlowId = parseWorkspaceFlowPreference(
    cookieStore.get(workspaceFlowPreferenceCookieName(mode))?.value,
  );
  const resolvedFlowId = resolveWorkspaceFlowId({
    requestedFlowId,
    rememberedFlowId,
    selectableFlowIds: selectableFlows.map((item) => item.id),
  });
  const defaultFlow =
    selectableFlows.find((item) => item.id === resolvedFlowId) ??
    selectableFlows[0];
  const defaultFlowId = defaultFlow?.id.toString();
  /* 办公类流程由部长操作：讲师账号不加载该流程的候选人（action 也会再次拒绝） */
  const canLoadDefaultCandidates =
    isInterviewWorkspace &&
    !(
      defaultFlow?.type === OFFICE_INTERVIEW_FLOW_TYPE &&
      session.role < MANAGER_ROLE
    );
  const [initialData, initialEvalData] = await Promise.all([
    defaultFlowId && !isInterviewWorkspace
      ? calScore(Number(defaultFlowId))
      : Promise.resolve([]),
    defaultFlowId && canLoadDefaultCandidates
      ? getEvaluationCandidates(Number(defaultFlowId))
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
          flowTypes={selectableFlows}
          initialData={initialData}
          initialEvalData={initialEvalData}
          defaultFlowId={defaultFlowId}
          targetUserFlowId={parsePositiveInteger(params.userFlowId)}
          targetScheduleId={parsePositiveInteger(params.scheduleId)}
          role={session.role}
        />
      </div>
    </>
  );
}
