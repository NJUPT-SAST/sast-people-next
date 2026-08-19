import { render, screen, waitFor } from "@testing-library/react";
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

  beforeEach(() => {
    mockToastPromise.mockClear();
    mockToastError.mockClear();
    push.mockClear();
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
});
