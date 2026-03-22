'use client';

/**
 * ZoneDetail – right-panel showing properties and crop assignments for the
 * currently selected zone.
 *
 * Features:
 *   - Editable zone name
 *   - Dimensions / area display with colour indicator
 *   - Editable notes textarea
 *   - Crop assignment list (emoji, EN/FI name, spacing, qty)
 *   - Searchable "Add Crop" dropdown from the crop database
 *   - Per-crop remove button
 *   - Top-3 AI recommendations from the rule engine
 *   - Action buttons: Duplicate, Lock/Unlock, Delete
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import { crops as cropDb, cropMap } from '@/data/crops';
import { recommendCropsForZone, calcPlantQty } from '@/lib/ruleEngine';
import type { CropAssignment } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold tracking-wide uppercase text-garden-stone">
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ZoneDetail() {
  const garden = useGardenStore((s) => s.garden);
  const canvas = useGardenStore((s) => s.canvas);
  const updateZone = useGardenStore((s) => s.updateZone);
  const removeZone = useGardenStore((s) => s.removeZone);
  const duplicateZone = useGardenStore((s) => s.duplicateZone);
  const lockZone = useGardenStore((s) => s.lockZone);
  const unlockZone = useGardenStore((s) => s.unlockZone);
  const assignCrops = useGardenStore((s) => s.assignCrops);
  const deselectAll = useGardenStore((s) => s.deselectAll);

  const [cropSearch, setCropSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedId = canvas.selectedZoneIds[0] ?? null;
  const zone = garden?.zones.find((z) => z.id === selectedId) ?? null;

  const activeSeason = garden?.seasons.find((s) => s.id === garden.active_season) ?? null;
  const assignment = activeSeason?.crop_assignments.find((a) => a.zone_id === selectedId);
  const assignedCrops: CropAssignment[] = assignment?.crops ?? [];

  // ── Derived recommendations ───────────────────────────────────────────────

  const recommendations = useMemo(() => {
    if (!zone || !garden) return [];
    const assignedIds = assignedCrops.map((c) => c.crop_id);
    return recommendCropsForZone(zone, garden.climate, assignedIds, 3);
  }, [zone, garden, assignedCrops]);

  // ── Crop search dropdown options ──────────────────────────────────────────

  const filteredCrops = useMemo(() => {
    const q = cropSearch.trim().toLowerCase();
    const assignedIds = new Set(assignedCrops.map((c) => c.crop_id));
    return cropDb
      .filter((c) => !assignedIds.has(c.id))
      .filter(
        (c) =>
          q === '' ||
          c.name_en.toLowerCase().includes(q) ||
          c.name_fi.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [cropSearch, assignedCrops]);

  // ── Mutation helpers ──────────────────────────────────────────────────────

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!zone) return;
      updateZone(zone.id, { name: e.target.value });
    },
    [zone, updateZone],
  );

  const handleNotesChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!zone) return;
      updateZone(zone.id, { notes: e.target.value });
    },
    [zone, updateZone],
  );

  const handleAddCrop = useCallback(
    (cropId: string) => {
      if (!zone || !activeSeason) return;
      const crop = cropMap[cropId];
      if (!crop) return;
      const qty = calcPlantQty(crop, zone);
      const next: CropAssignment[] = [...assignedCrops, { crop_id: cropId, qty }];
      assignCrops(zone.id, activeSeason.id, next);
      setCropSearch('');
      setDropdownOpen(false);
    },
    [zone, activeSeason, assignedCrops, assignCrops],
  );

  const handleRemoveCrop = useCallback(
    (cropId: string) => {
      if (!zone || !activeSeason) return;
      const next = assignedCrops.filter((c) => c.crop_id !== cropId);
      assignCrops(zone.id, activeSeason.id, next);
    },
    [zone, activeSeason, assignedCrops, assignCrops],
  );

  const handleDelete = useCallback(() => {
    if (!zone) return;
    if (!confirm(`Delete zone "${zone.name}"? This cannot be undone immediately.`)) return;
    deselectAll();
    removeZone(zone.id);
  }, [zone, deselectAll, removeZone]);

  // ── Empty state ───────────────────────────────────────────────────────────

  if (!zone) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center py-16">
        <span className="text-4xl" aria-hidden>🗺️</span>
        <p className="text-sm font-medium text-gray-500">No zone selected</p>
        <p className="text-xs text-gray-400 leading-relaxed">
          Click a zone on the canvas to see its details and assign crops.
        </p>
      </div>
    );
  }

  const area = (zone.width_m * zone.depth_m).toFixed(1);

  return (
    <div className="flex flex-col h-full overflow-y-auto">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-gray-100"
        style={{ borderLeftWidth: 4, borderLeftColor: zone.color }}
      >
        {/* Colour swatch */}
        <div
          className="w-5 h-5 rounded-md flex-none border border-black/10 shadow-sm"
          style={{ backgroundColor: zone.color }}
        />

        {/* Editable name */}
        <input
          type="text"
          value={zone.name}
          onChange={handleNameChange}
          disabled={zone.locked}
          className="
            flex-1 min-w-0 text-sm font-semibold text-gray-800 bg-transparent
            border-b border-transparent
            hover:border-garden-leaf/40 focus:border-garden-leaf
            focus:outline-none transition-colors duration-150
            disabled:opacity-60 disabled:cursor-not-allowed
          "
          aria-label="Zone name"
        />

        {/* Lock indicator */}
        {zone.locked && (
          <span className="flex-none text-garden-stone" title="Zone is locked">
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current" aria-hidden>
              <rect x="4" y="7" width="8" height="7" rx="1.5" />
              <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.3" fill="none" />
            </svg>
          </span>
        )}
      </div>

      <div className="flex-1 px-4 py-4 space-y-5 overflow-y-auto">

        {/* ── Dimensions ─────────────────────────────────────────────────── */}
        <section>
          <FieldLabel>Dimensions</FieldLabel>
          <div className="mt-1.5 flex items-baseline gap-2 text-sm text-gray-700">
            <span className="font-medium">{zone.width_m} m × {zone.depth_m} m</span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-500">{area} m²</span>
            {zone.shape === 'ellipse' && (
              <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">ellipse</span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-gray-400">
            Type: <span className="text-gray-600 font-medium capitalize">{zone.type.replace(/_/g, ' ')}</span>
            {' · '}
            Category: <span className="text-gray-600 font-medium capitalize">{zone.category}</span>
          </div>
        </section>

        {/* ── Notes ──────────────────────────────────────────────────────── */}
        <section>
          <FieldLabel>Notes</FieldLabel>
          <textarea
            value={zone.notes}
            onChange={handleNotesChange}
            disabled={zone.locked}
            rows={3}
            placeholder="Add notes about soil preparation, observations…"
            className="
              mt-1.5 w-full text-xs text-gray-700 placeholder:text-gray-400
              border border-gray-200 rounded-lg px-3 py-2 resize-none
              bg-gray-50/60 focus:bg-white
              focus:outline-none focus:ring-2 focus:ring-garden-leaf/30 focus:border-garden-leaf/50
              transition-all duration-150
              disabled:opacity-60 disabled:cursor-not-allowed
            "
          />
        </section>

        {/* ── Assigned Crops ─────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <FieldLabel>Assigned Crops</FieldLabel>
            {activeSeason && (
              <span className="text-[10px] text-garden-stone bg-garden-cream px-2 py-0.5 rounded-full">
                {activeSeason.year} {activeSeason.season.replace('_', ' ')}
              </span>
            )}
          </div>

          {/* Crop list */}
          {assignedCrops.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-1">No crops assigned yet.</p>
          ) : (
            <ul className="space-y-1.5 mb-3">
              {assignedCrops.map((ca) => {
                const crop = cropMap[ca.crop_id];
                if (!crop) return null;
                return (
                  <li
                    key={ca.crop_id}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-gray-50 border border-gray-100 group"
                  >
                    {/* Emoji */}
                    <span className="text-base leading-none" aria-hidden>{crop.emoji}</span>

                    {/* Names */}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-800 truncate">
                        {crop.name_en}
                        <span className="ml-1 font-normal text-gray-400">/ {crop.name_fi}</span>
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {crop.spacing_in_row_cm}&thinsp;cm spacing · {ca.qty} plant{ca.qty !== 1 ? 's' : ''}
                      </div>
                    </div>

                    {/* Remove */}
                    {!zone.locked && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCrop(ca.crop_id)}
                        className="
                          flex-none opacity-0 group-hover:opacity-100
                          w-6 h-6 rounded-md flex items-center justify-center
                          text-gray-400 hover:text-red-500 hover:bg-red-50
                          transition-all duration-150
                        "
                        title={`Remove ${crop.name_en}`}
                      >
                        <svg viewBox="0 0 12 12" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.8">
                          <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Add Crop dropdown */}
          {!zone.locked && activeSeason && (
            <div className="relative">
              <div className="flex items-center gap-1.5 border border-garden-leaf/30 rounded-lg px-2.5 py-1.5 bg-white focus-within:ring-2 focus-within:ring-garden-leaf/30">
                <svg viewBox="0 0 14 14" className="w-3.5 h-3.5 text-garden-leaf flex-none fill-none stroke-current" strokeWidth="1.6">
                  <circle cx="6" cy="6" r="4.5" />
                  <line x1="9.5" y1="9.5" x2="13" y2="13" />
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  value={cropSearch}
                  onChange={(e) => { setCropSearch(e.target.value); setDropdownOpen(true); }}
                  onFocus={() => setDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setDropdownOpen(false), 180)}
                  placeholder="Search crops to add…"
                  className="flex-1 min-w-0 text-xs bg-transparent focus:outline-none text-gray-700 placeholder:text-gray-400"
                />
                {cropSearch && (
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); setCropSearch(''); }}
                    className="flex-none text-gray-400 hover:text-gray-600"
                  >
                    <svg viewBox="0 0 10 10" className="w-3 h-3 fill-none stroke-current" strokeWidth="1.8">
                      <path d="M1 1l8 8M9 1l-8 8" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Dropdown */}
              {dropdownOpen && filteredCrops.length > 0 && (
                <ul className="
                  absolute z-50 top-full mt-1 w-full
                  bg-white border border-gray-200 rounded-xl shadow-lg
                  overflow-y-auto max-h-48
                  divide-y divide-gray-50
                ">
                  {filteredCrops.map((crop) => (
                    <li key={crop.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); handleAddCrop(crop.id); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-garden-cream/60 transition-colors duration-100"
                      >
                        <span className="text-base leading-none" aria-hidden>{crop.emoji}</span>
                        <span className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-gray-800">{crop.name_en}</span>
                          <span className="text-[10px] text-gray-400 ml-1">/ {crop.name_fi}</span>
                        </span>
                        <span className="text-[10px] text-garden-stone">
                          {crop.spacing_in_row_cm}cm
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {dropdownOpen && filteredCrops.length === 0 && cropSearch.length > 1 && (
                <div className="absolute z-50 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-3">
                  <p className="text-xs text-gray-400 italic text-center">No crops match &ldquo;{cropSearch}&rdquo;</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── AI Recommendations ─────────────────────────────────────────── */}
        {recommendations.length > 0 && (
          <section>
            <FieldLabel>Recommended Crops</FieldLabel>
            <ul className="mt-2 space-y-1.5">
              {recommendations.map(({ crop, score, reasons }) => (
                <li
                  key={crop.id}
                  className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg bg-garden-sprout/10 border border-garden-sprout/20"
                >
                  <span className="text-base leading-none mt-0.5" aria-hidden>{crop.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold text-garden-leaf-dark">{crop.name_en}</span>
                      <span className="text-[10px] text-garden-stone">{score}/100</span>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed mt-0.5 line-clamp-2">
                      {reasons[0]}
                    </p>
                  </div>
                  {!zone.locked && activeSeason && (
                    <button
                      type="button"
                      onClick={() => handleAddCrop(crop.id)}
                      disabled={assignedCrops.some((a) => a.crop_id === crop.id)}
                      className="
                        flex-none mt-0.5 h-6 px-2 rounded-md text-[10px] font-semibold
                        bg-garden-leaf text-white
                        hover:bg-garden-leaf-dark
                        disabled:opacity-40 disabled:cursor-not-allowed
                        transition-colors duration-100
                      "
                    >
                      Add
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

      </div>

      {/* ── Action buttons ─────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
        {/* Duplicate */}
        <button
          type="button"
          onClick={() => duplicateZone(zone.id)}
          className="
            flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-medium
            border border-gray-200 text-gray-600 bg-white
            hover:bg-gray-50 hover:border-gray-300
            transition-colors duration-100
          "
          title="Duplicate this zone"
        >
          <svg viewBox="0 0 14 14" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5">
            <rect x="3" y="3" width="8" height="8" rx="1.5" />
            <path d="M1 9V2a1 1 0 011-1h7" strokeLinecap="round" />
          </svg>
          Duplicate
        </button>

        {/* Lock / Unlock */}
        <button
          type="button"
          onClick={() => zone.locked ? unlockZone(zone.id) : lockZone(zone.id)}
          className={`
            flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-medium
            border transition-colors duration-100
            ${zone.locked
              ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
            }
          `}
          title={zone.locked ? 'Unlock zone' : 'Lock zone'}
        >
          <svg viewBox="0 0 14 14" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5">
            {zone.locked ? (
              <>
                <rect x="2" y="6" width="10" height="7" rx="1.5" />
                <path d="M4.5 6V4a2.5 2.5 0 015 0v2" strokeLinecap="round" />
              </>
            ) : (
              <>
                <rect x="2" y="6" width="10" height="7" rx="1.5" />
                <path d="M4.5 6V4a2.5 2.5 0 015 0" strokeLinecap="round" />
              </>
            )}
          </svg>
          {zone.locked ? 'Unlock' : 'Lock'}
        </button>

        {/* Spacer */}
        <span className="flex-1" />

        {/* Delete */}
        <button
          type="button"
          onClick={handleDelete}
          className="
            flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-medium
            border border-red-200 text-red-600 bg-white
            hover:bg-red-50 hover:border-red-300
            transition-colors duration-100
          "
          title="Delete zone"
        >
          <svg viewBox="0 0 14 14" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5">
            <path d="M2 3.5h10M5 3.5V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M5.5 6v4M8.5 6v4" strokeLinecap="round" />
            <path d="M3 3.5l.7 8.1a.8.8 0 00.8.7h5a.8.8 0 00.8-.7L11 3.5" strokeLinecap="round" />
          </svg>
          Delete
        </button>
      </div>
    </div>
  );
}
