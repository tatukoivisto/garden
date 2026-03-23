/**
 * spatialSolver.ts — Deterministic spatial functions for the garden planner.
 *
 * Pure functions: overlap detection, smart placement, bed sizing, boundary checks.
 * These are called by AI tool executors — the LLM never computes coordinates directly.
 */

import type { Zone } from '@/types';
import { cropMap } from '@/data/crops';

// ---------------------------------------------------------------------------
// Rect primitives
// ---------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Convert a Zone to a Rect, accounting for rotation. */
export function zoneToRect(zone: Zone): Rect {
  const isRotated = zone.rotation_deg === 90;
  return {
    x: zone.x_m,
    y: zone.y_m,
    w: isRotated ? zone.depth_m : zone.width_m,
    h: isRotated ? zone.width_m : zone.depth_m,
  };
}

/** Check if two rectangles overlap (share any interior area). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Compute the overlapping area between two rectangles. */
export function overlapArea(a: Rect, b: Rect): number {
  const overlapX = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const overlapY = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return overlapX * overlapY;
}

// ---------------------------------------------------------------------------
// Overlap detection
// ---------------------------------------------------------------------------

export interface OverlapInfo {
  zone_id: string;
  zone_name: string;
  overlap_m2: number;
}

/** Find all zones that overlap with the given rect. */
export function findOverlaps(
  rect: Rect,
  zones: Zone[],
  excludeId?: string,
): OverlapInfo[] {
  const overlaps: OverlapInfo[] = [];
  for (const z of zones) {
    if (excludeId && z.id === excludeId) continue;
    const zRect = zoneToRect(z);
    if (rectsOverlap(rect, zRect)) {
      overlaps.push({
        zone_id: z.id,
        zone_name: z.name,
        overlap_m2: Math.round(overlapArea(rect, zRect) * 100) / 100,
      });
    }
  }
  return overlaps;
}

// ---------------------------------------------------------------------------
// Boundary checking
// ---------------------------------------------------------------------------

export interface BoundaryCheck {
  inBounds: boolean;
  outsideBy: { left: number; top: number; right: number; bottom: number };
}

/** Check if a rect is within the garden boundary. */
export function checkBoundary(
  rect: Rect,
  gardenWidth_m: number,
  gardenDepth_m: number,
): BoundaryCheck {
  const outsideBy = {
    left: Math.max(0, -rect.x),
    top: Math.max(0, -rect.y),
    right: Math.max(0, (rect.x + rect.w) - gardenWidth_m),
    bottom: Math.max(0, (rect.y + rect.h) - gardenDepth_m),
  };
  const inBounds = outsideBy.left === 0 && outsideBy.top === 0 &&
                   outsideBy.right === 0 && outsideBy.bottom === 0;
  return { inBounds, outsideBy };
}

// ---------------------------------------------------------------------------
// Smart placement
// ---------------------------------------------------------------------------

export type SemanticLocation =
  | 'auto'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  | 'center' | 'next-to'
  | 'outside-right' | 'outside-below' | 'outside-left' | 'outside-above';

interface PlacementOptions {
  prefer?: SemanticLocation;
  nearZoneId?: string;
  nearSide?: 'left' | 'right' | 'above' | 'below';
  minGap?: number;
  excludeZoneId?: string;
  /** Allow placing outside the garden boundary. */
  allowOutside?: boolean;
}

interface ScoredPosition {
  x_m: number;
  y_m: number;
  score: number;
  reason: string;
}

/**
 * Find the best position for a zone of the given size.
 *
 * Strategy:
 * 1. Generate candidate positions (grid + edge-adjacent + semantic anchors)
 * 2. Filter out candidates that overlap existing zones
 * 3. Score by proximity to preferred location
 * 4. Return ranked positions
 */
