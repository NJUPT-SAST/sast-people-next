import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AddFlow } from "./add";

const mockAddFlow = jest.fn().mockResolvedValue(undefined);
const mockToastPromise = jest.fn((cb: () => Promise<unknown>) => cb());

jest.mock("@/action/flow/add", () => ({
  addFlow: (...args: Parameters<typeof mockAddFlow>) => mockAddFlow(...args),
}));

jest.mock("sonner", () => ({
  toast: {
    promise: (...args: Parameters<typeof mockToastPromise>) =>
      mockToastPromise(...args),
  },
}));

jest.mock("../ui/datetime-input", () => ({
  DateTimeInput: ({
    value,
    onChange,
  }: {
    value?: Date;
    onChange?: (value?: Date) => void;
  }) => (
    <input
      type="datetime-local"
      aria-label={value ? value.toISOString() : "datetime"}
      onChange={(event) => onChange?.(new Date(event.target.value))}
    />
  ),
}));

describe("AddFlow", () => {
  beforeEach(() => {
    mockAddFlow.mockClear();
    mockToastPromise.mockClear();
  });

  it("opens the dialog and submits the filled form", async () => {
    const user = userEvent.setup();

    render(<AddFlow />);

    await user.click(screen.getByRole("button", { name: "添加流程" }));
    await user.type(
      screen.getByPlaceholderText("填写展示的流程名称"),
      "2026 招新笔试",
    );
    await user.type(
      screen.getByPlaceholderText("填写展示的流程描述"),
      "第一阶段说明",
    );

    const inputs = screen.getAllByLabelText("datetime");
    await user.type(inputs[0], "2026-03-22T09:00");
    await user.type(inputs[1], "2026-03-22T18:00");
    await user.click(screen.getByRole("button", { name: "确认添加" }));

    await waitFor(() => {
      expect(mockToastPromise).toHaveBeenCalled();
      expect(mockAddFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "2026 招新笔试",
          description: "第一阶段说明",
          startedAt: expect.any(Date),
          endedAt: expect.any(Date),
        }),
      );
    });
  });
});
