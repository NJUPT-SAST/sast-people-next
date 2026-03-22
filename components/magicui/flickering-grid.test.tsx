import { render } from "@testing-library/react";
import { act } from "react";

import FlickeringGrid from "./flickering-grid";

type IntersectionObserverCallback = (
  entries: Array<{ isIntersecting: boolean }>,
) => void;

const observe = jest.fn();
const disconnect = jest.fn();
const requestAnimationFrameMock = jest.fn(() => 1);

let intersectionCallback: IntersectionObserverCallback | undefined;

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: jest.fn(() => ({
      clearRect: jest.fn(),
      fillRect: jest.fn(),
      getImageData: jest.fn(() => ({ data: [10, 20, 30, 255] })),
      set fillStyle(_value: string) {},
    })),
  });

  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    writable: true,
    value: jest.fn((callback: IntersectionObserverCallback) => {
      intersectionCallback = callback;
      return {
        observe,
        disconnect,
      };
    }),
  });

  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    writable: true,
    value: requestAnimationFrameMock,
  });

  Object.defineProperty(window, "cancelAnimationFrame", {
    configurable: true,
    writable: true,
    value: jest.fn(),
  });
});

beforeEach(() => {
  observe.mockClear();
  disconnect.mockClear();
  requestAnimationFrameMock.mockClear();
  intersectionCallback = undefined;
});

describe("FlickeringGrid", () => {
  it("renders a canvas with explicit sizing and observer wiring", () => {
    const { container } = render(
      <FlickeringGrid width={120} height={60} className="extra-grid" />,
    );

    const canvas = container.querySelector("canvas");
    expect(canvas?.tagName).toBe("CANVAS");
    expect(canvas).toHaveClass("extra-grid");
    expect(canvas).toHaveAttribute("width", "120");
    expect(canvas).toHaveAttribute("height", "60");
    expect(observe).toHaveBeenCalled();
  });

  it("starts animation when the canvas enters view", () => {
    render(<FlickeringGrid width={40} height={40} />);

    act(() => {
      intersectionCallback?.([{ isIntersecting: true }]);
    });

    expect(requestAnimationFrameMock).toHaveBeenCalled();
  });
});
