'use client';
import { calScore } from '@/action/user-flow/user-point/calScore';
import { ColumnDef } from '@tanstack/react-table';
import React from 'react';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';

const statusLabel: Record<string, string> = {
  pending: '未开始',
  ungraded: '未批卷',
  ongoing: '待确认',
  passed: '通过',
  failed: '不通过',
  accepted: '通过邮件已发',
  rejected: '不通过邮件已发',
};

const statusVariant: Record<
  string,
  React.ComponentProps<typeof Badge>['variant']
> = {
  pending: 'outline',
  ungraded: 'outline',
  ongoing: 'outline',
  passed: 'outline',
  failed: 'outline',
  accepted: 'outline',
  rejected: 'outline',
};

const statusClassName: Record<string, string> = {
  pending: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  ungraded: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  ongoing: 'border-chart-3/30 bg-chart-3/10 text-chart-3',
  passed: 'border-primary/30 bg-primary/10 text-primary',
  failed: 'border-destructive/30 bg-destructive/10 text-destructive',
  accepted: 'border-primary/30 bg-primary/10 text-primary',
  rejected: 'border-destructive/30 bg-destructive/10 text-destructive',
};

export const columns: ColumnDef<
  Awaited<ReturnType<typeof calScore>>[number]
>[] = [
  {
    id: 'select',
    header: ({ table }) => {
      const selectableRows = table
        .getFilteredRowModel()
        .rows.filter((row) => row.getCanSelect());
      const selectedCount = selectableRows.filter((row) =>
        row.getIsSelected(),
      ).length;
      const totalCount = selectableRows.length;
      const checked =
        selectedCount === 0
          ? false
          : selectedCount === totalCount
            ? true
            : 'indeterminate';

      return (
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => {
            selectableRows.forEach((row) => row.toggleSelected(!!value));
          }}
          aria-label="Select all"
          disabled={totalCount === 0}
        />
      );
    },
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        disabled={!row.getCanSelect()}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'studentId',
    header: '学号',
  },
  {
    accessorKey: 'name',
    header: () => <div className="text-center">姓名</div>,
    cell: ({ getValue }) => (
      <div className="text-center">{getValue() as string}</div>
    ),
  },
  {
    accessorKey: 'phoneNumber',
    header: '手机号',
  },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ getValue }) => {
      const status = String(getValue() ?? 'ongoing');
      return (
        <Badge
          variant={statusVariant[status] ?? 'outline'}
          className={statusClassName[status]}
        >
          {statusLabel[status] ?? status}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'problemScores',
    header: '得分组成',
    cell: ({ getValue }) => {
      const scores = getValue() as
        | Array<{
            id: number;
            title: string;
            score: number;
            points: number;
            judgerName: string | null;
          }>
        | undefined;
      if (!scores?.length) {
        return (
          <Button size="sm" variant="outline" disabled>
            无题目
          </Button>
        );
      }

      return (
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              查看得分
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>得分组成</DialogTitle>
            </DialogHeader>
            <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
              {scores.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="min-w-0 break-words">{item.title}</span>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant="outline" className="tabular-nums">
                      {item.points}/{item.score}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      阅卷：{item.judgerName ?? '未记录'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      );
    },
  },
  {
    accessorKey: 'totalScore',
    header: () => <div className="text-right">总分</div>,
    cell: ({ getValue }) => (
      <div className="flex justify-end">
        <span className="rounded-md bg-primary/10 px-2 py-1 text-sm font-semibold tabular-nums text-primary">
          {getValue() as string}
        </span>
      </div>
    ),
    filterFn: (row, id, filterValue) => {
      return row.original.totalScore
        ? parseInt(row.original.totalScore) >= parseInt(filterValue)
        : false;
    },
  },
];

export const Table: React.FC = () => {
  return <></>;
};
