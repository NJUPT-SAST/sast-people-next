import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EditUserInfoDialog } from "./editUserInfoDialog";

const mockEditBasicInfoByUid = jest.fn().mockResolvedValue(undefined);
const mockToastSuccess = jest.fn();

jest.mock("@/action/user/userInfo", () => ({
  editBasicInfoByUid: (...args: Parameters<typeof mockEditBasicInfoByUid>) =>
    mockEditBasicInfoByUid(...args),
}));

jest.mock("sonner", () => ({
  toast: {
    success: (...args: Parameters<typeof mockToastSuccess>) =>
      mockToastSuccess(...args),
  },
}));

jest.mock("../ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("EditUserInfoDialog", () => {
  beforeEach(() => {
    mockEditBasicInfoByUid.mockClear();
    mockToastSuccess.mockClear();
  });

  it("submits the edited user info", async () => {
    const user = userEvent.setup();

    render(
      <EditUserInfoDialog
        userInfo={{
          id: 2,
          name: "原姓名",
          studentId: "2026001",
          phone: "13800138000",
          email: "old@example.com",
          college: "计算机学院",
          major: "软件工程",
        } as never}
        colleges={[]}
      />,
    );

    await user.clear(screen.getByDisplayValue("原姓名"));
    await user.type(screen.getByPlaceholderText("请填写你的真实姓名"), "新姓名");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mockEditBasicInfoByUid).toHaveBeenCalledWith(
        2,
        expect.objectContaining({ name: "新姓名", studentId: "2026001" }),
      );
      expect(mockToastSuccess).toHaveBeenCalledWith("原姓名 的信息保存成功");
    });
  });
});
