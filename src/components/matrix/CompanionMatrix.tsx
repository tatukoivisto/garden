'use client';

/**
 * CompanionMatrix – companion planting relationship grid.
 *
 * Features:
 *   - Table with assigned crops on both axes
 *   - Green ✓ for companions, Red ✗ for antagonists, Gray — for neutral
 *   - Sticky row and column headers
 *   - Hover highlight on row & column
 *   - Summary counts per crop
 */

import React, { useMemo, useState } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import { cropMap } from '@/data/crops';
import type { Crop } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Relationship determination
// ─────────────────────────────────────────────────────────────────────────────

type Relationship = 'companion' | 'antagonist' | 'neutral' | 'self';

function getRelationship(a: Crop, b: Crop): Relationship {
  if (a.id === b.id) return 'self';
  if (a.companions.includes(b.id) || b.companions.includes(a.id)) return 'companion';
  if (a.antagonists.includes(b.id) || b.antagonists.includes(a.id)) return 'antagonist';
  return 'neutral';
}

const CELL_SYMBOL: Record<Relationship, string> = {
  companion: '✓',
  antagonist: '✗',
  neutral: '—',
  self: '·',
};

const CELL_BG: Record<Relationship, string> = {
  companion: 'bg-green-100 text-green-700',
  antagonist: 'bg-red-100 text-red-600',
  neutral: 'bg-gray-50 text-gray-400',
  self: 'bg-gray-100 text-gray-300',
};

