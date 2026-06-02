'use client';

import { readReviewRangeFromStorage } from '@/lib/review/review-range-storage';
import { useState } from 'react';

export const useLocalFlowId = (activeFlowIds?: number[]) => {
  const [flowId] = useState<number | null>(() => {
    return readReviewRangeFromStorage(activeFlowIds).range?.flowTypeId ?? null;
  });

  return flowId;
};
