'use client';

import { useEffect, useState } from 'react';

import { selectProbSchema, selectProbType } from '@/types/problem';

import { Badge } from '@/components/ui/badge';

const readSelectedRange = (): selectProbType | null => {
  const selectedProbs = localStorage.getItem('people_selectedProbs');

  if (!selectedProbs) {
    return null;
  }

  const result = selectProbSchema.safeParse(JSON.parse(selectedProbs));
  return result.success ? result.data : null;
};

export const SelectedRangeDisplay = () => {
  const [selectedRange, setSelectedRange] = useState<selectProbType | null>(
    () => (typeof window === 'undefined' ? null : readSelectedRange()),
  );

  useEffect(() => {
    const handleRangeUpdate = () => {
      setSelectedRange(readSelectedRange());
    };

    window.addEventListener('reviewRangeUpdated', handleRangeUpdate);

    return () => {
      window.removeEventListener('reviewRangeUpdated', handleRangeUpdate);
    };
  }, []);

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
      <div className="flex flex-wrap gap-2">
        {selectedRange.problemList.map((problem) => (
          <Badge key={problem.id} variant="outline">
            {problem.name} ({problem.maxPoint}分)
          </Badge>
        ))}
      </div>
    </div>
  );
};
