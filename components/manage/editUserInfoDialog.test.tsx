import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EditUserInfoDialog } from "./editUserInfoDialog";

jest.mock("../ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("EditUserInfoDialog", () => {
  it("displays user info", async () => {
    const user = userEvent.setup();

    render(
      <EditUserInfoDialog
        userInfo={{
          id: 2,
          name: "张三",
          studentId: "101",
          phone: "13800138000",
          email: "zs@example.com",
          college: "计算机学院",
          major: "软件工程",
          github: "https://github.com/test",
          blog: "",
          personalStatement: "自我介绍",
        } as never}
        role={2}
      />,
    );

    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);

    expect(screen.getByText("张三 的信息")).toBeInTheDocument();
    expect(screen.getByText("101")).toBeInTheDocument();
    expect(screen.getByText("13800138000")).toBeInTheDocument();
    expect(screen.getByText("zs@example.com")).toBeInTheDocument();
    expect(screen.getByText("计算机学院")).toBeInTheDocument();
    expect(screen.getByText("软件工程")).toBeInTheDocument();
    expect(screen.getByText("https://github.com/test")).toBeInTheDocument();
    expect(screen.getByText("自我介绍")).toBeInTheDocument();
  });
});
