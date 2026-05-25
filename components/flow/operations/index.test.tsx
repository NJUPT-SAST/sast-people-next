import { render, screen } from "@testing-library/react";

import { Operations } from "./index";

jest.mock("./editSteps", () => ({
  EditSteps: () => <div>edit-steps</div>,
}));

jest.mock("./delete", () => ({
  Delete: () => <div>delete-flow</div>,
}));

describe("Operations", () => {
  it("renders exam link for written recruitment flows", () => {
    render(<Operations data={{ id: 15, type: "recruitment" } as never} />);

    expect(screen.getByText("edit-steps")).toBeInTheDocument();
    expect(screen.getByText("delete-flow")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "编辑笔试" })).toHaveAttribute(
      "href",
      "/dashboard/flow/edit-exam?id=15",
    );
  });

  it("hides exam link for non-written flows", () => {
    render(<Operations data={{ id: 15, type: "woc" } as never} />);

    expect(screen.getByText("edit-steps")).toBeInTheDocument();
    expect(screen.getByText("delete-flow")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "编辑笔试" })).not.toBeInTheDocument();
  });
});
