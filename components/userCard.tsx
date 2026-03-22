import React from 'react';
import { Button } from './ui/button';
import { verifySession } from '@/lib/dal';
import Link from 'next/link';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { LogOut, MoreHorizontal } from 'lucide-react';

export const UserCard: React.FC = async () => {
  const session = await verifySession();
  const name = session?.name ? (session.name as string) : '未知用户';
  const roleLabel = session.role === 0 ? '新同学' : '讲师';

  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-9 w-9">
        <AvatarFallback className="text-sm font-medium">
          {name.charAt(0)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-xs text-muted-foreground">{roleLabel}</p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href="/api/auth/logout" prefetch={false}>
              <LogOut className="h-4 w-4 mr-2" />
              退出登录
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
