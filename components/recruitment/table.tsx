'use client';

import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  RowSelectionState,
  useReactTable,
} from '@tanstack/react-table';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useMemo, useState } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { batchEndByUid } from '@/action/user-flow/edit';
import { batchSendEmail } from '@/action/user/sendEmail';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  flowTypeId: number;
  role: number;
}

type RecruitmentRowLike = {
  uid: number;
  stepId: number;
};

export function DataTable<TData, TValue>({
  columns,
  data,
  flowTypeId,
  role,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const toRecruitmentRow = (row: { original: unknown }): RecruitmentRowLike =>
    row.original as RecruitmentRowLike;

  const visibleColumns = useMemo(
    () => (role >= 3 ? columns : columns.filter((c) => (c as { id?: string }).id !== 'select')),
    [columns, role],
  );

  const table = useReactTable({
    data,
    columns: visibleColumns,
    getCoreRowModel: getCoreRowModel(),
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      rowSelection,
      columnFilters,
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
        <Input
          placeholder="筛选分数线"
          value={
            (table.getColumn('totalScore')?.getFilterValue() as string) ?? ''
          }
          onChange={(event) =>
            table.getColumn('totalScore')?.setFilterValue(event.target.value)
          }
          className="max-w-sm w-full md:w-auto"
        />
        <div className="flex flex-wrap items-center gap-3">
          {role >= 3 && (
            <Button
              disabled={table.getSelectedRowModel().rows.length === 0}
              onClick={async () => {
              // get not selected rows
              const selectedRows = table.getSelectedRowModel().flatRows;
              const notSelectedRows = table
                .getRowModel()
                .flatRows.filter((row) => !selectedRows.includes(row));
              toast.promise(
                Promise.all([
                  batchSendEmail(
                    selectedRows.map((row) => toRecruitmentRow(row).uid),
                    flowTypeId,
                    true,
                  ).then(async () => {
                    await batchEndByUid(
                      flowTypeId,
                      toRecruitmentRow(selectedRows[0]).stepId,
                      'accepted',
                      selectedRows.map((row) => toRecruitmentRow(row).uid),
                    );
                  }),
                  batchSendEmail(
                    notSelectedRows.map((row) => toRecruitmentRow(row).uid),
                    flowTypeId,
                    false,
                  ).then(async () => {
                    batchEndByUid(
                      flowTypeId,
                      toRecruitmentRow(notSelectedRows[0]).stepId,
                      'rejected',
                      notSelectedRows.map((row) => toRecruitmentRow(row).uid),
                    );
                  }),
                ]),
                {
                  loading: '正在确认',
                  success: '确认成功',
                  error: '确认失败',
                },
              );
            }}
          >
            确认选中同学通过
          </Button>
          )}
          <span className='text-muted-foreground text-xs md:text-sm max-w-[200px] md:max-w-none'>{role >= 3 ? '同时修改流程与发送邮件，请谨慎操作' : ''}</span>
        </div>
      </div>
      
      <div className="rounded-md border bg-card">
        {role >= 3 && (
          <div className="flex-1 text-sm text-muted-foreground p-3 border-b">
            {table.getFilteredSelectedRowModel().rows.length} /{' '}
            {table.getFilteredRowModel().rows.length} 行选中
          </div>
        )}

        {/* PC 端长表格试图 */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
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
                      <TableCell key={cell.id} className="whitespace-nowrap py-3">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    暂时没有内容。
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* 移动端卡片视图 */}
        <div className="md:hidden flex flex-col divide-y divide-border">
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => {
              const cells = row.getVisibleCells();
              const offset = role >= 3 ? 1 : 0; // 有复选框时跳过第一列
              return (
                <div key={row.id} className="flex p-4 gap-4 transition-colors hover:bg-muted/50">
                  {role >= 3 && (
                    <div className="pt-1">
                      {flexRender(cells[0].column.columnDef.cell, cells[0].getContext())}
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-base py-1">
                        {flexRender(cells[1 + offset]?.column.columnDef.cell, cells[1 + offset]?.getContext()) || '未命名'}
                      </div>
                      <div className="bg-primary/10 text-primary px-2 py-1 rounded-md text-sm font-semibold">
                        {flexRender(cells[cells.length - 1]?.column.columnDef.cell, cells[cells.length - 1]?.getContext())}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">学号: {flexRender(cells[0 + offset]?.column.columnDef.cell, cells[0 + offset]?.getContext())}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                       手机: {flexRender(cells[2 + offset]?.column.columnDef.cell, cells[2 + offset]?.getContext())}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
             <div className="p-8 text-center text-muted-foreground text-sm flex items-center justify-center">暂时没有内容。</div>
          )}
        </div>
      </div>
    </div>
  );
}
