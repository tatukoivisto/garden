'use client';

/**
 * SeasonalTimeline
 *
 * A Gantt-chart-style SVG timeline showing sowing, growing, harvest, and
 * storage windows for every crop currently assigned in the garden, grouped
 * by zone.
 *
 * Features
 * ─────────
 * • Horizontal timeline: X-axis = months Jan–Dec, Y-axis = crops by zone
 * • Bars per crop:
 *     – Light-blue  : indoor sowing window
 *     – Family-tinted green : outdoor growing period
 *     – Amber/gold  : harvest window
 *     – Gray        : storage period (root / bulb crops)
 * • Family colour tinting on growing bar (Solanaceae=red, Brassicaceae=green, …)
 * • Red dashed vertical line at today's date
 * • Zone filter dropdown
 * • Year selector tabs (shows all seasons in the garden)
 * • Rich hover tooltip (crop name, dates, zone, family)
 * • Responsive – horizontally scrollable on small screens
 * • Rendered as SVG for crisp output
 *
 * Sowing dates are derived from getSowingWindow() in the rule engine, which
 * uses the garden's ClimateConfig to calculate everything from last_frost /
 * first_frost dates.
 */

import React, { useMemo, useRef, useState, useCallback } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import { cropMap } from '@/data/crops';
import { getSowingWindow, getFamilyColor } from '@/lib/ruleEngine';
import type { Crop, Zone } from '@/types';

// ─── Layout constants ─────────────────────────────────────────────────────────

/** Height of a single crop row in SVG units (px). */
const ROW_H = 30;
/** Left gutter width for crop / zone labels. */
const LABEL_W = 164;
/** Width of each month column. */
const MONTH_W = 72;
/** Height of the month-name header strip. */
const HEADER_H = 38;
/** Height of a zone group-header strip. */
const ZONE_HEADER_H = 22;
/** Total number of months. */
const TOTAL_MONTHS = 12;
/** Full chart width including label gutter. */
const CHART_W = LABEL_W + MONTH_W * TOTAL_MONTHS;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** True when year is a leap year. */
const leapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Days in year for `y`. */
const daysInYear = (y: number) => (leapYear(y) ? 366 : 365);

/** Fractional day-of-year for a Date (1 Jan = 0). */
function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.max(0, (d.getTime() - start.getTime()) / 86_400_000);
}

/** Convert a day-of-year value to SVG x within the chart area. */
function dayToX(day: number, year: number): number {
  return LABEL_W + (day / daysInYear(year)) * (MONTH_W * TOTAL_MONTHS);
}

/** Clamp `x` to the chart's drawable area. */
const clampX = (x: number) =>
  Math.max(LABEL_W, Math.min(LABEL_W + MONTH_W * TOTAL_MONTHS, x));

/** Format a Date as day-month short string. */
const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * Lighten a 6-digit hex colour toward white by `ratio` (0=unchanged, 1=white).
 * Returns an rgb() string.
 */
function lightenHex(hex: string, ratio = 0.45): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * ratio);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

// ─── SVG bar primitive ─────────────────────────────────────────────────────────

interface BarProps {
  x1: number;
  x2: number;
  /** Top-left y of the containing row. */
  rowY: number;
  fill: string;
  /** Bar height as fraction of ROW_H. */
  heightFrac?: number;
  opacity?: number;
  rx?: number;
}

