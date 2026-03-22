import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BasicInfo } from "./basic";

const editBasicInfo = jest.fn().mockResolvedValue(undefined);
const toastPromise = jest.fn();

jest.mock("@/action/user/userInfo", () => ({
  editBasicInfo: (...args: unknown[]) => editBasicInfo(...args),
}));

jest.mock("@/hooks/useCollegeList", () => ({
  useCollegeList: () => ["计算机学院", "软件学院"],
}));

jest.mock("sonner", () => ({
  toast: {
    promise: (...args: unknown[]) => toastPromise(...args),
  },
}));

describe("BasicInfo", () => {
  const initialInfo = {
    id: 1,
    name: "张三",
    studentId: "b001",
    phone: "13800138000",
    email: "user@example.com",
    college: "计算机学院",
    major: "软件工程",
  } as const;

  beforeEach(() => {
    editBasicInfo.mockClear();
    toastPromise.mockClear();
  });

  it("renders the initial form values", () => {
    render(<BasicInfo initialInfo={initialInfo as never} />);

    expect(screen.getByDisplayValue("张三")).toBeInTheDocument();
    expect(screen.getByDisplayValue("b001")).toBeDisabled();
    expect(screen.getByDisplayValue("13800138000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
  });

  it("submits edited values through the save action", async () => {
    const user = userEvent.setup();

    render(<BasicInfo initialInfo={initialInfo as never} />);

    await user.clear(screen.getByDisplayValue("张三"));
    await user.type(screen.getByPlaceholderText("请填写你的真实姓名"), "李四");
    await user.clear(screen.getByDisplayValue("软件工程"));
    await user.type(
      screen.getByPlaceholderText("请填写你目前所在的专业"),
      "信息安全",
    );
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(toastPromise).toHaveBeenCalled();
      expect(editBasicInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "李四",
          major: "信息安全",
          studentId: "b001",
        }),
      );
    });
  });
});
