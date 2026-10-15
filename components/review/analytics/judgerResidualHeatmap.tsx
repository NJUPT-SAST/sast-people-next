import type React from "react";

import { cn } from "@/lib/utils";

export type HeatmapColumn = { key: string; label: string };

export type HeatmapRow = {
  key: string;
  label: string;
  /** `count` = 该格聚合的观测数（样本数），写进 <title>：n=1 的格子是噪声，不得据此下结论 */
  cells: Array<{ columnKey: string; value: number | null; count?: number }>;
};

/** 格子边长与列间距（pitch），宽卡片里也不会被拉伸放大 */
const CELL_SIZE = 32;
const CELL_PITCH = 34;
const CELL_GAP = CELL_PITCH - CELL_SIZE;
const ROW_LABEL_WIDTH = 92;
const COLUMN_LABEL_FONT_SIZE = 10;
const ROW_LABEL_FONT_SIZE = 11;
/** 行/列标签最多 6 个字符（CJK 计 1 个），完整名放进 <title> */
const MAX_LABEL_CHARS = 6;
/** 45° 斜排列名区的最大高度 */
const MAX_LABEL_BAND = 64;
const BOTTOM_PAD = 74;
const FONT_SIZE = 11;
const NULL_CELL_OPACITY = 0.12;
const MAX_CELL_OPACITY = 0.85;
const MIN_LEGEND_WIDTH = 120;
const MAX_LEGEND_WIDTH = 240;
const GRADIENT_ID = "judger-residual-heatmap-scale";
const NO_RESIDUAL_TEXT = "暂无可用的标准化残差（本流程未识别出残差尺度）";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const char of text) {
    width += char.charCodeAt(0) > 0x2e80 ? fontSize : fontSize * 0.56;
  }
  return width;
}

function truncateChars(text: string, maxChars: number): string {
  const chars = Array.from(text);
  return chars.length > maxChars ? `${chars.slice(0, maxChars).join("")}…` : text;
}

