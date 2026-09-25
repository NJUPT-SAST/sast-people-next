'use client';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { findUserByStuID } from './checkUser';
import { resolveUserFlowForReview } from './resolveUserFlow';
import { selectProbSchema } from '@/types/problem';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export const MannualInput = ({ activeFlowIds }: { activeFlowIds?: number[] }) => {
  const [studentId, setStudentId] = useState('');
  const [hasReviewRange, setHasReviewRange] = useState(false);
  const [reviewFlowId, setReviewFlowId] = useState<number | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [candidate, setCandidate] = useState<Awaited<ReturnType<typeof findUserByStuID>>>(null);
  const [candidateStudentId, setCandidateStudentId] = useState('');
  const [showCandidateDialog, setShowCandidateDialog] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkReviewRange = () => {
      const selectedProbs = localStorage.getItem('people_selectedProbs');
      if (!selectedProbs) {
        setHasReviewRange(false);
        setReviewFlowId(null);
        return;
      }

      const parsed = selectProbSchema.safeParse(
        (() => {
          try {
            return JSON.parse(selectedProbs) as unknown;
          } catch {
            return null;
          }
        })(),
      );
      const isActive =
        parsed.success &&
        !!parsed.data.flowTypeId &&
        (!activeFlowIds || activeFlowIds.includes(parsed.data.flowTypeId));

      if (!isActive) {
        localStorage.removeItem('people_selectedProbs');
      }

      setHasReviewRange(isActive);
      setReviewFlowId(isActive ? parsed.data.flowTypeId : null);
    };

    checkReviewRange();

    const handleUpdate = () => {
      checkReviewRange();
    };

    window.addEventListener('reviewRangeUpdated', handleUpdate);

    return () => {
      window.removeEventListener('reviewRangeUpdated', handleUpdate);
    };
  }, [activeFlowIds]);

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
      const existed = await findUserByStuID(normalizedStudentId);

      if (!existed) {
        toast.error('未找到该考生，请检查学号后重试');
        return;
      }

      if (!reviewFlowId) {
        toast.error('请先设置阅卷范围');
        return;
      }

      const resolved = await resolveUserFlowForReview(normalizedStudentId, reviewFlowId);

      if (!resolved.success) {
        toast.error(resolved.message);
        return;
      }

      setCandidate(existed);
      setCandidateStudentId(normalizedStudentId);
      setShowCandidateDialog(true);
    } catch {
      toast.error('考生信息校验失败，请稍后重试');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <>
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
    </div>
    <Dialog open={showCandidateDialog} onOpenChange={setShowCandidateDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认考生信息</DialogTitle>
          <DialogDescription>请确认这就是要阅卷的考生，确认后将进入评分页面。</DialogDescription>
        </DialogHeader>
        {candidate && (
          <div className="grid gap-2 rounded-md border bg-muted/30 p-4 text-sm">
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">姓名</span><span className="font-medium">{candidate.name}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">学号</span><span className="font-mono font-medium">{candidate.studentId ?? candidateStudentId}</span></div>
            {candidate.college && <div className="flex justify-between gap-4"><span className="text-muted-foreground">学院</span><span className="text-right">{candidate.college}</span></div>}
            {candidate.major && <div className="flex justify-between gap-4"><span className="text-muted-foreground">专业</span><span>{candidate.major}</span></div>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowCandidateDialog(false)}>取消</Button>
          <Button onClick={() => { setShowCandidateDialog(false); router.push(`/dashboard/review/marking?user=${candidateStudentId}`); }}>确认进入阅卷</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};
