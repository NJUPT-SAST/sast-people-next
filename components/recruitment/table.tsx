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
import { useCallback, useMemo, useState } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import Link from 'next/link';
import { toast } from 'sonner';
import { batchSetOutcomeByUid } from '@/action/user-flow/edit';
import {
  buildRecruitmentScoreCsv,
  downloadCsv,
  recruitmentStatusText,
  type RecruitmentScoreExportRow,
} from '@/components/recruitment/exportCsv';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  flowTypeId: number;
  targetUserFlowId?: number;
  role: number;
}

type RecruitmentRowLike = {
  userFlowId?: number;
  uid: number;
  stepId: number;
  status: string;
  isGraded?: boolean;
} & RecruitmentScoreExportRow;

const finalStatuses = new Set(['passed', 'failed']);

export function DataTable<TData, TValue>({
  columns,
  data,
  flowTypeId,
  targetUserFlowId,
  role,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [statusOverrides, setStatusOverrides] = useState<Record<number, string>>({});
  const safeColumns = useMemo(() => (Array.isArray(columns) ? columns : []), [columns]);
  const safeData = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const getDisplayStatus = useCallback((row: RecruitmentRowLike) => {
    const status = statusOverrides[row.uid] ?? row.status ?? 'ongoing';
    if ((status === 'not_started' || status === 'ongoing') && row.isGraded === false) {
      return 'ungraded';
    }
    return status;
  }, [statusOverrides]);
  const tableData = useMemo(
    () =>
      safeData.map((item) => {
        const row = item as RecruitmentRowLike;
        const status = getDisplayStatus(row);
        return status !== row.status ? ({ ...item, status } as TData) : item;
      }),
    [safeData, getDisplayStatus],
  );
  const toRecruitmentRow = (row: { original: unknown }): RecruitmentRowLike =>
    row.original as RecruitmentRowLike;
  const getRowStatus = (row: { original: unknown }) => {
    const item = toRecruitmentRow(row);
    return getDisplayStatus(item);
  };
  const isFinalRow = (row: { original: unknown }) =>
    finalStatuses.has(getRowStatus(row));
  const isTargetRow = (row: { original: unknown }) => {
    const item = toRecruitmentRow(row);
    return Boolean(
      targetUserFlowId &&
        item.userFlowId &&
        item.userFlowId === targetUserFlowId,
    );
  };

  const visibleColumns = useMemo(
    () =>
      role >= 3
        ? safeColumns
        : safeColumns.filter((c) => {
            const col = c as { id?: string; accessorKey?: string };
            return (
              col.id !== 'select' &&
              col.accessorKey !== 'phoneNumber' &&
              col.accessorKey !== 'problemScores'
            );
          }),
    [safeColumns, role],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
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
  const allRows = table.getCoreRowModel().flatRows ?? [];
  const filteredRows = table.getFilteredRowModel().flatRows ?? [];
  const rowModelRows = table.getRowModel().rows ?? [];
  const filteredSelectedRows = table.getFilteredSelectedRowModel().rows ?? [];
  const totalScoreColumn =
    table.getAllLeafColumns().find((column) => column.id === 'totalScore') ?? null;
  const selectedMutableRows = (table.getSelectedRowModel().flatRows ?? []).filter(
    (row) => !isFinalRow(row),
  );
  const canEditOutcomes = selectedMutableRows.length > 0;
  const helperText =
    '成绩管理只负责确定通过/不通过；标完结果后，到邮件中心按本流程发送结果通知。';
  const summaryStatuses = ['ungraded', 'ongoing', 'passed', 'failed', 'not_started'];

  return (
    <div className="space-y-4">
      <div className="border-y bg-muted/20 px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">批量处理</p>
            <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
              {role >= 3
                ? helperText
                : '查看当前流程的报名结果与状态。'}
            </p>
            {role >= 3 && (
              <Button asChild size="sm" variant="link" className="h-auto px-0 text-xs">
                <Link href={`/dashboard/emails?tab=tasks&flowId=${flowTypeId}`}>
                  去邮件中心发结果通知
                </Link>
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
            <Input
              placeholder="筛选分数线"
              value={(totalScoreColumn?.getFilterValue() as string) ?? ''}
              onChange={(event) =>
                totalScoreColumn?.setFilterValue(event.target.value)
              }
              className="h-9 w-full sm:w-[180px]"
            />
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start lg:justify-end">
              <Button
                size="sm"
                variant="outline"
                disabled={filteredRows.length === 0}
                onClick={() => {
                  const csv = buildRecruitmentScoreCsv({
                    rows: filteredRows.map((row) => toRecruitmentRow(row)),
                    includeSensitiveInfo: role >= 3,
                  });
                  downloadCsv(`flow-${flowTypeId}-scores.csv`, csv);
                  toast.success('已导出当前筛选结果');
                }}
              >
                导出 CSV
              </Button>
              {role >= 3 && (
                <>
                  <Button
                    size="sm"
                    disabled={!canEditOutcomes}
                    onClick={async () => {
                      const selectedRows = selectedMutableRows;
                      const firstRow = selectedRows[0];
                      if (!firstRow) return;
                      const confirmed = window.confirm(
                        `确定将 ${selectedRows.length} 人设为通过吗？标完后请到邮件中心发送结果通知。`,
                      );
                      if (!confirmed) return;
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
                      const confirmed = window.confirm(
                        `确定将 ${selectedRows.length} 人设为不通过吗？标完后请到邮件中心发送结果通知。`,
                      );
                      if (!confirmed) return;
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
                </>
              )}
            </div>
          </div>
        </div>
        {role >= 3 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t pt-3 text-xs text-muted-foreground">
            {summaryStatuses.map((status) => {
              const count = allRows.filter((item) => getRowStatus(item) === status).length;
              return (
                <div
                  key={status}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-muted/20 px-2.5 py-1"
                >
                  <span>{recruitmentStatusText[status]}</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      <div className="min-w-0 overflow-hidden rounded-lg border bg-card">
        {role >= 3 && (
          <div className="border-b bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {filteredSelectedRows.length}
            </span>{' '}
            / {filteredRows.length} 行选中
          </div>
        )}

        {/* PC 端长表格试图 */}
        <div className="hidden min-w-0 md:block overflow-x-auto">
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
              {rowModelRows.length ? (
                rowModelRows.map((row) => (
                  <TableRow
                    key={row.id}
                    id={
                      isTargetRow(row)
                        ? `user-flow-${targetUserFlowId}-desktop`
                        : undefined
                    }
                    data-state={row.getIsSelected() && 'selected'}
                    className={
                      isTargetRow(row)
                        ? "scroll-mt-24 bg-primary/10 ring-1 ring-primary/30 hover:bg-primary/10"
                        : "hover:bg-muted/30 data-[state=selected]:bg-primary/5"
                    }
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
                    colSpan={visibleColumns.length}
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
          {rowModelRows.length ? (
            rowModelRows.map((row) => {
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
                <div
                  key={row.id}
                  id={
                    isTargetRow(row)
                      ? `user-flow-${targetUserFlowId}-mobile`
                      : undefined
                  }
                  className={
                    isTargetRow(row)
                      ? "flex scroll-mt-24 gap-4 bg-primary/10 p-4 ring-1 ring-primary/30"
                      : "flex gap-4 p-4 transition-colors hover:bg-muted/50"
                  }
                >
                  {role >= 3 && selectCell && (
                    <div className="pt-1">
                      {flexRender(selectCell.column.columnDef.cell, selectCell.getContext())}
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-base font-semibold">
                        {nameCell
                          ? flexRender(nameCell.column.columnDef.cell, nameCell.getContext())
                          : '未命名'}
                      </div>
                      <div className="shrink-0">
                        {totalScoreCell && flexRender(totalScoreCell.column.columnDef.cell, totalScoreCell.getContext())}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      学号:{' '}
                      {studentIdCell
                        ? flexRender(studentIdCell.column.columnDef.cell, studentIdCell.getContext())
                        : '-'}
                    </div>
                    {role >= 3 && phoneCell && (
                      <div className="text-sm text-muted-foreground">
                        手机: {flexRender(phoneCell.column.columnDef.cell, phoneCell.getContext()) || '-'}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3 pt-1">
                      {role >= 3 && problemScoresCell ? (
                        <div className="text-sm text-muted-foreground">
                          {flexRender(problemScoresCell.column.columnDef.cell, problemScoresCell.getContext())}
                        </div>
                      ) : (
                        <span />
                      )}
                      <div className="shrink-0">
                        {statusCell && flexRender(statusCell.column.columnDef.cell, statusCell.getContext())}
                      </div>
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
