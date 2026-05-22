import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ExperienceInfo } from "./experience";

const mockEditExperience = jest.fn().mockResolvedValue(undefined);
const mockToast = jest.fn();

jest.mock("@/action/user/userInfo", () => ({
  editExperience: (...args: unknown[]) => mockEditExperience(...args),
}));

jest.mock("sonner", () => ({
  toast: {
    promise: (...args: unknown[]) => mockToast(...args),
  },
}));

describe("ExperienceInfo", () => {
  beforeEach(() => {
    mockEditExperience.mockClear();
    mockToast.mockClear();
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
      expect(mockEditExperience).toHaveBeenCalled();
    });
  });
});
