import { render, screen } from "@testing-library/react";

import { columns } from "./columns";

const getColumnKey = (column: (typeof columns)[number]) =>
  column.id ?? ("accessorKey" in column ? column.accessorKey : undefined);

describe("recruitment columns", () => {
  it("exposes the expected data columns", () => {
    expect(columns.map(getColumnKey)).toEqual([
      "select",
      "studentId",
      "name",
      "phoneNumber",
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
