import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MarkProblemTable } from "./markProblemTable";

const mockToastPromise = jest.fn((promise: Promise<unknown>) => promise);
const mockToastError = jest.fn();
const push = jest.fn();
const stableProblems = [
  { id: 1, name: "算法题", maxPoint: 100 },
  { id: 2, name: "设计题", maxPoint: 50 },
];

jest.mock("@/hooks/useLocalProblemList", () => ({
  useLocalProblemList: () => stableProblems,
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({
    get: () => "2026001",
  }),
}));

jest.mock("sonner", () => ({
  toast: {
    promise: (...args: Parameters<typeof mockToastPromise>) =>
      mockToastPromise(...args),
    error: (...args: Parameters<typeof mockToastError>) =>
      mockToastError(...args),
  },
}));

describe("MarkProblemTable", () => {
  const fetchMock = jest.fn();
  const reloadPoints = jest.fn();

  beforeEach(() => {
    mockToastPromise.mockClear();
    mockToastError.mockClear();
    push.mockClear();
    reloadPoints.mockClear();
    fetchMock.mockReset();
    global.fetch = fetchMock as never;
  });

  it("validates score range and submits all scores before returning to the review page", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(
      <MarkProblemTable
        userFlowId={3}
        locks={[]}
        onReloadPoints={reloadPoints}
        points={[
          { fkProblemId: 1, points: 20 },
          { fkProblemId: 2, points: 10 },
        ] as never}
      />,
    );

    const scoreInputs = screen.getAllByRole("spinbutton");

    await user.clear(scoreInputs[0]);
    await user.type(scoreInputs[0], "120");
    await user.click(screen.getByRole("button", { name: /确认评分并返回扫码页/i }));
    expect(mockToastError).toHaveBeenCalledWith(
      "算法题 的得分必须在 0 到 100 之间",
    );
    expect(push).not.toHaveBeenCalled();

    await user.clear(scoreInputs[1]);
    await user.type(scoreInputs[1], "45");
    await user.clear(scoreInputs[0]);
    await user.type(scoreInputs[0], "88");
    await user.click(screen.getByRole("button", { name: /确认评分并返回扫码页/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/user-point",
        expect.objectContaining({
          method: "POST",
        }),
      );
      expect(mockToastPromise).toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith("/dashboard/review");
    });
  });

  it('autosaves a valid score for the edited problem', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(
      <MarkProblemTable
        userFlowId={3}
        locks={[]}
        onReloadPoints={reloadPoints}
        points={[{ fkProblemId: 1, points: 20 }] as never}
      />,
    );

    const scoreInput = screen.getAllByRole('spinbutton')[0];
    await user.clear(scoreInput);
    await user.type(scoreInput, '88');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/user-point',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            action: 'single',
            data: { userFlowId: 3, problemId: 1, point: 88 },
          }),
        }),
      );
    });
  });

  it('keeps a previous save from clearing an error after the score becomes invalid', async () => {
    const user = userEvent.setup();
    const deferred = Promise.withResolvers<{
      ok: boolean;
      json: () => Promise<{ success: boolean }>;
    }>();
    fetchMock.mockReturnValue(deferred.promise);

    render(
      <MarkProblemTable
        userFlowId={3}
        locks={[]}
        onReloadPoints={reloadPoints}
        points={[{ fkProblemId: 1, points: 20 }] as never}
      />,
    );

    const scoreInput = screen.getAllByRole('spinbutton')[0];
    await user.clear(scoreInput);
    await user.type(scoreInput, '88');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await user.clear(scoreInput);
    await user.type(scoreInput, '120');
    expect(screen.getByText('算法题 的得分必须在 0 到 100 之间')).toBeInTheDocument();

    deferred.resolve({ ok: true, json: async () => ({ success: true }) });
    await Promise.resolve();

    expect(screen.getByText('算法题 的得分必须在 0 到 100 之间')).toBeInTheDocument();
  });

  it('renders problems saved by another grader as read-only and excludes them from the batch', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(
      <MarkProblemTable
        userFlowId={3}
        locks={[{ problemId: 2, judgerId: 7, judgerName: '张三' }]}
        onReloadPoints={reloadPoints}
        points={[
          { fkProblemId: 1, points: 20 },
          { fkProblemId: 2, points: 30 },
        ] as never}
      />,
    );

    const [ownInput, lockedInput] = screen.getAllByRole('spinbutton');
    expect(lockedInput).toBeDisabled();
    expect(ownInput).toBeEnabled();
    expect(screen.getByText(/本题已由 张三 批改保存/)).toBeInTheDocument();
    expect(screen.getByText('1 题由他人批改')).toBeInTheDocument();

    await user.clear(ownInput);
    await user.type(ownInput, '88');
    await user.click(screen.getByRole('button', { name: /确认评分并返回扫码页/i }));

    await waitFor(() => {
      const batchCall = fetchMock.mock.calls.find(
        ([, init]) => JSON.parse(String((init as RequestInit).body)).action === 'batch',
      );
      expect(batchCall).toBeDefined();
      const payload = JSON.parse(String((batchCall?.[1] as RequestInit).body));
      expect(payload.data.map((value: { fkProblemId: number }) => value.fkProblemId)).toEqual([1]);
    });
  });

  it('turns a problem read-only and reloads scores when the server rejects an autosave', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        success: false,
        message: '本题已由其他批卷人保存',
        conflicts: [1],
      }),
    });

    render(
      <MarkProblemTable
        userFlowId={3}
        locks={[]}
        onReloadPoints={reloadPoints}
        points={[{ fkProblemId: 1, points: 20 }] as never}
      />,
    );

    const scoreInput = screen.getAllByRole('spinbutton')[0];
    await user.clear(scoreInput);
    await user.type(scoreInput, '88');

    await waitFor(() => expect(reloadPoints).toHaveBeenCalled());
    expect(screen.getByText(/本题已由其他批卷人批改保存/)).toBeInTheDocument();
    expect(screen.getAllByRole('spinbutton')[0]).toBeDisabled();
  });

  it('shows the real reason when the server rejects the score with 422', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        success: false,
        message: '该考生笔试结果已确认，不能再修改评分',
      }),
    });

    render(
      <MarkProblemTable
        userFlowId={3}
        locks={[]}
        onReloadPoints={reloadPoints}
        points={[{ fkProblemId: 1, points: 20 }] as never}
      />,
    );

    const scoreInput = screen.getAllByRole('spinbutton')[0];
    await user.clear(scoreInput);
    await user.type(scoreInput, '88');

    await waitFor(() =>
      expect(
        screen.getByText('该考生笔试结果已确认，不能再修改评分'),
      ).toBeInTheDocument(),
    );
    await expect(scoreInput).toHaveValue(88);
    expect(screen.getAllByRole('spinbutton')[0]).toBeEnabled();
  });

  it('asks for one more confirm after a batch conflict and then submits the rest', async () => {
    const user = userEvent.setup();
    let batchAttempts = 0;
    fetchMock.mockImplementation(
      async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        if (body.action === 'batch') {
          batchAttempts += 1;
          if (batchAttempts === 1) {
            return {
              ok: false,
              status: 409,
              json: async () => ({
                success: false,
                message: '部分题目已由其他批卷人保存',
                conflicts: [2],
              }),
            };
          }
        }
        return { ok: true, json: async () => ({ success: true }) };
      },
    );

    render(
      <MarkProblemTable
        userFlowId={3}
        locks={[]}
        onReloadPoints={reloadPoints}
        points={[
          { fkProblemId: 1, points: 20 },
          { fkProblemId: 2, points: 30 },
        ] as never}
      />,
    );

    const inputs = screen.getAllByRole('spinbutton');
    await user.clear(inputs[0]);
    await user.type(inputs[0], '88');
    await user.clear(inputs[1]);
    await user.type(inputs[1], '40');

    await user.click(screen.getByRole('button', { name: /确认评分并返回扫码页/i }));
    await waitFor(() => expect(reloadPoints).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /确认评分并返回扫码页/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard/review'));
    const batchCalls = fetchMock.mock.calls.filter(
      ([, init]) => JSON.parse(String((init as RequestInit).body)).action === 'batch',
    );
    expect(batchCalls).toHaveLength(2);
    const secondPayload = JSON.parse(String((batchCalls[1][1] as RequestInit).body));
    expect(secondPayload.data.map((value: { fkProblemId: number }) => value.fkProblemId)).toEqual([
      1,
    ]);
  });

  it('times out the batch submit when the response body never finishes', async () => {
    jest.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        if (body.action !== 'batch') {
          return { ok: true, status: 200, json: async () => ({ success: true }) };
        }

        const { promise, reject } = Promise.withResolvers<unknown>();
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
        return { ok: true, status: 200, json: () => promise };
      });

      render(
        <MarkProblemTable
          userFlowId={3}
          locks={[]}
          onReloadPoints={reloadPoints}
          points={[{ fkProblemId: 1, points: 20 }] as never}
        />,
      );

      const input = screen.getAllByRole('spinbutton')[0];
      await user.clear(input);
      await user.type(input, '88');
      await user.clear(screen.getAllByRole('spinbutton')[1]);
      await user.type(screen.getAllByRole('spinbutton')[1], '40');
      await user.click(screen.getByRole('button', { name: /确认评分并返回扫码页/i }));

      expect(mockToastPromise).toHaveBeenCalledTimes(1);
      const request = mockToastPromise.mock.calls[0][0] as Promise<unknown>;

      await act(async () => {
        await jest.advanceTimersByTimeAsync(30_000);
      });

      await expect(request).rejects.toThrow('提交超时');
      expect(push).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not treat a batch response with an unreadable body as success', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.action !== 'batch') {
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }

      return {
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('unexpected end of JSON input');
        },
      };
    });

    render(
      <MarkProblemTable
        userFlowId={3}
        locks={[]}
        onReloadPoints={reloadPoints}
        points={[{ fkProblemId: 1, points: 20 }] as never}
      />,
    );

    const input = screen.getAllByRole('spinbutton')[0];
    await user.clear(input);
    await user.type(input, '88');
    await user.clear(screen.getAllByRole('spinbutton')[1]);
    await user.type(screen.getAllByRole('spinbutton')[1], '40');
    await user.click(screen.getByRole('button', { name: /确认评分并返回扫码页/i }));

    const request = mockToastPromise.mock.calls[0][0] as Promise<unknown>;
    await expect(request).rejects.toThrow('已提交但未能读取服务端响应');
    expect(push).not.toHaveBeenCalled();
  });

  it('shows the candidate name next to the student id', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(
      <MarkProblemTable
        userFlowId={3}
        locks={[]}
        candidateName="张同学"
        onReloadPoints={reloadPoints}
        points={[] as never}
      />,
    );

    expect(screen.getByText('正在批改：张同学（2026001）')).toBeInTheDocument();
  });
});
