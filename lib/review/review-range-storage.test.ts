import {
  REVIEW_RANGE_STORAGE_KEY,
  parseReviewRange,
  readReviewRangeFromStorage,
  writeReviewRangeToStorage,
} from './review-range-storage';

const validRange = {
  flowTypeId: 10,
  flowTitle: '2026 春招',
  stepId: 20,
  problemList: [
    {
      id: 1,
      name: '算法题',
      maxPoint: 100,
    },
  ],
};

describe('review range storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('parses valid review range data', () => {
    expect(parseReviewRange(JSON.stringify(validRange))).toEqual(validRange);
  });

  it('returns null for malformed storage data', () => {
    expect(parseReviewRange('{bad json')).toBeNull();
    expect(parseReviewRange(JSON.stringify({ flowTypeId: '10' }))).toBeNull();
  });

  it('clears invalid local storage data instead of throwing', () => {
    localStorage.setItem(REVIEW_RANGE_STORAGE_KEY, '{bad json');

    expect(readReviewRangeFromStorage()).toEqual({
      range: null,
      cleared: true,
      reason: 'invalid',
    });
    expect(localStorage.getItem(REVIEW_RANGE_STORAGE_KEY)).toBeNull();
  });

  it('clears inactive flow ranges', () => {
    writeReviewRangeToStorage(validRange);

    expect(readReviewRangeFromStorage([11])).toEqual({
      range: null,
      cleared: true,
      reason: 'inactive-flow',
    });
    expect(localStorage.getItem(REVIEW_RANGE_STORAGE_KEY)).toBeNull();
  });
});
