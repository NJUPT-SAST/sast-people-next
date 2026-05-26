'use client';
import { Separator } from './ui/separator';
import { ArrowRight } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { useFormStatus } from 'react-dom';
import { loginFromTest } from '@/action/user/auth';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export const TestLogin = () => {
  const formStatus = useFormStatus();
  const router = useRouter();
  return (
    <div className="flex w-full flex-col gap-4">
      <Separator className="w-full" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">使用测试帐号登入</p>
        <p className="text-xs text-muted-foreground">仅开发环境可见。</p>
      </div>
      <form
        action={async (formdata) => {
          toast.promise(
            async () => {
              await loginFromTest(formdata);
              router.push('/dashboard');
              return;
            },
            {
              loading: '登录中',
              success: '登录成功',
              error: '登录失败, 请检查该学号是否已经拥有帐号',
            },
          );
        }}
        className="flex w-full flex-col gap-3 sm:flex-row"
      >
        <Input
          disabled={formStatus.pending}
          type="text"
          name="studentId"
          placeholder="请填写测试学号"
          className="h-11"
        />
        <FormContentWithStatus />
      </form>
    </div>
  );
};

const FormContentWithStatus = () => {
  const formStatus = useFormStatus();
  return (
    <>
      <Button
        loading={formStatus.pending}
        disabled={formStatus.pending}
        type="submit"
        className="m-0 h-11 shrink-0"
      >
        登录 <ArrowRight />
      </Button>
    </>
  );
};
