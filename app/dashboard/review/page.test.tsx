import { render, screen } from "@testing-library/react";

import Review from "./page";
import { useFlowList } from "@/hooks/useFlowList";

jest.mock("@/hooks/useFlowList", () => ({
  useFlowList: jest.fn(),
}));
jest.mock("@/components/route", () => ({
  PageHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  PageTitle: () => <h1>阅卷</h1>,
}));
jest.mock("@/components/review/qrcodeScanner", () => ({
  __esModule: true,
  default: ({ activeFlowIds }: { activeFlowIds: number[] }) => (
    <output data-testid="scanner-flow-ids">{activeFlowIds.join(",")}</output>
  ),
}));
jest.mock("@/components/review/mannualInput", () => ({
  MannualInput: () => null,
}));
jest.mock("./selectProblem", () => ({
  SelectProblemServer: ({ flowList }: { flowList: { id: number }[] }) => (
    <output data-testid="selectable-flow-ids">
      {flowList.map((flow) => flow.id).join(",")}
    </output>
  ),
}));
jest.mock("@/components/review/selectedRangeDisplay", () => ({
  ReviewRangeNotice: () => null,
  SelectedRangeDisplay: () => null,
}));
jest.mock("@/components/review/reviewSheet", () => ({
  ReviewSheet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockUseFlowList = jest.mocked(useFlowList);

describe("Review", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-15T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("only exposes flows that have started and not ended", async () => {
    mockUseFlowList.mockResolvedValue([
      {
        id: 1,
        title: "未来流程",
        description: null,
        type: "recruitment",
        ownerId: 1,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        startedAt: new Date("2026-08-16T00:00:00.000Z"),
        endedAt: null,
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
        isDeleted: false,
      },
      {
        id: 2,
        title: "活动流程",
        description: null,
        type: "recruitment",
        ownerId: 1,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        startedAt: new Date("2026-08-14T00:00:00.000Z"),
        endedAt: null,
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
        isDeleted: false,
      },
      {
        id: 3,
        title: "已结束流程",
        description: null,
        type: "recruitment",
        ownerId: 1,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        startedAt: new Date("2026-08-01T00:00:00.000Z"),
        endedAt: new Date("2026-08-14T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
        isDeleted: false,
      },
    ]);

    render(await Review());

    expect(screen.getByTestId("selectable-flow-ids")).toHaveTextContent("2");
    expect(screen.getByTestId("scanner-flow-ids")).toHaveTextContent("2");
  });
});