const CELL_HOVER_BG: Record<Relationship, string> = {
  companion: 'bg-green-200 text-green-800',
  antagonist: 'bg-red-200 text-red-700',
  neutral: 'bg-gray-100 text-gray-500',
  self: 'bg-gray-200 text-gray-400',
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function CompanionMatrix() {
  const garden = useGardenStore((s) => s.garden);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [hoveredCol, setHoveredCol] = useState<string | null>(null);

  const activeSeason = useMemo(
    () => garden?.seasons.find((s) => s.id === garden.active_season),
    [garden],
  );

  // Collect unique assigned crop ids across all zones in the active season
  const assignedCrops = useMemo<Crop[]>(() => {
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
    return result;
  }, [activeSeason]);

  if (!garden) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400 italic">
        No garden loaded.
      </div>
    );
  }

  if (assignedCrops.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-40 px-6 text-center">
        <span className="text-3xl" aria-hidden>🌱</span>
        <p className="text-sm text-gray-500">No crops assigned yet.</p>
        <p className="text-xs text-gray-400">Assign crops to zones to see companion relationships.</p>
      </div>
    );
  }

  // Per-crop companion/antagonist counts for summary
  const stats = useMemo(() => {
    return assignedCrops.map((crop) => {
      let companions = 0;
      let antagonists = 0;
      for (const other of assignedCrops) {
        if (other.id === crop.id) continue;
        const rel = getRelationship(crop, other);
        if (rel === 'companion') companions++;
        else if (rel === 'antagonist') antagonists++;
      }
      return { id: crop.id, companions, antagonists };
    });
  }, [assignedCrops]);

  const statsMap = Object.fromEntries(stats.map((s) => [s.id, s]));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Companion Planting Matrix
        </h2>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-green-100 rounded inline-block" />
            Companion
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-red-100 rounded inline-block" />
            Antagonist
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-gray-100 rounded inline-block" />
            Neutral
          </span>
        </div>
      </div>

      {/* Scrollable matrix */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 140 }} />
            {assignedCrops.map((c) => (
              <col key={c.id} style={{ width: 44 }} />
            ))}
            <col style={{ width: 56 }} />
          </colgroup>

          {/* ── Column headers ──────────────────────────────────────────── */}
          <thead>
            <tr>
              {/* Corner cell */}
              <th className="sticky top-0 left-0 z-30 bg-white border-b border-r border-gray-200 p-1" />

              {/* Crop column headers */}
              {assignedCrops.map((col) => {
                const isHighlighted = hoveredRow === col.id || hoveredCol === col.id;
                return (
                  <th
                    key={col.id}
                    className={`
                      sticky top-0 z-20 border-b border-gray-200
                      transition-colors duration-100 cursor-default
                      ${isHighlighted ? 'bg-garden-cream' : 'bg-white'}
                    `}
                    style={{ padding: 4 }}
                    onMouseEnter={() => setHoveredCol(col.id)}
                    onMouseLeave={() => setHoveredCol(null)}
                    title={`${col.name_en} (${col.name_fi})`}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-base leading-none" aria-hidden>{col.emoji}</span>
                      <span
                        className="text-[8px] text-gray-500 font-medium leading-none"
                        style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)', maxHeight: 52, overflow: 'hidden' }}
                      >
                        {col.name_en}
                      </span>
                    </div>
                  </th>
                );
              })}

              {/* Summary header */}
              <th className="sticky top-0 z-20 bg-white border-b border-l border-gray-200 p-1">
                <span className="text-[9px] text-gray-400 font-medium">Stats</span>
              </th>
            </tr>
          </thead>

          {/* ── Body ────────────────────────────────────────────────────── */}
          <tbody>
            {assignedCrops.map((row) => {
              const isRowHighlighted = hoveredRow === row.id;
              return (
                <tr
                  key={row.id}
                  onMouseEnter={() => setHoveredRow(row.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  {/* Row label */}
                  <td
                    className={`
                      sticky left-0 z-10 border-r border-b border-gray-200
                      transition-colors duration-100
                      ${isRowHighlighted ? 'bg-garden-cream' : 'bg-white'}
                    `}
                    style={{ padding: '4px 8px' }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm leading-none" aria-hidden>{row.emoji}</span>
                      <span className="text-xs font-medium text-gray-700 truncate" style={{ maxWidth: 100 }}>
                        {row.name_en}
                      </span>
                    </div>
                  </td>

                  {/* Relationship cells */}
                  {assignedCrops.map((col) => {
                    const rel = getRelationship(row, col);
                    const isHighlighted = isRowHighlighted || hoveredCol === col.id;
                    const bgClass = isHighlighted ? CELL_HOVER_BG[rel] : CELL_BG[rel];

                    return (
                      <td
                        key={col.id}
                        className={`
                          border-b border-r border-gray-100
                          text-center font-bold
                          transition-colors duration-100
                          cursor-default select-none
                          ${bgClass}
                        `}
                        style={{ padding: 4, fontSize: 13, width: 44, height: 36 }}
                        onMouseEnter={() => setHoveredCol(col.id)}
                        onMouseLeave={() => setHoveredCol(null)}
                        title={
                          rel === 'self'
                            ? `${row.name_en}`
                            : rel === 'companion'
                            ? `${row.name_en} and ${col.name_en} are companions`
                            : rel === 'antagonist'
                            ? `${row.name_en} and ${col.name_en} are antagonists`
                            : `${row.name_en} and ${col.name_en} are neutral`
                        }
                      >
                        {CELL_SYMBOL[rel]}
                      </td>
                    );
                  })}

                  {/* Summary cell */}
                  <td className="border-b border-l border-gray-200 bg-white" style={{ padding: '4px 6px' }}>
                    <div className="flex flex-col gap-0.5">
                      {statsMap[row.id]?.companions > 0 && (
                        <span className="text-[9px] font-semibold text-green-600">
                          +{statsMap[row.id].companions}
                        </span>
                      )}
                      {statsMap[row.id]?.antagonists > 0 && (
                        <span className="text-[9px] font-semibold text-red-500">
                          −{statsMap[row.id].antagonists}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-100 text-[10px] text-gray-400">
        {assignedCrops.length} crops assigned · Showing relationships for active season
      </div>
    </div>
  );
}
