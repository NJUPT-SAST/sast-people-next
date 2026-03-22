import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RemoveUserInfoDialog } from "./removeUserInfoDialog";

const banUser = jest.fn().mockResolvedValue(undefined);
const toastPromise = jest.fn();

jest.mock("@/action/user/ban", () => ({
  banUser: (...args: unknown[]) => banUser(...args),
}));

jest.mock("sonner", () => ({
  toast: {
    promise: (...args: unknown[]) => toastPromise(...args),
  },
}));

jest.mock("../ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("RemoveUserInfoDialog", () => {
  it("calls banUser after confirmation", async () => {
    const user = userEvent.setup();

    render(<RemoveUserInfoDialog uid={18} />);

    await user.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(banUser).toHaveBeenCalledWith(18);
      expect(toastPromise).toHaveBeenCalled();
    });
  });
});