export function findBestPosition(
  width_m: number,
  depth_m: number,
  zones: Zone[],
  gardenWidth_m: number,
  gardenDepth_m: number,
  options: PlacementOptions = {},
): ScoredPosition[] {
  const minGap = options.minGap ?? 0.3;
  const step = 0.5;
  const candidates: ScoredPosition[] = [];

  // --- 1. Generate semantic anchor positions ---
  const anchors: Array<{ x: number; y: number; reason: string }> = [];

  const allowOutside = options.allowOutside ?? false;

  // Corner/center positions (inside garden)
  anchors.push({ x: minGap, y: minGap, reason: 'top-left corner' });
  anchors.push({ x: gardenWidth_m - width_m - minGap, y: minGap, reason: 'top-right corner' });
  anchors.push({ x: minGap, y: gardenDepth_m - depth_m - minGap, reason: 'bottom-left corner' });
  anchors.push({ x: gardenWidth_m - width_m - minGap, y: gardenDepth_m - depth_m - minGap, reason: 'bottom-right corner' });
  anchors.push({ x: (gardenWidth_m - width_m) / 2, y: (gardenDepth_m - depth_m) / 2, reason: 'center' });

  // Outside-garden positions (for satellite areas)
  if (allowOutside) {
    anchors.push({ x: gardenWidth_m + minGap, y: 0, reason: 'outside right' });
    anchors.push({ x: 0, y: gardenDepth_m + minGap, reason: 'outside below' });
    anchors.push({ x: -width_m - minGap, y: 0, reason: 'outside left' });
    anchors.push({ x: 0, y: -depth_m - minGap, reason: 'outside above' });
  }

  // --- 2. Generate edge-adjacent positions near existing zones ---
  for (const z of zones) {
    if (options.excludeZoneId && z.id === options.excludeZoneId) continue;
    const zr = zoneToRect(z);
    // Right of zone
    anchors.push({ x: zr.x + zr.w + minGap, y: zr.y, reason: `right of ${z.name}` });
    // Left of zone
    anchors.push({ x: zr.x - width_m - minGap, y: zr.y, reason: `left of ${z.name}` });
    // Below zone
    anchors.push({ x: zr.x, y: zr.y + zr.h + minGap, reason: `below ${z.name}` });
    // Above zone
    anchors.push({ x: zr.x, y: zr.y - depth_m - minGap, reason: `above ${z.name}` });
  }

  // --- 3. Grid scan ---
  for (let x = 0; x <= gardenWidth_m - width_m; x += step) {
    for (let y = 0; y <= gardenDepth_m - depth_m; y += step) {
      anchors.push({ x, y, reason: 'grid' });
    }
  }

  // --- 4. Filter valid positions (no overlaps with gap) ---
  for (const anchor of anchors) {
    const rect: Rect = { x: anchor.x, y: anchor.y, w: width_m, h: depth_m };
    // Check boundary (skip for outside placements)
    if (!allowOutside) {
      if (anchor.x < -0.01 || anchor.y < -0.01 ||
          anchor.x + width_m > gardenWidth_m + 0.01 ||
          anchor.y + depth_m > gardenDepth_m + 0.01) {
        continue;
      }
    }
    // Check overlaps with gap
    const expandedRect: Rect = {
      x: anchor.x - minGap,
      y: anchor.y - minGap,
      w: width_m + minGap * 2,
      h: depth_m + minGap * 2,
    };
    const overlaps = findOverlaps(expandedRect, zones, options.excludeZoneId);
    if (overlaps.length > 0) continue;

    // Score the position
    const score = scorePosition(
      anchor.x, anchor.y, width_m, depth_m,
      gardenWidth_m, gardenDepth_m,
      zones, options,
    );

    candidates.push({ x_m: round2(anchor.x), y_m: round2(anchor.y), score, reason: anchor.reason });
  }

  // Deduplicate (positions within 0.1m of each other)
  const deduped: ScoredPosition[] = [];
  for (const c of candidates) {
    const isDupe = deduped.some(
      (d) => Math.abs(d.x_m - c.x_m) < 0.1 && Math.abs(d.y_m - c.y_m) < 0.1,
    );
    if (!isDupe) deduped.push(c);
  }

  // Sort by score descending
  deduped.sort((a, b) => b.score - a.score);

  return deduped.slice(0, 10);
}

