import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SelectFlow } from "./selectFlow";

jest.mock("../ui/select", () => {
  const SelectContext = React.createContext<{
    onValueChange?: (value: string) => void;
  }>({});

  return {
    Select: ({
      children,
      onValueChange,
    }: {
      children: React.ReactNode;
      onValueChange?: (value: string) => void;
    }) => (
      <SelectContext.Provider value={{ onValueChange }}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => (
      <span>{placeholder}</span>
    ),
    SelectContent: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    SelectItem: ({
      children,
      value,
    }: {
      children: React.ReactNode;
      value: string;
    }) => {
      const { onValueChange } = React.useContext(SelectContext);
      return (
        <button type="button" onClick={() => onValueChange?.(value)}>
          {children}
        </button>
      );
    },
  };
});

describe("SelectFlow", () => {
  it("calls onChange when a flow is selected", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(
      <SelectFlow
        flowTypes={
          [
            { id: 1, title: "笔试" },
            { id: 2, title: "面试" },
          ] as never
        }
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "面试" }));

    expect(onChange).toHaveBeenCalledWith("2");
  });
});
