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
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { ExternalLink, User } from 'lucide-react';
import { toast } from 'sonner';
import { userType } from '@/types/user';
import originalDayjs from '@/lib/dayjs';
import { updateUserRole } from '@/action/user/updateRole';
import { useUserInfoById as getUserInfoById } from '@/hooks/useUserInfoById';

const roleName: Record<number, string> = {
  0: '新同学',
  1: '部员',
  2: '讲师',
  3: '管理员',
};

const linkStateLabel: Record<string, string> = {
  njupter: '在校未加入',
  'on-sast': '现任成员',
  'retired-sast': '已离开',
  is_deleted: '已注销',
};

const emailTypeLabel: Record<string, string> = {
  njupt_email: '南邮邮箱',
  sast_email: 'SAST 邮箱',
};

const identityProviderLabel: Record<string, string> = {
  github: 'GitHub',
  lark: '飞书',
  other_mail: '其他邮箱',
};

function InfoSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border bg-background">
      <div className="border-b bg-muted/20 px-4 py-2.5">
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      <div className="divide-y">{children}</div>
    </section>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-3">
      <p className="text-xs text-muted-foreground sm:pt-0.5">{label}</p>
      <div className="min-w-0 text-sm font-medium">{children}</div>
    </div>
  );
}

function TextValue({
  value,
  multiline,
}: {
  value: string | null | undefined;
  multiline?: boolean;
}) {
  return (
    <p className={multiline ? "whitespace-pre-wrap leading-6" : "break-words"}>
      {value?.trim() || "-"}
    </p>
  );
}

function LinkValue({ value }: { value: string | null | undefined }) {
  const href = value?.trim();

  if (!href) return <span>-</span>;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-1 text-primary underline-offset-4 hover:underline"
    >
      <span className="truncate">{href}</span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
    </a>
  );
}

function IdentityList({ identities }: { identities: userType['identities'] }) {
  const safeIdentities = Array.isArray(identities) ? identities : [];

  if (safeIdentities.length === 0) {
    return <span>-</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {safeIdentities.map((identity) => (
        <span
          key={identity.id}
          className="rounded-md border bg-muted/20 px-2 py-1 text-xs font-medium"
        >
          {identityProviderLabel[identity.provider] ?? identity.provider}
        </span>
      ))}
    </div>
  );
}

export const ViewUserInfoSheet = ({
  userInfo,
  currentUserRole,
}: {
  userInfo: userType;
  currentUserRole: number;
}) => {
  const [role, setRole] = useState<number>(userInfo.role ?? 0);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [detailUserInfo, setDetailUserInfo] = useState<userType | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const displayUserInfo = detailUserInfo ?? userInfo;

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

  const handleOpenChange = async (open: boolean) => {
    if (!open || detailUserInfo || isLoadingDetail) {
      return;
    }

    setIsLoadingDetail(true);
    try {
      const detail = await getUserInfoById(userInfo.id);
      setDetailUserInfo(detail);
      setRole(detail.role ?? 0);
    } catch {
      toast.error('加载用户详细信息失败');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  return (
    <Sheet onOpenChange={(open) => void handleOpenChange(open)}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-10 sm:size-9">
          <User className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-5 py-5 sm:px-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14">
              <AvatarImage src={displayUserInfo.avatar ?? undefined} alt={displayUserInfo.name} />
              <AvatarFallback className="text-base font-medium">
                {(displayUserInfo.name || '?').charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <SheetTitle className="flex items-center gap-3">
                <span className="min-w-0 truncate text-xl">{displayUserInfo.name || '未知用户'}</span>
                <Badge variant="secondary" className="shrink-0">
                  {roleName[role] ?? '未知'}
                </Badge>
              </SheetTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {displayUserInfo.nickname ? `${displayUserInfo.nickname} · ` : ''}
                {displayUserInfo.studentId || '无学号'} · {displayUserInfo.college || '未知学院'}
              </p>
            </div>
          </div>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
          <InfoSection title="基础信息">
            <InfoRow label="学号">
              <TextValue value={displayUserInfo.studentId} />
            </InfoRow>
            <InfoRow label="昵称">
              <TextValue value={displayUserInfo.nickname} />
            </InfoRow>
            <InfoRow label="邮箱">
              <TextValue value={displayUserInfo.email} />
            </InfoRow>
            <InfoRow label="邮箱类型">
              <TextValue
                value={
                  displayUserInfo.emailType
                    ? emailTypeLabel[displayUserInfo.emailType] ?? displayUserInfo.emailType
                    : '-'
                }
              />
            </InfoRow>
            <InfoRow label="学院 / 专业">
              <TextValue
                value={`${displayUserInfo.college || '-'} / ${displayUserInfo.major || '-'}`}
              />
            </InfoRow>
            <InfoRow label="方向">
              <TextValue
                value={
                  displayUserInfo.departments.length > 0
                    ? displayUserInfo.departments.join('、')
                    : '-'
                }
              />
            </InfoRow>
            <InfoRow label="注册时间">
              <TextValue
                value={
                  displayUserInfo.createdAt
                    ? originalDayjs(displayUserInfo.createdAt).format('YYYY-MM-DD HH:mm')
                    : '-'
                }
              />
            </InfoRow>
            <InfoRow label="账号状态">
              <TextValue
                value={
                  displayUserInfo.linkState
                    ? linkStateLabel[displayUserInfo.linkState] ?? displayUserInfo.linkState
                    : displayUserInfo.isDeleted
                      ? '已注销'
                      : '-'
                }
              />
            </InfoRow>
          </InfoSection>

          {currentUserRole >= 2 && (
            <InfoSection title="联系方式">
              {currentUserRole >= 3 && (
                <InfoRow label="手机号码">
                  <TextValue value={displayUserInfo.phone} />
                </InfoRow>
              )}
              <InfoRow label="QQ">
                <TextValue value={displayUserInfo.qq} />
              </InfoRow>
            </InfoSection>
          )}

          <InfoSection title="权限">
            <InfoRow label="角色">
              {currentUserRole >= 3 ? (
                <Select
                  value={role.toString()}
                  onValueChange={handleRoleChange}
                  disabled={isUpdatingRole}
                >
                  <SelectTrigger className="h-9 w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">新同学</SelectItem>
                    <SelectItem value="1">部员</SelectItem>
                    <SelectItem value="2">讲师</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <TextValue value={roleName[role] ?? '未知'} />
              )}
            </InfoRow>
          </InfoSection>

          <InfoSection title="能力信息">
            <InfoRow label="加载状态">
              <TextValue value={isLoadingDetail ? '正在读取完整资料...' : '已读取'} />
            </InfoRow>
            <InfoRow label="GitHub">
              <LinkValue value={displayUserInfo.github} />
            </InfoRow>
            <InfoRow label="博客">
              <LinkValue value={displayUserInfo.blog} />
            </InfoRow>
            <InfoRow label="个人陈述">
              <TextValue value={displayUserInfo.personalStatement} multiline />
            </InfoRow>
          </InfoSection>

          <InfoSection title="Link 账号">
            <InfoRow label="绑定账号">
              <IdentityList identities={displayUserInfo.identities} />
            </InfoRow>
          </InfoSection>
        </div>
      </SheetContent>
    </Sheet>
  );
};
