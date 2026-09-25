'use client';

import { useEffect, useState } from 'react';

import { readReviewRangeFromStorage } from '@/lib/review/review-range-storage';
import { selectProbType } from '@/types/problem';

import { Badge } from '@/components/ui/badge';

function useSelectedRange(activeFlowIds?: number[]) {
  const [selectedRange, setSelectedRange] = useState<selectProbType | null>(null);

  useEffect(() => {
    const handleRangeUpdate = () => {
      setSelectedRange(readReviewRangeFromStorage(activeFlowIds).range);
    };

    handleRangeUpdate();
    window.addEventListener('reviewRangeUpdated', handleRangeUpdate);

    return () => {
      window.removeEventListener('reviewRangeUpdated', handleRangeUpdate);
    };
  }, [activeFlowIds]);

  return selectedRange;
}

export function ReviewRangeNotice({
  activeFlowIds,
}: {
  activeFlowIds?: number[];
}) {
  const selectedRange = useSelectedRange(activeFlowIds);

  if (selectedRange?.problemList.length) {
    return null;
  }

  return (
    <div className="mx-4 mb-5 mt-3 rounded-md border bg-amber-50 px-4 py-3 text-center dark:bg-amber-950/20 lg:mx-6 lg:mb-6 lg:mt-4">
      <p className="text-xs text-amber-700 dark:text-amber-400">
        请先设置上方【阅卷范围】，再开始阅卷。
      </p>
    </div>
  );
}

export const SelectedRangeDisplay = ({
  activeFlowIds,
}: {
  activeFlowIds?: number[];
}) => {
  const selectedRange = useSelectedRange(activeFlowIds);

  if (!selectedRange || selectedRange.problemList.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">当前评卷范围</p>
        <p className="text-sm text-muted-foreground">未设置阅卷范围</p>
      </div>
    );
  }

  const totalScore = selectedRange.problemList.reduce(
    (sum, problem) => sum + problem.maxPoint,
    0,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">当前评卷范围</p>
          <p className="text-sm text-muted-foreground">
            {selectedRange.flowTitle || '已选流程'}，共选择{' '}
            {selectedRange.problemList.length} 道题。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {selectedRange.problemList.length} 题
          </Badge>
          <Badge variant="outline">总分 {totalScore} 分</Badge>
        </div>
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-lg border sm:flex sm:flex-wrap sm:gap-2 sm:divide-y-0 sm:overflow-visible sm:border-0">
        {selectedRange.problemList.map((problem) => (
          <Badge
            key={problem.id}
            variant="outline"
            className="flex w-full items-center justify-between gap-3 rounded-none border-0 px-3 py-2 text-sm font-normal whitespace-normal sm:w-fit sm:justify-center sm:gap-1 sm:rounded-full sm:border sm:px-2 sm:py-0.5 sm:text-xs sm:font-medium sm:whitespace-nowrap"
          >
            <span>{problem.name}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums sm:text-foreground">
              ({problem.maxPoint}分)
            </span>
          </Badge>
        ))}
      </div>
    </div>
  );
};
