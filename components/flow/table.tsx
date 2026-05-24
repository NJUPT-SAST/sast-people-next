'use client';
import React from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { displayFlow } from '@/types/flow';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '../ui/table';
import { Badge } from '../ui/badge';
import originalDayjs from '@/lib/dayjs';
import { Operations } from './operations';

const flowTypeLabel: Record<string, string> = {
  recruitment: '招新',
  recruitment_exemption: '招新免试',
  woc: 'WOC',
  soc: 'SOC',
};

export const FlowTableColumns: ColumnDef<displayFlow>[] = [
  {
    accessorKey: 'title',
    header: '名称',
    accessorFn: (data) => data.title,
  },
  {
    accessorKey: 'type',
    header: '类型',
    accessorFn: (data) => data.type,
    cell({ row }) {
      const type = row.getValue('type') as string;
      return <Badge variant="secondary">{flowTypeLabel[type] ?? type}</Badge>;
    },
  },
  {
    accessorKey: 'description',
    header: '描述',
    accessorFn: (data) => data.description,
  },
  {
    accessorKey: 'startedAt',
    header: '开始时间',
    accessorFn: (data) => data.startedAt,
    cell({ row }) {
      const time = row.getValue('startedAt') as Date;
      return originalDayjs(time).format('YYYY-MM-DD HH:mm:ss');
    },
  },
  {
    accessorKey: 'endedAt',
    header: '结束时间',
    accessorFn: (data) => data.endedAt,
    cell({ row }) {
      const time = row.getValue('endedAt') as Date;
      return originalDayjs(time).format('YYYY-MM-DD HH:mm:ss');
    },
  },
  {
    accessorKey: 'operations',
    header: '操作',
    cell({ row }) {
      const data = row.original;
      return <Operations data={data} />;
    },
  },
];

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}

export function FlowTable<TData extends displayFlow, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="rounded-md border bg-card">
      {/* PC 端表格视图 */}
      <div className="hidden md:block overflow-x-auto">
        <Table className="min-w-[800px]">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} className="whitespace-nowrap py-3">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  暂时没有内容
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* 移动端卡片视图 */}
      <div className="md:hidden flex flex-col divide-y divide-border">
        {table.getRowModel().rows?.length ? (
          table.getRowModel().rows.map((row) => (
            <div key={row.id} className="p-4 space-y-4 transition-colors hover:bg-muted/50">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-base px-1">{row.original.title}</span>
              </div>
              <div className="text-sm space-y-2 px-1">
                <div className="text-muted-foreground break-words">{row.original.description || '-'}</div>
                <div className="flex justify-between items-center text-muted-foreground pt-2">
                  <span>开始时间</span>
                  <span className="text-foreground text-xs font-mono">{originalDayjs(row.original.startedAt).format('YYYY-MM-DD HH:mm')}</span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>结束时间</span>
                  <span className="text-foreground text-xs font-mono">{originalDayjs(row.original.endedAt).format('YYYY-MM-DD HH:mm')}</span>
                </div>
              </div>
              <div className="pt-3 flex justify-end gap-3 border-t">
                <Operations data={row.original} />
              </div>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-muted-foreground text-sm">暂时没有内容</div>
        )}
      </div>
    </div>
  );
}
