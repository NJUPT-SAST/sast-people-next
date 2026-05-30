import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ExperienceInfo } from "./experience";

describe("ExperienceInfo", () => {
  it("renders readonly experience fields and links to Link", async () => {
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

    await user.click(screen.getByRole("link", { name: "前往 Link 修改" }));

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("请填写你的GitHub主页地址"),
      ).toBeDisabled();
      expect(screen.getByPlaceholderText("请填写你的博客地址")).toBeDisabled();
      expect(screen.getByPlaceholderText("请填写你的个人介绍")).toBeDisabled();
    });
  });
});
