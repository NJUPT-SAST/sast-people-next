'use client';

import { readReviewRangeFromStorage } from '@/lib/review/review-range-storage';
import { useEffect, useState } from 'react';

export const useLocalFlowId = (activeFlowIds?: number[]) => {
  const [flowId, setFlowId] = useState<number | null>(() => {
    return readReviewRangeFromStorage(activeFlowIds).range?.flowTypeId ?? null;
  });

  useEffect(() => {
    const refreshFlowId = () => {
      setFlowId(readReviewRangeFromStorage(activeFlowIds).range?.flowTypeId ?? null);
    };

    refreshFlowId();
    window.addEventListener('reviewRangeUpdated', refreshFlowId);

    return () => {
      window.removeEventListener('reviewRangeUpdated', refreshFlowId);
    };
  }, [activeFlowIds]);

  return flowId;
};
