/** @jest-environment node */

import { GET } from '@/app/api/user-flow/route';
import { DepartmentAccessError } from '@/lib/authz';

const findUserFlowId = jest.fn();

jest.mock('@/action/user-flow/find', () => ({
  findUserFlowId: (...args: unknown[]) => findUserFlowId(...args),
}));

jest.mock('@/lib/dal', () => ({
  verifySession: jest.fn().mockResolvedValue({
    isAuth: true,
    uid: 1,
    role: 2,
    name: '测试用户',
    department: null,
  }),
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

  it('explains that withdrawn candidates cannot be reviewed', async () => {
    findUserFlowId.mockResolvedValue({ id: 8, progressStatus: 'withdrawn' });

    const response = await GET(requestFor() as never);

    await expect(response.json()).resolves.toEqual({
      success: true,
      userFlowId: 8,
      canReview: false,
      message: '该考生已退回当前流程，不能再修改评分',
    });
  });

  it('answers 403 when the candidate belongs to another department', async () => {
    findUserFlowId.mockRejectedValue(
      new DepartmentAccessError('该同学不属于当前部门，无法阅卷'),
    );

    const response = await GET(requestFor() as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: '该同学不属于当前部门，无法阅卷',
    });
  });
});
