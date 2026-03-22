import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle } from "./theme-toggle";

const setTheme = jest.fn();
const useThemeMock = jest.fn();

jest.mock("next-themes", () => ({
  useTheme: () => useThemeMock(),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders a dark mode action when the active theme is light", () => {
    useThemeMock.mockReturnValue({
      resolvedTheme: "light",
      setTheme,
    });

    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: "切换到深色模式" });
    fireEvent.click(button);

    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("renders a light mode action when the active theme is dark", () => {
    useThemeMock.mockReturnValue({
      resolvedTheme: "dark",
      setTheme,
    });

    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: "切换到浅色模式" });
    fireEvent.click(button);

    expect(setTheme).toHaveBeenCalledWith("light");
  });
});
