'use client';

/**
 * SeasonalTimeline – SVG Gantt chart showing crop timing across the year.
 *
 * Features:
 *   - X-axis: months Jan–Dec
 *   - Y-axis: crops grouped by zone
 *   - Colour bars: blue = indoor sow, green = growing outdoors, gold = harvest
 *   - Red vertical line for today's date
 *   - Zone filter dropdown
 *   - Hover tooltips
 */

import React, { useMemo, useRef, useState } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import { cropMap } from '@/data/crops';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const ROW_H = 28;
const LABEL_W = 160;
const HEADER_H = 36;
const PAD_T = 8;
const PAD_B = 16;
const BAR_H = 14;
const BAR_RADIUS = 3;

const PHASE_COLORS = {
  indoor: '#93c5fd',   // blue-300
  growing: '#4ade80',  // green-400
  harvest: '#fbbf24',  // amber-400
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Day-of-year for a "MM-DD" string (e.g. "05-15" → ~135) */
function mmddToDoy(mmdd: string): number {
  const [m, d] = mmdd.split('-').map(Number);
  let doy = d;
  for (let i = 0; i < m - 1; i++) doy += MONTH_DAYS[i];
  return doy;
}

/** Day of year for today */
function todayDoy(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}

/** Convert a day-of-year (1-365) to an x fraction (0-1) */
function doyToFrac(doy: number): number {
  return Math.max(0, Math.min(1, (doy - 1) / 365));
}

interface PhaseBar {
  phase: 'indoor' | 'growing' | 'harvest';
  startDoy: number;
  endDoy: number;
  label: string;
}

interface CropRow {
  zoneId: string;
  zoneName: string;
  zoneColor: string;
  cropId: string;
  cropName: string;
  cropEmoji: string;
  cropNameFi: string;
  bars: PhaseBar[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip
// ─────────────────────────────────────────────────────────────────────────────

interface TooltipState {
  x: number;
  y: number;
  content: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function SeasonalTimeline() {
  const garden = useGardenStore((s) => s.garden);
  const [filterZoneId, setFilterZoneId] = useState<string>('all');
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const activeSeason = useMemo(
    () => garden?.seasons.find((s) => s.id === garden.active_season),
    [garden],
  );

  // Build row data
  const rows = useMemo<CropRow[]>(() => {
    if (!garden || !activeSeason) return [];

    const lastFrostDoy = mmddToDoy(garden.climate.last_frost);
    const firstFrostDoy = mmddToDoy(garden.climate.first_frost);

    const result: CropRow[] = [];

    for (const assignment of activeSeason.crop_assignments) {
      const zone = garden.zones.find((z) => z.id === assignment.zone_id);
      if (!zone) continue;
      if (filterZoneId !== 'all' && zone.id !== filterZoneId) continue;

      for (const ca of assignment.crops) {
        const crop = cropMap[ca.crop_id];
        if (!crop) continue;

        const bars: PhaseBar[] = [];

        // Indoor sow phase
        if (crop.sow_indoor_weeks_before_last_frost > 0) {
          const indoorStart = lastFrostDoy - crop.sow_indoor_weeks_before_last_frost * 7;
          const indoorEnd = lastFrostDoy + (crop.transplant_weeks_after_last_frost ?? 0) * 7;
          bars.push({
            phase: 'indoor',
            startDoy: Math.max(1, indoorStart),
            endDoy: Math.min(365, indoorEnd),
            label: `Sow indoors (${crop.sow_indoor_weeks_before_last_frost} wks before last frost)`,
          });
        }

        // Growing phase (transplant/direct sow → harvest start)
        const growStart = crop.direct_sow
          ? lastFrostDoy
          : lastFrostDoy + (crop.transplant_weeks_after_last_frost ?? 0) * 7;
        const growEnd = growStart + crop.days_to_harvest[0];
        if (growEnd > growStart) {
          bars.push({
            phase: 'growing',
            startDoy: Math.max(1, growStart),
            endDoy: Math.min(365, growEnd),
            label: `Growing (${crop.days_to_harvest[0]}–${crop.days_to_harvest[1]} days to harvest)`,
          });
        }

        // Harvest window
        const harvestEnd = Math.min(firstFrostDoy, growEnd + crop.harvest_window_weeks * 7);
        if (harvestEnd > growEnd) {
          bars.push({
            phase: 'harvest',
            startDoy: Math.max(1, growEnd),
            endDoy: Math.min(365, harvestEnd),
            label: `Harvest window (${crop.harvest_window_weeks} wks)`,
          });
        }

        result.push({
          zoneId: zone.id,
          zoneName: zone.name,
          zoneColor: zone.color,
          cropId: crop.id,
          cropName: crop.name_en,
          cropEmoji: crop.emoji,
          cropNameFi: crop.name_fi,
          bars,
        });
      }
    }

    return result;
  }, [garden, activeSeason, filterZoneId]);

  // Group rows by zone for display
  const rowsWithHeaders = useMemo(() => {
    const out: Array<{ type: 'header'; zoneId: string; zoneName: string; zoneColor: string } | { type: 'crop'; row: CropRow; rowIdx: number }> = [];
    let lastZoneId = '';
    let rowIdx = 0;
    for (const row of rows) {
      if (row.zoneId !== lastZoneId) {
        out.push({ type: 'header', zoneId: row.zoneId, zoneName: row.zoneName, zoneColor: row.zoneColor });
        lastZoneId = row.zoneId;
      }
      out.push({ type: 'crop', row, rowIdx: rowIdx++ });
    }
    return out;
  }, [rows]);

  if (!garden || !activeSeason) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400 italic">
        No garden loaded.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400 italic px-4 text-center">
        No crops assigned yet. Add crops to zones to see the timeline.
      </div>
    );
  }

  // Dimensions
  const chartW = 700; // logical SVG units (scrollable)
  const plotW = chartW - LABEL_W;

  // Count total display rows (headers + crop rows)
  let totalDisplayRows = 0;
  for (const item of rowsWithHeaders) {
    totalDisplayRows += item.type === 'header' ? 0.5 : 1;
  }
  const svgH = HEADER_H + PAD_T + totalDisplayRows * ROW_H + PAD_B;

  // Month x-positions
  const monthX = (month: number) => LABEL_W + (month / 12) * plotW;

  // Day-of-year to SVG x
  const doyToX = (doy: number) => LABEL_W + doyToFrac(doy) * plotW;

  const todayX = doyToX(todayDoy());

  // Y position for nth row in display list
  let yAccum = HEADER_H + PAD_T;
  const rowYs: number[] = [];
  for (const item of rowsWithHeaders) {
    if (item.type === 'header') {
      rowYs.push(yAccum);
      yAccum += ROW_H * 0.5;
    } else {
      rowYs.push(yAccum);
      yAccum += ROW_H;
    }
  }

  const zones = garden.zones.filter((z) => z.category === 'growing');

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 flex-wrap">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Seasonal Timeline</span>

        {/* Zone filter */}
        <div className="flex items-center gap-1.5 ml-auto">
          <label className="text-xs text-gray-500" htmlFor="tl-zone-filter">Zone</label>
          <select
            id="tl-zone-filter"
            value={filterZoneId}
            onChange={(e) => setFilterZoneId(e.target.value)}
            className="
              text-xs border border-gray-200 rounded-lg px-2 py-1
              bg-white text-gray-700
              focus:outline-none focus:ring-2 focus:ring-garden-leaf/30
            "
          >
            <option value="all">All zones</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>{z.name}</option>
            ))}
          </select>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3">
          {(['indoor', 'growing', 'harvest'] as const).map((p) => (
            <span key={p} className="flex items-center gap-1 text-[10px] text-gray-500">
              <span className="w-3 h-2.5 rounded-sm inline-block" style={{ backgroundColor: PHASE_COLORS[p] }} />
              {p === 'indoor' ? 'Sow indoors' : p === 'growing' ? 'Growing' : 'Harvest'}
            </span>
          ))}
          <span className="flex items-center gap-1 text-[10px] text-gray-500">
            <span className="w-0.5 h-3 bg-red-500 inline-block" />
            Today
          </span>
        </div>
      </div>

      {/* ── SVG chart (scrollable) ─────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${chartW} ${svgH}`}
          width="100%"
          style={{ minWidth: 500, display: 'block' }}
          aria-label="Seasonal planting timeline"
          onMouseLeave={() => setTooltip(null)}
        >
          {/* ── Month headers ─────────────────────────────────────────────── */}
          {MONTHS.map((m, i) => {
            const x = monthX(i);
            const x2 = monthX(i + 1);
            return (
              <g key={m}>
                {/* Alternating band */}
                <rect
                  x={x}
                  y={HEADER_H}
                  width={x2 - x}
                  height={svgH - HEADER_H}
                  fill={i % 2 === 0 ? '#f9fafb' : '#ffffff'}
                />
                {/* Month label */}
                <text
                  x={(x + x2) / 2}
                  y={HEADER_H - 8}
                  textAnchor="middle"
                  className="text-[10px]"
                  style={{ fontSize: 10, fill: '#9ca3af', fontFamily: 'inherit' }}
                >
                  {m}
                </text>
                {/* Vertical grid line */}
                <line
                  x1={x}
                  y1={HEADER_H}
                  x2={x}
                  y2={svgH - PAD_B}
                  stroke="#e5e7eb"
                  strokeWidth={0.5}
                />
              </g>
            );
          })}

          {/* ── Header bottom border ───────────────────────────────────────── */}
          <line x1={0} y1={HEADER_H} x2={chartW} y2={HEADER_H} stroke="#e5e7eb" strokeWidth={1} />

          {/* ── Rows ──────────────────────────────────────────────────────── */}
          {rowsWithHeaders.map((item, idx) => {
            const y = rowYs[idx];

            if (item.type === 'header') {
              return (
                <g key={`h-${item.zoneId}`}>
                  <rect
                    x={0}
                    y={y}
                    width={LABEL_W}
                    height={ROW_H * 0.5}
                    fill={`${item.zoneColor}22`}
                  />
                  <text
                    x={8}
                    y={y + ROW_H * 0.35}
                    style={{ fontSize: 9, fontWeight: 700, fill: '#374151', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: 0.5 }}
                  >
                    {item.zoneName}
                  </text>
                  <line
                    x1={0}
                    y1={y}
                    x2={chartW}
                    y2={y}
                    stroke={item.zoneColor}
                    strokeWidth={1.5}
                    strokeOpacity={0.4}
                  />
                </g>
              );
            }

            // Crop row
            const { row } = item;
            const centerY = y + ROW_H / 2;
            const barY = centerY - BAR_H / 2;

            return (
              <g key={`${row.zoneId}-${row.cropId}`}>
                {/* Row bg hover */}
                <rect
                  x={0}
                  y={y}
                  width={chartW}
                  height={ROW_H}
                  fill="transparent"
                  onMouseEnter={() => {}}
                />
                {/* Crop label */}
                <text
                  x={8}
                  y={centerY + 4}
                  style={{ fontSize: 11, fill: '#374151', fontFamily: 'inherit' }}
                >
                  {row.cropEmoji} {row.cropName}
                </text>

                {/* Phase bars */}
                {row.bars.map((bar, bi) => {
                  const bx = doyToX(bar.startDoy);
                  const bw = Math.max(4, doyToX(bar.endDoy) - bx);
                  const color = PHASE_COLORS[bar.phase];

                  return (
                    <rect
                      key={bi}
                      x={bx}
                      y={barY}
                      width={bw}
                      height={BAR_H}
                      rx={BAR_RADIUS}
                      fill={color}
                      fillOpacity={0.85}
                      stroke={color}
                      strokeWidth={0.5}
                      strokeOpacity={0.6}
                      style={{ cursor: 'default' }}
                      onMouseEnter={(e) => {
                        const svgRect = svgRef.current?.getBoundingClientRect();
                        if (!svgRect) return;
                        setTooltip({
                          x: e.clientX - svgRect.left,
                          y: e.clientY - svgRect.top - 36,
                          content: `${row.cropEmoji} ${row.cropName} — ${bar.label}`,
                        });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })}

                {/* Row separator */}
                <line
                  x1={LABEL_W}
                  y1={y + ROW_H}
                  x2={chartW}
                  y2={y + ROW_H}
                  stroke="#f3f4f6"
                  strokeWidth={0.5}
                />
              </g>
            );
          })}

          {/* ── Today line ────────────────────────────────────────────────── */}
          {todayX >= LABEL_W && (
            <>
              <line
                x1={todayX}
                y1={HEADER_H}
                x2={todayX}
                y2={svgH - PAD_B}
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              <text
                x={todayX + 3}
                y={HEADER_H + 10}
                style={{ fontSize: 8, fill: '#ef4444', fontFamily: 'inherit', fontWeight: 600 }}
              >
                Today
              </text>
            </>
          )}
        </svg>

        {/* ── Tooltip ──────────────────────────────────────────────────── */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-50 bg-gray-900 text-white text-xs px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap"
            style={{ left: tooltip.x + 12, top: tooltip.y }}
          >
            {tooltip.content}
          </div>
        )}
      </div>
    </div>
  );
}
