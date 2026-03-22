import { render, screen } from "@testing-library/react";
import { act } from "react";

import { SelectedRangeDisplay } from "./selectedRangeDisplay";

describe("SelectedRangeDisplay", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the empty state without stored range", () => {
    render(<SelectedRangeDisplay />);

    expect(screen.getByText("未设置阅卷范围")).toBeInTheDocument();
  });

  it("reads valid localStorage data and reacts to update events", () => {
    window.localStorage.setItem(
      "people_selectedProbs",
      JSON.stringify({
        flowTypeId: 1,
        stepId: 2,
        problemList: [{ id: 3, name: "算法题", maxPoint: 100 }],
      }),
    );

    render(<SelectedRangeDisplay />);
    expect(screen.getByText("算法题 (100分)")).toBeInTheDocument();

    act(() => {
      window.localStorage.setItem(
        "people_selectedProbs",
        JSON.stringify({
          flowTypeId: 1,
          stepId: 2,
          problemList: [{ id: 4, name: "设计题", maxPoint: 50 }],
        }),
      );
      window.dispatchEvent(new Event("reviewRangeUpdated"));
    });

    expect(screen.getByText("设计题 (50分)")).toBeInTheDocument();
  });
});
