'use client';
import React from 'react';
import { Button } from './ui/button';
import Image from 'next/image';
import { redirectSASTLink } from '@/action/user/link';

export const LinkLogin = ({ isBinding }: { isBinding: boolean }) => {
  return (
    <Button
      className="h-12 w-full rounded-xl bg-[#18A058] px-5 text-base font-medium text-white shadow-none transition-colors hover:bg-[#158f4e] active:bg-[#127a45]"
      onClick={async () => redirectSASTLink(isBinding)}
    >
      <Image
        width={25}
        height={25}
        src={'/images/link.svg'}
        alt="link logo"
        className="mr-3 size-5 invert"
      />
      <span>使用 SAST Link 登录</span>
    </Button>
  );
};
