import React from 'react';
import { Button } from './ui/button';
import { verifySession } from '@/lib/dal';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { useUserInfo as getUserInfo } from '@/hooks/useUserInfo';
import type { userType } from '@/types/user';
import { LogOut } from 'lucide-react';

export const UserCard: React.FC = async () => {
  const session = await verifySession();
  let avatar: string | null | undefined = null;
  let nickname: string | null | undefined = null;

  try {
    const userInfo = await getUserInfo() as userType;
    avatar = userInfo.avatar;
    nickname = userInfo.nickname;
  } catch {
    // Keep the sidebar usable even if Link profile loading is unavailable.
  }

  const name = session?.name ? (session.name as string) : '未知用户';
  const roleLabel =
    session.role === 0 ? '新同学'
    : session.role === 1 ? '部员'
    : session.role === 2 ? '讲师'
    : '管理员';

  return (
    <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent/70">
      <Avatar className="h-9 w-9">
        <AvatarImage src={avatar ?? undefined} alt={name} />
        <AvatarFallback className="text-sm font-medium">
          {name.charAt(0)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {nickname ? `${roleLabel} · ${nickname}` : roleLabel}
        </p>
      </div>
      <form action="/api/auth/logout">
        <Button variant="ghost" size="icon-sm" type="submit">
          <LogOut className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
};
