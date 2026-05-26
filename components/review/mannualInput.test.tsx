import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MannualInput } from "./mannualInput";

const push = jest.fn();
const checkUserByStuID = jest.fn();
const resolveUserFlowForReview = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

jest.mock("./checkUser", () => ({
  checkUserByStuID: (...args: Parameters<typeof checkUserByStuID>) =>
    checkUserByStuID(...args),
}));

jest.mock("./resolveUserFlow", () => ({
  resolveUserFlowForReview: (
    ...args: Parameters<typeof resolveUserFlowForReview>
  ) => resolveUserFlowForReview(...args),
}));

describe("MannualInput", () => {
  beforeEach(() => {
    push.mockClear();
    checkUserByStuID.mockReset();
    resolveUserFlowForReview.mockReset();
    checkUserByStuID.mockResolvedValue(true);
    resolveUserFlowForReview.mockResolvedValue({ success: true, userFlowId: 8 });
    window.localStorage.clear();
    window.localStorage.setItem(
      "people_selectedProbs",
      JSON.stringify({
        flowTypeId: 1,
        stepId: 2,
        problemList: [{ id: 3, name: "算法题", maxPoint: 100 }],
      }),
    );
  });

  it("navigates to the marking route once a student id is provided", async () => {
    const user = userEvent.setup();

    render(<MannualInput />);

    const button = screen.getByRole("button", { name: "开始阅卷" });
    expect(button).toBeDisabled();

    await user.type(screen.getByPlaceholderText("请输入考生学号"), "2026001");
    await user.click(button);

    expect(checkUserByStuID).toHaveBeenCalledWith("2026001");
    expect(resolveUserFlowForReview).toHaveBeenCalledWith("2026001", 1);
    expect(push).toHaveBeenCalledWith("/dashboard/review/marking?user=2026001");
  });
});
