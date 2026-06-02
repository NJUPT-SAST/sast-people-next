import { selectProbSchema, type selectProbType } from '@/types/problem';

export const REVIEW_RANGE_STORAGE_KEY = 'people_selectedProbs';

export type ReviewRangeReadResult = {
  range: selectProbType | null;
  cleared: boolean;
  reason: 'empty' | 'invalid' | 'inactive-flow' | null;
};

export function parseReviewRange(rawValue: string | null): selectProbType | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    const result = selectProbSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function readReviewRangeFromStorage(
  activeFlowIds?: number[],
): ReviewRangeReadResult {
  if (typeof window === 'undefined') {
    return { range: null, cleared: false, reason: 'empty' };
  }

  const rawValue = localStorage.getItem(REVIEW_RANGE_STORAGE_KEY);

  if (!rawValue) {
    return { range: null, cleared: false, reason: 'empty' };
  }

  const range = parseReviewRange(rawValue);

  if (!range) {
    localStorage.removeItem(REVIEW_RANGE_STORAGE_KEY);
    return { range: null, cleared: true, reason: 'invalid' };
  }

  if (activeFlowIds && !activeFlowIds.includes(range.flowTypeId)) {
    localStorage.removeItem(REVIEW_RANGE_STORAGE_KEY);
    return { range: null, cleared: true, reason: 'inactive-flow' };
  }

  return { range, cleared: false, reason: null };
}

export function writeReviewRangeToStorage(range: selectProbType) {
  localStorage.setItem(REVIEW_RANGE_STORAGE_KEY, JSON.stringify(range));
}

export function clearReviewRangeFromStorage() {
  localStorage.removeItem(REVIEW_RANGE_STORAGE_KEY);
}
