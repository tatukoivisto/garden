'use client';

/**
 * MultiYearView – multi-year / multi-season planning panel.
 *
 * Features:
 *   - Clickable season tabs (year + season label)
 *   - "Add season" button
 *   - Mini SVG garden preview per season (zone crop colours)
 *   - Rotation violation badges on zones with problems
 *   - Side-by-side comparison toggle (two seasons at once)
 *   - Perennial crop "persists" indicator
 *   - Rotation arrow overlay showing where crops moved
 */

import { useCallback, useMemo, useState } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import { checkRotationViolation } from '@/lib/ruleEngine';
import { crops as cropDb } from '@/data/crops';
import type { SeasonPlan, Zone } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function uuid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function seasonLabel(s: SeasonPlan): string {
  const name =
    s.season === 'spring'    ? 'Spring'
    : s.season === 'autumn'  ? 'Autumn'
    : 'Full Year';
  return `${s.year} ${name}`;
}

function seasonEmoji(s: SeasonPlan): string {
  return s.season === 'spring' ? '🌱' : s.season === 'autumn' ? '🍂' : '🌻';
}

/** Collect all crop ids assigned to a zone in a given season plan. */
function zoneCropIds(seasonPlan: SeasonPlan, zoneId: string): string[] {
  const za = seasonPlan.crop_assignments.find((a) => a.zone_id === zoneId);
  return za ? za.crops.map((c) => c.crop_id) : [];
}

