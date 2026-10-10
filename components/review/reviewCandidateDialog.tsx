'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** 批卷入口（扫码 / 手输学号）核对的信息，两个入口必须一致 */
export type ReviewCandidateSummary = {
  name?: string | null;
  studentId?: string | null;
  college?: string | null;
  major?: string | null;
};

/**
 * 进入批卷页前的考生确认弹窗：扫码与手输学号共用同一个组件，
 * 避免两个入口显示不同字段/不同按钮文案导致现场对不上人。
 */
export const ReviewCandidateDialog = ({
  open,
  onOpenChange,
  candidate,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: ReviewCandidateSummary;
  onConfirm: () => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>确认考生信息</DialogTitle>
        <DialogDescription>
          请核对姓名、学号与试卷一致，确认后进入该考生的评分页。
        </DialogDescription>
      </DialogHeader>
      <dl className="grid gap-2 rounded-md border bg-muted/30 p-4 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">姓名</dt>
          <dd className="font-medium">{candidate.name || '未填写'}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">学号</dt>
          <dd className="font-mono font-medium">{candidate.studentId || '未填写'}</dd>
        </div>
        {candidate.college ? (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">学院</dt>
            <dd className="text-right">{candidate.college}</dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">专业</dt>
          <dd className="text-right">{candidate.major || '未填写'}</dd>
        </div>
      </dl>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          取消
        </Button>
        <Button onClick={onConfirm}>确认并开始阅卷</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
