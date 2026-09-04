import { render, screen } from "@testing-library/react";

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

    expect(screen.getByText("张三")).toBeInTheDocument();
    expect(screen.getByText("b001")).toBeInTheDocument();
    expect(screen.getByText("13800138000")).toBeInTheDocument();
    expect(screen.getByText("123456")).toBeInTheDocument();
    expect(screen.getByText("计算机学院")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "前往 Link 修改" }),
    ).toBeInTheDocument();
  });

  it("links to Link for edits", () => {
    render(<BasicInfo initialInfo={initialInfo as never} />);
    expect(screen.getByRole("link", { name: "前往 Link 修改" })).toBeInTheDocument();
  });
});
