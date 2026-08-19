import { resolveUserFlowForReview } from './resolveUserFlow';

describe('resolveUserFlowForReview', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as never;
  });

  it('accepts a successful response that predates the canReview field', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, userFlowId: 42 }),
    });

    await expect(resolveUserFlowForReview('2026001', 3)).resolves.toEqual({
      success: true,
      userFlowId: 42,
    });
  });

  it('rejects a response that explicitly disallows review', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        userFlowId: 42,
        canReview: false,
        message: '当前流程不在阅卷时间内',
      }),
    });

    await expect(resolveUserFlowForReview('2026001', 3)).resolves.toEqual({
      success: false,
      message: '当前流程不在阅卷时间内',
    });
  });
});
