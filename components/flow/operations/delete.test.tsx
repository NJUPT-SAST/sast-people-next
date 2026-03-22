import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Delete } from "./delete";

const deleteFlow = jest.fn().mockResolvedValue(undefined);
const toastPromise = jest.fn();

jest.mock("@/action/flow/delete", () => ({
  deleteFlow: (...args: unknown[]) => deleteFlow(...args),
}));

jest.mock("sonner", () => ({
  toast: {
    promise: (...args: unknown[]) => toastPromise(...args),
  },
}));

describe("Delete", () => {
  it("confirms and deletes the selected flow", async () => {
    const user = userEvent.setup();

    render(<Delete data={{ id: 9 } as never} />);

    await user.click(screen.getAllByRole("button", { name: "删除" })[0]);
    await user.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => {
      expect(deleteFlow).toHaveBeenCalledWith(9);
      expect(toastPromise).toHaveBeenCalled();
    });
  });
});
