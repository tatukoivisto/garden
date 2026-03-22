'use client';

/**
 * SunHeatmap – SVG <g> overlay that renders a sun-exposure heatmap on the
 * garden canvas.  Drop it inside the main canvas <svg> element.
 *
 * The component keeps its own `dayOfYear` slider state so it can be used
 * standalone; the parent can optionally drive it via the `dayOfYear` prop and
 * the `onDayOfYearChange` callback.
 */

import { useMemo, useState } from 'react';
import { generateSunHeatmap } from '@/lib/ruleEngine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SunHeatmapProps {
  gardenWidth_m: number;
  gardenDepth_m: number;
  pixelsPerMeter: number;
  /** Initial / controlled day of year (1–365). Defaults to 172 (summer solstice). */
  dayOfYear?: number;
  /** Called when the built-in slider changes the day. */
  onDayOfYearChange?: (day: number) => void;
  /** Observer latitude for the heatmap model. Defaults to 60.17 (Helsinki). */
  latitude_deg?: number;
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

/** Six-stop colour ramp: dark-blue → blue → green → yellow → orange → red */
const STOPS: { hours: number; r: number; g: number; b: number }[] = [
  { hours:  0, r:  13, g:  71, b: 161 }, // dark blue   – 0 h
  { hours:  2, r:  30, g: 136, b: 229 }, // blue        – 2 h
  { hours:  4, r:  67, g: 160, b:  71 }, // green       – 4 h
  { hours:  6, r: 253, g: 216, b:  53 }, // yellow      – 6 h
  { hours:  8, r: 245, g: 124, b:   0 }, // orange      – 8 h
  { hours: 10, r: 211, g:  47, b:  47 }, // red         – 10+ h
];

function sunHoursToRgb(hours: number): string {
  const h = Math.min(hours, 10);

  // Find the two bracketing stops
  let lo = STOPS[0];
  let hi = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (h >= STOPS[i].hours && h <= STOPS[i + 1].hours) {
      lo = STOPS[i];
      hi = STOPS[i + 1];
      break;
    }
  }

  const range = hi.hours - lo.hours;
  const t = range === 0 ? 0 : (h - lo.hours) / range;
  const r = Math.round(lo.r + t * (hi.r - lo.r));
  const g = Math.round(lo.g + t * (hi.g - lo.g));
  const b = Math.round(lo.b + t * (hi.b - lo.b));
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// Day-of-year helpers
// ---------------------------------------------------------------------------

/** Map a slider value (0–100) to a day of year spanning spring → summer → autumn. */
function sliderToDayOfYear(slider: number): number {
  // Spring equinox ≈ day 80, summer solstice ≈ day 172, autumn equinox ≈ day 266
  const start = 80;
  const end = 266;
  return Math.round(start + (slider / 100) * (end - start));
}

function dayOfYearToSlider(day: number): number {
  const start = 80;
  const end = 266;
  return Math.round(((day - start) / (end - start)) * 100);
}

