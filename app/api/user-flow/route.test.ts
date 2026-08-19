/** @jest-environment node */

import { GET } from './route';

const findUserFlowId = jest.fn();

jest.mock('@/action/user-flow/find', () => ({
  findUserFlowId: (...args: unknown[]) => findUserFlowId(...args),
}));

jest.mock('@/lib/server-error-log', () => ({
  logServerError: jest.fn(),
}));

const requestFor = (studentId = '2026001', flowId = '1') =>
  new Request(
    `http://localhost/api/user-flow?studentId=${studentId}&flowId=${flowId}`,
  );

describe('user flow review eligibility', () => {
  beforeEach(() => {
    findUserFlowId.mockReset();
  });

  it.each(['passed', 'failed'] as const)(
    'blocks %s candidates from entering grading',
    async (progressStatus) => {
      findUserFlowId.mockResolvedValue({ id: 8, progressStatus });

      const response = await GET(requestFor() as never);

      await expect(response.json()).resolves.toEqual({
        success: true,
        userFlowId: 8,
        canReview: false,
        message: '该考生笔试结果已确认，不能再修改评分',
      });
    },
  );

  it('allows candidates whose result is not finalized', async () => {
    findUserFlowId.mockResolvedValue({ id: 8, progressStatus: 'ongoing' });

    const response = await GET(requestFor() as never);

    await expect(response.json()).resolves.toEqual({
      success: true,
      userFlowId: 8,
      canReview: true,
    });
  });
});
