import { render, screen } from "@testing-library/react";

import { ExperienceInfo } from "./experience";

describe("ExperienceInfo", () => {
  it("renders readonly experience fields and links to Link", () => {
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
    expect(screen.getByText("https://github.com/old")).toBeInTheDocument();
    expect(screen.getByText("old intro")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "前往 Link 修改" })).toBeInTheDocument();
  });
});
