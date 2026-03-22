import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import ProbCheckBox from "./probCheckBox";
import { selectProbType } from "@/types/problem";

describe("ProbCheckBox", () => {
  it("adds and removes selected problems before saving", async () => {
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
    await user.click(checkbox);
    await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: "提交" }));

    expect(handleSave).toHaveBeenCalled();
  });

  it("renders nothing when there is no problem list", () => {
    const { container } = render(
      <ProbCheckBox
        probList={null as never}
        selectedProbs={[]}
        setSelectedProbs={jest.fn()}
        handleSave={jest.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
