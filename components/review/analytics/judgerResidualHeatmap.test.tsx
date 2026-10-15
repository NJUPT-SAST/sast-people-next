import { render, screen } from "@testing-library/react";

import {
  JudgerResidualHeatmap,
  type HeatmapColumn,
  type HeatmapRow,
} from "./judgerResidualHeatmap";

const COLUMNS: HeatmapColumn[] = [
  { key: "p1", label: "题目一" },
  { key: "p2", label: "很长很长的题目名称" },
];

const ROWS: HeatmapRow[] = [
  {
    key: "j1",
    label: "甲讲师",
    cells: [
      { columnKey: "p1", value: 0.5, count: 3 },
      { columnKey: "p2", value: null, count: 0 },
    ],
  },
  {
    key: "j2",
    label: "乙讲师",
    cells: [
      { columnKey: "p1", value: 3, count: 1 },
      { columnKey: "p2", value: -2, count: 12 },
    ],
  },
];

function queryElement(container: HTMLElement, selector: string): SVGElement {
  const element = container.querySelector(selector);
  if (!element) throw new Error(`找不到元素：${selector}`);
  return element as SVGElement;
}

function findCell(container: HTMLElement, rowKey: string, columnKey: string): SVGElement {
  return queryElement(container, `[data-part="cell"][data-row-key="${rowKey}"][data-column-key="${columnKey}"]`);
}

function viewBoxWidth(container: HTMLElement): number {
  return Number(queryElement(container, "svg").getAttribute("viewBox")?.split(" ")[2]);
}

