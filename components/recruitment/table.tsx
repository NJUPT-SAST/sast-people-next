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
  isGraded?: boolean;
};

const finalStatuses = new Set(['accepted', 'rejected']);
const statusText: Record<string, string> = {
  pending: '未开始',
  ungraded: '未批卷',
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
  const getDisplayStatus = (row: RecruitmentRowLike) => {
    const status = statusOverrides[row.uid] ?? row.status ?? 'ongoing';
    if ((status === 'pending' || status === 'ongoing') && row.isGraded === false) {
      return 'ungraded';
    }
    return status;
  };
  const tableData = useMemo(
    () =>
      data.map((item) => {
        const row = item as RecruitmentRowLike;
        const status = getDisplayStatus(row);
        return status !== row.status ? ({ ...item, status } as TData) : item;
      }),
    [data, statusOverrides],
  );
  const toRecruitmentRow = (row: { original: unknown }): RecruitmentRowLike =>
    row.original as RecruitmentRowLike;
  const getRowStatus = (row: { original: unknown }) => {
    const item = toRecruitmentRow(row);
    return getDisplayStatus(item);
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
    enableRowSelection: (row) => !finalStatuses.has(getRowStatus(row)),
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
  const selectedPassedRows = selectedMutableRows.filter(
    (row) => getRowStatus(row) === 'passed',
  );
  const selectedFailedRows = selectedMutableRows.filter(
    (row) => getRowStatus(row) === 'failed',
  );
  const selectedOutcomeRows = [...selectedPassedRows, ...selectedFailedRows];
  const canEditOutcomes = selectedMutableRows.length > 0;
  const canSendSelectedEmails =
    selectedMutableRows.length > 0 &&
    selectedOutcomeRows.length === selectedMutableRows.length;
  const helperText =
    '已发邮件的结果不可更改；选中未发邮件且已设为通过/不通过的同学后，可发送对应结果邮件并锁定';
  const summaryStatuses = ['ungraded', 'ongoing', 'passed', 'failed', 'accepted', 'rejected'];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">批量处理</p>
            <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
              {role >= 3
                ? helperText
                : '查看当前流程的报名结果与状态。'}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
            <Input
              placeholder="筛选分数线"
              value={
                (table.getColumn('totalScore')?.getFilterValue() as string) ?? ''
              }
              onChange={(event) =>
                table.getColumn('totalScore')?.setFilterValue(event.target.value)
              }
              className="h-9 w-full sm:w-[180px]"
            />
            <div className="flex flex-wrap items-center gap-2">
          {role >= 3 && (
            <>
            <Button
              size="sm"
              disabled={!canEditOutcomes}
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
            size="sm"
            variant="outline"
            disabled={!canEditOutcomes}
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
            size="sm"
            variant="outline"
            disabled={!canSendSelectedEmails}
            onClick={async () => {
              const passedUids = selectedPassedRows.map((row) => toRecruitmentRow(row).uid);
              const failedUids = selectedFailedRows.map((row) => toRecruitmentRow(row).uid);
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
                  loading: '正在发送选中结果邮件',
                  success: '选中结果邮件已加入发送队列，已发送人员结果锁定',
                  error: '发送选中邮件失败',
                },
              );
            }}
          >
            发送选中邮件
          </Button>
            </>
          )}
            </div>
          </div>
        </div>
      </div>
      {role >= 3 && (
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          {summaryStatuses.map((status) => {
            const count = allRows.filter((row) => getRowStatus(row) === status).length;
            return (
              <div key={status} className="rounded-full border bg-card px-3 py-1.5">
                <span>{statusText[status]}</span>
                <span className="ml-2 font-semibold tabular-nums text-foreground">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      )}
      
      <div className="overflow-hidden rounded-xl border bg-card">
        {role >= 3 && (
          <div className="border-b bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {table.getFilteredSelectedRowModel().rows.length}
            </span>{' '}
            / {table.getFilteredRowModel().rows.length} 行选中
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
                    className="hover:bg-muted/30 data-[state=selected]:bg-primary/5"
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
              const cellById = new Map(cells.map((cell) => [cell.column.id, cell]));
              const selectCell = cellById.get('select');
              const studentIdCell = cellById.get('studentId');
              const nameCell = cellById.get('name');
              const phoneCell = cellById.get('phoneNumber');
              const statusCell = cellById.get('status');
              const totalScoreCell = cellById.get('totalScore');
              const problemScoresCell = cells.find((cell) => cell.column.id === 'problemScores');
              return (
                <div key={row.id} className="flex gap-4 p-4 transition-colors hover:bg-muted/50">
                  {role >= 3 && selectCell && (
                    <div className="pt-1">
                      {flexRender(selectCell.column.columnDef.cell, selectCell.getContext())}
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <div className="flex min-h-[96px] items-stretch justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="text-base font-semibold">
                          {nameCell
                            ? flexRender(nameCell.column.columnDef.cell, nameCell.getContext())
                            : '未命名'}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          学号:{' '}
                          {studentIdCell
                            ? flexRender(studentIdCell.column.columnDef.cell, studentIdCell.getContext())
                            : '-'}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end justify-between gap-3">
                        {totalScoreCell && flexRender(totalScoreCell.column.columnDef.cell, totalScoreCell.getContext())}
                        {statusCell && flexRender(statusCell.column.columnDef.cell, statusCell.getContext())}
                      </div>
                    </div>
                    {role >= 3 && phoneCell && (
                      <div className="text-sm text-muted-foreground">
                         手机: {flexRender(phoneCell.column.columnDef.cell, phoneCell.getContext())}
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
