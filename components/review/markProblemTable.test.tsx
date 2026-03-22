import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MarkProblemTable } from "./markProblemTable";

const mockToastPromise = jest.fn((promise: Promise<unknown>) => promise);
const mockToastError = jest.fn();
const stableProblems = [
  { id: 1, name: "算法题", maxPoint: 100 },
  { id: 2, name: "设计题", maxPoint: 50 },
];

jest.mock("@/hooks/useLocalProblemList", () => ({
  useLocalProblemList: () => stableProblems,
}));

jest.mock("next/navigation", () => ({
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
    fetchMock.mockReset();
    global.fetch = fetchMock as never;
  });

  it("validates score range before saving and updates a single score", async () => {
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
    await user.click(screen.getByRole("button", { name: /保存/i }));
    expect(mockToastError).toHaveBeenCalledWith(
      "更新失败，算法题的得分必须在0到100之间！",
    );

    await user.clear(scoreInputs[1]);
    await user.type(scoreInputs[1], "45");
    await user.click(screen.getAllByRole("button", { name: /更新/i })[1]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/user-point",
        expect.objectContaining({
          method: "POST",
        }),
      );
      expect(mockToastPromise).toHaveBeenCalled();
    });
  });
});
