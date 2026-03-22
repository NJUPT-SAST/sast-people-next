import { render, screen } from "@testing-library/react";

import { Operations } from "./index";

jest.mock("./editSteps", () => ({
  EditSteps: () => <div>edit-steps</div>,
}));

jest.mock("./delete", () => ({
  Delete: () => <div>delete-flow</div>,
}));

describe("Operations", () => {
  it("renders edit, exam link, and delete actions", () => {
    render(<Operations data={{ id: 15 } as never} />);

    expect(screen.getByText("edit-steps")).toBeInTheDocument();
    expect(screen.getByText("delete-flow")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "编辑笔试" })).toHaveAttribute(
      "href",
      "/dashboard/flow/edit-exam?id=15",
    );
  });
});
