import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SearchInput } from "./searchInput";

jest.mock("react", () => {
  const actual = jest.requireActual("react");
  return {
    ...actual,
    useDeferredValue: <T,>(value: T) => value,
    useTransition: () => [false, (callback: () => void) => callback()],
  };
});

const push = jest.fn();
const stableSearchParams = new URLSearchParams("page=3&tab=all");

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/dashboard/manage",
  useSearchParams: () => stableSearchParams,
}));

describe("SearchInput", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("pushes a reset-page search query when the text changes", async () => {
    const user = userEvent.setup();

    render(<SearchInput defaultValue="旧值" />);

    await user.clear(screen.getByPlaceholderText("搜索用户..."));
    await user.type(screen.getByPlaceholderText("搜索用户..."), "新值");

    await waitFor(() => {
      expect(push).toHaveBeenLastCalledWith(
        "/dashboard/manage?page=1&tab=all&search=%E6%96%B0%E5%80%BC",
      );
    });
  });
});
