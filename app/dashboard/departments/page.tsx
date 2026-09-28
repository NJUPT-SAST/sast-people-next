import {
  listDepartmentOverview,
  listFlowDepartmentAssignments,
  listUserFlowDepartmentAssignments,
} from "@/action/department/manage";
import { DepartmentOverviewTable } from "@/components/department/department-overview-table";
import { FlowDepartmentTable } from "@/components/department/flow-department-table";
import { UserFlowDepartmentTable } from "@/components/department/user-flow-department-table";
import { PageHeader, PageTitle } from "@/components/route";

export const dynamic = "force-dynamic";

const DepartmentsPage = async () => {
  const [overview, flowAssignments, userFlowAssignments] = await Promise.all([
    listDepartmentOverview(),
    listFlowDepartmentAssignments(),
    listUserFlowDepartmentAssignments({ onlyUnassigned: true, limit: 100 }),
  ]);

  return (
    <>
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-1">
          <PageTitle />
          <p className="text-sm text-muted-foreground">
            部门归属决定普通账号能看到的数据范围；未归属部门的数据只有管理员可见。
          </p>
        </div>
      </PageHeader>
      <DepartmentOverviewTable overview={overview} />
      <FlowDepartmentTable
        initialFlows={flowAssignments}
        departmentKeys={overview.departmentKeys}
      />
      <UserFlowDepartmentTable
        initialData={userFlowAssignments}
        flows={flowAssignments.map((flow) => ({ id: flow.id, title: flow.title }))}
        departmentKeys={overview.departmentKeys}
      />
    </>
  );
};

export default DepartmentsPage;