export function JudgerResidualHeatmap({
  rows,
  columns,
  maxAbs = 3,
  className,
}: {
  rows: HeatmapRow[];
  columns: HeatmapColumn[];
  maxAbs?: number;
  className?: string;
}): React.ReactElement {
  const svgClassName = cn("w-full h-auto", className);

  if (rows.length === 0 || columns.length === 0) {
    return (
      <svg
        className={svgClassName}
        style={{ maxWidth: 320 }}
        viewBox="0 0 320 80"
        role="img"
        aria-label="讲师×题目标准化残差热力图：暂无数据"
      >
        <text
          x={160}
          y={44}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={12}
          fill="var(--muted-foreground)"
        >
          暂无数据
        </text>
      </svg>
    );
  }

  /* 一个残差值都没有（例如标准误缺失导致残差不可用）时不画格子，避免一片空黑 */
  const hasAnyValue = rows.some((row) =>
    row.cells.some((cell) => typeof cell.value === "number" && Number.isFinite(cell.value)),
  );
  if (!hasAnyValue) {
    return (
      <svg
        className={svgClassName}
        style={{ maxWidth: 380 }}
        viewBox="0 0 380 80"
        role="img"
        aria-label={`讲师×题目标准化残差热力图：${NO_RESIDUAL_TEXT}`}
      >
        <text
          x={190}
          y={44}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={12}
          fill="var(--muted-foreground)"
        >
          {NO_RESIDUAL_TEXT}
        </text>
      </svg>
    );
  }

  const safeMaxAbs = Number.isFinite(maxAbs) && maxAbs > 0 ? maxAbs : 1;
  const columnLabels = columns.map((column) => truncateChars(column.label, MAX_LABEL_CHARS));
  const maxColumnLabelWidth = Math.max(
    ...columnLabels.map((label) => estimateTextWidth(label, COLUMN_LABEL_FONT_SIZE)),
  );
  /** 45° 斜排的列名占用的顶部高度（按最长标签的旋转投影算，上限 64） */
  const labelBand = Math.max(
    26,
    Math.min(MAX_LABEL_BAND, Math.ceil(maxColumnLabelWidth * 0.72) + 16),
  );
  const columnLabelRightPad = Math.ceil(maxColumnLabelWidth * 0.72) + 8;
  const plotWidth = columns.length * CELL_PITCH;
  const plotHeight = rows.length * CELL_PITCH;
  const plotBottom = labelBand + plotHeight;
  const legendWidth = clamp(plotWidth, MIN_LEGEND_WIDTH, MAX_LEGEND_WIDTH);
  const legendY = plotBottom + 30;
  const legendCenterX = ROW_LABEL_WIDTH + legendWidth / 2;
  const legendCaption = "低于模型预期 ← 0 → 高于模型预期";
  const width = Math.ceil(
    Math.max(
      ROW_LABEL_WIDTH + plotWidth + columnLabelRightPad,
      ROW_LABEL_WIDTH + legendWidth + 16,
      legendCenterX + estimateTextWidth(legendCaption, FONT_SIZE) / 2 + 8,
    ),
  );
  const height = plotBottom + BOTTOM_PAD;

  return (
    <svg
      className={svgClassName}
      style={{ maxWidth: width }}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`讲师×题目标准化残差热力图：${rows.length} 名讲师 × ${columns.length} 道题，色阶 ±${safeMaxAbs}σ`}
    >
      <defs>
        <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="1" y2="0">
          <stop
            offset="0%"
            style={{ stopColor: "var(--success)", stopOpacity: MAX_CELL_OPACITY }}
          />
          <stop
            offset="50%"
            style={{ stopColor: "var(--muted-foreground)", stopOpacity: 0.06 }}
          />
          <stop
            offset="100%"
            style={{ stopColor: "var(--error)", stopOpacity: MAX_CELL_OPACITY }}
          />
        </linearGradient>
      </defs>

      {columns.map((column, columnIndex) => {
        const anchorX = ROW_LABEL_WIDTH + columnIndex * CELL_PITCH + 2;
        const anchorY = labelBand - 6;
        return (
          <g key={`column-${column.key}`} data-part="column-label-group" data-column-key={column.key}>
            <title>{column.label}</title>
            <text
              data-part="column-label"
              data-column-key={column.key}
              x={anchorX}
              y={anchorY}
              transform={`rotate(-45 ${anchorX} ${anchorY})`}
              textAnchor="start"
              dominantBaseline="middle"
              fontSize={COLUMN_LABEL_FONT_SIZE}
              fill="var(--muted-foreground)"
            >
              {columnLabels[columnIndex]}
            </text>
          </g>
        );
      })}

      {rows.map((row, rowIndex) => {
        const rowTop = labelBand + rowIndex * CELL_PITCH;
        const cellByColumn = new Map(row.cells.map((cell) => [cell.columnKey, cell]));
        return (
          <g key={row.key} data-part="row" data-row-key={row.key}>
            <title>{row.label}</title>
            <text
              data-part="row-label"
              data-row-key={row.key}
              x={ROW_LABEL_WIDTH - 8}
              y={rowTop + CELL_PITCH / 2}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={ROW_LABEL_FONT_SIZE}
              fill="var(--foreground)"
            >
              {truncateChars(row.label, MAX_LABEL_CHARS)}
            </text>

            {columns.map((column, columnIndex) => {
              const cell = cellByColumn.get(column.key);
              const rawValue = cell?.value;
              const value =
                typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : null;
              const cellX = ROW_LABEL_WIDTH + columnIndex * CELL_PITCH + CELL_GAP / 2;
              const cellY = rowTop + CELL_GAP / 2;
              const valueLabel =
                value === null ? "无数据" : `${value > 0 ? "+" : ""}${value.toFixed(2)}σ`;
              const countLabel = typeof cell?.count === "number" ? ` · n=${cell.count}` : "";
              return (
                <rect
                  key={`${row.key}-${column.key}`}
                  data-part="cell"
                  data-row-key={row.key}
                  data-column-key={column.key}
                  data-value={value === null ? undefined : value}
                  x={cellX}
                  y={cellY}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  rx={3}
                  fill={
                    value === null
                      ? "var(--muted-foreground)"
                      : value > 0
                        ? "var(--error)"
                        : "var(--success)"
                  }
                  stroke="var(--border)"
                  strokeWidth={0.5}
                  style={{
                    opacity:
                      value === null
                        ? NULL_CELL_OPACITY
                        : Math.min(1, Math.abs(value) / safeMaxAbs) * MAX_CELL_OPACITY,
                  }}
                >
                  <title>{`${row.label} · ${column.label} · ${valueLabel}${countLabel}`}</title>
                </rect>
              );
            })}
          </g>
        );
      })}

      <rect
        data-part="grid-frame"
        x={ROW_LABEL_WIDTH}
        y={labelBand}
        width={plotWidth}
        height={plotHeight}
        fill="none"
        stroke="var(--border)"
        strokeWidth={1}
      />

      <line
        data-part="legend-separator"
        x1={ROW_LABEL_WIDTH}
        x2={ROW_LABEL_WIDTH + legendWidth}
        y1={plotBottom + 15}
        y2={plotBottom + 15}
        stroke="var(--border)"
        strokeWidth={1}
      />

      <rect
        data-part="legend-bar"
        x={ROW_LABEL_WIDTH}
        y={legendY}
        width={legendWidth}
        height={10}
        rx={2}
        fill={`url(#${GRADIENT_ID})`}
        stroke="var(--border)"
        strokeWidth={0.5}
      />
      <text
        data-part="legend-min"
        x={ROW_LABEL_WIDTH}
        y={legendY - 8}
        textAnchor="start"
        dominantBaseline="middle"
        fontSize={FONT_SIZE}
        fill="var(--muted-foreground)"
      >
        {`-${safeMaxAbs}σ`}
      </text>
      <text
        data-part="legend-mid"
        x={legendCenterX}
        y={legendY - 8}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={FONT_SIZE}
        fill="var(--muted-foreground)"
      >
        0
      </text>
      <text
        data-part="legend-max"
        x={ROW_LABEL_WIDTH + legendWidth}
        y={legendY - 8}
        textAnchor="end"
        dominantBaseline="middle"
        fontSize={FONT_SIZE}
        fill="var(--muted-foreground)"
      >
        {`+${safeMaxAbs}σ`}
      </text>
      <text
        data-part="legend-caption"
        x={legendCenterX}
        y={legendY + 28}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={FONT_SIZE}
        fill="var(--muted-foreground)"
      >
        {legendCaption}
      </text>
    </svg>
  );
}
