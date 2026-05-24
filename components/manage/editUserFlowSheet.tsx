'use client';
import React, { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../ui/sheet';
import { Workflow } from 'lucide-react';
import { userType } from '@/types/user';
import { FlowCard } from './flowCardClient';
import { useFlowListClient } from '@/hooks/useFlowListClient';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';

export const EditUserFlowSheet = ({
  userInfo,
  role,
}: {
  userInfo: Partial<userType>;
  role: number;
}) => {
  const { data: flowList, isLoading, error } = useFlowListClient(userInfo.id as number);
  const [selectedFlowId, setSelectedFlowId] = useState<number>();

  const selectedFlow = selectedFlowId !== undefined && Array.isArray(flowList)
    ? flowList.find((f) => f.id === selectedFlowId)
    : undefined;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon">
          <Workflow className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-[50vw] sm:w-3/4 overflow-y-auto p-4 sm:p-6 flex flex-col">
        <SheetHeader className="px-1 pt-2 pb-2">
          <SheetTitle>
            编辑 <span className="text-primary">{userInfo.name}</span> 的流程
          </SheetTitle>
          <SheetDescription>在下方编辑用户的流程</SheetDescription>
        </SheetHeader>
        <div className="rounded-lg border bg-muted/20 p-3 space-y-1 text-sm">
          <p className="text-xs text-muted-foreground">学号 / 邮箱</p>
          <p className="font-medium truncate">
            {userInfo.studentId || '-'} | {userInfo.email || '-'}
          </p>
        </div>
        <div className="flex flex-col gap-5 px-1 pb-32">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">加载中...</p>
          ) : error ? (
            <p className="text-destructive text-sm">加载失败，请重试</p>
          ) : (
            <Select
              onValueChange={(value) => setSelectedFlowId(parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择流程" />
              </SelectTrigger>
              {Array.isArray(flowList) && flowList.length > 0 && (
                <SelectContent>
                  {flowList.map((flow) => (
                    <SelectItem key={flow.id} value={flow.id.toString()}>
                      {flow.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              )}
            </Select>
          )}
          {selectedFlow && (
            <FlowCard flow={selectedFlow} role={role} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
