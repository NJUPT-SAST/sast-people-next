import { render, screen } from "@testing-library/react";

import { FlowTable, FlowTableColumns } from "./table";

jest.mock("./operations", () => ({
  Operations: ({ data }: { data: { id: number } }) => <div>ops-{data.id}</div>,
}));

jest.mock("@/lib/dayjs", () => {
  return (date: Date) => ({
    format: () => `formatted:${date.toISOString()}`,
  });
});

describe("FlowTable", () => {
  it("renders headers, formatted dates, and operations", () => {
    render(
      <FlowTable
        columns={FlowTableColumns}
        data={[
          {
            id: 3,
            title: "宣讲会",
            description: "线下宣讲",
            startedAt: new Date("2026-03-22T09:00:00.000Z"),
            endedAt: new Date("2026-03-22T18:00:00.000Z"),
          },
        ] as never}
      />,
    );

    expect(screen.getByText("名称")).toBeInTheDocument();
    expect(screen.getByText("宣讲会")).toBeInTheDocument();
    expect(
      screen.getByText("formatted:2026-03-22T09:00:00.000Z"),
    ).toBeInTheDocument();
    expect(screen.getByText("ops-3")).toBeInTheDocument();
  });

  it("shows the empty table state when there is no data", () => {
    render(<FlowTable columns={FlowTableColumns} data={[]} />);

    expect(screen.getByText("暂时没有内容")).toBeInTheDocument();
  });
});
