"use client";

import { useState } from "react";
import type {
  DepartmentOverview,
  FlowDepartmentAssignment,
  UserFlowDepartmentAssignmentList,
} from "@/action/department/manage";
import { DepartmentOverviewTable } from "@/components/department/department-overview-table";
import { FlowDepartmentTable } from "@/components/department/flow-department-table";
import { UserFlowDepartmentTable } from "@/components/department/user-flow-department-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * 部门管理控制台：概览 / 流程归属 / 报名记录归属 三件事原本竖着堆在同一页（近 3000px 高），
 * 管理员每次都要滚过两张长表才能到第三张。改成页签后每屏只面对一件事。
 * 数据全部在服务端一次取回，切页签不发请求。
 */
export function DepartmentConsole({
  overview,
  flowAssignments,
  userFlowAssignments,
}: {
  overview: DepartmentOverview;
  flowAssignments: FlowDepartmentAssignment[];
  userFlowAssignments: UserFlowDepartmentAssignmentList;
}) {
  const [tab, setTab] = useState("overview");

  return (
    <Tabs value={tab} onValueChange={setTab} className="min-w-0">
      <TabsList className="w-full justify-start sm:w-fit">
        <TabsTrigger value="overview">
          部门概览
          <span className="tabular-nums text-muted-foreground">
            {overview.departments.length}
          </span>
        </TabsTrigger>
        <TabsTrigger value="flows">
          流程归属
          <span className="tabular-nums text-muted-foreground">
            {flowAssignments.length}
          </span>
        </TabsTrigger>
        <TabsTrigger value="candidates">
          报名记录归属
          <span className="tabular-nums text-muted-foreground">
            {userFlowAssignments.total}
          </span>
        </TabsTrigger>
      </TabsList>

      <div className="mt-4">
        {tab === "overview" && <DepartmentOverviewTable overview={overview} />}
        {tab === "flows" && (
          <FlowDepartmentTable
            initialFlows={flowAssignments}
            departmentKeys={overview.departmentKeys}
          />
        )}
        {tab === "candidates" && (
          <UserFlowDepartmentTable
            initialData={userFlowAssignments}
            flows={flowAssignments.map((flow) => ({
              id: flow.id,
              title: flow.title,
            }))}
            departmentKeys={overview.departmentKeys}
          />
        )}
      </div>
    </Tabs>
  );
}
