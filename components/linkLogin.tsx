'use client';
import React from 'react';
import { Button } from './ui/button';
import Image from 'next/image';
import {
  redirectSASTLink,
  type LinkOAuthPurpose,
} from '@/action/user/link';

export const LinkLogin = ({
  isBinding,
  purpose = 'session',
}: {
  isBinding: boolean;
  purpose?: LinkOAuthPurpose;
}) => {
  return (
    <Button
      className={`${isBinding ? "h-12" : "h-14"} w-full rounded-xl bg-[#18A058] px-5 text-base font-medium text-white shadow-none transition-colors hover:bg-[#159a52] active:bg-[#127a45]`}
      onClick={async () => redirectSASTLink(isBinding, purpose)}
    >
      <Image
        width={25}
        height={25}
        src={'/images/link.svg'}
        alt="link logo"
        className="mr-3 size-5 invert"
      />
      <span>{purpose === 'admin' ? '授权 Link 管理权限' : '使用 SAST Link 登录'}</span>
    </Button>
  );
};
