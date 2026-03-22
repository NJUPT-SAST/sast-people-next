'use client';

import { selectProbSchema } from '@/types/problem';
import { useState } from 'react';

export const useLocalFlowId = () => {
  const [flowId] = useState<number | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    const selectedProbs = localStorage.getItem('people_selectedProbs');
    if (!selectedProbs) {
      return null;
    }
    const res = selectProbSchema.safeParse(JSON.parse(selectedProbs));
    if (res.success && res.data?.flowTypeId) {
      return res.data.flowTypeId;
    }
    localStorage.removeItem('people_selectedProbs');
    return null;
  });

  return flowId;
};
