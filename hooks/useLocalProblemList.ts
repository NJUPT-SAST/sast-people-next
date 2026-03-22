'use client';

import { selectProbSchema, selectProbType } from '@/types/problem';
import { useState } from 'react';

export const useLocalProblemList = () => {
  const [problemList] = useState<selectProbType['problemList']>(() => {
    if (typeof window === 'undefined') {
      return [];
    }
    const selectedProbs = localStorage.getItem('people_selectedProbs');
    if (!selectedProbs) {
      return [];
    }
    const res = selectProbSchema.safeParse(JSON.parse(selectedProbs));
    if (res.success) {
      return res.data.problemList;
    }
    localStorage.removeItem('people_selectedProbs');
    return [];
  });
  return problemList;
};