function Bar({ x1, x2, rowY, fill, heightFrac = 0.55, opacity = 0.88, rx = 3 }: BarProps) {
  const h = ROW_H * heightFrac;
  const y = rowY + (ROW_H - h) / 2;
  const w = Math.max(x2 - x1, 2);
  return (
    <rect
      x={x1}
      y={y}
      width={w}
      height={h}
      rx={rx}
      ry={rx}
      fill={fill}
      opacity={opacity}
    />
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipData {
  clientX: number;
  clientY: number;
  cropName: string;
  zoneName: string;
  family: string;
  indoorStart: string | null;
  outdoorStart: string;
  harvestStart: string;
  harvestEnd: string;
  storageEnd: string | null;
}

// ─── Row data model ───────────────────────────────────────────────────────────

interface RowData {
  crop: Crop;
  zone: Zone;
  window: ReturnType<typeof getSowingWindow>;
}

interface GroupData {
  zone: Zone;
  rows: RowData[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SeasonalTimeline() {
  const garden = useGardenStore((s) => s.garden);

  // ── Year selector ─────────────────────────────────────────────────────────
  const thisYear = new Date().getFullYear();
  const availableYears = useMemo<number[]>(() => {
    if (!garden) return [thisYear];
    const set = new Set<number>([thisYear]);
    garden.seasons.forEach((s) => set.add(s.year));
    return Array.from(set).sort();
  }, [garden, thisYear]);

  const [year, setYear] = useState<number>(thisYear);

  // ── Zone filter ───────────────────────────────────────────────────────────
  const [zoneFilter, setZoneFilter] = useState<string>('all');

  // ── Tooltip ───────────────────────────────────────────────────────────────
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ── Build grouped row data ────────────────────────────────────────────────
  const groups = useMemo<GroupData[]>(() => {
    if (!garden) return [];

    const climate = garden.climate;

    // Collect crop assignments from all seasons matching the selected year
    const seasonIds = new Set(
      garden.seasons.filter((s) => s.year === year).map((s) => s.id),
    );

    // zone_id → Set<crop_id>
    const zoneCrops = new Map<string, Set<string>>();
    garden.seasons
      .filter((s) => seasonIds.has(s.id))
      .forEach((season) =>
        season.crop_assignments.forEach((ca) => {
          if (!zoneCrops.has(ca.zone_id)) zoneCrops.set(ca.zone_id, new Set());
          ca.crops.forEach((c) => zoneCrops.get(ca.zone_id)!.add(c.crop_id));
        }),
      );

    // Fall back: if the garden has zones but no assignments for the selected
    // year, show the active season regardless of year so the timeline is
    // always populated for demo purposes.
    if (zoneCrops.size === 0 && garden.active_season) {
      const activeSeason = garden.seasons.find((s) => s.id === garden.active_season);
      if (activeSeason) {
        activeSeason.crop_assignments.forEach((ca) => {
          if (!zoneCrops.has(ca.zone_id)) zoneCrops.set(ca.zone_id, new Set());
          ca.crops.forEach((c) => zoneCrops.get(ca.zone_id)!.add(c.crop_id));
        });
      }
    }

    const result: GroupData[] = [];

    for (const zone of garden.zones) {
      if (zone.category !== 'growing') continue;
      if (zoneFilter !== 'all' && zone.id !== zoneFilter) continue;

      const cropIds = Array.from(zoneCrops.get(zone.id) ?? []);
      if (cropIds.length === 0) continue;

      const rows: RowData[] = cropIds
        .map((id) => cropMap[id])
        .filter(Boolean)
        .map((crop) => ({
          crop,
          zone,
          window: getSowingWindow(crop, climate, year),
        }));

      if (rows.length > 0) result.push({ zone, rows });
    }

    return result;
  }, [garden, year, zoneFilter]);

  // ── Compute SVG dimensions ────────────────────────────────────────────────
  const totalRows = groups.reduce((n, g) => n + g.rows.length, 0);
  const svgH =
    HEADER_H + groups.length * ZONE_HEADER_H + totalRows * ROW_H + 12;

  // ── Today marker ─────────────────────────────────────────────────────────
  const today = new Date();
  const todayX =
    today.getFullYear() === year
      ? clampX(dayToX(dayOfYear(today), year))
      : null;

  // ── Month column x positions ──────────────────────────────────────────────
  const monthXs = useMemo(() =>
    MONTH_LABELS.map((_, i) => {
      const d = new Date(year, i, 1);
      return dayToX(dayOfYear(d), year);
    }), [year]);

  // ── Tooltip handlers ──────────────────────────────────────────────────────
  const showTooltip = useCallback(
    (e: React.MouseEvent, rd: RowData) => {
      const w = rd.window;
      setTooltip({
        clientX: e.clientX,
        clientY: e.clientY,
        cropName: `${rd.crop.emoji} ${rd.crop.name_en}`,
        zoneName: rd.zone.name,
        family: rd.crop.family,
        indoorStart: w.indoorStart ? fmtDate(w.indoorStart) : null,
        outdoorStart: fmtDate(w.outdoorStart),
        harvestStart: fmtDate(w.harvestStart),
        harvestEnd: fmtDate(w.harvestEnd),
        storageEnd: w.storageEnd ? fmtDate(w.storageEnd) : null,
      });
    },
    [],
  );
  const hideTooltip = useCallback(() => setTooltip(null), []);

  // ── Flatten rows for rendering ────────────────────────────────────────────
  interface FlatRow extends RowData { svgY: number }
  const flatRows: FlatRow[] = [];
  const groupHeaders: { zone: Zone; y: number }[] = [];
  let cursor = HEADER_H;
  for (const grp of groups) {
    groupHeaders.push({ zone: grp.zone, y: cursor });
    cursor += ZONE_HEADER_H;
    for (const row of grp.rows) {
      flatRows.push({ ...row, svgY: cursor });
      cursor += ROW_H;
    }
  }

  // ─── Empty states ─────────────────────────────────────────────────────────

  if (!garden) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-garden-stone italic">
        No garden loaded.
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-garden-cream-dark bg-white/70 p-8 text-center">
        <p className="text-sm font-medium text-garden-soil mb-1">
          No crop assignments for {year}
        </p>
        <p className="text-xs text-garden-stone">
          Assign crops to zones in the planner to see the seasonal timeline.
        </p>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      ref={wrapperRef}
      className="relative rounded-xl border border-garden-cream-dark bg-white/70 shadow-sm overflow-hidden"
    >
      {/* ── Top controls ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-garden-cream-dark bg-garden-cream/60">
        <span className="text-xs font-semibold text-garden-leaf-dark uppercase tracking-wide">
          Seasonal Timeline
        </span>

        {/* Year tabs */}
        <div className="flex gap-1 flex-wrap ml-2">
          {availableYears.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={[
                'px-2.5 py-0.5 text-xs rounded-full font-medium transition-colors',
                y === year
                  ? 'bg-garden-leaf text-white'
                  : 'bg-white/70 text-garden-soil hover:bg-garden-leaf/20',
              ].join(' ')}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Zone filter */}
        <select
          value={zoneFilter}
          onChange={(e) => setZoneFilter(e.target.value)}
          className="ml-auto text-xs rounded-lg border border-garden-cream-dark bg-white/80 px-2 py-1 text-garden-soil focus:outline-none focus:ring-1 focus:ring-garden-leaf"
        >
          <option value="all">All zones</option>
          {garden.zones
            .filter((z) => z.category === 'growing')
            .map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
        </select>
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-1.5 border-b border-garden-cream-dark bg-white/30 text-[11px] text-garden-soil">
        {[
          { label: 'Indoor sowing', fill: '#93C5FD' },
          { label: 'Growing outdoors', fill: '#4A7C59' },
          { label: 'Harvest window', fill: '#F4B942' },
          { label: 'Storage', fill: '#9E9E8E' },
        ].map(({ label, fill }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span
              className="inline-block w-4 h-3 rounded-sm"
              style={{ backgroundColor: fill, opacity: 0.85 }}
            />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1 ml-auto opacity-60">
          <span className="inline-block w-px h-3 bg-red-500" />
          <span>Today</span>
        </span>
      </div>

      {/* ── SVG chart (horizontally scrollable) ──────────────────────────── */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: CHART_W }}>
          <svg
            width={CHART_W}
            height={svgH}
            className="block select-none"
            aria-label="Seasonal planting timeline"
            onMouseLeave={hideTooltip}
          >
            {/* ── Alternating month bands + grid lines ─────────────────── */}
            {monthXs.map((x, i) => {
              const nextX = monthXs[i + 1] ?? CHART_W;
              return (
                <g key={i}>
                  <rect
                    x={x}
                    y={HEADER_H}
                    width={nextX - x}
                    height={svgH - HEADER_H}
                    fill={i % 2 === 0 ? '#F9F7F2' : '#FFFFFF'}
                    opacity={0.7}
                  />
                  <line
                    x1={x}
                    y1={HEADER_H}
                    x2={x}
                    y2={svgH}
                    stroke="#E8E0C8"
                    strokeWidth={0.75}
                  />
                </g>
              );
            })}

            {/* ── Header bar ───────────────────────────────────────────── */}
            <rect x={0} y={0} width={CHART_W} height={HEADER_H} fill="#2F5E3A" />
            {/* Label column header */}
            <text
              x={LABEL_W / 2}
              y={HEADER_H / 2 + 5}
              textAnchor="middle"
              fill="#A8C66C"
              fontSize={10}
              fontWeight={600}
            >
              Crop
            </text>
            {/* Month labels */}
            {MONTH_LABELS.map((m, i) => {
              const x = monthXs[i];
              const nextX = monthXs[i + 1] ?? CHART_W;
              return (
                <text
                  key={m}
                  x={x + (nextX - x) / 2}
                  y={HEADER_H / 2 + 5}
                  textAnchor="middle"
                  fill="white"
                  fontSize={11}
                  fontWeight={500}
                >
                  {m}
                </text>
              );
            })}

            {/* ── Zone group headers ────────────────────────────────────── */}
            {groupHeaders.map(({ zone, y }) => (
              <g key={`gh-${zone.id}`}>
                <rect
                  x={0}
                  y={y}
                  width={CHART_W}
                  height={ZONE_HEADER_H}
                  fill="#4A7C5918"
                />
                <text
                  x={8}
                  y={y + ZONE_HEADER_H / 2 + 4}
                  fill="#2F5E3A"
                  fontSize={10}
                  fontWeight={700}
                >
                  {zone.name}
                </text>
              </g>
            ))}

            {/* ── Crop rows ─────────────────────────────────────────────── */}
            {flatRows.map((rd) => {
              const { crop, zone, window: w, svgY } = rd;
              const familyColor = getFamilyColor(crop.family);
              const key = `${zone.id}::${crop.id}`;

              // Compute bar x positions, clamped to chart area
              const cx = (d: Date) => clampX(dayToX(dayOfYear(d), year));

              const indX1 = w.indoorStart ? cx(w.indoorStart) : null;
              const indX2 = w.indoorEnd ? cx(w.indoorEnd) : null;
              const outX1 = cx(w.outdoorStart);
              const harX1 = cx(w.harvestStart);
              const harX2 = cx(w.harvestEnd);
              const stoX2 = w.storageEnd ? cx(w.storageEnd) : null;

              return (
                <g
                  key={key}
                  onMouseMove={(e) => showTooltip(e, rd)}
                  onMouseLeave={hideTooltip}
                  style={{ cursor: 'default' }}
                >
                  {/* Row hover highlight */}
                  <rect
                    x={0}
                    y={svgY}
                    width={CHART_W}
                    height={ROW_H}
                    fill="transparent"
                    className="hover:fill-garden-leaf/5"
                  />

                  {/* Crop label */}
                  <text
                    x={8}
                    y={svgY + ROW_H / 2 + 4}
                    fill="#5C3D2E"
                    fontSize={11}
                  >
                    {crop.emoji} {crop.name_en}
                  </text>

                  {/* Indoor sowing bar */}
                  {indX1 !== null && indX2 !== null && indX2 > indX1 && (
                    <Bar
                      x1={indX1}
                      x2={indX2}
                      rowY={svgY}
                      fill={lightenHex('#3B82F6', 0.35)}
                      heightFrac={0.48}
                      opacity={0.82}
                    />
                  )}

                  {/* Outdoor growing bar (family-colour tinted) */}
                  {harX1 > outX1 && (
                    <Bar
                      x1={outX1}
                      x2={harX1}
                      rowY={svgY}
                      fill={familyColor}
                      heightFrac={0.55}
                      opacity={0.78}
                    />
                  )}

                  {/* Harvest bar */}
                  {harX2 > harX1 && (
                    <Bar
                      x1={harX1}
                      x2={harX2}
                      rowY={svgY}
                      fill="#F4B942"
                      heightFrac={0.55}
                      opacity={0.88}
                    />
                  )}

                  {/* Storage bar */}
                  {stoX2 !== null && stoX2 > harX2 && (
                    <Bar
                      x1={harX2}
                      x2={stoX2}
                      rowY={svgY}
                      fill="#9E9E8E"
                      heightFrac={0.4}
                      opacity={0.6}
                    />
                  )}

                  {/* Row separator */}
                  <line
                    x1={LABEL_W}
                    y1={svgY + ROW_H - 0.5}
                    x2={CHART_W}
                    y2={svgY + ROW_H - 0.5}
                    stroke="#EDE4D0"
                    strokeWidth={0.5}
                  />
                </g>
              );
            })}

            {/* ── Today indicator ───────────────────────────────────────── */}
            {todayX !== null && (
              <g aria-label="Today">
                <line
                  x1={todayX}
                  y1={HEADER_H}
                  x2={todayX}
                  y2={svgH}
                  stroke="#EF4444"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  opacity={0.75}
                />
                <circle
                  cx={todayX}
                  cy={HEADER_H + 5}
                  r={3.5}
                  fill="#EF4444"
                  opacity={0.9}
                />
              </g>
            )}
          </svg>
        </div>
      </div>

      {/* ── Hover tooltip ────────────────────────────────────────────────── */}
      {tooltip && (
        <TooltipPopover
          data={tooltip}
          wrapperRef={wrapperRef}
        />
      )}
    </div>
  );
}

// ─── Tooltip popover (positioned relative to wrapper) ─────────────────────────

function TooltipPopover({
  data,
  wrapperRef,
}: {
  data: TooltipData;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
}) {
  const rect = wrapperRef.current?.getBoundingClientRect();
  if (!rect) return null;
  const left = data.clientX - rect.left + 14;
  const top = data.clientY - rect.top - 10;

  return (
    <div
      className="pointer-events-none absolute z-50 rounded-xl border border-garden-cream-dark bg-white/96 shadow-xl p-3 text-xs backdrop-blur-sm max-w-[220px]"
      style={{ left, top, transform: 'translateY(-50%)' }}
    >
      <p className="font-semibold text-garden-soil text-sm leading-tight mb-0.5">
        {data.cropName}
      </p>
      <p className="text-garden-stone mb-2 text-[11px]">{data.zoneName}</p>
      <table className="w-full text-garden-soil leading-5">
        <tbody>
          {data.indoorStart && (
            <tr>
              <td className="pr-2 text-blue-400">Indoor sow</td>
              <td className="font-medium">{data.indoorStart}</td>
            </tr>
          )}
          <tr>
            <td className="pr-2 text-garden-leaf">Outdoors</td>
            <td className="font-medium">{data.outdoorStart}</td>
          </tr>
          <tr>
            <td className="pr-2 text-garden-sun">Harvest from</td>
            <td className="font-medium">{data.harvestStart}</td>
          </tr>
          <tr>
            <td className="pr-2 text-garden-sun">Harvest to</td>
            <td className="font-medium">{data.harvestEnd}</td>
          </tr>
          {data.storageEnd && (
            <tr>
              <td className="pr-2 text-garden-stone">Storage end</td>
              <td className="font-medium">{data.storageEnd}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-2 text-garden-stone italic text-[10px]">{data.family}</p>
    </div>
  );
}
