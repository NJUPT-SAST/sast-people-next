import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

jest.mock("@/components/manage/viewUserInfoSheet", () => ({
  ViewUserInfoSheet: ({ trigger }: { trigger?: ReactNode }) => (
    <div>{trigger}</div>
  ),
}));

import { makeColumns } from "@/components/recruitment/columns";

const columns = makeColumns(3);

const nameColumn = columns.find(
  (column) => "accessorKey" in column && column.accessorKey === "name",
);

const getColumnKey = (column: (typeof columns)[number]) =>
  column.id ?? ("accessorKey" in column ? column.accessorKey : undefined);

describe("recruitment columns", () => {
  it("renders the candidate name as a clickable details trigger", () => {
    const cell = nameColumn?.cell as
      | ((props: never) => ReactNode)
      | undefined;
    expect(typeof cell).toBe("function");

    render(
      <>
        {cell?.({
          row: { original: { uid: 42, name: "张三", studentId: "2026001" } },
          getValue: () => "张三",
        } as never)}
      </>,
    );

    expect(screen.getByRole("button", { name: "张三" })).toBeInTheDocument();
  });

  it("exposes the expected data columns", () => {
    expect(columns.map(getColumnKey)).toEqual([
      "select",
      "studentId",
      "name",
      "status",
      "problemScores",
      "totalScore",
    ]);
  });

  it("filters rows by total score", () => {
    const totalScoreColumn = columns.find(
      (column) => "accessorKey" in column && column.accessorKey === "totalScore",
    );

    expect(typeof totalScoreColumn?.filterFn).toBe("function");

    if (typeof totalScoreColumn?.filterFn !== "function") {
      throw new Error("Expected totalScore column to expose a filter function");
    }

    expect(
      totalScoreColumn.filterFn(
        { original: { totalScore: "90" } } as never,
        "totalScore",
        "80",
        () => undefined,
      ),
    ).toBe(true);
    expect(
      totalScoreColumn.filterFn(
        { original: { totalScore: "70" } } as never,
        "totalScore",
        "80",
        () => undefined,
      ),
    ).toBe(false);
  });

  it("renders the placeholder Table component as empty", () => {
    const { Table } = jest.requireActual("./columns") as typeof import("./columns");
    const { container } = render(<Table />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
