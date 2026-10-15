import type React from "react";

import type { JudgerVerdict } from "@/lib/grading-fairness/types";
import { cn } from "@/lib/utils";

import { JUDGER_VERDICT_META } from "./judgerVerdict";

export type JudgerForestPlotRow = {
  judgerId: number;
  name: string;
  /** 宽严（得分率差，正 = 偏松） */
  bias: number;
  /** 标准误；为 null 时表示不可辨识，不画须线 */
  standardError: number | null;
  observationCount: number;
  /** 可信度权重 0..1 */
  credibility: number;
  verdict: JudgerVerdict;
};

const WIDTH = 760;
const ROW_HEIGHT = 26;
const PLOT_LEFT = 150;
const PLOT_RIGHT = 560;
const TOP_PAD = 14;
/** 绘图区下方：刻度（中心 +10）与 x 轴说明（中心 +30） */
const BOTTOM_PAD = 44;
/** x 轴刻度间隔（百分点） */
const TICK_STEP = 5;
/** x 轴至少覆盖 ±5 个百分点 */
const MIN_EXTENT = 5;
/** 定义域留白系数，避免端点贴边 */
const EXTENT_PADDING = 1.1;
const Z_SCORE = 1.96;
const MIN_RADIUS = 3;
const MAX_RADIUS = 7;
const MIN_OPACITY = 0.5;
/** 轴文字 */
const AXIS_FONT_SIZE = 10;
/** 行标签与数值列 */
const FONT_SIZE = 11;
const NAME_MAX_WIDTH = 130;
const VALUE_X = PLOT_RIGHT + 10;
const VERDICT_X = PLOT_RIGHT + 70;
const COUNT_X = WIDTH - 15;
const GRID_COLOR = "var(--border)";
const GRID_DASH = "3 3";

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

function truncateToWidth(text: string, maxWidth: number, fontSize: number): string {
  if (estimateTextWidth(text, fontSize) <= maxWidth) return text;
  let truncated = "";
  for (const char of text) {
    if (estimateTextWidth(`${truncated}${char}…`, fontSize) > maxWidth) break;
    truncated += char;
  }
  return `${truncated}…`;
}

/** 定义域以 0 为中心对称，至少 ±5 个百分点，并覆盖全部估计与置信区间。 */
function computeExtent(rows: JudgerForestPlotRow[]): number {
  let maxAbs = MIN_EXTENT;
  for (const row of rows) {
    const biasPercent = Math.abs(row.bias) * 100;
    const halfWidth =
      row.standardError === null || !Number.isFinite(row.standardError)
        ? 0
        : Z_SCORE * Math.abs(row.standardError) * 100;
    maxAbs = Math.max(maxAbs, biasPercent + halfWidth);
  }
  return Math.max(MIN_EXTENT, maxAbs * EXTENT_PADDING);
}

function buildTicks(extent: number): number[] {
  const limit = Math.floor(extent / TICK_STEP) * TICK_STEP;
  const ticks: number[] = [];
  for (let tick = -limit; tick <= limit; tick += TICK_STEP) {
    ticks.push(tick);
  }
  return ticks;
}

