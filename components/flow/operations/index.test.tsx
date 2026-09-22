import { render, screen } from "@testing-library/react";

import { Operations } from "./index";

jest.mock("./editSteps", () => ({
  EditSteps: () => <div>edit-steps</div>,
}));

jest.mock("./delete", () => ({
  Delete: () => <div>delete-flow</div>,
}));

jest.mock("./duplicate", () => ({
  Duplicate: () => <div>duplicate-flow</div>,
}));

describe("Operations", () => {
  it("uses the unified flow editor for written recruitment flows", () => {
    render(<Operations data={{ id: 15, type: "recruitment" } as never} />);

    expect(screen.getByText("edit-steps")).toBeInTheDocument();
    expect(screen.getByText("duplicate-flow")).toBeInTheDocument();
    expect(screen.getByText("delete-flow")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "编辑笔试" })).not.toBeInTheDocument();
  });

  it("does not expose exam-only controls for non-written flows", () => {
    render(<Operations data={{ id: 15, type: "woc" } as never} />);

    expect(screen.getByText("edit-steps")).toBeInTheDocument();
    expect(screen.getByText("duplicate-flow")).toBeInTheDocument();
    expect(screen.getByText("delete-flow")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "编辑笔试" })).not.toBeInTheDocument();
  });
});
