import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import { ViewUserInfoSheet } from "./viewUserInfoSheet";

jest.mock("@/hooks/useUserInfoById", () => ({
  useUserInfoById: jest.fn().mockResolvedValue({
    id: 42,
    name: "张三",
    role: 2,
  }),
}));

describe("ViewUserInfoSheet", () => {
  it("shows the role as read-only for administrators", async () => {
    const user = userEvent.setup();

    render(
      <ViewUserInfoSheet
        userInfo={
          { id: 42, name: "张三", role: 2 } satisfies ComponentProps<
            typeof ViewUserInfoSheet
          >["userInfo"]
        }
        currentUserRole={3}
      />,
    );

    await user.click(screen.getByRole("button"));

    expect(await screen.findByText("权限")).toBeInTheDocument();
    expect(screen.getAllByText("讲师").length).toBeGreaterThan(0);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
