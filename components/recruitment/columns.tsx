'use client';
import type { ScoreRow } from '@/action/user-flow/user-point/calScore';
import { Column, ColumnDef } from '@tanstack/react-table';
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
import { ViewUserInfoSheet } from '@/components/manage/viewUserInfoSheet';
import { departmentLabel } from '@/const/department';
import { ArrowDown, ArrowUp, ArrowUpDown, MessageSquareText } from 'lucide-react';
import { cn } from '@/lib/utils';

const statusLabel: Record<string, string> = {
  pending: '未开始',
  not_started: '未开始',
  ungraded: '未批卷',
  ongoing: '待确认',
  passed: '通过',
  failed: '不通过',
  withdrawn: '未参与',
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
  withdrawn: 'outline',
  accepted: 'outline',
  rejected: 'outline',
};

const statusClassName: Record<string, string> = {
  pending: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  not_started: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  ungraded: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  ongoing: 'border-chart-3/30 bg-chart-3/10 text-chart-3',
  passed: 'border-primary/30 bg-primary/10 text-primary',
  failed: 'border-destructive/30 bg-destructive/10 text-destructive',
  withdrawn: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  accepted: 'border-primary/30 bg-primary/10 text-primary',
  rejected: 'border-destructive/30 bg-destructive/10 text-destructive',
};

/** 表头排序按钮：与面试表同一套箭头与文字色，点击在升序 / 降序之间切换 */
export const SortableHeader = ({
  column,
  label,
  align = 'left',
}: {
  column: Column<ScoreRow, unknown>;
  label: string;
  align?: 'left' | 'right';
}) => {
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      aria-label={`按${label}排序`}
      className={cn(
        'group inline-flex w-full items-center gap-1 rounded text-xs font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
        align === 'right' ? 'justify-end' : 'justify-start',
        sorted ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      {sorted === 'asc' ? (
        <ArrowUp className="size-3 shrink-0" aria-hidden="true" />
      ) : sorted === 'desc' ? (
        <ArrowDown className="size-3 shrink-0" aria-hidden="true" />
      ) : (
        <ArrowUpDown
          className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60"
          aria-hidden="true"
        />
      )}
    </button>
  );
};

export const makeColumns = (role: number): ColumnDef<ScoreRow>[] => [
  {
    id: 'select',
    header: ({ table }) => {
      const rows = table.getFilteredRowModel().rows ?? [];
      const selectableRows = rows.filter((row) => row.getCanSelect());
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
          aria-label="全选当前列表"
          disabled={totalCount === 0}
        />
      );
    },
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label={`选择 ${row.original.name}`}
        disabled={!row.getCanSelect()}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'studentId',
    header: ({ column }) => <SortableHeader column={column} label="学号" />,
    sortingFn: (a, b) =>
      (a.original.studentId ?? '').localeCompare(b.original.studentId ?? ''),
    cell: ({ getValue }) => {
      const studentId = getValue() as string | null;
      if (!studentId) {
        return <span className="text-muted-foreground">-</span>;
      }
      return <span className="tabular-nums">{studentId}</span>;
    },
  },
  {
    accessorKey: 'name',
    header: ({ column }) => <SortableHeader column={column} label="姓名" />,
    sortingFn: (a, b) =>
      a.original.name.localeCompare(b.original.name, 'zh-Hans-CN'),
    cell: ({ row }) => {
      const original = row.original;
      return (
        <ViewUserInfoSheet
          userInfo={{
            id: original.uid,
            name: original.name,
            studentId: original.studentId,
          }}
          currentUserRole={role}
          trigger={
            <button
              type="button"
              title={original.name}
              className="max-w-full truncate text-left font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
            >
              {original.name}
            </button>
          }
        />
      );
    },
  },
  {
    accessorKey: 'department',
    header: ({ column }) => <SortableHeader column={column} label="投递部门" />,
    cell: ({ getValue }) => {
      const label = departmentLabel(getValue() as string | null);
      return (
        <span className="truncate text-sm text-muted-foreground" title={label}>
          {label}
        </span>
      );
    },
  },
  {
    accessorKey: 'qq',
    header: 'QQ',
    cell: ({ getValue }) => {
      const qq = getValue() as string | null;
      if (!qq) {
        return <span className="text-muted-foreground">-</span>;
      }
      return <span className="tabular-nums">{qq}</span>;
    },
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <SortableHeader column={column} label="状态" />,
    filterFn: (row, _columnId, filterValue) => {
      const filter = String(filterValue ?? '').trim();
      if (!filter) return true;
      return String(row.original.status) === filter;
    },
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
            note: string | null;
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
          <DialogContent className="max-h-[82dvh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>得分组成</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              {scores.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border bg-muted/15 p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="min-w-0 break-words text-sm font-medium leading-6">{item.title}</span>
                    <Badge variant="outline" className="shrink-0 tabular-nums px-2.5 py-1 text-sm">
                      {item.points}/{item.score}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>阅卷：{item.judgerName ?? '未记录'}</span>
                  </div>
                  {item.note && (
                    <div className="mt-3 flex gap-2 rounded-lg bg-background/70 px-3 py-2.5 text-sm leading-6 text-muted-foreground">
                      <MessageSquareText className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="whitespace-pre-wrap">{item.note}</span>
                    </div>
                  )}
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
    header: ({ column }) => (
      <SortableHeader column={column} label="总分" align="right" />
    ),
    /* 总分存的是字符串：按数值比较，没批卷 / 空的记录固定沉底 */
    sortingFn: (a, b) => {
      const parse = (value: string | null | undefined) => {
        const parsed = Number.parseInt(value ?? '', 10);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const left = parse(a.original.totalScore);
      const right = parse(b.original.totalScore);
      if (left === null || right === null) {
        if (left === right) return 0;
        return left === null ? 1 : -1;
      }
      return left - right;
    },
    cell: ({ getValue }) => (
      <div className="flex justify-end">
        <span className="rounded-md bg-primary/10 px-2 py-1 text-sm font-semibold tabular-nums text-primary">
          {getValue() as string}
        </span>
      </div>
    ),
    filterFn: (row, id, filterValue) => {
      if (!String(filterValue ?? '').trim()) return true;
      return row.original.totalScore
        ? parseInt(row.original.totalScore) >= parseInt(filterValue)
        : false;
    },
  },
];

export const Table: React.FC = () => {
  return <></>;
};