describe("JudgerResidualHeatmap", () => {
  it("按 rows × columns 渲染行、列与格子", () => {
    const { container } = render(<JudgerResidualHeatmap rows={ROWS} columns={COLUMNS} />);

    expect(container.querySelectorAll('[data-part="row-label"]')).toHaveLength(ROWS.length);
    expect(container.querySelectorAll('[data-part="column-label"]')).toHaveLength(COLUMNS.length);
    expect(container.querySelectorAll('[data-part="cell"]')).toHaveLength(
      ROWS.length * COLUMNS.length,
    );
    /* 格子 32px、列间距 34px */
    const first = findCell(container, "j1", "p1");
    expect(Number(first.getAttribute("width"))).toBe(32);
    expect(
      Number(findCell(container, "j1", "p2").getAttribute("x")) - Number(first.getAttribute("x")),
    ).toBe(34);
  });

  it("格子不透明度随 |value| 单调不减（上限 0.85）", () => {
    const { container } = render(<JudgerResidualHeatmap rows={ROWS} columns={COLUMNS} />);

    const small = Number(findCell(container, "j1", "p1").style.opacity);
    const medium = Number(findCell(container, "j2", "p2").style.opacity);
    const large = Number(findCell(container, "j2", "p1").style.opacity);

    /* |0.5| < |-2| < |3|，maxAbs 默认 3 */
    expect(small).toBeCloseTo((0.5 / 3) * 0.85, 5);
    expect(medium).toBeCloseTo((2 / 3) * 0.85, 5);
    expect(large).toBeCloseTo(0.85, 5);
    expect(medium).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(medium);
    expect(large).toBeLessThanOrEqual(0.85);
  });

  it("正值用 error、负值用 success，null 不落前景色", () => {
    const { container } = render(<JudgerResidualHeatmap rows={ROWS} columns={COLUMNS} />);

    expect(findCell(container, "j2", "p1").getAttribute("fill")).toBe("var(--error)");
    expect(findCell(container, "j2", "p2").getAttribute("fill")).toBe("var(--success)");

    const empty = findCell(container, "j1", "p2");
    expect(empty.getAttribute("fill")).toBe("var(--muted-foreground)");
    expect(empty.getAttribute("fill")).not.toBe("var(--error)");
    expect(empty.getAttribute("fill")).not.toBe("var(--success)");
    expect(Number(empty.style.opacity)).toBeLessThan(Number(findCell(container, "j1", "p1").style.opacity));
    expect(empty.getAttribute("data-value")).toBeNull();
  });

  it("每格 <title> 写清讲师 / 题目 / 数值 / 样本数", () => {
    const { container } = render(<JudgerResidualHeatmap rows={ROWS} columns={COLUMNS} />);

    expect(findCell(container, "j2", "p2").querySelector("title")?.textContent).toBe(
      "乙讲师 · 很长很长的题目名称 · -2.00σ · n=12",
    );
    expect(findCell(container, "j2", "p1").querySelector("title")?.textContent).toBe(
      "乙讲师 · 题目一 · +3.00σ · n=1",
    );
    /* 没有观测的格子：样本数为 0，明确写出来，避免把「无数据」读成「没有差异」 */
    expect(findCell(container, "j1", "p2").querySelector("title")?.textContent).toBe(
      "甲讲师 · 很长很长的题目名称 · 无数据 · n=0",
    );
    expect(findCell(container, "j1", "p1").querySelector("title")?.textContent).toBe(
      "甲讲师 · 题目一 · +0.50σ · n=3",
    );
  });

  it("未提供样本数时不写 n（n=1 的格子是噪声，规范 §10.2 要求把样本数放进 <title>）", () => {
    const rows: HeatmapRow[] = [
      { key: "j1", label: "甲讲师", cells: [{ columnKey: "p1", value: 0.5 }] },
    ];
    const { container } = render(<JudgerResidualHeatmap rows={rows} columns={COLUMNS} />);

    expect(findCell(container, "j1", "p1").querySelector("title")?.textContent).toBe(
      "甲讲师 · 题目一 · +0.50σ",
    );
  });

  it("行/列标签最多 6 个字符，完整名放在 <title> 里", () => {
    const { container } = render(<JudgerResidualHeatmap rows={ROWS} columns={COLUMNS} />);

    expect(
      Array.from(container.querySelectorAll('[data-part="column-label"]')).map(
        (node) => node.textContent,
      ),
    ).toEqual(["题目一", "很长很长的题…"]);
    expect(
      queryElement(container, '[data-part="column-label-group"][data-column-key="p2"] title')
        .textContent,
    ).toBe("很长很长的题目名称");
    expect(
      queryElement(container, '[data-part="row"][data-row-key="j1"] > title').textContent,
    ).toBe("甲讲师");
  });

  it("画布宽度随列数自适应，不是固定宽度", () => {
    const wide = render(
      <JudgerResidualHeatmap
        rows={ROWS}
        columns={Array.from({ length: 6 }, (_, index) => ({
          key: `p${index}`,
          label: `题目${index}`,
        }))}
      />,
    );
    const narrow = render(<JudgerResidualHeatmap rows={ROWS} columns={COLUMNS} />);

    const wideWidth = viewBoxWidth(wide.container);
    const narrowWidth = viewBoxWidth(narrow.container);

    expect(narrowWidth).toBeLessThan(wideWidth);
    expect(wideWidth).toBeLessThan(900);
    expect(findCell(wide.container, "j1", "p5")).not.toBeNull();
  });

  it("maxAbs 决定色阶饱和点", () => {
    const { container } = render(
      <JudgerResidualHeatmap rows={ROWS} columns={COLUMNS} maxAbs={1} />,
    );

    expect(Number(findCell(container, "j1", "p1").style.opacity)).toBeCloseTo(0.5 * 0.85, 5);
    expect(Number(findCell(container, "j2", "p1").style.opacity)).toBeCloseTo(0.85, 5);
    expect(queryElement(container, '[data-part="legend-min"]').textContent).toBe("-1σ");
    expect(queryElement(container, '[data-part="legend-max"]').textContent).toBe("+1σ");
  });

  it("底部渲染 ±maxAbsσ 的色阶图例", () => {
    const { container } = render(<JudgerResidualHeatmap rows={ROWS} columns={COLUMNS} />);

    expect(queryElement(container, '[data-part="legend-min"]').textContent).toBe("-3σ");
    expect(queryElement(container, '[data-part="legend-max"]').textContent).toBe("+3σ");
    expect(queryElement(container, '[data-part="legend-mid"]').textContent).toBe("0");
    expect(queryElement(container, '[data-part="legend-caption"]').textContent).toBe(
      "低于模型预期 ← 0 → 高于模型预期",
    );
    expect(queryElement(container, '[data-part="legend-bar"]').getAttribute("fill")).toContain(
      "url(#",
    );
  });

  it("全部残差为 null 时不画格子，改用一行说明文字", () => {
    const rows: HeatmapRow[] = [
      {
        key: "j1",
        label: "甲讲师",
        cells: [
          { columnKey: "p1", value: null },
          { columnKey: "p2", value: null },
        ],
      },
    ];
    const { container } = render(<JudgerResidualHeatmap rows={rows} columns={COLUMNS} />);

    expect(
      screen.getByText("暂无可用的标准化残差（本流程未识别出残差尺度）"),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('[data-part="cell"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-part="legend-bar"]')).toHaveLength(0);
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("未识别出残差尺度"),
    );
    expect(queryElement(container, "svg").style.maxWidth).toBe("380px");
  });

  it("格子区域有外框、图例上方有分隔线，字号规范", () => {
    const { container } = render(<JudgerResidualHeatmap rows={ROWS} columns={COLUMNS} />);

    const frame = queryElement(container, '[data-part="grid-frame"]');
    expect(frame.getAttribute("stroke")).toBe("var(--border)");
    const firstCell = findCell(container, "j1", "p1");
    const lastCell = findCell(container, "j1", "p2");
    expect(Number(frame.getAttribute("x"))).toBeLessThan(Number(firstCell.getAttribute("x")));
    expect(Number(frame.getAttribute("x")) + Number(frame.getAttribute("width"))).toBeGreaterThan(
      Number(lastCell.getAttribute("x")) + Number(lastCell.getAttribute("width")),
    );
    /* 行标签右对齐到格子左边留 8px */
    expect(Number(queryElement(container, '[data-part="row-label"]').getAttribute("x"))).toBe(
      Number(frame.getAttribute("x")) - 8,
    );

    const separator = queryElement(container, '[data-part="legend-separator"]');
    const legendBar = queryElement(container, '[data-part="legend-bar"]');
    expect(separator.getAttribute("stroke")).toBe("var(--border)");
    expect(Number(separator.getAttribute("y1"))).toBeLessThan(
      Number(legendBar.getAttribute("y")),
    );
    expect(Number(separator.getAttribute("y1"))).toBeGreaterThan(
      Number(frame.getAttribute("y")) + Number(frame.getAttribute("height")),
    );

    /* 字号：列标签 10 / 行标签 11 / 图例 11 */
    expect(
      queryElement(container, '[data-part="column-label"]').getAttribute("font-size"),
    ).toBe("10");
    expect(queryElement(container, '[data-part="row-label"]').getAttribute("font-size")).toBe("11");
    expect(queryElement(container, '[data-part="legend-min"]').getAttribute("font-size")).toBe("11");

    for (const text of Array.from(container.querySelectorAll("text"))) {
      expect(text.getAttribute("text-anchor")).not.toBeNull();
      expect(text.getAttribute("dominant-baseline")).not.toBeNull();
    }
  });

  it("空数据渲染占位", () => {
    const { container } = render(<JudgerResidualHeatmap rows={[]} columns={COLUMNS} />);

    expect(screen.getByText("暂无数据")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-part="cell"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-part="legend-bar"]')).toHaveLength(0);
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("暂无数据"),
    );
    expect(queryElement(container, "svg").style.maxWidth).toBe("320px");
  });

  it("空列同样渲染占位", () => {
    const { container } = render(<JudgerResidualHeatmap rows={ROWS} columns={[]} />);

    expect(screen.getByText("暂无数据")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-part="cell"]')).toHaveLength(0);
  });

  it("svg 是响应式的、可无障碍访问的图片", () => {
    const { container } = render(
      <JudgerResidualHeatmap rows={ROWS} columns={COLUMNS} className="mt-4" />,
    );

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("w-full");
    expect(svg?.getAttribute("class")).toContain("mt-4");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toContain("2 名讲师 × 2 道题");
    expect(svg?.getAttribute("viewBox")).toMatch(/^0 0 \d+ \d+$/);
    /* 自然宽度上限：宽卡片里只会缩放到画布宽，不会被拉伸放大 */
    expect(queryElement(container, "svg").style.maxWidth).toBe(`${viewBoxWidth(container)}px`);
  });
});
