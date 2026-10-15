import { render, screen } from "@testing-library/react";

import { JudgerShiftChart, type JudgerShiftChartRow } from "./judgerShiftChart";

const ROWS: JudgerShiftChartRow[] = [
  { judgerId: 1, name: "甲", rawMeanRatio: 0.72, adjustedMeanRatio: 0.78, observationCount: 30 },
  { judgerId: 2, name: "乙", rawMeanRatio: 0.9, adjustedMeanRatio: 0.86, observationCount: 12 },
];

function queryElement(container: HTMLElement, selector: string): SVGElement {
  const element = container.querySelector(selector);
  if (!element) throw new Error(`找不到元素：${selector}`);
  return element as SVGElement;
}

function pointX(container: HTMLElement, part: string, judgerId: number): number {
  return Number(
    queryElement(container, `[data-part="${part}"][data-judger-id="${judgerId}"]`).getAttribute(
      "cx",
    ),
  );
}

describe("JudgerShiftChart", () => {
  it("校正后得分率更高时实心点在空心环右侧，反之在左侧", () => {
    const { container } = render(<JudgerShiftChart rows={ROWS} />);

    expect(pointX(container, "adjusted-point", 1)).toBeGreaterThan(
      pointX(container, "raw-point", 1),
    );
    expect(pointX(container, "adjusted-point", 2)).toBeLessThan(
      pointX(container, "raw-point", 2),
    );
  });

  it("原始点是空心环、校正后点是实心小圆", () => {
    const { container } = render(<JudgerShiftChart rows={ROWS} />);

    const raw = queryElement(container, '[data-part="raw-point"][data-judger-id="1"]');
    const adjusted = queryElement(container, '[data-part="adjusted-point"][data-judger-id="1"]');

    expect(raw.getAttribute("fill")).toBe("none");
    expect(raw.getAttribute("stroke")).toBe("var(--muted-foreground)");
    expect(raw.getAttribute("stroke-width")).toBe("2");
    expect(raw.getAttribute("r")).toBe("4.5");
    expect(adjusted.getAttribute("fill")).toBe("var(--primary)");
    expect(adjusted.getAttribute("fill")).not.toBe("var(--accent)");
    /* 环比实心点大，两点重合时环仍露在外面 */
    expect(Number(raw.getAttribute("r"))).toBeGreaterThan(Number(adjusted.getAttribute("r")));
  });

  it("λ=0（原始 = 校正）时两点重合，环仍可见", () => {
    const { container } = render(
      <JudgerShiftChart
        rows={[
          { judgerId: 5, name: "甲", rawMeanRatio: 0.7, adjustedMeanRatio: 0.7, observationCount: 9 },
        ]}
      />,
    );

    expect(pointX(container, "raw-point", 5)).toBeCloseTo(pointX(container, "adjusted-point", 5), 5);
    expect(
      queryElement(container, '[data-part="raw-point"][data-judger-id="5"]').getAttribute(
        "stroke-width",
      ),
    ).toBe("2");
  });

  it("每行右端显示差值", () => {
    const { container } = render(<JudgerShiftChart rows={ROWS} />);

    expect(
      Array.from(container.querySelectorAll('[data-part="delta"]')).map((n) => n.textContent),
    ).toEqual(["+6.0pp", "−4.0pp"]);
    /* 差值文本在绘图区右侧 */
    expect(
      Number(queryElement(container, '[data-part="delta"]').getAttribute("x")),
    ).toBeGreaterThan(pointX(container, "adjusted-point", 1));
  });

  it("每行一条连接线，端点与两个点重合", () => {
    const { container } = render(<JudgerShiftChart rows={ROWS} />);

    expect(container.querySelectorAll('[data-part="raw-point"]')).toHaveLength(ROWS.length);
    expect(container.querySelectorAll('[data-part="adjusted-point"]')).toHaveLength(ROWS.length);
    expect(container.querySelectorAll('[data-part="connector"]')).toHaveLength(ROWS.length);

    for (const row of ROWS) {
      const connector = queryElement(
        container,
        `[data-part="connector"][data-judger-id="${row.judgerId}"]`,
      );
      const ends = [Number(connector.getAttribute("x1")), Number(connector.getAttribute("x2"))].sort(
        (a, b) => a - b,
      );
      const points = [
        pointX(container, "raw-point", row.judgerId),
        pointX(container, "adjusted-point", row.judgerId),
      ].sort((a, b) => a - b);

      expect(ends[0]).toBeCloseTo(points[0], 5);
      expect(ends[1]).toBeCloseTo(points[1], 5);
    }
  });

  it("底部刻度为 0/25/50/75/100%，并带 x 轴说明", () => {
    const { container } = render(<JudgerShiftChart rows={ROWS} />);

    const tickLabels = Array.from(container.querySelectorAll('[data-part="tick-label"]'));
    expect(tickLabels.map((node) => node.textContent)).toEqual([
      "0%",
      "25%",
      "50%",
      "75%",
      "100%",
    ]);

    const plotBottom = Number(
      queryElement(container, '[data-part="grid-line"]').getAttribute("y2"),
    );
    for (const label of tickLabels) {
      expect(Number(label.getAttribute("y"))).toBeGreaterThan(plotBottom);
    }
    expect(queryElement(container, '[data-part="axis-caption"]').textContent).toBe("平均得分率");

    const zeroX = Number(tickLabels[0].getAttribute("x"));
    const hundredX = Number(tickLabels[4].getAttribute("x"));
    expect(zeroX).toBeLessThan(hundredX);
    /* 所有点都落在 0..100% 之间 */
    for (const row of ROWS) {
      expect(pointX(container, "raw-point", row.judgerId)).toBeGreaterThan(zeroX);
      expect(pointX(container, "raw-point", row.judgerId)).toBeLessThan(hundredX);
      expect(pointX(container, "adjusted-point", row.judgerId)).toBeLessThan(hundredX);
    }
  });

  it("名称最多 6 个字符，完整名在 <title> 里", () => {
    const longName = "很长的讲师姓名需要被截断";
    const { container } = render(
      <JudgerShiftChart
        rows={[
          {
            judgerId: 1,
            name: longName,
            rawMeanRatio: 0.5,
            adjustedMeanRatio: 0.6,
            observationCount: 4,
          },
        ]}
      />,
    );

    const labels = Array.from(container.querySelectorAll('[data-part="row-label"]'));
    expect(labels).toHaveLength(1);
    expect(labels[0].textContent).toBe("很长的讲师姓…");
    expect(queryElement(container, '[data-part="row"] title').textContent).toContain(longName);
  });

  it("统一坐标轴语言：虚线网格 = 刻度数、底边基线、连接线样式", () => {
    const { container } = render(<JudgerShiftChart rows={ROWS} />);

    const tickLabels = Array.from(container.querySelectorAll('[data-part="tick-label"]'));
    const gridLines = Array.from(container.querySelectorAll('[data-part="grid-line"]'));
    expect(gridLines).toHaveLength(tickLabels.length);
    for (const gridLine of gridLines) {
      expect(gridLine.getAttribute("stroke")).toBe("var(--border)");
      expect(gridLine.getAttribute("stroke-dasharray")).toBe("3 3");
      expect(gridLine.getAttribute("opacity")).toBe("0.6");
    }

    const baseline = queryElement(container, '[data-part="axis-line"]');
    expect(baseline.getAttribute("y1")).toBe(baseline.getAttribute("y2"));
    expect(Number(baseline.getAttribute("y1"))).toBe(Number(gridLines[0].getAttribute("y2")));

    const connector = queryElement(container, '[data-part="connector"][data-judger-id="1"]');
    expect(connector.getAttribute("stroke")).toBe("var(--border)");
    expect(connector.getAttribute("stroke-width")).toBe("2");
    expect(connector.getAttribute("stroke-linecap")).toBe("round");

    for (const tickLabel of tickLabels) {
      expect(tickLabel.getAttribute("font-size")).toBe("10");
    }
    expect(queryElement(container, '[data-part="axis-caption"]').getAttribute("font-size")).toBe(
      "10",
    );
    expect(queryElement(container, '[data-part="row-label"]').getAttribute("font-size")).toBe("11");
    expect(queryElement(container, '[data-part="delta"]').getAttribute("font-size")).toBe("11");
    expect(queryElement(container, '[data-part="row-label"]').getAttribute("fill")).toBe(
      "var(--foreground)",
    );

    for (const text of Array.from(container.querySelectorAll("text"))) {
      expect(text.getAttribute("text-anchor")).not.toBeNull();
      expect(text.getAttribute("dominant-baseline")).not.toBeNull();
    }
  });

  it("按可比簇分组：簇边界插入分隔标签，不可判定组排在最后", () => {
    const rows: JudgerShiftChartRow[] = [
      {
        judgerId: 1,
        name: "甲",
        rawMeanRatio: 0.6,
        adjustedMeanRatio: 0.65,
        observationCount: 10,
        clusterIndex: 0,
      },
      {
        judgerId: 2,
        name: "乙",
        rawMeanRatio: 0.7,
        adjustedMeanRatio: 0.68,
        observationCount: 10,
        clusterIndex: 0,
      },
      {
        judgerId: 3,
        name: "丙",
        rawMeanRatio: 0.5,
        adjustedMeanRatio: 0.5,
        observationCount: 4,
        clusterIndex: -1,
      },
    ];
    const { container } = render(<JudgerShiftChart rows={rows} />);

    const labels = Array.from(container.querySelectorAll('[data-part="cluster-label"]'));
    expect(labels.map((node) => node.textContent)).toEqual([
      "阅卷组 1 · 2 名讲师 · 仅组内可比",
      "不可判定 · 没有其他讲师评过同一名考生",
    ]);
    /* 分隔线横跨绘图区，标签在成员行上方 */
    const dividers = Array.from(container.querySelectorAll('[data-part="cluster-divider"]'));
    expect(dividers).toHaveLength(2);
    const labelYs = labels.map((node) => Number(node.getAttribute("y")));
    expect(labelYs[0]).toBeLessThan(
      Number(queryElement(container, '[data-part="raw-point"][data-judger-id="1"]').getAttribute("cy")),
    );
    expect(
      Number(queryElement(container, '[data-part="raw-point"][data-judger-id="2"]').getAttribute("cy")),
    ).toBeLessThan(labelYs[1]);
    /* 每名讲师照常画原始点、校正点与连接线 */
    expect(container.querySelectorAll('[data-part="raw-point"]')).toHaveLength(rows.length);
    expect(container.querySelectorAll('[data-part="adjusted-point"]')).toHaveLength(rows.length);
    expect(container.querySelectorAll('[data-part="connector"]')).toHaveLength(rows.length);
  });

  it("只有一个可比簇时不插分隔标签", () => {
    const { container } = render(<JudgerShiftChart rows={ROWS} />);

    expect(container.querySelectorAll('[data-part="cluster-label"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-part="cluster-divider"]')).toHaveLength(0);
  });

  it("空数据渲染占位", () => {
    const { container } = render(<JudgerShiftChart rows={[]} />);

    expect(screen.getByText("暂无数据")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-part="raw-point"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-part="tick-label"]')).toHaveLength(0);
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("暂无数据"),
    );
  });

  it("svg 是响应式的、可无障碍访问的图片", () => {
    const { container } = render(<JudgerShiftChart rows={ROWS} className="mt-4" />);

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("w-full");
    expect(svg?.getAttribute("class")).toContain("mt-4");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toContain("2 名讲师");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 420 106");
  });
});
