import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { DepartmentAssigner } from "./department-assigner";

const errorToast = jest.fn();

jest.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => errorToast(...args) },
}));

/* Radix Select 在 jsdom 里缺少指针能力，这里用最小实现暴露选项点击 */
jest.mock("@/components/ui/select", () => {
  const mockReact = jest.requireActual("react");
  const SelectContext = mockReact.createContext((_value: string) => {});

  return {
    Select: ({ children, onValueChange }: { children: ReactNode; onValueChange: (value: string) => void }) =>
      mockReact.createElement(SelectContext.Provider, { value: onValueChange }, children),
    SelectTrigger: ({ children }: { children: ReactNode }) =>
      mockReact.createElement("div", null, children),
    SelectValue: () => null,
    SelectContent: ({ children }: { children: ReactNode }) =>
      mockReact.createElement("div", null, children),
    SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
      const onValueChange = mockReact.useContext(SelectContext);
      return mockReact.createElement(
        "button",
        { type: "button", onClick: () => onValueChange(value) },
        children,
      );
    },
  };
});

describe("DepartmentAssigner", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("选择现存部门标识时回传该标识", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn().mockResolvedValue(undefined);

    render(<DepartmentAssigner value={null} departmentKeys={["software"]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /软件研发部/ }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("software"));
  });

  it("选择全局时回传 null", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn().mockResolvedValue(undefined);

    render(<DepartmentAssigner value="software" departmentKeys={["software"]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "全局（未归属部门）" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
  });

  it("手填新标识时使用输入值并收起输入框", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn().mockResolvedValue(undefined);

    render(<DepartmentAssigner value={null} departmentKeys={["software"]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "手填新部门标识…" }));
    const input = screen.getByLabelText("手填部门标识");
    await user.type(input, "media");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("media"));
    await waitFor(() => expect(screen.queryByLabelText("手填部门标识")).toBeNull());
  });

  it("保存失败时报错并保留当前选择", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn().mockRejectedValue(new Error("无权修改其他部门的流程"));

    render(<DepartmentAssigner value={null} departmentKeys={["software"]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /软件研发部/ }));

    await waitFor(() => expect(errorToast).toHaveBeenCalledWith("无权修改其他部门的流程"));
  });
});
