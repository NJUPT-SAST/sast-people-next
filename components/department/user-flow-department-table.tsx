'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  assignUserFlowDepartment,
  listUserFlowDepartmentAssignments,
  type UserFlowDepartmentAssignmentList,
} from '@/action/department/manage';
import { DepartmentAssigner } from '@/components/department/department-assigner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const ALL_FLOWS_VALUE = '__all__';

const progressLabels: Record<string, string> = {
  not_started: '未开始',
  ongoing: '进行中',
  passed: '通过',
  failed: '未通过',
  withdrawn: '已退回',
};

/** 报名记录归属：报名当时的部门已固化，这里只做管理员手动纠正 */
export function UserFlowDepartmentTable({
  initialData,
  flows,
  departmentKeys,
}: {
  initialData: UserFlowDepartmentAssignmentList;
  flows: Array<{ id: number; title: string }>;
  departmentKeys: string[];
}) {
  const [data, setData] = useState(initialData);
  const [flowId, setFlowId] = useState<number | null>(null);
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);
  const [loading, setLoading] = useState(false);

  async function reload(nextFlowId: number | null, nextOnlyUnassigned: boolean) {
    setLoading(true);
    try {
      setData(
        await listUserFlowDepartmentAssignments({
          flowId: nextFlowId,
          onlyUnassigned: nextOnlyUnassigned,
          limit: 100,
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载报名记录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  async function assign(userFlowId: number, department: string | null) {
    const result = await assignUserFlowDepartment(userFlowId, department);
    setData((current) => ({
      ...current,
      total:
        onlyUnassigned && result.department !== null
          ? Math.max(0, current.total - 1)
          : current.total,
      items: current.items
        .map((item) =>
          item.id === result.userFlowId ? { ...item, department: result.department } : item,
        )
        .filter((item) => !onlyUnassigned || item.department === null),
    }));
  }

  return (
    <Card className="gap-0 overflow-hidden rounded-lg py-0">
      <CardHeader className="gap-1 border-b px-4 py-3">
        <CardTitle className="text-sm">报名记录归属</CardTitle>
        <CardDescription className="text-xs">
          报名记录的部门在报名时按「组别映射 → 流程归属」固化；此表用于纠正历史数据。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-0 p-0">
        <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center">
          <Select
            value={flowId === null ? ALL_FLOWS_VALUE : String(flowId)}
            onValueChange={(next) => {
              const nextFlowId = next === ALL_FLOWS_VALUE ? null : Number(next);
              setFlowId(nextFlowId);
              void reload(nextFlowId, onlyUnassigned);
            }}
            disabled={loading}
          >
            <SelectTrigger className="h-9 sm:w-[16rem]">
              {/* Radix 的默认值为空时不会回填文案，这里显式渲染当前筛选 */}
              <SelectValue>
                {flowId === null
                  ? '全部流程'
                  : flows.find((flow) => flow.id === flowId)?.title ?? '全部流程'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FLOWS_VALUE}>全部流程</SelectItem>
              {flows.map((flow) => (
                <SelectItem key={flow.id} value={String(flow.id)}>
                  {flow.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant={onlyUnassigned ? 'default' : 'outline'}
            aria-pressed={onlyUnassigned}
            disabled={loading}
            onClick={() => {
              const next = !onlyUnassigned;
              setOnlyUnassigned(next);
              void reload(flowId, next);
            }}
          >
            只看未归属
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground sm:ml-auto">
            共 {data.total} 条，显示最近 {data.items.length} 条
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-10 px-4 text-xs font-medium text-muted-foreground">候选人</TableHead>
              <TableHead className="h-10 px-3 text-xs font-medium text-muted-foreground">流程</TableHead>
              <TableHead className="h-10 px-3 text-xs font-medium text-muted-foreground">投递组别</TableHead>
              <TableHead className="hidden h-10 px-3 text-xs font-medium text-muted-foreground lg:table-cell">
                当前进度
              </TableHead>
              <TableHead className="h-10 w-[13rem] px-4 text-xs font-medium text-muted-foreground">
                归属部门
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.length === 0 ? (
              <TableRow className="border-b-0">
                <TableCell colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {loading ? '正在加载…' : '没有符合条件的报名记录'}
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((item) => (
                <TableRow key={item.id} className="border-b border-border/60 last:border-0">
                  <TableCell className="px-4 py-2.5">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium">
                        {item.userName ?? `用户 #${item.fkUserId}`}
                      </span>
                      <span className="truncate text-xs tabular-nums text-muted-foreground">
                        {item.userStudentId ?? `UID ${item.fkUserId}`} ·{' '}
                        {new Date(item.createdAt).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[16rem] truncate px-3 py-2.5 text-sm">
                    {item.flowTitle}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-sm text-muted-foreground">
                    {item.applyGroup ?? '—'}
                  </TableCell>
                  <TableCell className="hidden px-3 py-2.5 text-sm text-muted-foreground lg:table-cell">
                    {item.progressStatus
                      ? progressLabels[item.progressStatus] ?? item.progressStatus
                      : '—'}
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <DepartmentAssigner
                      value={item.department}
                      departmentKeys={departmentKeys}
                      onChange={(department) => assign(item.id, department)}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
