import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BasicInfo } from "./basic";

describe("BasicInfo", () => {
  const initialInfo = {
    id: 1,
    name: "张三",
    studentId: "b001",
    phone: "13800138000",
    email: "user@example.com",
    college: "计算机学院",
    major: "软件工程",
    qq: "123456",
  } as const;

  it("renders the initial readonly values", () => {
    render(<BasicInfo initialInfo={initialInfo as never} />);

    expect(screen.getByDisplayValue("张三")).toBeInTheDocument();
    expect(screen.getByDisplayValue("b001")).toBeDisabled();
    expect(screen.getByDisplayValue("13800138000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("123456")).toBeInTheDocument();
    expect(screen.getByDisplayValue("计算机学院")).toBeDisabled();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "前往 Link 修改" }),
    ).toBeInTheDocument();
  });

  it("keeps fields readonly and links to Link", async () => {
    const user = userEvent.setup();

    render(<BasicInfo initialInfo={initialInfo as never} />);

    await user.click(screen.getByRole("link", { name: "前往 Link 修改" }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("请填写你的真实姓名")).toBeDisabled();
      expect(
        screen.getByPlaceholderText("请填写你目前所在的专业"),
      ).toBeDisabled();
    });
  });
});
