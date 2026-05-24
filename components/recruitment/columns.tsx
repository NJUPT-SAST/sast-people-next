'use client';
import { calScore } from '@/action/user-flow/user-point/calScore';
import { ColumnDef } from '@tanstack/react-table';
import React from 'react';
import { Checkbox } from '../ui/checkbox';

export const columns: ColumnDef<
  Awaited<ReturnType<typeof calScore>>[number]
>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
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
    accessorKey: 'totalScore',
    header: () => <div className="text-right">总分</div>,
    cell: ({ getValue }) => (
      <div className="text-right tabular-nums">{getValue() as string}</div>
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
