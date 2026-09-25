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
import { toast } from 'sonner';
import { batchSetOutcomeByUid } from '@/action/user-flow/edit';
import { cn } from '@/lib/utils';
import { LockKeyhole } from 'lucide-react';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  flowTypeId: number;
  targetUserFlowId?: number;
  role: number;
  onOutcomeChanged?: () => void;
  resultsLocked?: boolean;
}

type RecruitmentRowLike = {
  userFlowId?: number;
  uid: number;
  stepId: number;
  status: string;
  isGraded?: boolean;
  qq?: unknown;
};

const recruitmentStatusText: Record<string, string> = {
  ungraded: '未批卷',
  ongoing: '待确认',
  passed: '通过',
  failed: '不通过',
  withdrawn: '未参与',
  not_started: '未开始',
};

export function DataTable<TData, TValue>({
  columns,
  data,
  flowTypeId,
  targetUserFlowId,
  role,
  onOutcomeChanged,
  resultsLocked = false,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
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
            if (c.id === 'select') return false;
            const key = 'accessorKey' in c ? c.accessorKey : undefined;
            if (key === 'problemScores') return role >= 2;
            if (key === 'qq') return false;
            return true;
          }),
    [safeColumns, role],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: tableData,
    columns: visibleColumns,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: () => !resultsLocked,
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue ?? "").trim().toLocaleLowerCase();
      if (!query) return true;
      const item = row.original as RecruitmentRowLike & {
        studentId?: unknown;
        name?: unknown;
      };
      return [item.studentId, item.name, item.qq]
        .some((value) => String(value ?? "").toLocaleLowerCase().includes(query));
    },
    state: {
      rowSelection,
      columnFilters,
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
  });
  const allRows = table.getCoreRowModel().flatRows ?? [];
  const rowModelRows = table.getRowModel().rows ?? [];
  const totalScoreColumn =
    table.getAllLeafColumns().find((column) => column.id === 'totalScore') ?? null;
  const selectedMutableRows = table.getSelectedRowModel().flatRows ?? [];
  const canEditOutcomes = !resultsLocked && selectedMutableRows.length > 0;
  const summaryStatuses = ['ungraded', 'ongoing', 'passed', 'failed', 'withdrawn', 'not_started'];
  const columnWidthClass: Record<string, string> = {
    select: 'w-12',
    studentId: 'w-[5.5rem]',
    name: 'w-[9rem]',
    qq: 'w-[7rem]',
    status: 'w-[6rem]',
    problemScores: 'w-[6.5rem]',
    totalScore: 'w-[5.5rem]',
  };
  const statusColumn =
    table.getAllLeafColumns().find((column) => column.id === 'status') ?? null;
  const activeStatusFilter = String(statusColumn?.getFilterValue() ?? '');
  const statusSummary = statusColumn
    ? summaryStatuses
        .map((status) => ({
          status,
          count: allRows.filter((item) => getRowStatus(item) === status).length,
        }))
        .filter((item) => item.count > 0)
    : [];
  const selectedCount = selectedMutableRows.length;
  const emptyMessage =
    allRows.length > 0 ? '没有符合条件的考生。' : '暂时没有内容。';
  const filterChipClass = (active: boolean) =>
    cn(
      'inline-flex touch-manipulation items-center justify-center gap-1.5 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition-colors',
      active
        ? 'border-foreground/20 bg-foreground/10 font-medium text-foreground'
        : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
    );

  const applyOutcome = (status: 'passed' | 'failed' | 'withdrawn') => {
    const selectedRows = selectedMutableRows;
    const firstRow = selectedRows[0];
    if (!firstRow) return;
    const stepId = toRecruitmentRow(firstRow).stepId;
    if (selectedRows.some((row) => toRecruitmentRow(row).stepId !== stepId)) {
      toast.error('请选择同一批次的考生后再批量设置结果');
      return;
    }
    const userIds = selectedRows.map((row) => toRecruitmentRow(row).uid);
    toast.promise(
      batchSetOutcomeByUid(flowTypeId, stepId, status, userIds).then(({ updatedUserIds }) => {
        setStatusOverrides((prev) => ({
          ...prev,
          ...Object.fromEntries(updatedUserIds.map((uid) => [uid, status])),
        }));
        setRowSelection({});
        onOutcomeChanged?.();
        return updatedUserIds.length;
      }),
      {
        loading: status === 'passed' ? '正在设置为通过' : status === 'failed' ? '正在设置为不通过' : '正在标记为未参与',
        success: (updatedCount) => updatedCount < userIds.length
          ? `已更新 ${updatedCount}/${userIds.length} 人，部分人员未找到`
          : status === 'passed' ? '已设置为通过' : status === 'failed' ? '已设置为不通过' : '已标记为未参与',
        error: '设置失败',
      },
    );
  };

  return (
    <div className="min-w-0 rounded-lg border bg-card">
      <div className="sticky top-0 z-20 rounded-t-lg border-b bg-card/95 backdrop-blur-sm">
        <div className="flex flex-col gap-3 p-3 sm:p-4">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-x-4">
            <div className="flex min-w-0 items-center gap-2">
              <Input
                placeholder="搜索姓名、学号或QQ"
                aria-label="搜索笔试考生"
                value={globalFilter}
                onChange={(event) => setGlobalFilter(event.target.value)}
                className="h-9 min-w-0 flex-1 sm:w-[13rem] sm:flex-none"
              />
              <Input
                placeholder="分数线"
                aria-label="按总分筛选，输入分数线"
                inputMode="numeric"
                value={(totalScoreColumn?.getFilterValue() as string) ?? ''}
                onChange={(event) =>
                  totalScoreColumn?.setFilterValue(event.target.value)
                }
                className="h-9 w-[6rem] shrink-0 sm:w-[8rem]"
              />
            </div>
            {role >= 3 && (
              <div className="flex min-w-0 items-center gap-2.5">
                {(resultsLocked || selectedCount > 0) && (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {resultsLocked ? '已锁定' : `已选 ${selectedCount} 人`}
                  </span>
                )}
                <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 lg:flex lg:flex-none">
                  <Button
                    size="sm"
                    className="h-9 px-2 text-xs lg:h-8 lg:px-3 lg:text-sm"
                    disabled={!canEditOutcomes}
                    onClick={() => {
                      if (selectedCount > 0) applyOutcome('passed');
                    }}
                  >
                    设为通过
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 px-2 text-xs lg:h-8 lg:px-3 lg:text-sm"
                    disabled={!canEditOutcomes}
                    onClick={() => {
                      if (selectedCount > 0) applyOutcome('failed');
                    }}
                  >
                    设为不通过
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 px-2 text-xs lg:h-8 lg:px-3 lg:text-sm"
                    disabled={!canEditOutcomes}
                    onClick={() => {
                      if (selectedCount > 0) applyOutcome('withdrawn');
                    }}
                  >
                    标记未参与
                  </Button>
                </div>
              </div>
            )}
          </div>
          {(statusSummary.length > 0 || resultsLocked) && (
            <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:gap-2">
              {resultsLocked && (
                <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <LockKeyhole className="size-3.5" aria-hidden="true" />
                  结果已发布，名单已锁定
                </p>
              )}
              {statusSummary.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:flex lg:flex-wrap lg:items-center">
                  <button
                    type="button"
                    aria-pressed={!activeStatusFilter}
                    className={filterChipClass(!activeStatusFilter)}
                    onClick={() => statusColumn?.setFilterValue(undefined)}
                  >
                    全部
                    <span className="tabular-nums opacity-60">{allRows.length}</span>
                  </button>
                  {statusSummary.map(({ status, count }) => {
                    const active = activeStatusFilter === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        aria-pressed={active}
                        className={filterChipClass(active)}
                        onClick={() =>
                          statusColumn?.setFilterValue(active ? undefined : status)
                        }
                      >
                        {recruitmentStatusText[status] ?? status}
                        <span className="tabular-nums opacity-60">{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* PC 端长表格视图 */}
      <div className="hidden min-w-0 overflow-x-auto rounded-b-lg lg:block">
        <Table className="w-full min-w-[42rem] table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/30 hover:bg-muted/30">
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      className={`whitespace-nowrap px-3 py-3 ${columnWidthClass[header.column.id] ?? ''}`}
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
                      ? "scroll-mt-32 bg-primary/10 ring-1 ring-primary/30 hover:bg-primary/10"
                      : "hover:bg-muted/30 data-[state=selected]:bg-primary/5"
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={`whitespace-nowrap px-3 py-3 ${columnWidthClass[cell.column.id] ?? ''}`}
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
                  className="h-32 px-4 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* 移动端卡片视图 */}
      <div className="flex flex-col divide-y divide-border rounded-b-lg lg:hidden">
        {rowModelRows.length ? (
          rowModelRows.map((row) => {
            const cells = row.getVisibleCells();
            const cellById = new Map(cells.map((cell) => [cell.column.id, cell]));
            const selectCell = cellById.get('select');
            const studentIdCell = cellById.get('studentId');
            const nameCell = cellById.get('name');
            const statusCell = cellById.get('status');
            const totalScoreCell = cellById.get('totalScore');
            const problemScoresCell = cells.find((cell) => cell.column.id === 'problemScores');
            const qqCell = cellById.get('qq');
            const qqText = qqCell
              ? String(toRecruitmentRow(row).qq ?? '').trim()
              : '';
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
                    ? "flex scroll-mt-40 gap-3 bg-primary/10 px-4 py-3 ring-1 ring-primary/30"
                    : "flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                }
              >
                {role >= 3 && selectCell && (
                  <div className="pt-0.5">
                    {flexRender(selectCell.column.columnDef.cell, selectCell.getContext())}
                  </div>
                )}
                <div className="flex min-w-0 flex-1 gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="min-w-0 truncate text-sm font-semibold">
                      {nameCell
                        ? flexRender(nameCell.column.columnDef.cell, nameCell.getContext())
                        : '未命名'}
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                      <span className="shrink-0">
                        学号{' '}
                        {studentIdCell
                          ? flexRender(studentIdCell.column.columnDef.cell, studentIdCell.getContext())
                          : '-'}
                      </span>
                      {qqText && (
                        <span className="min-w-0 truncate">· QQ {qqText}</span>
                      )}
                    </div>
                    {role >= 2 && problemScoresCell && (
                      <div className="pt-0.5">
                        {flexRender(problemScoresCell.column.columnDef.cell, problemScoresCell.getContext())}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end justify-between gap-2">
                    <div>
                      {totalScoreCell && flexRender(totalScoreCell.column.columnDef.cell, totalScoreCell.getContext())}
                    </div>
                    <div>
                      {statusCell && flexRender(statusCell.column.columnDef.cell, statusCell.getContext())}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col gap-1 px-4 py-12 text-center">
            <p className="text-sm font-medium text-foreground">{emptyMessage}</p>
            {allRows.length === 0 && (
              <p className="text-xs text-muted-foreground">
                当前流程下还没有考生记录。
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
