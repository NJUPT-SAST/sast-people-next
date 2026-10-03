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
import { departmentCategory, departmentLabel } from '@/const/department';
import { cn } from '@/lib/utils';
import { AlertTriangle, FileStack, UserRoundCheck, Workflow } from 'lucide-react';

/** 未归属数据是唯一的异常项，只有它带色；其余数字保持中性，一眼就能看出哪里要处理 */
const unassignedTone = (count: number) =>
  count > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground';

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Workflow;
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3.5 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-xl font-semibold tabular-nums', tone)}>{value}</p>
      </div>
    </div>
  );
}

/** 部门概览：只有管理员能看到全量聚合，普通账号只能看到自己部门的数据 */
export function DepartmentOverviewTable({ overview }: { overview: DepartmentOverview }) {
  /* 服务端已经把目录里的部门补齐成 0 条的行：概览要能看出哪些部门还没归属数据，
     所以这里不再按「有数据」过滤 */
  const departments = overview.departments;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Workflow} label="流程总数" value={overview.totalFlowCount} />
        <StatTile
          icon={AlertTriangle}
          label="未归属流程"
          value={overview.unassignedFlowCount}
          tone={unassignedTone(overview.unassignedFlowCount)}
        />
        <StatTile icon={FileStack} label="报名记录总数" value={overview.totalCandidateCount} />
        <StatTile
          icon={UserRoundCheck}
          label="未归属报名记录"
          value={overview.unassignedCandidateCount}
          tone={unassignedTone(overview.unassignedCandidateCount)}
        />
      </div>

      <Card className="gap-0 overflow-hidden rounded-lg py-0">
        <CardHeader className="gap-1 border-b px-4 py-3">
          <CardTitle className="text-sm">部门分布</CardTitle>
          <CardDescription className="text-xs">
            部门标识来自 SAST Link；未归属部门（全局）的流程与报名记录只有管理员可见。
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-10 px-4 text-xs font-medium text-muted-foreground">部门</TableHead>
                <TableHead className="hidden h-10 px-3 text-xs font-medium text-muted-foreground sm:table-cell">标识</TableHead>
                <TableHead className="h-10 px-3 text-right text-xs font-medium text-muted-foreground">流程数</TableHead>
                <TableHead className="h-10 px-4 text-right text-xs font-medium text-muted-foreground">报名记录数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.length === 0 ? (
                <TableRow className="border-b-0">
                  <TableCell colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    暂无部门归属数据
                  </TableCell>
                </TableRow>
              ) : (
                departments.map((row) => (
                  <TableRow key={row.department} className="border-b border-border/60 last:border-0">
                    <TableCell className="px-4 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {departmentLabel(row.department)}
                        </span>
                        <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground">
                          {departmentCategory(row.department) === 'tech'
                            ? '技术'
                            : departmentCategory(row.department) === 'office'
                              ? '办公'
                              : '未分类'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden px-3 py-2.5 font-mono text-xs text-muted-foreground sm:table-cell">
                      {row.department}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-right text-sm tabular-nums">
                      {row.flowCount}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right text-sm tabular-nums">
                      {row.candidateCount}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
