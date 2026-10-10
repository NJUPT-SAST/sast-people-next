/** @jest-environment node */

import { POST } from '@/app/api/user-point/route';
import {
  ReviewPointConflictError,
  ScoreValidationError,
} from '@/action/user-flow/user-point/upsert';

const upsertPoint = jest.fn();
const batchUpsertPoint = jest.fn();

jest.mock('@/action/user-flow/user-point/upsert', () => {
  const actual = jest.requireActual('@/action/user-flow/user-point/upsert');
  return {
    ...actual,
    upsertPoint: (...args: unknown[]) => upsertPoint(...args),
    batchUpsertPoint: (...args: unknown[]) => batchUpsertPoint(...args),
  };
});

jest.mock('@/lib/server-error-log', () => ({
  logServerError: jest.fn(),
  isNextControlFlowError: () => false,
}));

const postJson = (body: unknown) =>
  Object.assign(
    new Request('http://localhost/api/user-point', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { nextUrl: new URL('http://localhost/api/user-point') },
  ) as never;

const singleBody = {
  action: 'single',
  data: { userFlowId: 3, problemId: 7, point: 88 },
};

describe('user point route error mapping', () => {
  beforeEach(() => {
    upsertPoint.mockReset();
    batchUpsertPoint.mockReset();
  });

  it('returns 200 for a saved single score', async () => {
    upsertPoint.mockResolvedValue(undefined);

    const response = await POST(postJson(singleBody));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: '更新成功',
    });
  });

  it('surfaces the reason of a score validation failure as 422', async () => {
    upsertPoint.mockRejectedValue(
      new ScoreValidationError('该考生笔试结果已确认，不能再修改评分'),
    );

    const response = await POST(postJson(singleBody));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: '该考生笔试结果已确认，不能再修改评分',
    });
  });

  it('returns 409 with the conflicting problem ids', async () => {
    batchUpsertPoint.mockRejectedValue(
      new ReviewPointConflictError('部分题目已由其他批卷人保存', [11, 12]),
    );

    const response = await POST(
      postJson({
        action: 'batch',
        data: [
          { fkUserFlowId: 3, fkProblemId: 11, points: 80 },
          { fkUserFlowId: 3, fkProblemId: 12, points: 90 },
        ],
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: '部分题目已由其他批卷人保存',
      conflicts: [11, 12],
    });
  });

  it('keeps internal failures as a generic 500 without leaking the message', async () => {
    upsertPoint.mockRejectedValue(new Error('connection terminated unexpectedly'));

    const response = await POST(postJson(singleBody));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: '操作失败',
    });
  });

  it('rejects a batch that contains the same problem twice with 400', async () => {
    const response = await POST(
      postJson({
        action: 'batch',
        data: [
          { fkUserFlowId: 3, fkProblemId: 11, points: 80 },
          { fkUserFlowId: 3, fkProblemId: 11, points: 90 },
        ],
      }),
    );

    expect(response.status).toBe(400);
    expect(batchUpsertPoint).not.toHaveBeenCalled();
  });
});
