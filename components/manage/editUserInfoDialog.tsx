"use client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { userType } from "@/types/user";
import { Eye } from "lucide-react";
import { Button } from "../ui/button";

export const EditUserInfoDialog = ({
  userInfo,
  role,
}: {
  userInfo: Partial<userType>;
  role: number;
}) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Eye className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{userInfo.name} 的信息</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
            <p className="text-xs text-muted-foreground">姓名</p>
            <p className="font-medium">{userInfo.name}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
            <p className="text-xs text-muted-foreground">学号</p>
            <p className="font-medium">{userInfo.studentId || '-'}</p>
          </div>
          {role >= 2 && (
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
              <p className="text-xs text-muted-foreground">手机号码</p>
              <p className="font-medium">{userInfo.phone || '-'}</p>
            </div>
          )}
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
            <p className="text-xs text-muted-foreground">邮箱</p>
            <p className="font-medium">{userInfo.email || '-'}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
            <p className="text-xs text-muted-foreground">学院</p>
            <p className="font-medium">{userInfo.college || '-'}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
            <p className="text-xs text-muted-foreground">专业</p>
            <p className="font-medium">{userInfo.major || '-'}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
            <p className="text-xs text-muted-foreground">GitHub</p>
            <p className="font-medium">{userInfo.github || '未填写'}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
            <p className="text-xs text-muted-foreground">博客地址</p>
            <p className="font-medium break-all">{userInfo.blog || '未填写'}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
            <p className="text-xs text-muted-foreground">个人介绍</p>
            <p className="font-medium whitespace-pre-wrap">{userInfo.personalStatement || '未填写'}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
