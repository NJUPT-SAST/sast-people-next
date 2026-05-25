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
import { batchSetOutcomeByUid } from '@/action/user-flow/edit';
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
  status: string;
};

const finalStatuses = new Set(['accepted', 'rejected']);
const outcomeStatuses = new Set(['passed', 'failed']);
const statusText: Record<string, string> = {
  pending: '未开始',
  ongoing: '待确认',
  passed: '通过',
  failed: '不通过',
  accepted: '通过邮件已发',
  rejected: '不通过邮件已发',
};

export function DataTable<TData, TValue>({
  columns,
  data,
  flowTypeId,
  role,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [statusOverrides, setStatusOverrides] = useState<Record<number, string>>({});
  const tableData = useMemo(
    () =>
      data.map((item) => {
        const row = item as RecruitmentRowLike;
        const status = statusOverrides[row.uid];
        return status ? ({ ...item, status } as TData) : item;
      }),
    [data, statusOverrides],
  );
  const toRecruitmentRow = (row: { original: unknown }): RecruitmentRowLike =>
    row.original as RecruitmentRowLike;
  const getRowStatus = (row: { original: unknown }) => {
    const item = toRecruitmentRow(row);
    return statusOverrides[item.uid] ?? item.status ?? 'ongoing';
  };
  const isFinalRow = (row: { original: unknown }) =>
    finalStatuses.has(getRowStatus(row));

  const visibleColumns = useMemo(
    () =>
      role >= 3
        ? columns
        : columns.filter((c) => {
            const col = c as { id?: string; accessorKey?: string };
            return (
              col.id !== 'select' &&
              col.accessorKey !== 'phoneNumber' &&
              col.accessorKey !== 'problemScores'
            );
          }),
    [columns, role],
  );

  const table = useReactTable({
    data: tableData,
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
  const allRows = table.getCoreRowModel().flatRows;
  const selectedMutableRows = table
    .getSelectedRowModel()
    .flatRows.filter((row) => !isFinalRow(row));
  const outcomeRows = allRows.filter((row) => {
    const status = getRowStatus(row);
    return outcomeStatuses.has(status);
  });
  const hasFinalRows = allRows.some((row) => finalStatuses.has(getRowStatus(row)));
  const undecidedRows = allRows.filter((row) => {
    const status = getRowStatus(row);
    return !outcomeStatuses.has(status) && !finalStatuses.has(status);
  });
  const canEditOutcomes = !hasFinalRows;
  const canSendResultEmails =
    canEditOutcomes && outcomeRows.length > 0 && undecidedRows.length === 0;
  const helperText = hasFinalRows
    ? '结果邮件已发送，名单已锁定'
    : undecidedRows.length > 0
      ? '需先将所有同学设为通过或不通过，再发送结果邮件'
      : '邮件发送后名单锁定，权限以通过邮件发送成功为准';
  const summaryStatuses = hasFinalRows
    ? ['accepted', 'rejected']
    : ['passed', 'failed'];

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
            <>
            <Button
              disabled={!canEditOutcomes || selectedMutableRows.length === 0}
              onClick={async () => {
              const selectedRows = selectedMutableRows;
              const firstRow = selectedRows[0];
              if (!firstRow) return;
              const stepId = toRecruitmentRow(firstRow).stepId;
              const passedUids = selectedRows.map((row) => toRecruitmentRow(row).uid);
              toast.promise(
                batchSetOutcomeByUid(
                  flowTypeId,
                  stepId,
                  'passed',
                  passedUids,
                ).then(() => {
                  setStatusOverrides((prev) => ({
                    ...prev,
                      ...Object.fromEntries(passedUids.map((uid) => [uid, 'passed'])),
                    }));
                  setRowSelection({});
                }),
                {
                  loading: '正在设置为通过',
                  success: '已设置为通过',
                  error: '设置失败',
                },
              );
            }}
          >
            设为通过
          </Button>
          <Button
            variant="outline"
            disabled={!canEditOutcomes || selectedMutableRows.length === 0}
            onClick={async () => {
              const selectedRows = selectedMutableRows;
              const firstRow = selectedRows[0];
              if (!firstRow) return;
              const stepId = toRecruitmentRow(firstRow).stepId;
              const failedUids = selectedRows.map((row) => toRecruitmentRow(row).uid);
              toast.promise(
                batchSetOutcomeByUid(
                  flowTypeId,
                  stepId,
                  'failed',
                  failedUids,
                ).then(() => {
                  setStatusOverrides((prev) => ({
                    ...prev,
                    ...Object.fromEntries(failedUids.map((uid) => [uid, 'failed'])),
                  }));
                  setRowSelection({});
                }),
                {
                  loading: '正在设置为不通过',
                  success: '已设置为不通过',
                  error: '设置失败',
                },
              );
            }}
          >
            设为不通过
          </Button>
          <Button
            variant="outline"
            disabled={!canSendResultEmails}
            onClick={async () => {
              const passedRows = allRows.filter((row) => getRowStatus(row) === 'passed');
              const failedRows = allRows.filter((row) => getRowStatus(row) === 'failed');
              const passedUids = passedRows.map((row) => toRecruitmentRow(row).uid);
              const failedUids = failedRows.map((row) => toRecruitmentRow(row).uid);
              toast.promise(
                Promise.all([
                  passedUids.length > 0
                    ? batchSendEmail(passedUids, flowTypeId, true)
                    : Promise.resolve(),
                  failedUids.length > 0
                    ? batchSendEmail(failedUids, flowTypeId, false)
                    : Promise.resolve(),
                ]).then(() => {
                  setStatusOverrides((prev) => ({
                    ...prev,
                    ...Object.fromEntries(passedUids.map((uid) => [uid, 'accepted'])),
                    ...Object.fromEntries(failedUids.map((uid) => [uid, 'rejected'])),
                  }));
                  setRowSelection({});
                }),
                {
                  loading: '正在发送结果邮件',
                  success: '结果邮件已加入发送队列，名单已锁定',
                  error: '发送失败',
                },
              );
            }}
          >
            发送结果邮件并锁定
          </Button>
            </>
          )}
          <span className='text-muted-foreground text-xs md:text-sm max-w-[260px] md:max-w-none'>{role >= 3 ? helperText : ''}</span>
        </div>
      </div>
      {role >= 3 && (
        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          {summaryStatuses.map((status) => {
            const count = allRows.filter((row) => getRowStatus(row) === status).length;
            return (
              <div key={status} className="rounded-md border bg-card px-3 py-2">
                {statusText[status]}：{count}
              </div>
            );
          })}
        </div>
      )}
      
      <div className="overflow-hidden rounded-md border bg-card">
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
                <TableRow key={headerGroup.id} className="bg-muted/30 hover:bg-muted/30">
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id} className="whitespace-nowrap px-4 py-3">
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
                      <TableCell
                        key={cell.id}
                        className={
                          cell.column.id === 'problemScores'
                            ? 'whitespace-nowrap px-4 py-4'
                            : 'whitespace-nowrap px-4 py-4'
                        }
                      >
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
              const problemScoresCell = cells.find((cell) => cell.column.id === 'problemScores');
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
                      <div className="shrink-0">
                        {flexRender(cells[cells.length - 1]?.column.columnDef.cell, cells[cells.length - 1]?.getContext())}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">学号: {flexRender(cells[0 + offset]?.column.columnDef.cell, cells[0 + offset]?.getContext())}</span>
                    </div>
                    {role >= 3 && (
                      <div className="text-sm text-muted-foreground">
                         手机: {flexRender(cells[2 + offset]?.column.columnDef.cell, cells[2 + offset]?.getContext())}
                      </div>
                    )}
                    {role >= 3 && problemScoresCell && (
                      <div className="text-sm text-muted-foreground">
                        {flexRender(problemScoresCell.column.columnDef.cell, problemScoresCell.getContext())}
                      </div>
                    )}
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
