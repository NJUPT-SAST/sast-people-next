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
import originalDayjs from '@/lib/dayjs';
import { Operations } from './operations';

const flowTypeLabel: Record<string, string> = {
  recruitment: '笔试招新',
  recruitment_exemption: '免试招新',
  woc: 'WOC/WOD',
  soc: 'SOC/SOD',
};

export const FlowTableColumns: ColumnDef<displayFlow>[] = [
  {
    accessorKey: 'title',
    header: '名称',
    accessorFn: (data) => data.title,
    cell({ row }) {
      return (
        <div className="min-w-0 space-y-1">
          <div className="font-medium leading-6">{row.original.title}</div>
          <div className="line-clamp-2 max-w-[30rem] text-sm leading-5 text-muted-foreground">
            {row.original.description || '暂无描述'}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'type',
    header: '类型',
    accessorFn: (data) => data.type,
    cell({ row }) {
      const type = row.getValue('type') as string;
      return (
        <span className="text-muted-foreground">
          {flowTypeLabel[type] ?? type}
        </span>
      );
    },
  },
  {
    accessorKey: 'startedAt',
    header: '开始时间',
    accessorFn: (data) => data.startedAt,
    cell({ row }) {
      const time = row.getValue('startedAt') as Date;
      return (
        <span className="text-sm tabular-nums text-muted-foreground">
          {originalDayjs(time).format('YYYY-MM-DD HH:mm')}
        </span>
      );
    },
  },
  {
    accessorKey: 'endedAt',
    header: '结束时间',
    accessorFn: (data) => data.endedAt,
    cell({ row }) {
      const time = row.getValue('endedAt') as Date;
      return (
        <span className="text-sm tabular-nums text-muted-foreground">
          {originalDayjs(time).format('YYYY-MM-DD HH:mm')}
        </span>
      );
    },
  },
  {
    accessorKey: 'operations',
    header: () => (
      <div className="grid w-full grid-cols-[4.5rem_4.5rem_3.5rem] items-center justify-end gap-1">
        <span className="col-start-2 text-center">操作</span>
      </div>
    ),
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
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* PC 端表格视图 */}
      <div className="hidden xl:block">
        <Table className="table-fixed" containerClassName="overflow-x-visible">
          <colgroup>
            <col className="w-[32%]" />
            <col className="w-[11%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[27%]" />
          </colgroup>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/30 hover:bg-muted/30">
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      className={
                        header.column.id === 'operations'
                          ? 'whitespace-nowrap px-4 py-3 text-right'
                          : 'whitespace-nowrap px-4 py-3'
                      }
                    >
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
                  className="hover:bg-muted/30"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={
                        cell.column.id === 'operations'
                          ? 'px-4 py-3 text-right align-middle'
                          : 'px-4 py-3 align-middle'
                      }
                    >
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
      <div className="xl:hidden flex flex-col divide-y divide-border">
        {table.getRowModel().rows?.length ? (
          table.getRowModel().rows.map((row) => (
            <div key={row.id} className="space-y-4 p-4 transition-colors hover:bg-muted/50">
              <div className="flex items-center justify-between">
                <div className="min-w-0 space-y-1 px-1">
                  <span className="font-semibold text-base">{row.original.title}</span>
                  <div>
                    <span className="text-sm text-muted-foreground">
                      {flowTypeLabel[row.original.type] ?? row.original.type}
                    </span>
                  </div>
                </div>
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
