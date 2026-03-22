import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ExperienceInfo } from "./experience";

const mockToastSuccess = jest.fn();

jest.mock("sonner", () => ({
  toast: {
    success: (...args: Parameters<typeof mockToastSuccess>) =>
      mockToastSuccess(...args),
  },
}));

describe("ExperienceInfo", () => {
  beforeEach(() => {
    mockToastSuccess.mockClear();
  });

  it("renders editable experience fields and submits them", async () => {
    const user = userEvent.setup();

    render(
      <ExperienceInfo
        initialInfo={
          {
            github: "https://github.com/old",
            blog: "",
            personalStatement: "old intro",
          } as never
        }
      />,
    );

    expect(screen.getByText("我的能力")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("请填写你的GitHub主页地址"),
    ).toHaveValue("https://github.com/old");
    expect(
      screen.getByPlaceholderText("请填写你的个人介绍"),
    ).toHaveValue("old intro");

    await user.type(
      screen.getByPlaceholderText("请填写你的博客地址"),
      "https://blog.example.com",
    );
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("个人信息保存成功");
    });
  });
});
