'use client';

/**
 * CompanionMatrix
 *
 * A companion-planting relationship grid that shows how every crop currently
 * assigned in the garden relates to every other assigned crop.
 *
 * Features
 * ─────────
 * • Grid/table with crops on both axes (only currently-assigned crops)
 * • Cell types:
 *     – Green  ✓  : companion pair
 *     – Red    ✗  : antagonist pair
 *     – Gray   —  : neutral / no known relationship
 *     – Dark diagonal : same crop (self)
 * • Click / hover cell to display a tooltip explaining the relationship
 * • Sticky row header column and column header row while scrolling
 * • Row + column highlight on hover for easy cross-referencing
 * • Emoji + short name in both axes
 * • Summary column: companion count and antagonist count per crop
 * • Clean, professional Tailwind styling using the garden palette
 *
 * Companion data is sourced from the crop database (Crop.companions /
 * Crop.antagonists arrays). The checkCompanionship() function from the rule
 * engine is used for bidirectional lookups and explanatory text.
 */

import React, { useMemo, useState, useCallback, useRef } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import { cropMap } from '@/data/crops';
import { checkCompanionship, getFamilyColor } from '@/lib/ruleEngine';
import type { Crop } from '@/types';

// ─── Cell styling ─────────────────────────────────────────────────────────────

type Rel = 'companion' | 'antagonist' | 'neutral' | 'self';

const CELL_SYMBOL: Record<Rel, string> = {
  companion:  '✓',
  antagonist: '✗',
  neutral:    '—',
  self:       '·',
};

interface CellStyle {
  base: string;
  hover: string;
  highlight: string;
}

const CELL_STYLES: Record<Rel, CellStyle> = {
  companion: {
    base:      'bg-green-50 text-green-700',
    hover:     'bg-green-100 text-green-800',
    highlight: 'bg-green-100 text-green-800',
  },
  antagonist: {
    base:      'bg-red-50 text-red-600',
    hover:     'bg-red-100 text-red-700',
    highlight: 'bg-red-100 text-red-700',
  },
  neutral: {
    base:      'bg-white text-gray-300',
    hover:     'bg-gray-50 text-gray-400',
    highlight: 'bg-gray-50 text-gray-400',
  },
  self: {
    base:      'bg-gray-100 text-gray-400',
    hover:     'bg-gray-200 text-gray-500',
    highlight: 'bg-gray-200 text-gray-500',
  },
};

// ─── Tooltip popover ──────────────────────────────────────────────────────────

