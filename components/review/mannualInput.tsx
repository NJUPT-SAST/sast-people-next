'use client';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { checkUserByStuID } from './checkUser';

export const MannualInput = () => {
  const [studentId, setStudentId] = useState('');
  const [hasReviewRange, setHasReviewRange] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkReviewRange = () => {
      const selectedProbs = localStorage.getItem('people_selectedProbs');
      const hasRange = !!selectedProbs;
      setHasReviewRange(hasRange);
    };

    checkReviewRange();

    const handleUpdate = () => {
      checkReviewRange();
    };

    window.addEventListener('reviewRangeUpdated', handleUpdate);

    return () => {
      window.removeEventListener('reviewRangeUpdated', handleUpdate);
    };
  }, []);

  const handleStartMarking = async () => {
    const normalizedStudentId = studentId.trim().toUpperCase();

    if (!hasReviewRange) {
      toast.error('请先设置阅卷范围');
      return;
    }

    if (!normalizedStudentId) {
      toast.error('请输入考生学号');
      return;
    }

    setIsChecking(true);

    try {
      const existed = await checkUserByStuID(normalizedStudentId);

      if (!existed) {
        toast.error('未找到该考生，请检查学号后重试');
        return;
      }

      router.push(`/dashboard/review/marking?user=${normalizedStudentId}`);
    } catch {
      toast.error('考生信息校验失败，请稍后重试');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-1 sm:p-2">
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold text-foreground">手动输入学号</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          扫码失败时，可直接输入学号进入该考生的评分页。
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Input
            placeholder="请输入考生学号"
            value={studentId}
            className="h-11 bg-background text-base sm:text-sm"
            onChange={(e) => setStudentId(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleStartMarking();
              }
            }}
          />
        </div>
        <Button
          className="h-11 sm:w-28"
          disabled={!studentId.trim() || !hasReviewRange || isChecking}
          onClick={() => void handleStartMarking()}
          loading={isChecking}
        >
          开始阅卷
        </Button>
      </div>
      {!hasReviewRange && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          请先设置阅卷范围，再开始阅卷。
        </p>
      )}
    </div>
  );
};