/** Derive a display colour for a zone's primary crop (or the zone's own colour). */
function zonePrimaryColor(zone: Zone, seasonPlan: SeasonPlan): string {
  const ids = zoneCropIds(seasonPlan, zone.id);
  if (ids.length === 0) return zone.color;
  const crop = cropDb.find((c) => c.id === ids[0]);
  if (!crop) return zone.color;
  // Map rotation groups to palette colours
  const groupColors: Record<string, string> = {
    solanaceae:      '#e07a5f',
    brassica_family: '#81b29a',
    legume_family:   '#f2cc8f',
    allium_family:   '#c9b1bd',
    cucurbit_family: '#f4a261',
    apiaceae:        '#e9c46a',
    chenopodiaceae:  '#2a9d8f',
    asteraceae:      '#a8dadc',
    lamiaceae:       '#b7b7a4',
    other:           '#d4a5a5',
  };
  return groupColors[crop.rotation_group] ?? zone.color;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini SVG Garden Preview
// ─────────────────────────────────────────────────────────────────────────────

interface MiniGardenProps {
  zones: Zone[];
  season: SeasonPlan;
  violations: Map<string, boolean>; // zoneId → hasViolation
  width?: number;
  height?: number;
}

function MiniGarden({ zones, season, violations, width = 140, height = 100 }: MiniGardenProps) {
  const gardenWidth  = zones.reduce((max, z) => Math.max(max, z.x_m + z.width_m), 1);
  const gardenHeight = zones.reduce((max, z) => Math.max(max, z.y_m + z.depth_m), 1);

  const scaleX = (width  - 4) / gardenWidth;
  const scaleY = (height - 4) / gardenHeight;
  const scale  = Math.min(scaleX, scaleY);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="rounded-lg overflow-hidden"
      style={{ background: '#f5f0e8' }}
      aria-label={`Mini preview for ${seasonLabel(season)}`}
    >
      {/* Garden boundary */}
      <rect
        x={2}
        y={2}
        width={gardenWidth * scale}
        height={gardenHeight * scale}
        rx={3}
        fill="#ede4d0"
        stroke="#c5b89a"
        strokeWidth={0.8}
      />

      {/* Zones */}
      {zones
        .filter((z) => z.category === 'growing')
        .map((zone) => {
          const x = 2 + zone.x_m * scale;
          const y = 2 + zone.y_m * scale;
          const w = Math.max(zone.width_m * scale, 4);
          const h = Math.max(zone.depth_m * scale, 4);
          const colour = zonePrimaryColor(zone, season);
          const hasViolation = violations.get(zone.id) ?? false;

          return (
            <g key={zone.id}>
              {zone.shape === 'ellipse' ? (
                <ellipse
                  cx={x + w / 2}
                  cy={y + h / 2}
                  rx={w / 2}
                  ry={h / 2}
                  fill={colour}
                  fillOpacity={0.75}
                  stroke={hasViolation ? '#ef4444' : '#6b7280'}
                  strokeWidth={hasViolation ? 1.5 : 0.5}
                />
              ) : (
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx={1.5}
                  fill={colour}
                  fillOpacity={0.75}
                  stroke={hasViolation ? '#ef4444' : '#6b7280'}
                  strokeWidth={hasViolation ? 1.5 : 0.5}
                />
              )}
              {/* Violation dot */}
              {hasViolation && (
                <circle
                  cx={x + w - 2}
                  cy={y + 2}
                  r={2.5}
                  fill="#ef4444"
                />
              )}
            </g>
          );
        })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Season Card
// ─────────────────────────────────────────────────────────────────────────────

interface SeasonCardProps {
  season: SeasonPlan;
  zones: Zone[];
  previousSeason: SeasonPlan | null;
  isActive: boolean;
  isCompareB: boolean;
  onClick: () => void;
  compact?: boolean;
}

function SeasonCard({
  season,
  zones,
  previousSeason,
  isActive,
  isCompareB,
  onClick,
  compact = false,
}: SeasonCardProps) {
  // Compute rotation violations for each zone
  const violations = useMemo<Map<string, boolean>>(() => {
    const map = new Map<string, boolean>();
    if (!previousSeason) return map;

    for (const zone of zones) {
      const currentIds  = zoneCropIds(season, zone.id);
      const previousIds = zoneCropIds(previousSeason, zone.id);
      let hasViolation = false;
      for (const cropId of currentIds) {
        const v = checkRotationViolation(cropId, previousIds);
        if (v) { hasViolation = true; break; }
      }
      if (hasViolation) map.set(zone.id, true);
    }
    return map;
  }, [season, previousSeason, zones]);

  const violationCount = Array.from(violations.values()).filter(Boolean).length;

  // Count perennial crops
  const perennialCount = useMemo(() => {
    const seen = new Set<string>();
    for (const za of season.crop_assignments) {
      for (const ca of za.crops) {
        const crop = cropDb.find((c) => c.id === ca.crop_id);
        if (crop?.type === 'perennial') seen.add(ca.crop_id);
      }
    }
    return seen.size;
  }, [season]);

  const totalCrops = useMemo(() => {
    const seen = new Set<string>();
    for (const za of season.crop_assignments) {
      for (const ca of za.crops) seen.add(ca.crop_id);
    }
    return seen.size;
  }, [season]);

  const ring = isActive
    ? 'ring-2 ring-garden-leaf ring-offset-2'
    : isCompareB
    ? 'ring-2 ring-garden-sun ring-offset-2'
    : 'ring-1 ring-gray-200';

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'relative flex flex-col gap-2 rounded-xl p-3 text-left',
        'bg-white shadow-sm hover:shadow-md transition-all duration-150',
        ring,
        compact ? 'min-w-[100px]' : 'min-w-[160px]',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <span className="text-lg leading-none" aria-hidden>{seasonEmoji(season)}</span>
        <span className="text-xs font-semibold text-gray-800 leading-tight">
          {seasonLabel(season)}
        </span>
        {isActive && (
          <span className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded-full bg-garden-leaf text-white text-[9px] font-bold leading-none">
            Active
          </span>
        )}
      </div>

      {/* Mini preview */}
      {!compact && (
        <MiniGarden
          zones={zones}
          season={season}
          violations={violations}
          width={134}
          height={90}
        />
      )}

      {/* Stats row */}
      <div className="flex items-center gap-2 flex-wrap">
        {totalCrops > 0 && (
          <span className="text-[10px] text-gray-500 font-medium">
            {totalCrops} crop{totalCrops !== 1 ? 's' : ''}
          </span>
        )}
        {perennialCount > 0 && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-garden-sprout/20 text-garden-leaf-dark text-[9px] font-semibold">
            ♻ {perennialCount} perennial{perennialCount !== 1 ? 's' : ''}
          </span>
        )}
        {violationCount > 0 && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[9px] font-semibold">
            ⚠ {violationCount} rotation issue{violationCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rotation Detail Panel
// ─────────────────────────────────────────────────────────────────────────────

interface RotationPanelProps {
  season: SeasonPlan;
  previousSeason: SeasonPlan | null;
  zones: Zone[];
}

function RotationPanel({ season, previousSeason, zones }: RotationPanelProps) {
  if (!previousSeason) {
    return (
      <p className="text-xs text-gray-400 italic px-1">
        No previous season to compare against.
      </p>
    );
  }

  const rows: {
    zone: Zone;
    prevCropNames: string[];
    currCropNames: string[];
    violations: string[];
  }[] = [];

  for (const zone of zones.filter((z) => z.category === 'growing')) {
    const prevIds = zoneCropIds(previousSeason, zone.id);
    const currIds = zoneCropIds(season, zone.id);
    if (prevIds.length === 0 && currIds.length === 0) continue;

    const prevNames = prevIds.map((id) => cropDb.find((c) => c.id === id)?.name_en ?? id);
    const currNames = currIds.map((id) => cropDb.find((c) => c.id === id)?.name_en ?? id);

    const viols: string[] = [];
    for (const cropId of currIds) {
      const v = checkRotationViolation(cropId, prevIds);
      if (v) viols.push(v.reason);
    }

    rows.push({ zone, prevCropNames: prevNames, currCropNames: currNames, violations: viols });
  }

  if (rows.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic px-1">
        No crop assignments to compare yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map(({ zone, prevCropNames, currCropNames, violations }) => (
        <div
          key={zone.id}
          className={[
            'rounded-lg border px-3 py-2.5 text-xs',
            violations.length > 0
              ? 'border-red-200 bg-red-50'
              : 'border-gray-100 bg-gray-50',
          ].join(' ')}
        >
          <p className="font-semibold text-gray-700 mb-1">{zone.name}</p>

          {/* Arrow from previous → current */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-500">
              {prevCropNames.length > 0 ? prevCropNames.join(', ') : 'Empty'}
            </span>
            <svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden className="flex-shrink-0 text-gray-400">
              <path d="M1 5h12M9 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-medium text-gray-800">
              {currCropNames.length > 0 ? currCropNames.join(', ') : 'Empty'}
            </span>
          </div>

          {/* Violation messages */}
          {violations.map((v, i) => (
            <p key={i} className="mt-1 text-red-600 flex items-start gap-1">
              <span className="flex-shrink-0 mt-0.5">⚠</span>
              <span>{v}</span>
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function MultiYearView() {
  const garden         = useGardenStore((s) => s.garden);
  const setActiveSeason = useGardenStore((s) => s.setActiveSeason);
  const addSeason      = useGardenStore((s) => s.addSeason);

  // Which season is shown in the "compare B" slot
  const [compareBId, setCompareBId] = useState<string | null>(null);
  const [sideBySide, setSideBySide] = useState(false);

  // Whether to show the rotation detail panel
  const [showRotation, setShowRotation] = useState(false);

  // ── Derived data ───────────────────────────────────────────────────────────

  const seasons = garden?.seasons ?? [];
  const activeId = garden?.active_season ?? null;
  const activeSeason = seasons.find((s) => s.id === activeId) ?? null;
  const zones = garden?.zones ?? [];

  // Sort seasons chronologically
  const sortedSeasons = useMemo(() => {
    return [...seasons].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      const ord = { spring: 0, full_year: 1, autumn: 2 };
      return (ord[a.season] ?? 1) - (ord[b.season] ?? 1);
    });
  }, [seasons]);

  // Get index of a season in sorted list
  const sortedIndex = useCallback(
    (id: string) => sortedSeasons.findIndex((s) => s.id === id),
    [sortedSeasons],
  );

  // Previous season relative to a given season
  const previousOf = useCallback(
    (season: SeasonPlan): SeasonPlan | null => {
      const idx = sortedIndex(season.id);
      return idx > 0 ? sortedSeasons[idx - 1] : null;
    },
    [sortedIndex, sortedSeasons],
  );

  const compareB = compareBId ? seasons.find((s) => s.id === compareBId) ?? null : null;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleAddSeason = useCallback(() => {
    if (!garden) return;
    const lastSeason = sortedSeasons[sortedSeasons.length - 1];
    const newYear    = lastSeason ? lastSeason.year + (lastSeason.season === 'autumn' || lastSeason.season === 'full_year' ? 1 : 0) : new Date().getFullYear();
    const newSeason: SeasonPlan['season'] =
      !lastSeason ? 'spring'
      : lastSeason.season === 'spring' ? 'autumn'
      : 'spring';

    const plan: SeasonPlan = {
      id: uuid(),
      year: lastSeason?.season === 'spring' ? lastSeason.year : newYear,
      season: newSeason,
      crop_assignments: [],
    };
    addSeason(plan);
    setActiveSeason(plan.id);
  }, [garden, sortedSeasons, addSeason, setActiveSeason]);

  const handleTabClick = useCallback(
    (season: SeasonPlan) => {
      if (sideBySide && activeId !== season.id) {
        // In side-by-side mode: clicking a non-active tab sets compare B
        setCompareBId((prev) => (prev === season.id ? null : season.id));
      } else {
        setActiveSeason(season.id);
      }
    },
    [sideBySide, activeId, setActiveSeason],
  );

  // ── Guard ──────────────────────────────────────────────────────────────────

  if (!garden) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
        <span className="text-4xl" aria-hidden>📅</span>
        <p className="text-sm text-gray-500">No garden loaded.</p>
        <p className="text-xs text-gray-400">Create or open a garden to plan across seasons.</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* ── Panel header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">Multi-Year Planner</h2>

        <div className="flex items-center gap-2">
          {/* Side-by-side toggle */}
          <button
            type="button"
            onClick={() => {
              setSideBySide((v) => !v);
              if (!sideBySide) setCompareBId(null);
            }}
            className={[
              'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium border transition-colors duration-100',
              sideBySide
                ? 'bg-garden-sun/20 border-garden-sun/40 text-garden-soil'
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300',
            ].join(' ')}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
              <rect x="1" y="1" width="4.5" height="11" rx="1" stroke="currentColor" strokeWidth="1.4" />
              <rect x="7.5" y="1" width="4.5" height="11" rx="1" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            Compare
          </button>

          {/* Add season */}
          <button
            type="button"
            onClick={handleAddSeason}
            className="
              inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-medium
              bg-garden-leaf text-white hover:bg-garden-leaf-dark
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garden-leaf focus-visible:ring-offset-1
              transition-colors duration-100
            "
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
              <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Add season
          </button>
        </div>
      </div>

      {/* ── Season tabs (horizontal scroll) ──────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto border-b border-gray-100 scrollbar-thin">
        {sortedSeasons.map((season) => {
          const isActive   = season.id === activeId;
          const isCompareB = sideBySide && season.id === compareBId;

          return (
            <button
              key={season.id}
              type="button"
              onClick={() => handleTabClick(season)}
              className={[
                'flex items-center gap-1.5 flex-shrink-0 h-8 px-3 rounded-lg text-xs font-medium',
                'border transition-colors duration-100 whitespace-nowrap',
                isActive
                  ? 'bg-garden-leaf text-white border-garden-leaf shadow-sm'
                  : isCompareB
                  ? 'bg-garden-sun/20 text-garden-soil border-garden-sun/50'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50',
              ].join(' ')}
              aria-pressed={isActive}
            >
              <span aria-hidden>{seasonEmoji(season)}</span>
              {seasonLabel(season)}
            </button>
          );
        })}
      </div>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {sortedSeasons.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
            <span className="text-5xl" aria-hidden>🌻</span>
            <p className="text-sm font-medium text-gray-600">No seasons yet</p>
            <p className="text-xs text-gray-400">Add your first season plan using the button above.</p>
          </div>
        ) : sideBySide ? (
          // ── Side-by-side view ─────────────────────────────────────────
          <div className="grid grid-cols-2 gap-0 h-full divide-x divide-gray-100">
            {[activeSeason, compareB].map((season, idx) => (
              <div key={idx} className="flex flex-col">
                {/* Slot header */}
                <div className={[
                  'px-3 py-2 border-b border-gray-100 text-xs font-semibold',
                  idx === 0 ? 'text-garden-leaf' : 'text-garden-soil',
                ].join(' ')}>
                  {idx === 0 ? 'Season A (active)' : 'Season B (compare)'}
                </div>

                {season ? (
                  <div className="p-3 space-y-3">
                    <SeasonCard
                      season={season}
                      zones={zones}
                      previousSeason={previousOf(season)}
                      isActive={idx === 0}
                      isCompareB={idx === 1}
                      onClick={() => {}}
                      compact={false}
                    />

                    {/* Rotation details */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
                        Rotation vs previous
                      </p>
                      <RotationPanel
                        season={season}
                        previousSeason={previousOf(season)}
                        zones={zones}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-2">
                    <p className="text-xs text-gray-400">
                      Click another season tab to compare
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          // ── Single season detail view ─────────────────────────────────
          <div className="p-4 space-y-4">
            {/* Season cards grid */}
            <div className="flex flex-wrap gap-3">
              {sortedSeasons.map((season) => (
                <SeasonCard
                  key={season.id}
                  season={season}
                  zones={zones}
                  previousSeason={previousOf(season)}
                  isActive={season.id === activeId}
                  isCompareB={false}
                  onClick={() => handleTabClick(season)}
                  compact={false}
                />
              ))}
            </div>

            {/* Active season detail */}
            {activeSeason && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    {seasonLabel(activeSeason)} — Rotation Analysis
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowRotation((v) => !v)}
                    className="text-xs text-garden-leaf hover:text-garden-leaf-dark underline underline-offset-2 transition-colors"
                  >
                    {showRotation ? 'Hide' : 'Show'} details
                  </button>
                </div>

                {showRotation && (
                  <div className="rounded-xl border border-gray-200 p-3 bg-gray-50/60">
                    <RotationPanel
                      season={activeSeason}
                      previousSeason={previousOf(activeSeason)}
                      zones={zones}
                    />
                  </div>
                )}

                {/* Perennial summary for active season */}
                {(() => {
                  const perennials: { name: string; emoji: string }[] = [];
                  const seen = new Set<string>();
                  for (const za of activeSeason.crop_assignments) {
                    for (const ca of za.crops) {
                      if (seen.has(ca.crop_id)) continue;
                      const crop = cropDb.find((c) => c.id === ca.crop_id);
                      if (crop?.type === 'perennial') {
                        perennials.push({ name: crop.name_en, emoji: crop.emoji });
                        seen.add(ca.crop_id);
                      }
                    }
                  }
                  if (perennials.length === 0) return null;
                  return (
                    <div className="rounded-xl border border-garden-sprout/30 bg-garden-sprout/10 px-3 py-3">
                      <p className="text-xs font-semibold text-garden-leaf-dark mb-2 flex items-center gap-1.5">
                        <span aria-hidden>♻</span>
                        Perennial crops — persist across seasons
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {perennials.map(({ name, emoji }) => (
                          <span
                            key={name}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-garden-sprout/40 text-xs font-medium text-garden-leaf-dark"
                          >
                            {emoji} {name}
                            <span className="text-[9px] bg-garden-sprout/30 px-1 rounded-full ml-0.5">perennial</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
