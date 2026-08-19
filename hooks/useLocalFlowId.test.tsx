import { act, renderHook } from '@testing-library/react';

import { writeReviewRangeToStorage } from '@/lib/review/review-range-storage';

import { useLocalFlowId } from './useLocalFlowId';

describe('useLocalFlowId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('refreshes when a review range is saved after the scanner mounts', () => {
    const { result } = renderHook(() => useLocalFlowId());

    expect(result.current).toBeNull();

    act(() => {
      writeReviewRangeToStorage({
        flowTypeId: 1,
        stepId: 2,
        problemList: [{ id: 3, name: '算法题', maxPoint: 100 }],
      });
      window.dispatchEvent(new Event('reviewRangeUpdated'));
    });

    expect(result.current).toBe(1);
  });
});
