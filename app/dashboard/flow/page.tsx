import { PageHeader, PageTitle } from "@/components/route";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense } from "react";
import { AddFlow } from "@/components/flow/add";
import { getDepartmentScope } from "@/lib/authz";
import { FlowTableServer } from "./flowTable";

const FlowPage = async ({ searchParams }: { searchParams: Promise<{ edit?: string }> }) => {
  const params = await searchParams;
  const scope = await getDepartmentScope();
  const scopeDepartment = scope.kind === "department" ? scope.department : null;
  return (
    <>
      <PageHeader className="border-b pb-4">
        <div className="min-w-0 space-y-1">
          <PageTitle />
          <p className="text-sm text-muted-foreground">
            管理招新、免试、WOC/WOD、SOC/SOD 与办公类部门面试等流程，维护时间、步骤与题目。
          </p>
        </div>
        <div className="w-full shrink-0 sm:w-auto">
          <AddFlow
            canChooseDepartment={scope.kind === "all"}
            department={scopeDepartment}
          />
        </div>
      </PageHeader>
      <div className="mt-1">
        <Suspense fallback={<Skeleton className="h-[200px] w-full" />}>
          <FlowTableServer initialEditFlowId={params.edit ? Number(params.edit) : undefined} scope={scope} />
        </Suspense>
      </div>
    </>
  );
};

export default FlowPage;