export function JudgerForestPlot({
  rows,
  className,
}: {
  rows: JudgerForestPlotRow[];
  className?: string;
}): React.ReactElement {
  const svgClassName = cn("w-full h-auto", className);

  if (rows.length === 0) {
    return (
      <svg
        className={svgClassName}
        viewBox="0 0 320 80"
        role="img"
        aria-label="讲师宽严森林图：暂无数据"
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

  const extent = computeExtent(rows);
  const plotWidth = PLOT_RIGHT - PLOT_LEFT;
  const plotBottom = TOP_PAD + rows.length * ROW_HEIGHT;
  const height = plotBottom + BOTTOM_PAD;
  const ticks = buildTicks(extent);
  const maxObservationCount = Math.max(
    1,
    ...rows.map((row) => Math.max(0, row.observationCount)),
  );

  /** 百分点 → 画布 x 坐标 */
  const scaleX = (percent: number) =>
    PLOT_LEFT + ((percent + extent) / (2 * extent)) * plotWidth;
  const zeroX = scaleX(0);

  return (
    <svg
      className={svgClassName}
      viewBox={`0 0 ${WIDTH} ${height}`}
      role="img"
      aria-label={`讲师宽严森林图：共 ${rows.length} 名讲师，横轴为宽严（百分点，正值偏松）`}
    >
      {ticks.map((tick) => (
        <line
          key={`grid-${tick}`}
          data-part="grid-line"
          x1={scaleX(tick)}
          x2={scaleX(tick)}
          y1={TOP_PAD}
          y2={plotBottom}
          stroke={GRID_COLOR}
          strokeWidth={1}
          strokeDasharray={GRID_DASH}
          opacity={0.6}
        />
      ))}

      <line
        data-part="reference-line"
        x1={zeroX}
        x2={zeroX}
        y1={TOP_PAD}
        y2={plotBottom}
        stroke="var(--muted-foreground)"
        strokeWidth={1}
      />

      <line
        data-part="axis-line"
        x1={PLOT_LEFT}
        x2={PLOT_RIGHT}
        y1={plotBottom}
        y2={plotBottom}
        stroke={GRID_COLOR}
        strokeWidth={1}
      />

      {ticks.map((tick) => (
        <g key={`tick-${tick}`} data-part="tick">
          <line
            data-part="tick-mark"
            x1={scaleX(tick)}
            x2={scaleX(tick)}
            y1={plotBottom}
            y2={plotBottom + 4}
            stroke={GRID_COLOR}
            strokeWidth={1}
          />
          <text
            data-part="tick-label"
            x={scaleX(tick)}
            y={plotBottom + 10}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={AXIS_FONT_SIZE}
            fill="var(--muted-foreground)"
          >
            {tick === 0 ? "0" : `${tick > 0 ? "+" : "-"}${Math.abs(tick)}%`}
          </text>
        </g>
      ))}

      <text
        data-part="axis-caption"
        x={(PLOT_LEFT + PLOT_RIGHT) / 2}
        y={plotBottom + 30}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={AXIS_FONT_SIZE}
        fill="var(--muted-foreground)"
      >
        宽严（百分点，正 = 偏松）
      </text>

      {rows.map((row, index) => {
        const y = TOP_PAD + ROW_HEIGHT * (index + 0.5);
        const meta = JUDGER_VERDICT_META[row.verdict] ?? JUDGER_VERDICT_META.unknown;
        const biasPercent = row.bias * 100;
        const standardErrorPercent =
          row.standardError === null || !Number.isFinite(row.standardError)
            ? null
            : Math.abs(row.standardError) * 100;
        const hasInterval = standardErrorPercent !== null && standardErrorPercent > 0;
        const halfWidth = hasInterval ? Z_SCORE * standardErrorPercent : 0;
        const lowerX = scaleX(clamp(biasPercent - halfWidth, -extent, extent));
        const upperX = scaleX(clamp(biasPercent + halfWidth, -extent, extent));
        const radius =
          MIN_RADIUS +
          (MAX_RADIUS - MIN_RADIUS) *
            Math.sqrt(clamp(Math.max(0, row.observationCount) / maxObservationCount, 0, 1));
        const opacity = MIN_OPACITY + (1 - MIN_OPACITY) * clamp(row.credibility, 0, 1);
        const biasLabel = `${biasPercent > 0 ? "+" : biasPercent < 0 ? "−" : ""}${Math.abs(biasPercent).toFixed(1)}pp`;

        return (
          <g key={`${row.judgerId}-${index}`} data-part="row" data-judger-id={row.judgerId}>
            <title>
              {`${row.name}：宽严 ${biasLabel}，n=${row.observationCount}，${meta.label}`}
            </title>

            <text
              data-part="row-label"
              x={PLOT_LEFT - 12}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={FONT_SIZE}
              fill="var(--foreground)"
            >
              {truncateToWidth(row.name, NAME_MAX_WIDTH, FONT_SIZE)}
            </text>

            {hasInterval && (
              <>
                <line
                  data-part="whisker"
                  data-judger-id={row.judgerId}
                  x1={lowerX}
                  x2={upperX}
                  y1={y}
                  y2={y}
                  stroke={meta.color}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  opacity={0.9}
                />
                <line
                  data-part="whisker-cap"
                  data-judger-id={row.judgerId}
                  x1={lowerX}
                  x2={lowerX}
                  y1={y - 4}
                  y2={y + 4}
                  stroke={meta.color}
                  strokeWidth={1.5}
                  opacity={0.9}
                />
                <line
                  data-part="whisker-cap"
                  data-judger-id={row.judgerId}
                  x1={upperX}
                  x2={upperX}
                  y1={y - 4}
                  y2={y + 4}
                  stroke={meta.color}
                  strokeWidth={1.5}
                  opacity={0.9}
                />
              </>
            )}

            <circle
              data-part="point"
              data-judger-id={row.judgerId}
              data-verdict={row.verdict}
              cx={scaleX(clamp(biasPercent, -extent, extent))}
              cy={y}
              r={radius}
              fill={hasInterval ? meta.color : "none"}
              stroke={meta.color}
              strokeWidth={1.5}
              strokeDasharray={hasInterval ? undefined : "2 2"}
              style={{ opacity }}
            />

            <text
              data-part="row-value"
              data-judger-id={row.judgerId}
              x={VALUE_X}
              y={y}
              textAnchor="start"
              dominantBaseline="middle"
              fontSize={FONT_SIZE}
              fill={meta.color}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {biasLabel}
            </text>

            <text
              data-part="verdict-label"
              data-judger-id={row.judgerId}
              x={VERDICT_X}
              y={y}
              textAnchor="start"
              dominantBaseline="middle"
              fontSize={FONT_SIZE}
              fill="var(--muted-foreground)"
            >
              {meta.label}
            </text>

            <text
              data-part="observation-count"
              data-judger-id={row.judgerId}
              x={COUNT_X}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={FONT_SIZE}
              fill="var(--muted-foreground)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {`n=${row.observationCount}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
