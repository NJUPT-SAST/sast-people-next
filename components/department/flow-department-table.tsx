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

const FLOW_TYPE_LABELS: Record<string, string> = {
  recruitment: '笔试招新',
  recruitment_exemption: '免试招新',
  woc: 'WOC/WOD',
  soc: 'SOC/SOD',
};

const groupMappingText = (mapping: Record<string, string> | null) => {
  const entries = Object.entries(mapping ?? {});
  if (entries.length === 0) return '无组别映射';
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

  async function assign(flowId: number, department: string | null) {
    const result = await assignFlowDepartment(flowId, department);
    setFlows((current) =>
      current.map((item) =>
        item.id === result.flowId ? { ...item, department: result.department } : item,
      ),
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>流程归属</CardTitle>
        <CardDescription>
          流程归属决定哪些部门账号能看到该流程；「全局」表示未归属，仅管理员可见可改。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>流程</TableHead>
                <TableHead className="hidden lg:table-cell">组别映射</TableHead>
                <TableHead className="text-right">报名人数</TableHead>
                <TableHead className="min-w-[12rem]">归属部门</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    暂无流程
                  </TableCell>
                </TableRow>
              ) : (
                flows.map((flow) => (
                  <TableRow key={flow.id}>
                    <TableCell>
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="font-medium">{flow.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {FLOW_TYPE_LABELS[flow.type] ?? flow.type} · 创建于{' '}
                          {new Date(flow.createdAt).toLocaleDateString('zh-CN')}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden max-w-[20rem] text-xs text-muted-foreground lg:table-cell">
                      {groupMappingText(flow.groupDepartments)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {flow.candidateCount}
                    </TableCell>
                    <TableCell>
                      <DepartmentAssigner
                        value={flow.department}
                        departmentKeys={departmentKeys}
                        onChange={(department) => assign(flow.id, department)}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
