'use client';
import React from 'react';
import { Button } from './ui/button';
import Image from 'next/image';
import { redirectSASTLink } from '@/action/user/link';

export const LinkLogin = ({ isBinding }: { isBinding: boolean }) => {
  return (
    <Button
      className="py-6 px-12 text-base text-white bg-[#18A058] hover:bg-[#158f4e] rounded-xl shadow-md shadow-[#18A058]/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-[#18A058]/30 active:scale-[0.98]"
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
