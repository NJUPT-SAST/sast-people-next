import { redirect } from "next/navigation";

import {
  listGradingFairnessFlows,
  loadGradingFairnessData,
} from "@/action/user-flow/grading-fairness/load";
import { loadGradingFairnessProfile } from "@/action/user-flow/grading-fairness/profile";
import { FairnessFlowPicker } from "@/components/review/analytics/flowPicker";
import { GradingFairnessDashboard } from "@/components/review/analytics/gradingFairnessDashboard";
import { PageHeader, PageTitle } from "@/components/route";
import { verifyRole } from "@/lib/dal";
import { MANAGER_ROLE } from "@/lib/link/role";

/**
 * 阅卷公平性分析（部长及以上）。
 *
 * 只读分析：不写回 `user_point`，不影响官方成绩。模型规范见 docs/GRADING_FAIRNESS_MODEL.md。
 */
export default async function GradingFairnessPage({
  searchParams,
}: {
  searchParams: Promise<{ flowId?: string }>;
}) {
  const session = await verifyRole(MANAGER_ROLE).catch(() => null);
  if (!session) redirect("/dashboard");

  const { flowId } = await searchParams;
  const flows = await listGradingFairnessFlows();
  const selected = flows.find((flow) => String(flow.id) === flowId) ?? flows[0] ?? null;

  const [data, profile] = selected
    ? await Promise.all([
        loadGradingFairnessData(selected.id),
        loadGradingFairnessProfile(selected.id),
      ])
    : [null, null];

  return (
    <>
      <PageHeader className="border-b pb-4">
        <PageTitle />
      </PageHeader>

      {selected ? (
        <div className="mt-4 flex flex-col gap-3 px-4 lg:flex-row lg:items-end lg:justify-between lg:px-6">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="truncate text-base font-medium">{selected.title}</p>
            <p className="text-sm text-muted-foreground">
              {selected.department ? `${selected.department} · ` : "全局流程 · "}
              {flows.length > 1 ? `本部门共 ${flows.length} 个流程有评分记录` : "本流程已有评分记录"}
            </p>
          </div>
          {flows.length > 1 ? (
            <FairnessFlowPicker flows={flows} selectedId={selected.id} />
          ) : null}
        </div>
      ) : null}

      <div className="mt-4">
        {data && profile ? (
          <GradingFairnessDashboard data={data} profile={profile} />
        ) : (
          <p className="px-4 text-sm text-muted-foreground lg:px-6">
            当前没有可分析的阅卷数据：需要流程内已有评分记录，且该流程在本人部门可见范围内。
          </p>
        )}
      </div>
    </>
  );
}
