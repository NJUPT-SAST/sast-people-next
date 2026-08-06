import { render, screen } from "@testing-library/react";
import { act } from "react";

import { ReviewRangeNotice, SelectedRangeDisplay } from "./selectedRangeDisplay";

describe("SelectedRangeDisplay", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the empty state without stored range", () => {
    render(<SelectedRangeDisplay />);

    expect(screen.getByText("未设置阅卷范围")).toBeInTheDocument();
  });

  it("shows the notice only when a review range is missing", () => {
    render(<ReviewRangeNotice />);

    expect(
      screen.getByText("请先设置上方【阅卷范围】，再开始阅卷。"),
    ).toBeInTheDocument();

    act(() => {
      window.localStorage.setItem(
        "people_selectedProbs",
        JSON.stringify({
          flowTypeId: 1,
          stepId: 2,
          problemList: [{ id: 3, name: "算法题", maxPoint: 100 }],
        }),
      );
      window.dispatchEvent(new Event("reviewRangeUpdated"));
    });

    expect(
      screen.queryByText("请先设置上方【阅卷范围】，再开始阅卷。"),
    ).not.toBeInTheDocument();
  });

  it("reads valid localStorage data and reacts to update events", async () => {
    window.localStorage.setItem(
      "people_selectedProbs",
      JSON.stringify({
        flowTypeId: 1,
        stepId: 2,
        problemList: [{ id: 3, name: "算法题", maxPoint: 100 }],
      }),
    );

    render(<SelectedRangeDisplay />);
    expect(await screen.findByText("算法题 (100分)")).toBeInTheDocument();

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
