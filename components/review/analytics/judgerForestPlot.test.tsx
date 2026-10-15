import { render, screen } from "@testing-library/react";

import { JudgerForestPlot, type JudgerForestPlotRow } from "./judgerForestPlot";
import { JUDGER_VERDICT_META } from "./judgerVerdict";

function queryElement(container: HTMLElement, selector: string): SVGElement {
  const element = container.querySelector(selector);
  if (!element) throw new Error(`找不到元素：${selector}`);
  return element as SVGElement;
}

function makeRow(
  overrides: Partial<JudgerForestPlotRow> &
    Pick<JudgerForestPlotRow, "judgerId" | "name">,
): JudgerForestPlotRow {
  return {
    bias: 0,
    standardError: 0.01,
    observationCount: 20,
    credibility: 0.8,
    verdict: "fair",
    ...overrides,
  };
}

describe("JudgerForestPlot", () => {
  it("每名讲师渲染一个点，|bias| 越大圆心离 0 参考线越远", () => {
    const rows = [
      makeRow({ judgerId: 1, name: "甲", bias: 0.02, standardError: 0.01 }),
      makeRow({ judgerId: 2, name: "乙", bias: -0.09, standardError: 0.02, verdict: "strict" }),
      makeRow({ judgerId: 3, name: "丙", bias: -0.03, standardError: 0.01 }),
    ];
    const { container } = render(<JudgerForestPlot rows={rows} />);

    const points = Array.from(container.querySelectorAll('[data-part="point"]'));
    expect(points).toHaveLength(rows.length);

    const zeroX = Number(
      queryElement(container, '[data-part="reference-line"]').getAttribute("x1"),
    );
    const distanceFromZero = (judgerId: number) =>
      Math.abs(
        Number(
          queryElement(container, `[data-part="point"][data-judger-id="${judgerId}"]`).getAttribute(
            "cx",
          ),
        ) - zeroX,
      );

    expect(distanceFromZero(2)).toBeGreaterThan(distanceFromZero(3));
    expect(distanceFromZero(3)).toBeGreaterThan(distanceFromZero(1));
    /* 行按传入顺序自上而下排列 */
    expect(
      Number(queryElement(container, '[data-part="point"][data-judger-id="1"]').getAttribute("cy")),
    ).toBeLessThan(
      Number(queryElement(container, '[data-part="point"][data-judger-id="3"]').getAttribute("cy")),
    );
  });

  it("x 轴以 0 为中心对称且至少覆盖 ±5 个百分点", () => {
    const rows = [
      makeRow({ judgerId: 1, name: "甲", bias: 0.01, standardError: 0.005 }),
      makeRow({ judgerId: 2, name: "乙", bias: -0.01, standardError: 0.005 }),
    ];
    const { container } = render(<JudgerForestPlot rows={rows} />);

    const zeroX = Number(
      queryElement(container, '[data-part="reference-line"]').getAttribute("x1"),
    );
    const tickLabels = Array.from(container.querySelectorAll('[data-part="tick-label"]'));

    expect(tickLabels.map((node) => node.textContent)).toEqual(["-5%", "0", "+5%"]);

    const fivePercentX = Number(
      tickLabels.find((node) => node.textContent === "+5%")?.getAttribute("x"),
    );
    const minusFivePercentX = Number(
      tickLabels.find((node) => node.textContent === "-5%")?.getAttribute("x"),
    );
    expect(zeroX - minusFivePercentX).toBeCloseTo(fivePercentX - zeroX, 5);
  });

  it("刻度与 x 轴说明都排在绘图区下方", () => {
    const { container } = render(<JudgerForestPlot rows={[makeRow({ judgerId: 1, name: "甲" })]} />);

    const plotBottom = Number(
      queryElement(container, '[data-part="grid-line"]').getAttribute("y2"),
    );
    const tickLabels = Array.from(container.querySelectorAll('[data-part="tick-label"]'));
    expect(tickLabels.length).toBeGreaterThan(0);
    for (const label of tickLabels) {
      expect(Number(label.getAttribute("y"))).toBeGreaterThan(plotBottom);
    }

    const captionY = Number(
      queryElement(container, '[data-part="axis-caption"]').getAttribute("y"),
    );
    expect(captionY).toBeGreaterThan(Number(tickLabels[0].getAttribute("y")));
  });

  it("standardError 为 null 的行不画须线，点用可见的空心虚线", () => {
    const rows = [
      makeRow({ judgerId: 1, name: "甲", bias: 0.03, standardError: null, verdict: "unknown" }),
      makeRow({ judgerId: 2, name: "乙", bias: -0.05, standardError: 0.02, verdict: "strict" }),
    ];
    const { container } = render(<JudgerForestPlot rows={rows} />);

    const whiskers = Array.from(container.querySelectorAll('[data-part="whisker"]'));
    expect(whiskers).toHaveLength(1);
    expect(whiskers[0].getAttribute("data-judger-id")).toBe("2");

    const unknownPoint = queryElement(container, '[data-part="point"][data-judger-id="1"]');
    expect(unknownPoint.getAttribute("fill")).toBe("none");
    expect(unknownPoint.getAttribute("stroke")).toBe("var(--muted-foreground)");
    expect(unknownPoint.getAttribute("stroke")).not.toBe("var(--border)");
    expect(unknownPoint.getAttribute("stroke-dasharray")).toBe("2 2");
    expect(JUDGER_VERDICT_META.unknown.color).toBe("var(--muted-foreground)");

    const strictPoint = queryElement(container, '[data-part="point"][data-judger-id="2"]');
    expect(strictPoint.getAttribute("fill")).toBe(JUDGER_VERDICT_META.strict.color);
    expect(strictPoint.getAttribute("fill")).toBe("var(--warning)");
    expect(strictPoint.getAttribute("stroke-dasharray")).toBeNull();

    expect(
      queryElement(container, '[data-part="verdict-label"][data-judger-id="1"]').textContent,
    ).toBe("样本不足");
    expect(screen.getByText("样本不足")).toBeInTheDocument();
  });

  it("行尾显示宽严数值、判定标签与样本量", () => {
    const rows = [
      makeRow({ judgerId: 1, name: "甲", bias: 0.044, verdict: "lenient", observationCount: 12 }),
      makeRow({ judgerId: 2, name: "乙", bias: -0.066, verdict: "strict", observationCount: 7 }),
      makeRow({ judgerId: 3, name: "丙", bias: 0, standardError: null, verdict: "unknown", observationCount: 3 }),
    ];
    const { container } = render(<JudgerForestPlot rows={rows} />);

    expect(
      Array.from(container.querySelectorAll('[data-part="row-value"]')).map((n) => n.textContent),
    ).toEqual(["+4.4pp", "−6.6pp", "0.0pp"]);
    expect(
      Array.from(container.querySelectorAll('[data-part="verdict-label"]')).map((n) => n.textContent),
    ).toEqual(["偏松", "偏严", "样本不足"]);
    expect(
      Array.from(container.querySelectorAll('[data-part="observation-count"]')).map(
        (n) => n.textContent,
      ),
    ).toEqual(["n=12", "n=7", "n=3"]);

    /* 数值用该行 verdict 的颜色 */
    expect(
      queryElement(container, '[data-part="row-value"][data-judger-id="1"]').getAttribute("fill"),
    ).toBe("var(--error)");
    expect(
      queryElement(container, '[data-part="row-value"][data-judger-id="2"]').getAttribute("fill"),
    ).toBe("var(--warning)");
    expect(
      queryElement(container, '[data-part="row-value"][data-judger-id="3"]').getAttribute("fill"),
    ).toBe("var(--muted-foreground)");
    /* n= 在最右 */
    expect(
      Number(queryElement(container, '[data-part="observation-count"]').getAttribute("x")),
    ).toBeGreaterThan(
      Number(queryElement(container, '[data-part="verdict-label"]').getAttribute("x")),
    );
  });

  it("须线以点为中心、覆盖 ±1.96 标准误", () => {
    const rows = [makeRow({ judgerId: 7, name: "甲", bias: 0.04, standardError: 0.02 })];
    const { container } = render(<JudgerForestPlot rows={rows} />);

    const point = queryElement(container, '[data-part="point"][data-judger-id="7"]');
    const whisker = queryElement(container, '[data-part="whisker"][data-judger-id="7"]');
    const centerX = Number(point.getAttribute("cx"));
    const lowX = Number(whisker.getAttribute("x1"));
    const highX = Number(whisker.getAttribute("x2"));

    expect(lowX).toBeLessThan(centerX);
    expect(centerX).toBeLessThan(highX);
    expect(centerX - lowX).toBeCloseTo(highX - centerX, 5);
  });

  it("点半径随 observationCount 增大（3..7），不透明度随 credibility 增大（0.5..1）", () => {
    const rows = [
      makeRow({ judgerId: 1, name: "甲", observationCount: 5, credibility: 0.2 }),
      makeRow({ judgerId: 2, name: "乙", observationCount: 20, credibility: 0.6 }),
      makeRow({ judgerId: 3, name: "丙", observationCount: 80, credibility: 1 }),
    ];
    const { container } = render(<JudgerForestPlot rows={rows} />);

    const point = (judgerId: number) =>
      queryElement(container, `[data-part="point"][data-judger-id="${judgerId}"]`);
    const radius = (judgerId: number) => Number(point(judgerId).getAttribute("r"));
    const opacity = (judgerId: number) => Number(point(judgerId).style.opacity);

    expect(radius(1)).toBeGreaterThanOrEqual(3);
    expect(radius(3)).toBeLessThanOrEqual(7);
    expect(radius(2)).toBeGreaterThan(radius(1));
    expect(radius(3)).toBeGreaterThan(radius(2));

    expect(opacity(1)).toBeCloseTo(0.5 + 0.5 * 0.2, 5);
    expect(opacity(2)).toBeGreaterThan(opacity(1));
    expect(opacity(3)).toBeCloseTo(1, 5);
    expect(opacity(1)).toBeGreaterThanOrEqual(0.5);
    expect(opacity(3)).toBeLessThanOrEqual(1);
  });

  it("统一坐标轴语言：虚线网格 = 刻度数、底边基线、字号规范", () => {
    const { container } = render(<JudgerForestPlot rows={[makeRow({ judgerId: 1, name: "甲" })]} />);

    const tickLabels = Array.from(container.querySelectorAll('[data-part="tick-label"]'));
    const gridLines = Array.from(container.querySelectorAll('[data-part="grid-line"]'));
    expect(tickLabels.length).toBeGreaterThan(0);
    expect(gridLines).toHaveLength(tickLabels.length);
    for (const gridLine of gridLines) {
      expect(gridLine.getAttribute("stroke")).toBe("var(--border)");
      expect(gridLine.getAttribute("stroke-dasharray")).toBe("3 3");
      expect(gridLine.getAttribute("opacity")).toBe("0.6");
    }

    /* 底边基线与绘图区底部、刻度线相接 */
    const baseline = queryElement(container, '[data-part="axis-line"]');
    expect(baseline.getAttribute("y1")).toBe(baseline.getAttribute("y2"));
    expect(Number(baseline.getAttribute("y1"))).toBe(
      Number(gridLines[0].getAttribute("y2")),
    );
    expect(Number(baseline.getAttribute("x1"))).toBeLessThan(Number(baseline.getAttribute("x2")));

    /* 0 参考线更强 */
    expect(queryElement(container, '[data-part="reference-line"]').getAttribute("stroke")).toBe(
      "var(--muted-foreground)",
    );

    /* 字号规范：轴 10 / 行标签与数值列 11 */
    for (const tickLabel of tickLabels) {
      expect(tickLabel.getAttribute("font-size")).toBe("10");
    }
    expect(queryElement(container, '[data-part="axis-caption"]').getAttribute("font-size")).toBe(
      "10",
    );
    for (const part of ["row-label", "row-value", "verdict-label", "observation-count"]) {
      expect(queryElement(container, `[data-part="${part}"]`).getAttribute("font-size")).toBe("11");
    }

    /* 每个 <text> 都显式声明锚点与基线 */
    for (const text of Array.from(container.querySelectorAll("text"))) {
      expect(text.getAttribute("text-anchor")).not.toBeNull();
      expect(text.getAttribute("dominant-baseline")).not.toBeNull();
    }
  });

  it("空数据渲染占位而不是空轴", () => {
    const { container } = render(<JudgerForestPlot rows={[]} />);

    expect(screen.getByText("暂无数据")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-part="point"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-part="tick-label"]')).toHaveLength(0);
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("暂无数据"),
    );
  });

  it("svg 是响应式的、可无障碍访问的图片", () => {
    const { container } = render(
      <JudgerForestPlot rows={[makeRow({ judgerId: 1, name: "很长的讲师姓名需要被截断" })]} className="mt-4" />,
    );

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("class")).toContain("w-full");
    expect(svg?.getAttribute("class")).toContain("mt-4");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 760 84");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toContain("1 名讲师");
    /* 长名截断：渲染成原名前缀 + 省略号 */
    const longName = "很长的讲师姓名需要被截断";
    const label = queryElement(container, '[data-part="row-label"]');
    const rendered = label.textContent ?? "";
    expect(rendered.endsWith("…")).toBe(true);
    expect(longName.startsWith(rendered.slice(0, -1))).toBe(true);
    expect(rendered).not.toBe(longName);
  });
});
