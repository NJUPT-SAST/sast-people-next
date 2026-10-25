import { render, screen } from "@testing-library/react";

import { CollectionManageActions } from "./collection-manage-actions";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

jest.mock("@/action/collection", () => ({
  deleteCollectionForm: jest.fn(),
  duplicateCollectionForm: jest.fn(),
  setCollectionFormStatus: jest.fn(),
}));

const renderActions = (overrides: {
  status: string;
  phase: "upcoming" | "open" | "closed";
  deadlinePassed: boolean;
}) =>
  render(
    <CollectionManageActions
      formId={1}
      exportHref="/dashboard/collection/1/export"
      shareToken="token"
      {...overrides}
    />,
  );

describe("CollectionManageActions", () => {
  it("still allows closing an open form after its deadline passed", () => {
    renderActions({ status: "open", phase: "closed", deadlinePassed: true });

    expect(screen.getByRole("button", { name: "结束收集" })).toBeEnabled();
    expect(screen.getByText(/可手动结束收集/)).toBeInTheDocument();
  });

  it("disables reopening once the deadline passed", () => {
    renderActions({ status: "closed", phase: "closed", deadlinePassed: true });

    expect(screen.getByRole("button", { name: "已截止" })).toBeDisabled();
    expect(screen.getByText(/请先编辑收集表延长截止时间/)).toBeInTheDocument();
  });

  it("allows reopening a closed form whose deadline is still in the future", () => {
    renderActions({ status: "closed", phase: "closed", deadlinePassed: false });

    expect(screen.getByRole("button", { name: "恢复收集" })).toBeEnabled();
  });
});