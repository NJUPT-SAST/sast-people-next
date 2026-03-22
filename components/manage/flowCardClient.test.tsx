import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FlowCard } from "./flowCardClient";

const forward = jest.fn().mockResolvedValue(undefined);
const reopen = jest.fn().mockResolvedValue(undefined);
const mutate = jest.fn().mockResolvedValue(undefined);

jest.mock("@/hooks/useFlowStepsInfoClient", () => ({
  useFlowStepsInfoClient: () => ({
    data: [
      { id: 1, type: "registering" },
      { id: 2, type: "checking" },
    ],
  }),
}));

jest.mock("@/action/user-flow/edit", () => ({
  forward: (...args: unknown[]) => forward(...args),
  backward: jest.fn(),
  finish: jest.fn(),
  reject: jest.fn(),
  reopen: (...args: unknown[]) => reopen(...args),
}));

jest.mock("swr", () => ({
  mutate: (...args: unknown[]) => mutate(...args),
}));

describe("manage FlowCard", () => {
  beforeEach(() => {
    forward.mockClear();
    reopen.mockClear();
    mutate.mockClear();
  });

  it("moves an ongoing flow forward and refreshes SWR caches", async () => {
    const user = userEvent.setup();

    render(
      <FlowCard
        flow={{
          id: 10,
          fkUserId: 5,
          title: "招新流程",
          status: "ongoing",
          currentStepOrder: 1,
          steps: [
            { id: 1, order: 1, title: "报名", description: "提交资料" },
            { id: 2, order: 2, title: "审核", description: "等待审核" },
          ],
        } as never}
      />,
    );

    await user.click(screen.getAllByRole("button").at(-1)!);

    await waitFor(() => {
      expect(forward).toHaveBeenCalledWith(10);
      expect(mutate).toHaveBeenCalledWith("/api/flow?uid=5");
      expect(mutate).toHaveBeenCalledWith("/api/flow/10");
    });
  });

  it("shows reopen action for completed flows", async () => {
    const user = userEvent.setup();

    render(
      <FlowCard
        flow={{
          id: 11,
          fkUserId: 9,
          title: "已结束流程",
          status: "accepted",
          currentStepOrder: 1,
          steps: [{ id: 1, order: 1, title: "终试", description: "已结束" }],
        } as never}
      />,
    );

    await user.click(screen.getByRole("button"));

    expect(reopen).toHaveBeenCalledWith(11);
    expect(screen.getByText("已通过考核")).toBeInTheDocument();
  });
});
