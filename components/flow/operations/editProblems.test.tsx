import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EditProblems } from "./editProblems";

const mockUpdateProblems = jest.fn().mockResolvedValue(undefined);
const mockToastPromise = jest.fn((promise: Promise<unknown>) => promise);

jest.mock("@/action/flow/problem/edit", () => ({
  updateProblems: (...args: Parameters<typeof mockUpdateProblems>) =>
    mockUpdateProblems(...args),
}));

jest.mock("sonner", () => ({
  toast: {
    promise: (...args: Parameters<typeof mockToastPromise>) =>
      mockToastPromise(...args),
    error: jest.fn(),
  },
}));

const baseStep = { id: 1, title: "笔试", order: 1, description: null, fkFlowId: 4 };
const baseProblems = [{ id: 11, title: "算法题1", score: 20, fkFlowStepId: 1 }];

describe("EditProblems", () => {
  beforeEach(() => {
    mockUpdateProblems.mockClear();
    mockToastPromise.mockClear();
  });

  it("renders step selector with step title", () => {
    render(
      <EditProblems
        steps={[baseStep]}
        problemsByStep={{ 1: baseProblems }}
        defaultStepId={1}
        flowTypeId={4}
      />,
    );

    expect(screen.getByText("题目列表")).toBeTruthy();
    expect(screen.getByText("笔试")).toBeTruthy();
    expect(screen.getByText("1 道题目")).toBeTruthy();
  });

  it("adds and saves problems", async () => {
    const user = userEvent.setup();

    render(
      <EditProblems
        steps={[baseStep]}
        problemsByStep={{ 1: baseProblems }}
        defaultStepId={1}
        flowTypeId={4}
      />,
    );

    await user.click(screen.getByRole("button", { name: "添加题目" }));

    const nameInputs = screen.getAllByLabelText("题目名称");
    expect(nameInputs).toHaveLength(2);
    expect(nameInputs[1]).toHaveValue("");

    await user.type(nameInputs[1], "设计题");

    const scoreInputs = screen.getAllByLabelText("最高分数");
    expect(scoreInputs[1]).toHaveValue(null);

    await user.type(scoreInputs[1], "15");

    await user.click(screen.getByRole("button", { name: /保存/ }));

    await waitFor(() => {
      expect(mockUpdateProblems).toHaveBeenCalledWith(
        1,
        {
          default: expect.arrayContaining([
            expect.objectContaining({ title: "算法题1", score: 20, fkFlowStepId: 1 }),
            expect.objectContaining({ title: "设计题", score: 15, fkFlowStepId: 1 }),
          ]),
        },
        4,
      );
    });
  });

  it("shows validation error when title is empty", async () => {
    const { toast } = await import("sonner");
    const user = userEvent.setup();

    render(
      <EditProblems
        steps={[baseStep]}
        problemsByStep={{}}
        defaultStepId={1}
        flowTypeId={4}
      />,
    );

    await user.click(screen.getByRole("button", { name: "添加题目" }));
    await user.click(screen.getByRole("button", { name: /保存/ }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("题目名称不能为空");
    });
    expect(mockUpdateProblems).not.toHaveBeenCalled();
  });

  it("shows validation error when score is empty or zero", async () => {
    const { toast } = await import("sonner");
    const user = userEvent.setup();

    render(
      <EditProblems
        steps={[baseStep]}
        problemsByStep={{}}
        defaultStepId={1}
        flowTypeId={4}
      />,
    );

    await user.click(screen.getByRole("button", { name: "添加题目" }));
    await user.type(screen.getByLabelText("题目名称"), "新题");
    await user.click(screen.getByRole("button", { name: /保存/ }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("分数必须为大于 0 的数字");
    });
    expect(mockUpdateProblems).not.toHaveBeenCalled();
  });

  it("shows empty state when no problems", () => {
    render(
      <EditProblems
        steps={[]}
        problemsByStep={{}}
        defaultStepId={0}
        flowTypeId={4}
      />,
    );

    expect(screen.getByText(/暂无题目/)).toBeTruthy();
  });
});