interface TooltipState {
  rowId: string;
  colId: string;
  relationship: Rel;
  reason: string;
  rowEmoji: string;
  rowName: string;
  colEmoji: string;
  colName: string;
  anchorEl: EventTarget & HTMLTableCellElement;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CompanionMatrix() {
  const garden = useGardenStore((s) => s.garden);

  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [hoveredCol, setHoveredCol] = useState<string | null>(null);
  const [tooltipState, setTooltipState] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Collect unique assigned crops from the active season ──────────────────
  const assignedCrops = useMemo<Crop[]>(() => {
    if (!garden) return [];

    const activeSeason = garden.seasons.find((s) => s.id === garden.active_season);
    if (!activeSeason) return [];

    const seen = new Set<string>();
    const result: Crop[] = [];
    for (const za of activeSeason.crop_assignments) {
      for (const ca of za.crops) {
        if (seen.has(ca.crop_id)) continue;
        const crop = cropMap[ca.crop_id];
        if (crop) {
          seen.add(ca.crop_id);
          result.push(crop);
        }
      }
    }
    return result.sort((a, b) => a.name_en.localeCompare(b.name_en));
  }, [garden]);

  // ── Per-crop summary stats ────────────────────────────────────────────────
  const statsMap = useMemo(() => {
    const m: Record<string, { companions: number; antagonists: number }> = {};
    for (const crop of assignedCrops) {
      let companions = 0;
      let antagonists = 0;
      for (const other of assignedCrops) {
        if (other.id === crop.id) continue;
        const r = checkCompanionship(crop, other).relationship;
        if (r === 'companion') companions++;
        else if (r === 'antagonist') antagonists++;
      }
      m[crop.id] = { companions, antagonists };
    }
    return m;
  }, [assignedCrops]);

  // ── Tooltip handlers ──────────────────────────────────────────────────────
  const openTooltip = useCallback(
    (
      e: React.MouseEvent<HTMLTableCellElement>,
      row: Crop,
      col: Crop,
    ) => {
      if (row.id === col.id) return;
      const result = checkCompanionship(row, col);
      setTooltipState({
        rowId: row.id,
        colId: col.id,
        relationship: result.relationship,
        reason: result.reason,
        rowEmoji: row.emoji,
        rowName: row.name_en,
        colEmoji: col.emoji,
        colName: col.name_en,
        anchorEl: e.currentTarget,
      });
    },
    [],
  );

  const closeTooltip = useCallback(() => setTooltipState(null), []);

  // ─── Empty states ─────────────────────────────────────────────────────────

  if (!garden) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-garden-stone italic">
        No garden loaded.
      </div>
    );
  }

  if (assignedCrops.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-48 px-6 text-center">
        <span className="text-4xl" aria-hidden>🌱</span>
        <p className="text-sm font-medium text-garden-soil">No crops assigned yet</p>
        <p className="text-xs text-garden-stone max-w-xs">
          Assign crops to zones in the garden planner to see companion and antagonist
          relationships here.
        </p>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full rounded-xl border border-garden-cream-dark bg-white/70 shadow-sm overflow-hidden">

      {/* ── Header + legend ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-garden-cream-dark bg-garden-cream/60 flex-shrink-0">
        <h2 className="text-xs font-semibold text-garden-leaf-dark uppercase tracking-wide">
          Companion Planting Matrix
        </h2>

        <div className="flex flex-wrap items-center gap-3 ml-auto text-[11px] text-garden-soil">
          {[
            { bg: 'bg-green-100', text: 'text-green-700', label: '✓ Companion' },
            { bg: 'bg-red-100',   text: 'text-red-600',   label: '✗ Antagonist' },
            { bg: 'bg-gray-100',  text: 'text-gray-400',  label: '— Neutral' },
          ].map(({ bg, text, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className={`w-3.5 h-3.5 rounded-sm inline-block ${bg}`} />
              <span className={text}>{label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Sub-heading ──────────────────────────────────────────────────── */}
      <p className="px-4 py-1.5 text-[11px] text-garden-stone bg-white/30 border-b border-garden-cream-dark flex-shrink-0">
        {assignedCrops.length} crops assigned — hover a cell to see the relationship, click
        to keep the tooltip open.
      </p>

      {/* ── Scrollable matrix ────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto relative"
        onClick={closeTooltip}
      >
        <table
          className="border-collapse text-xs"
          style={{ tableLayout: 'fixed' }}
        >
          <colgroup>
            {/* Row label column */}
            <col style={{ width: 148 }} />
            {/* One column per crop */}
            {assignedCrops.map((c) => (
              <col key={c.id} style={{ width: 44 }} />
            ))}
            {/* Summary column */}
            <col style={{ width: 60 }} />
          </colgroup>

          {/* ── Column headers ─────────────────────────────────────────── */}
          <thead>
            <tr>
              {/* Corner cell */}
              <th
                className="sticky top-0 left-0 z-30 bg-white border-b-2 border-r border-garden-cream-dark p-1"
                scope="col"
                aria-label="Crop names"
              />

              {/* Crop column headers */}
              {assignedCrops.map((col) => {
                const isHighlighted = hoveredRow === col.id || hoveredCol === col.id;
                const familyColor = getFamilyColor(col.family);
                return (
                  <th
                    key={col.id}
                    scope="col"
                    className={[
                      'sticky top-0 z-20 border-b-2 border-r border-garden-cream-dark',
                      'transition-colors duration-75 cursor-default align-bottom',
                      isHighlighted ? 'bg-garden-cream' : 'bg-white',
                    ].join(' ')}
                    style={{ padding: '6px 3px 4px' }}
                    onMouseEnter={() => setHoveredCol(col.id)}
                    onMouseLeave={() => setHoveredCol(null)}
                    title={`${col.name_en} (${col.name_fi})`}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      {/* Family colour accent bar */}
                      <span
                        className="w-5 h-1 rounded-full mb-0.5 opacity-70"
                        style={{ backgroundColor: familyColor }}
                      />
                      <span className="text-base leading-none" aria-hidden>
                        {col.emoji}
                      </span>
                      <span
                        className="text-[8px] text-gray-500 font-medium leading-none"
                        style={{
                          writingMode: 'vertical-lr',
                          transform: 'rotate(180deg)',
                          maxHeight: 56,
                          overflow: 'hidden',
                          display: 'block',
                        }}
                      >
                        {col.name_en}
                      </span>
                    </div>
                  </th>
                );
              })}

              {/* Summary header */}
              <th
                className="sticky top-0 z-20 bg-white border-b-2 border-l-2 border-garden-cream-dark p-1 text-center"
                scope="col"
              >
                <span className="text-[9px] text-garden-stone font-semibold uppercase tracking-wide">
                  Stats
                </span>
              </th>
            </tr>
          </thead>

          {/* ── Body ───────────────────────────────────────────────────── */}
          <tbody>
            {assignedCrops.map((row) => {
              const isRowHighlighted = hoveredRow === row.id;
              const stats = statsMap[row.id];
              const familyColor = getFamilyColor(row.family);

              return (
                <tr
                  key={row.id}
                  onMouseEnter={() => setHoveredRow(row.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  {/* Sticky row label */}
                  <td
                    className={[
                      'sticky left-0 z-10 border-r border-b border-garden-cream-dark',
                      'transition-colors duration-75',
                      isRowHighlighted ? 'bg-garden-cream' : 'bg-white',
                    ].join(' ')}
                    style={{ padding: '4px 8px' }}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {/* Family accent */}
                      <span
                        className="w-1 h-5 rounded-full flex-shrink-0 opacity-60"
                        style={{ backgroundColor: familyColor }}
                      />
                      <span className="text-sm leading-none flex-shrink-0" aria-hidden>
                        {row.emoji}
                      </span>
                      <span
                        className="text-xs font-medium text-garden-soil truncate"
                        style={{ maxWidth: 90 }}
                      >
                        {row.name_en}
                      </span>
                    </div>
                  </td>

                  {/* Relationship cells */}
                  {assignedCrops.map((col) => {
                    const isSelf = row.id === col.id;
                    const rel: Rel = isSelf
                      ? 'self'
                      : checkCompanionship(row, col).relationship;

                    const isActive =
                      tooltipState?.rowId === row.id &&
                      tooltipState?.colId === col.id;
                    const isHighlighted =
                      isRowHighlighted || hoveredCol === col.id;

                    const styles = CELL_STYLES[rel];
                    let bgClass = styles.base;
                    if (isActive) bgClass = styles.hover;
                    else if (isHighlighted && !isSelf) bgClass = styles.highlight;

                    return (
                      <td
                        key={col.id}
                        className={[
                          'border-b border-r border-garden-cream-dark/60',
                          'text-center font-bold transition-colors duration-75',
                          isSelf ? 'cursor-not-allowed' : 'cursor-pointer',
                          bgClass,
                        ].join(' ')}
                        style={{ padding: 4, fontSize: 13, width: 44, height: 36 }}
                        onMouseEnter={() => {
                          setHoveredCol(col.id);
                        }}
                        onMouseLeave={() => {
                          setHoveredCol(null);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openTooltip(e, row, col);
                        }}
                        title={
                          isSelf
                            ? row.name_en
                            : rel === 'companion'
                            ? `${row.name_en} ✓ ${col.name_en} — companions`
                            : rel === 'antagonist'
                            ? `${row.name_en} ✗ ${col.name_en} — antagonists`
                            : `${row.name_en} — ${col.name_en} — neutral`
                        }
                        aria-label={
                          isSelf
                            ? `${row.name_en} (same crop)`
                            : `${row.name_en} and ${col.name_en}: ${rel}`
                        }
                      >
                        {CELL_SYMBOL[rel]}
                      </td>
                    );
                  })}

                  {/* Summary cell */}
                  <td
                    className={[
                      'border-b border-l-2 border-garden-cream-dark bg-white',
                      'transition-colors duration-75',
                      isRowHighlighted ? 'bg-garden-cream/40' : '',
                    ].join(' ')}
                    style={{ padding: '4px 6px' }}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      {stats?.companions > 0 && (
                        <span className="text-[10px] font-bold text-green-600 leading-none">
                          +{stats.companions}
                        </span>
                      )}
                      {stats?.antagonists > 0 && (
                        <span className="text-[10px] font-bold text-red-500 leading-none">
                          −{stats.antagonists}
                        </span>
                      )}
                      {stats?.companions === 0 && stats?.antagonists === 0 && (
                        <span className="text-[10px] text-gray-300">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* ── Summary footer row ──────────────────────────────────────── */}
          <tfoot>
            <tr>
              <td
                className="sticky left-0 bg-garden-cream/60 border-t-2 border-r border-garden-cream-dark px-3 py-1.5"
              >
                <span className="text-[9px] font-semibold text-garden-stone uppercase tracking-wide">
                  Companions ↓
                </span>
              </td>
              {assignedCrops.map((col) => {
                const s = statsMap[col.id];
                return (
                  <td
                    key={col.id}
                    className="border-t-2 border-r border-garden-cream-dark bg-garden-cream/40 text-center"
                    style={{ padding: '4px 2px' }}
                  >
                    {s?.companions > 0 ? (
                      <span className="text-[10px] font-bold text-green-600">
                        +{s.companions}
                      </span>
                    ) : (
                      <span className="text-[9px] text-gray-300">—</span>
                    )}
                  </td>
                );
              })}
              <td className="border-t-2 border-l-2 border-garden-cream-dark bg-garden-cream/40" />
            </tr>
          </tfoot>
        </table>

        {/* ── Relationship tooltip popover ─────────────────────────────── */}
        {tooltipState && (
          <RelationshipTooltip
            state={tooltipState}
            containerRef={containerRef}
            onClose={closeTooltip}
          />
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 py-1.5 border-t border-garden-cream-dark bg-garden-cream/30 text-[10px] text-garden-stone flex items-center justify-between">
        <span>
          {assignedCrops.length} crops · active season ·{' '}
          {Object.values(statsMap).reduce((n, s) => n + (s.companions > 0 ? 1 : 0), 0)}{' '}
          crops have companions
        </span>
        <span className="italic">Click a cell for details</span>
      </div>
    </div>
  );
}

// ─── Relationship tooltip popover ─────────────────────────────────────────────

function RelationshipTooltip({
  state,
  containerRef,
  onClose,
}: {
  state: TooltipState;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  // Position tooltip relative to the container div
  const containerRect = containerRef.current?.getBoundingClientRect();
  const cellRect = state.anchorEl.getBoundingClientRect();
  if (!containerRect) return null;

  const left = cellRect.left - containerRect.left + cellRect.width + 8;
  const top = cellRect.top - containerRect.top + containerRef.current!.scrollTop;

  const { relationship, reason, rowEmoji, rowName, colEmoji, colName } = state;

  const relStyles: Record<NonNullable<TooltipState['relationship']>, string> = {
    companion:  'border-green-300 bg-green-50',
    antagonist: 'border-red-300 bg-red-50',
    neutral:    'border-gray-200 bg-gray-50',
    self:       'border-gray-200 bg-gray-50',
  };

  const relLabel: Record<NonNullable<TooltipState['relationship']>, string> = {
    companion:  '✓ Companions',
    antagonist: '✗ Antagonists',
    neutral:    '— Neutral',
    self:       '· Same crop',
  };

  const relTextColor: Record<NonNullable<TooltipState['relationship']>, string> = {
    companion:  'text-green-700',
    antagonist: 'text-red-600',
    neutral:    'text-gray-500',
    self:       'text-gray-400',
  };

  return (
    <div
      className={[
        'absolute z-50 rounded-xl border-2 shadow-xl p-3 text-xs max-w-[220px]',
        relStyles[relationship],
      ].join(' ')}
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Title */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-base">{rowEmoji}</span>
        <span className="font-semibold text-garden-soil">{rowName}</span>
        <span className="mx-0.5 text-garden-stone">+</span>
        <span className="text-base">{colEmoji}</span>
        <span className="font-semibold text-garden-soil">{colName}</span>
      </div>

      {/* Relationship badge */}
      <p className={['font-bold mb-1', relTextColor[relationship]].join(' ')}>
        {relLabel[relationship]}
      </p>

      {/* Explanation */}
      <p className="text-garden-soil leading-relaxed">{reason}</p>

      {/* Close button */}
      <button
        onClick={onClose}
        className="mt-2 text-garden-stone hover:text-garden-soil transition-colors text-[10px] underline"
      >
        Close
      </button>
    </div>
  );
}
