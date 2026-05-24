'use client';

import React, { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../ui/sheet';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { User } from 'lucide-react';
import { toast } from 'sonner';
import { userType } from '@/types/user';
import originalDayjs from '@/lib/dayjs';
import { updateUserRole } from '@/action/user/updateRole';

const roleName: Record<number, string> = {
  0: '新同学',
  1: '部员',
  2: '讲师',
  3: '管理员',
};

export const ViewUserInfoSheet = ({
  userInfo,
  currentUserRole,
}: {
  userInfo: userType;
  currentUserRole: number;
}) => {
  const [role, setRole] = useState<number>(userInfo.role ?? 0);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  const handleRoleChange = async (newRole: string) => {
    const roleNum = Number(newRole);
    setRole(roleNum);
    setIsUpdatingRole(true);
    try {
      await updateUserRole(userInfo.id, roleNum);
      toast.success(`角色已更新为 ${roleName[roleNum]}`);
    } catch {
      setRole(userInfo.role ?? 0);
      toast.error('角色更新失败');
    } finally {
      setIsUpdatingRole(false);
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon">
          <User className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto p-4 sm:p-6 flex flex-col">
        <SheetHeader className="px-1 pt-2 pb-4">
          <SheetTitle>
            <span className="text-primary">{userInfo.name}</span> 的详细信息
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-1 pb-8">
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">学号</p>
            <p className="font-medium">{userInfo.studentId || '-'}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">邮箱</p>
            <p className="font-medium">{userInfo.email || '-'}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">手机号码</p>
            <p className="font-medium">{userInfo.phone || '-'}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">学院 / 专业</p>
            <p className="font-medium">
              {userInfo.college || '-'} · {userInfo.major || '-'}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">角色</p>
            {currentUserRole >= 3 ? (
              <div className="mt-1">
                <Select
                  value={role.toString()}
                  onValueChange={handleRoleChange}
                  disabled={isUpdatingRole}
                >
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">新同学</SelectItem>
                    <SelectItem value="1">部员</SelectItem>
                    <SelectItem value="2">讲师</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <Badge variant="secondary" className="mt-1">
                {roleName[userInfo.role ?? 0] ?? '未知'}
              </Badge>
            )}
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">注册时间</p>
            <p className="font-medium">
              {userInfo.createdAt
                ? originalDayjs(userInfo.createdAt).format('YYYY-MM-DD HH:mm')
                : '-'}
            </p>
          </div>
          {(userInfo.github || userInfo.blog || userInfo.personalStatement) && (
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              {userInfo.github && (
                <div>
                  <p className="text-xs text-muted-foreground">GitHub</p>
                  <p className="font-medium text-sm truncate">{userInfo.github}</p>
                </div>
              )}
              {userInfo.blog && (
                <div>
                  <p className="text-xs text-muted-foreground">博客</p>
                  <p className="font-medium text-sm truncate">{userInfo.blog}</p>
                </div>
              )}
              {userInfo.personalStatement && (
                <div>
                  <p className="text-xs text-muted-foreground">个人陈述</p>
                  <p className="font-medium text-sm">{userInfo.personalStatement}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
