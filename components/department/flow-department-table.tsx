'use client';

import { useState } from 'react';
import {
  assignFlowDepartment,
  type FlowDepartmentAssignment,
} from '@/action/department/manage';
import { DepartmentAssigner } from '@/components/department/department-assigner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { departmentLabel } from '@/const/department';
import { flowTypeLabel } from '@/const/flow';

const groupMappingText = (mapping: Record<string, string> | null) => {
  const entries = Object.entries(mapping ?? {});
  if (entries.length === 0) return null;
  return entries
    .map(([group, department]) => `${group} → ${departmentLabel(department)}`)
    .join('；');
};

/** 流程归属分配：清空为「全局」后该流程对普通部门账号不可见，除非已有本部门报名记录 */
export function FlowDepartmentTable({
  initialFlows,
  departmentKeys,
}: {
  initialFlows: FlowDepartmentAssignment[];
  departmentKeys: string[];
}) {
  const [flows, setFlows] = useState(initialFlows);
  /* 组别映射只有少数流程配了，全列都是「无组别映射」时整列都是噪音 */
  const hasGroupMapping = flows.some(
    (flow) => Object.keys(flow.groupDepartments ?? {}).length > 0,
  );

  async function assign(flowId: number, department: string | null) {
    const result = await assignFlowDepartment(flowId, department);
    setFlows((current) =>
      current.map((item) =>
        item.id === result.flowId ? { ...item, department: result.department } : item,
      ),
    );
  }

  return (
    <Card className="gap-0 overflow-hidden rounded-lg py-0">
      <CardHeader className="gap-1 border-b px-4 py-3">
        <CardTitle className="text-sm">流程归属</CardTitle>
        <CardDescription className="text-xs">
          流程归属决定哪些部门账号能看到该流程；「全局」表示未归属，仅管理员可见可改。
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-10 px-4 text-xs font-medium text-muted-foreground">流程</TableHead>
              {hasGroupMapping && (
                <TableHead className="hidden h-10 px-3 text-xs font-medium text-muted-foreground lg:table-cell">
                  组别映射
                </TableHead>
              )}
              <TableHead className="h-10 w-24 px-3 text-right text-xs font-medium text-muted-foreground">
                报名人数
              </TableHead>
              <TableHead className="h-10 w-[13rem] px-4 text-xs font-medium text-muted-foreground">
                归属部门
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flows.length === 0 ? (
              <TableRow className="border-b-0">
                <TableCell colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  暂无流程
                </TableCell>
              </TableRow>
            ) : (
              flows.map((flow) => {
                const mapping = groupMappingText(flow.groupDepartments);
                return (
                  <TableRow key={flow.id} className="border-b border-border/60 last:border-0">
                    <TableCell className="px-4 py-2.5">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-sm font-medium">{flow.title}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {flowTypeLabel(flow.type, flow.department)} · 创建于{' '}
                          {new Date(flow.createdAt).toLocaleDateString('zh-CN')}
                        </span>
                      </div>
                    </TableCell>
                    {hasGroupMapping && (
                      <TableCell className="hidden max-w-[20rem] px-3 py-2.5 text-xs text-muted-foreground lg:table-cell">
                        {mapping ?? <span className="text-muted-foreground/60">—</span>}
                      </TableCell>
                    )}
                    <TableCell className="px-3 py-2.5 text-right text-sm tabular-nums">
                      {flow.candidateCount}
                    </TableCell>
                    <TableCell className="px-4 py-2.5">
                      <DepartmentAssigner
                        value={flow.department}
                        departmentKeys={departmentKeys}
                        onChange={(department) => assign(flow.id, department)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