function scorePosition(
  x: number, y: number, w: number, h: number,
  gardenW: number, gardenH: number,
  zones: Zone[],
  options: PlacementOptions,
): number {
  let score = 50; // base score

  const prefer = options.prefer ?? 'auto';

  // Semantic location preference scoring
  switch (prefer) {
    case 'top-left':
      score += 100 - (x + y) * 5;
      break;
    case 'top-right':
      score += 100 - ((gardenW - x - w) + y) * 5;
      break;
    case 'bottom-left':
      score += 100 - (x + (gardenH - y - h)) * 5;
      break;
    case 'bottom-right':
      score += 100 - ((gardenW - x - w) + (gardenH - y - h)) * 5;
      break;
    case 'center': {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const dist = Math.hypot(cx - gardenW / 2, cy - gardenH / 2);
      score += 100 - dist * 10;
      break;
    }
    case 'next-to': {
      if (options.nearZoneId) {
        const nearZone = zones.find((z) => z.id === options.nearZoneId);
        if (nearZone) {
          const nRect = zoneToRect(nearZone);
          const dist = rectDistance(
            { x, y, w, h },
            nRect,
          );
          score += 100 - dist * 20;

          // Bonus for correct side
          if (options.nearSide === 'right' && x >= nRect.x + nRect.w) score += 30;
          if (options.nearSide === 'left' && x + w <= nRect.x) score += 30;
          if (options.nearSide === 'below' && y >= nRect.y + nRect.h) score += 30;
          if (options.nearSide === 'above' && y + h <= nRect.y) score += 30;
        }
      }
      break;
    }
    case 'outside-right':
      score += x >= gardenW ? 100 : 0;
      break;
    case 'outside-below':
      score += y >= gardenH ? 100 : 0;
      break;
    case 'outside-left':
      score += x + w <= 0 ? 100 : 0;
      break;
    case 'outside-above':
      score += y + h <= 0 ? 100 : 0;
      break;
    case 'auto':
    default:
      // Prefer top-left, neat rows
      score += 50 - (x + y) * 2;
      // Bonus for aligning with existing zone edges
      for (const z of zones) {
        const zr = zoneToRect(z);
        if (Math.abs(x - zr.x) < 0.1) score += 5; // aligned x
        if (Math.abs(y - zr.y) < 0.1) score += 5; // aligned y
        if (Math.abs(x - (zr.x + zr.w)) < 0.5) score += 3; // adjacent x
        if (Math.abs(y - (zr.y + zr.h)) < 0.5) score += 3; // adjacent y
      }
      break;
  }

  return score;
}

/** Minimum distance between two rects (0 if overlapping). */
function rectDistance(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w)));
  const dy = Math.max(0, Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h)));
  return Math.hypot(dx, dy);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Bed dimension calculator
// ---------------------------------------------------------------------------

export interface BedSizeResult {
  recommended_width_m: number;
  recommended_depth_m: number;
  total_area_m2: number;
  fits_all: boolean;
  per_crop: Array<{
    crop_id: string;
    qty_requested: number;
    area_needed_m2: number;
    spacing_in_row_cm: number;
    spacing_between_rows_cm: number;
  }>;
}

/**
 * Calculate bed dimensions to fit given crops and quantities.
 *
 * Uses crop spacing data to compute total area needed, then
 * fits it into a bed of the given max width.
 */
export function calculateBedDimensions(
  crops: Array<{ crop_id: string; qty: number }>,
  maxWidth_m: number = 1.2,
): BedSizeResult {
  let totalArea = 0;
  const perCrop: BedSizeResult['per_crop'] = [];

  for (const { crop_id, qty } of crops) {
    const crop = cropMap[crop_id.toLowerCase()];
    const spacingRow = crop?.spacing_in_row_cm ?? 30;
    const spacingBetween = crop?.spacing_between_rows_cm ?? 30;
    const areaPer = (spacingRow * spacingBetween) / 10000; // cm² → m²
    const areaCrop = areaPer * qty;
    totalArea += areaCrop;
    perCrop.push({
      crop_id,
      qty_requested: qty,
      area_needed_m2: round2(areaCrop),
      spacing_in_row_cm: spacingRow,
      spacing_between_rows_cm: spacingBetween,
    });
  }

  // Fit into bed with max width
  const width = Math.min(maxWidth_m, Math.ceil(Math.sqrt(totalArea) * 4) / 4);
  const depth = Math.max(1, Math.ceil((totalArea / width) * 4) / 4); // round up to 0.25m

  return {
    recommended_width_m: round2(width),
    recommended_depth_m: round2(depth),
    total_area_m2: round2(totalArea),
    fits_all: true,
    per_crop: perCrop,
  };
}

// ---------------------------------------------------------------------------
// Semantic location resolver for modify_zone
// ---------------------------------------------------------------------------

/**
 * Resolve a semantic location to x,y coordinates for a zone of given size.
 */
export function resolveSemanticLocation(
  location: SemanticLocation,
  width_m: number,
  depth_m: number,
  gardenWidth_m: number,
  gardenDepth_m: number,
  zones: Zone[],
  options: { nearZoneId?: string; nearSide?: string; excludeZoneId?: string } = {},
): { x_m: number; y_m: number } | null {
  const positions = findBestPosition(
    width_m, depth_m, zones, gardenWidth_m, gardenDepth_m,
    {
      prefer: location,
      nearZoneId: options.nearZoneId,
      nearSide: options.nearSide as PlacementOptions['nearSide'],
      excludeZoneId: options.excludeZoneId,
    },
  );
  if (positions.length === 0) return null;
  return { x_m: positions[0].x_m, y_m: positions[0].y_m };
}
