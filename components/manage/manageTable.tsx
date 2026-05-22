'use client';
import {
  PaginationComponent
} from '@/components/ui/pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import originalDayjs from '@/lib/dayjs';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { EditUserFlowSheet } from './editUserFlowSheet';
import { RemoveUserInfoDialog } from './removeUserInfoDialog';
import { SearchInput } from './searchInput';
import { userType } from '@/types/user';


// 定义表格列

export const ManageTable = ({
  users,
  totalCount,
  totalPages: _totalPages,
  search,
  currentPage,
  role,
}: {
  users: userType[];
  totalCount: number;
  totalPages: number;
  search: string;
  currentPage: number;
  role: number;
}) => {
  const columns: ColumnDef<userType>[] = [
    {
      accessorKey: 'name',
      header: '姓名',
      cell(props) {
        return <div className="w-[80px]">{props.row.original.name}</div>;
      },
    },
    {
      accessorKey: 'studentId',
      header: '学号',
    },
    ...(role >= 2 ? [{
      accessorKey: 'phone' as const,
      header: '手机号码',
    }] : []),
    {
      accessorKey: 'email',
      header: '邮箱',
    },
    {
      accessorKey: 'createdAt',
      header: '创建时间',
      cell: ({ row }) => {
        const date = row.getValue('createdAt') as Date;
        return (
          <div className="w-[80px]">
            {originalDayjs(date).format('YYYY-MM-DD')}
          </div>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="w-[80px] flex gap-3 mr-4">
          <EditUserFlowSheet userInfo={row.original} role={role} />
          {role >= 2 && <RemoveUserInfoDialog uid={row.original.id} />}
        </div>
      ),
    },
  ];
  const table = useReactTable({
    data: users,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex space-x-2">
          <SearchInput defaultValue={search} />
        </div>
        <div className="flex space-x-2">
          {/* <Button>导入</Button>
          <Button>导出</Button>
          <Button variant="default">+ 添加用户</Button> */}
        </div>
      </div>

      <div className="rounded-md border bg-card">
        {/* PC 端表格视图 */}
        <div className="hidden md:block overflow-x-auto">
          <Table className="min-w-[800px]">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="whitespace-nowrap py-3">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
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
                    暂时没有用户数据
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
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-base">{row.original.name}</span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded-md">{row.original.studentId}</span>
                </div>
                <div className="text-sm space-y-2">
                  {role >= 2 && (
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>手机号码</span>
                      <span className="text-foreground">{row.original.phone || '-'}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>邮箱</span>
                    <span className="truncate max-w-[200px] text-right text-foreground">{row.original.email || '-'}</span>
                  </div>
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>创建时间</span>
                    <span className="text-foreground">{originalDayjs(row.original.createdAt).format('YYYY-MM-DD')}</span>
                  </div>
                </div>
                <div className="pt-3 flex justify-end gap-3 border-t">
                  <EditUserFlowSheet userInfo={row.original} role={role} />
                  {role >= 2 && <RemoveUserInfoDialog uid={row.original.id} />}
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-muted-foreground text-sm">暂时没有用户数据</div>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div className="text-sm text-muted-foreground">
          显示 {(currentPage - 1) * 10 + 1} - {Math.min(currentPage * 10, totalCount)} 共{' '}
          {totalCount} 条结果
        </div>
        <div>
          <PaginationComponent
            totalItems={totalCount}
            pageSize={10}
            currentPage={currentPage}
          />
        </div>
      </div>
    </div>
  );
};
