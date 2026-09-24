import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MannualInput } from "./mannualInput";

const push = jest.fn();
const findUserByStuID = jest.fn();
const resolveUserFlowForReview = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

jest.mock("./checkUser", () => ({
  findUserByStuID: (...args: Parameters<typeof findUserByStuID>) =>
    findUserByStuID(...args),
}));

jest.mock("./resolveUserFlow", () => ({
  resolveUserFlowForReview: (
    ...args: Parameters<typeof resolveUserFlowForReview>
  ) => resolveUserFlowForReview(...args),
}));

describe("MannualInput", () => {
  beforeEach(() => {
    push.mockClear();
    findUserByStuID.mockReset();
    resolveUserFlowForReview.mockReset();
    findUserByStuID.mockResolvedValue({
      id: 8,
      name: "张三",
      studentId: "2026001",
      college: "计算机学院",
      major: "软件工程",
    });
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

    expect(findUserByStuID).toHaveBeenCalledWith("2026001");
    expect(screen.getByRole("dialog")).toHaveTextContent("张三");
    expect(push).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认进入阅卷" }));
    expect(resolveUserFlowForReview).toHaveBeenCalledWith("2026001", 1);
    expect(push).toHaveBeenCalledWith("/dashboard/review/marking?user=2026001");
  });
});
