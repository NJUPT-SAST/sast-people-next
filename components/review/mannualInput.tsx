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
    <div className="flex flex-col gap-3 rounded-xl border border-dashed bg-muted/20 p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">手动输入考生学号</p>
        <p className="text-xs text-muted-foreground">
          适用于二维码识别失败或现场需要直接跳转到指定考生。
        </p>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Input
          placeholder="请输入考生学号"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleStartMarking();
            }
          }}
        />
        <div className="flex-none">
          <Button
            disabled={!studentId.trim() || !hasReviewRange || isChecking}
            onClick={() => void handleStartMarking()}
            loading={isChecking}
          >
            开始阅卷
          </Button>
        </div>
      </div>
      {!hasReviewRange && (
        <p className="text-xs text-destructive">
          还没有设置阅卷范围，开始阅卷前请先选择试卷和题目。
        </p>
      )}
    </div>
  );
};
