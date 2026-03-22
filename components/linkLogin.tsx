'use client';
import React from 'react';
import { Button } from './ui/button';
import Image from 'next/image';
import { redirectSASTLink } from '@/action/user/link';

export const LinkLogin = ({ isBinding }: { isBinding: boolean }) => {
  return (
    <Button
      className="py-7 px-16 text-base text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
      onClick={async () => redirectSASTLink(isBinding)}
    >
      <Image
        width={25}
        height={25}
        src={'/images/link.svg'}
        alt="link logo"
        className="mr-4 invert"
      />
      <span>使用 SAST Link 登录</span>
    </Button>
  );
};