function dayOfYearLabel(day: number): string {
  // Approximate month/day from day-of-year (non-leap year)
  const months = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let remaining = day;
  for (let m = 0; m < months.length; m++) {
    if (remaining <= months[m]) {
      return `${names[m]} ${remaining}`;
    }
    remaining -= months[m];
  }
  return `Day ${day}`;
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

const LEGEND_ITEMS: { label: string; color: string }[] = [
  { label: '0–2 h', color: sunHoursToRgb(1) },
  { label: '2–4 h', color: sunHoursToRgb(3) },
  { label: '4–6 h', color: sunHoursToRgb(5) },
  { label: '6–8 h', color: sunHoursToRgb(7) },
  { label: '8–10 h', color: sunHoursToRgb(9) },
  { label: '10+ h', color: sunHoursToRgb(10) },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SunHeatmap({
  gardenWidth_m,
  gardenDepth_m,
  pixelsPerMeter,
  dayOfYear: controlledDay,
  onDayOfYearChange,
  latitude_deg = 60.17,
}: SunHeatmapProps) {
  const CELL_SIZE_M = 0.5;

  // Internal slider state (0–100). Synced from prop when provided.
  const [sliderValue, setSliderValue] = useState<number>(() =>
    controlledDay !== undefined
      ? dayOfYearToSlider(controlledDay)
      : dayOfYearToSlider(172),
  );

  const dayOfYear =
    controlledDay !== undefined ? controlledDay : sliderToDayOfYear(sliderValue);

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value);
    setSliderValue(val);
    onDayOfYearChange?.(sliderToDayOfYear(val));
  }

  // Generate heatmap cells – memoised so it only recomputes when inputs change
  const cells = useMemo(
    () =>
      generateSunHeatmap({
        gardenWidth_m,
        gardenDepth_m,
        cellSize_m: CELL_SIZE_M,
        dayOfYear,
        latitude_deg,
      }),
    [gardenWidth_m, gardenDepth_m, dayOfYear, latitude_deg],
  );

  const cellPx = CELL_SIZE_M * pixelsPerMeter;

  // Canvas pixel size (for legend positioning)
  const canvasW = gardenWidth_m * pixelsPerMeter;
  const canvasH = gardenDepth_m * pixelsPerMeter;

  // Legend dimensions
  const LEGEND_ITEM_W = 52;
  const LEGEND_ITEM_H = 18;
  const LEGEND_PADDING = 8;
  const legendW = LEGEND_ITEM_W * LEGEND_ITEMS.length + LEGEND_PADDING * 2;
  const legendH = LEGEND_ITEM_H + LEGEND_PADDING * 2 + 14; // +14 for title
  const legendX = (canvasW - legendW) / 2;
  const legendY = canvasH + 8;

  // Slider panel dimensions (rendered as a foreignObject so we can use HTML
  // range input – much simpler than a custom SVG slider)
  const SLIDER_W = Math.min(canvasW * 0.6, 280);
  const SLIDER_H = 52;
  const sliderX = (canvasW - SLIDER_W) / 2;
  const sliderY = legendY + legendH + 6;

  return (
    <g>
      {/* ── Heatmap cells ────────────────────────────────────────── */}
      <g opacity={0.4}>
        {cells.map((cell) => (
          <rect
            key={`${cell.col}-${cell.row}`}
            x={cell.col * cellPx}
            y={cell.row * cellPx}
            width={cellPx}
            height={cellPx}
            fill={sunHoursToRgb(cell.sunHours)}
          />
        ))}
      </g>

      {/* ── Legend ───────────────────────────────────────────────── */}
      <g transform={`translate(${legendX}, ${legendY})`}>
        {/* Background pill */}
        <rect
          x={0}
          y={0}
          width={legendW}
          height={legendH}
          rx={6}
          ry={6}
          fill="white"
          fillOpacity={0.92}
          stroke="#CBD5E1"
          strokeWidth={1}
        />
        {/* Title */}
        <text
          x={legendW / 2}
          y={LEGEND_PADDING + 10}
          textAnchor="middle"
          fontSize={9}
          fontFamily="system-ui, sans-serif"
          fill="#475569"
          fontWeight="600"
          letterSpacing="0.05em"
        >
          SUN HOURS / DAY
        </text>
        {/* Colour swatches + labels */}
        {LEGEND_ITEMS.map((item, i) => {
          const itemX = LEGEND_PADDING + i * LEGEND_ITEM_W;
          const itemY = LEGEND_PADDING + 14;
          return (
            <g key={item.label} transform={`translate(${itemX}, ${itemY})`}>
              <rect
                x={2}
                y={0}
                width={LEGEND_ITEM_W - 8}
                height={10}
                rx={2}
                fill={item.color}
                opacity={0.85}
              />
              <text
                x={(LEGEND_ITEM_W - 8) / 2 + 2}
                y={20}
                textAnchor="middle"
                fontSize={8}
                fontFamily="system-ui, sans-serif"
                fill="#475569"
              >
                {item.label}
              </text>
            </g>
          );
        })}
      </g>

      {/* ── Day-of-year slider (HTML inside foreignObject) ───────── */}
      <foreignObject
        x={sliderX}
        y={sliderY}
        width={SLIDER_W}
        height={SLIDER_H}
      >
        {/* @ts-expect-error – xmlns required on foreignObject children in some SVG renderers */}
        <div xmlns="http://www.w3.org/1999/xhtml"
          style={{
            background: 'rgba(255,255,255,0.92)',
            borderRadius: '6px',
            border: '1px solid #CBD5E1',
            padding: '6px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '9px',
            fontFamily: 'system-ui, sans-serif',
            color: '#475569',
            fontWeight: 600,
            letterSpacing: '0.05em',
          }}>
            <span>SPRING EQ</span>
            <span style={{ color: '#1e40af', fontWeight: 700 }}>
              {dayOfYearLabel(dayOfYear)}
            </span>
            <span>AUTUMN EQ</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={sliderValue}
            onChange={handleSliderChange}
            style={{
              width: '100%',
              accentColor: '#4A7C59',
              cursor: 'pointer',
              height: '4px',
            }}
            aria-label="Day of year"
          />
        </div>
      </foreignObject>
    </g>
  );
}
