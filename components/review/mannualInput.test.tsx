import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MannualInput } from "./mannualInput";

const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("MannualInput", () => {
  beforeEach(() => {
    push.mockClear();
    window.localStorage.clear();
  });

  it("navigates to the marking route once a student id is provided", async () => {
    const user = userEvent.setup();

    render(<MannualInput />);

    const button = screen.getByRole("button", { name: "开始阅卷" });
    expect(button).toBeDisabled();

    await user.type(screen.getByPlaceholderText("请输入考生学号"), "2026001");
    await user.click(button);

    expect(push).toHaveBeenCalledWith("/dashboard/review/marking?user=2026001");
  });
});
