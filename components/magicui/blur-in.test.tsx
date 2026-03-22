import { render, screen } from "@testing-library/react";

import BlurIn from "./blur-in";

jest.mock("framer-motion", () => ({
  motion: {
    h1: ({
      children,
      transition,
      variants,
      ...props
    }: React.ComponentProps<"h1"> & {
      transition?: { duration?: number };
      variants?: {
        hidden?: { filter?: string };
        visible?: { filter?: string };
      };
    }) => (
      <h1
        data-duration={transition?.duration}
        data-hidden-filter={variants?.hidden?.filter}
        data-visible-filter={variants?.visible?.filter}
        {...props}
      >
        {children}
      </h1>
    ),
  },
}));

describe("BlurIn", () => {
  it("renders the word with default variants and classes", () => {
    render(<BlurIn word="SAST" className="custom-class" />);

    const heading = screen.getByRole("heading", { name: "SAST" });
    expect(heading).toHaveClass("custom-class");
    expect(heading).toHaveAttribute("data-duration", "1");
    expect(heading).toHaveAttribute("data-hidden-filter", "blur(10px)");
    expect(heading).toHaveAttribute("data-visible-filter", "blur(0px)");
  });

  it("uses a caller-provided variant and duration", () => {
    render(
      <BlurIn
        word="Hello"
        duration={2.5}
        variant={{
          hidden: { filter: "blur(4px)", opacity: 0.2 },
          visible: { filter: "blur(1px)", opacity: 0.9 },
        }}
      />,
    );

    const heading = screen.getByRole("heading", { name: "Hello" });
    expect(heading).toHaveAttribute("data-duration", "2.5");
    expect(heading).toHaveAttribute("data-hidden-filter", "blur(4px)");
    expect(heading).toHaveAttribute("data-visible-filter", "blur(1px)");
  });
});
