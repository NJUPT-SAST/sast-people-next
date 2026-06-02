'use client';

import { readReviewRangeFromStorage } from '@/lib/review/review-range-storage';
import { selectProbType } from '@/types/problem';
import { useState } from 'react';

export const useLocalProblemList = () => {
  const [problemList] = useState<selectProbType['problemList']>(() => {
    return readReviewRangeFromStorage().range?.problemList ?? [];
  });
  return problemList;
};
