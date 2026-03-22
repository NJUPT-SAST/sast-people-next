import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import ProbCheckBox from "./probCheckBox";
import { selectProbType } from "@/types/problem";

describe("ProbCheckBox", () => {
  it("toggles problems and saves the selected range", async () => {
    const user = userEvent.setup();
    const handleSave = jest.fn();

    const Wrapper = () => {
      const [selectedProbs, setSelectedProbs] = React.useState<
        selectProbType["problemList"]
      >([]);

      return (
        <ProbCheckBox
          probList={[
            { id: 1, title: "算法题", score: 100 },
            { id: 2, title: "设计题", score: 50 },
          ] as never}
          selectedProbs={selectedProbs}
          setSelectedProbs={setSelectedProbs}
          handleSave={handleSave}
        />
      );
    };

    render(<Wrapper />);

    const checkbox = screen.getAllByRole("checkbox")[0];
    expect(screen.getByText("已选 0 题")).toBeInTheDocument();

    await user.click(checkbox);
    expect(screen.getByText("已选 1 题")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "清空" }));
    expect(screen.getByText("已选 0 题")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "全选" }));
    expect(screen.getByText("已选 2 题")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存范围" }));

    expect(handleSave).toHaveBeenCalled();
  });

  it("shows the empty state when there is no problem list", () => {
    render(
      <ProbCheckBox
        probList={[]}
        selectedProbs={[]}
        setSelectedProbs={jest.fn()}
        handleSave={jest.fn()}
      />,
    );

    expect(screen.getByText("当前流程下没有可用于阅卷的题目。")).toBeInTheDocument();
  });
});
