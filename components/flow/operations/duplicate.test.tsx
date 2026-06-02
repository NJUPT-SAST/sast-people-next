import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Duplicate } from "./duplicate";

const duplicateFlow = jest.fn().mockResolvedValue(undefined);
const toastPromise = jest.fn();

jest.mock("@/action/flow/duplicate", () => ({
  duplicateFlow: (...args: unknown[]) => duplicateFlow(...args),
}));

jest.mock("sonner", () => ({
  toast: {
    promise: (...args: unknown[]) => toastPromise(...args),
  },
}));

describe("Duplicate", () => {
  beforeEach(() => {
    duplicateFlow.mockClear();
    toastPromise.mockClear();
  });

  it("confirms and duplicates the selected flow", async () => {
    const user = userEvent.setup();

    render(<Duplicate data={{ id: 9 } as never} />);

    await user.click(screen.getByRole("button", { name: "复制" }));
    await user.click(screen.getByRole("button", { name: "确认复制" }));

    await waitFor(() => {
      expect(duplicateFlow).toHaveBeenCalledWith(9);
      expect(toastPromise).toHaveBeenCalled();
    });
  });
});
