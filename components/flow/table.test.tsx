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

    expect(screen.getAllByText("名称")[0]).toBeInTheDocument();
    expect(screen.getAllByText("宣讲会")[0]).toBeInTheDocument();
    expect(
      screen.getAllByText("formatted:2026-03-22T09:00:00.000Z")[0],
    ).toBeInTheDocument();
    expect(screen.getAllByText("ops-3")[0]).toBeInTheDocument();
  });

  it("shows the empty table state when there is no data", () => {
    render(<FlowTable columns={FlowTableColumns} data={[]} />);

    expect(screen.getAllByText("暂时没有内容")[0]).toBeInTheDocument();
  });
});
