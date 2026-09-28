import type { DepartmentOverview } from '@/action/department/manage';
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

/** 部门概览：只有管理员能看到全量聚合，普通账号只能看到自己部门的数据 */
export function DepartmentOverviewTable({ overview }: { overview: DepartmentOverview }) {
  const departmentsWithData = overview.departments.filter(
    (row) => row.flowCount > 0 || row.candidateCount > 0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>部门概览</CardTitle>
        <CardDescription>
          部门标识来自 SAST Link；未归属部门（全局）的流程与报名记录只有管理员可见。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">流程总数</p>
            <p className="text-2xl font-semibold tabular-nums">{overview.totalFlowCount}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">未归属流程</p>
            <p className="text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-500">
              {overview.unassignedFlowCount}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">报名记录总数</p>
            <p className="text-2xl font-semibold tabular-nums">{overview.totalCandidateCount}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">未归属报名记录</p>
            <p className="text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-500">
              {overview.unassignedCandidateCount}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>部门</TableHead>
                <TableHead>标识</TableHead>
                <TableHead className="text-right">流程数</TableHead>
                <TableHead className="text-right">报名记录数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departmentsWithData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    暂无部门归属数据
                  </TableCell>
                </TableRow>
              ) : (
                departmentsWithData.map((row) => (
                  <TableRow key={row.department}>
                    <TableCell className="font-medium">{departmentLabel(row.department)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {row.department}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.flowCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.candidateCount}</TableCell>
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
