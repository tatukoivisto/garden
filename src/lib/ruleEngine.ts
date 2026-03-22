/**
 * Rule engine utilities for the Kitchen Garden Planner.
 *
 * This file contains:
 *  1. generateSunHeatmap     — solar-model heatmap for the canvas overlay
 *  2. getSowingWindow        — sowing/harvest date calculator from climate config
 *  3. checkCompanionship     — bidirectional companion/antagonist lookup
 *  4. getFamilyColor         — family colour palette helper
 *  5. recommendCropsForZone  — agronomic crop recommendation engine
 *  6. Companion helpers      — getCompanionIds, areAntagonists, calcPlantQty
 *  7. generateShoppingList   — shopping list from season plan
 */

// All type imports consolidated at the top of the file.
import type { Crop, Zone, ClimateConfig, SeasonPlan, ShoppingListItem, BedSystem, BedSystemConfig } from '@/types';
import { crops, cropMap } from '@/data/crops';

// ─────────────────────────────────────────────────────────────────────────────
// Bed system configuration
// ─────────────────────────────────────────────────────────────────────────────

const BED_SYSTEM_CONFIGS: Record<BedSystem, BedSystemConfig> = {
  market_30in: {
    id: 'market_30in',
    name: 'Market Garden (30")',
    bedWidth_cm: 76,
    pathWidth_cm: 30,
    gridSnap_cm: 76,
    description: 'Fortier / Curtis Stone — 30" beds with 12" paths',
  },
  biointensive_4ft: {
    id: 'biointensive_4ft',
    name: 'Bio-intensive (4\')',
    bedWidth_cm: 122,
    pathWidth_cm: 30,
    gridSnap_cm: 122,
    description: 'John Jeavons / SPIN farming — 4\' beds',
  },
  sfg_1ft: {
    id: 'sfg_1ft',
    name: 'Square Foot (1\')',
    bedWidth_cm: 30,
    pathWidth_cm: 0,
    gridSnap_cm: 30,
    description: 'Mel Bartholomew — 1\' grid squares',
  },
  metric: {
    id: 'metric',
    name: 'Metric (free)',
    bedWidth_cm: 120,
    pathWidth_cm: 40,
    gridSnap_cm: 25,
    description: 'European / Finnish default — 25 cm grid snap',
  },
  custom: {
    id: 'custom',
    name: 'Custom',
    bedWidth_cm: 120,
    pathWidth_cm: 40,
    gridSnap_cm: 25,
    description: 'User-defined bed and path widths',
  },
};

/** Return the bed system configuration for the given system ID. */
export function getBedSystemConfig(system: BedSystem): BedSystemConfig {
  return BED_SYSTEM_CONFIGS[system] ?? BED_SYSTEM_CONFIGS.metric;
}

// ─────────────────────────────────────────────────────────────────────────────
// Zone companion conflict analysis (for on-canvas indicators)
// ─────────────────────────────────────────────────────────────────────────────

export interface ZoneCompanionLine {
  zoneA: string;
  zoneB: string;
  type: 'companion' | 'antagonist';
  cropA: string;
  cropB: string;
}

/**
 * Compute companion/antagonist lines between zones based on crop assignments.
 */
export function getZoneCompanionConflicts(
  zones: Zone[],
  seasons: SeasonPlan[],
  activeSeasonId: string,
): ZoneCompanionLine[] {
  const season = seasons.find((s) => s.id === activeSeasonId);
  if (!season) return [];

  const lines: ZoneCompanionLine[] = [];
  const assignments = season.crop_assignments;

  for (let i = 0; i < assignments.length; i++) {
    for (let j = i + 1; j < assignments.length; j++) {
      const a = assignments[i];
      const b = assignments[j];
      for (const cropA of a.crops) {
        const cA = cropMap[cropA.crop_id];
        if (!cA) continue;
        for (const cropB of b.crops) {
          const cB = cropMap[cropB.crop_id];
          if (!cB) continue;
          if (cA.antagonists.includes(cB.id) || cB.antagonists.includes(cA.id)) {
            lines.push({ zoneA: a.zone_id, zoneB: b.zone_id, type: 'antagonist', cropA: cA.id, cropB: cB.id });
          } else if (cA.companions.includes(cB.id) || cB.companions.includes(cA.id)) {
            lines.push({ zoneA: a.zone_id, zoneB: b.zone_id, type: 'companion', cropA: cA.id, cropB: cB.id });
          }
        }
      }
    }
  }

  return lines;
}

export interface HeatmapCell {
  /** Column index (0-based, west → east) */
  col: number;
  /** Row index (0-based, north → south) */
  row: number;
  /** Estimated sun hours for the day (0–24) */
  sunHours: number;
}

export interface SunHeatmapOptions {
  /** Garden width in metres (east-west extent) */
  gardenWidth_m: number;
  /** Garden depth in metres (north-south extent) */
  gardenDepth_m: number;
  /** Cell size in metres (default 0.5) */
  cellSize_m?: number;
  /** Day of year (1–365) */
  dayOfYear: number;
  /** Observer latitude in decimal degrees (default 60.17 = Helsinki) */
  latitude_deg?: number;
}

const DEG = Math.PI / 180;

/** Solar declination in radians for a given day of year. */
function solarDeclination(dayOfYear: number): number {
  // Spencer formula (simple approximation)
  const B = (2 * Math.PI * (dayOfYear - 1)) / 365;
  return (
    (0.006918 -
      0.399912 * Math.cos(B) +
      0.070257 * Math.sin(B) -
      0.006758 * Math.cos(2 * B) +
      0.000907 * Math.sin(2 * B) -
      0.002697 * Math.cos(3 * B) +
      0.00148 * Math.sin(3 * B)) *
    (180 / Math.PI) *
    DEG
  );
}

/**
 * Hour angle at sunrise/sunset for given latitude and declination.
 * Returns the absolute value in radians.
 */
function sunriseHourAngle(lat_rad: number, decl_rad: number): number {
  const cosOmega = -Math.tan(lat_rad) * Math.tan(decl_rad);
  // Clamp to [-1, 1] to handle polar day / polar night
  const clamped = Math.max(-1, Math.min(1, cosOmega));
  return Math.acos(clamped);
}

/**
 * Potential daylight hours for a flat, unobstructed surface at the given
 * latitude and day of year.
 */
function daylightHours(lat_deg: number, dayOfYear: number): number {
  const lat_rad = lat_deg * DEG;
  const decl = solarDeclination(dayOfYear);
  const omega = sunriseHourAngle(lat_rad, decl);
  return (2 * omega) / (15 * DEG); // convert radians → hours
}

/**
 * Generate a sun-hours heatmap for the garden.
 *
 * In this simplified model every cell receives the same potential daylight
 * hours (unobstructed, flat site). In a full implementation you would factor
 * in neighbouring structures, tree shadows, slope, etc. The function is
 * designed so callers can easily substitute a richer model later.
 */
export function generateSunHeatmap(options: SunHeatmapOptions): HeatmapCell[] {
  const {
    gardenWidth_m,
    gardenDepth_m,
    cellSize_m = 0.5,
    dayOfYear,
    latitude_deg = 60.17,
  } = options;

  const cols = Math.ceil(gardenWidth_m / cellSize_m);
  const rows = Math.ceil(gardenDepth_m / cellSize_m);

  // Base daylight for the day at this latitude
  const baseDaylight = daylightHours(latitude_deg, dayOfYear);

  const cells: HeatmapCell[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Slight north-south gradient: southern part of the plot (higher row
      // index when south_edge === 'top') gets marginally more direct sun.
      // We add ±10 % variation based on row position to make the heatmap
      // visually interesting without pretending to be a real shadow model.
      const rowFraction = row / Math.max(rows - 1, 1); // 0 (north) → 1 (south)
      const gradient = 1 - 0.1 + 0.2 * rowFraction; // 0.9 → 1.1

      // Very small random micro-variation (±2 %) per cell so the heatmap
      // doesn't look completely banded – seeded deterministically so it's
      // stable across re-renders for the same inputs.
      const seed = (col * 9301 + row * 49297 + dayOfYear * 233) % 1000;
      const micro = 0.98 + (seed / 1000) * 0.04; // 0.98 → 1.02

      const sunHours = Math.min(baseDaylight * gradient * micro, 24);

      cells.push({ col, row, sunHours });
    }
  }

  return cells;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sowing-window helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface SowingWindow {
  /** Start of indoor sowing (null if the crop is not sown indoors). */
  indoorStart: Date | null;
  /** End of the recommended indoor sowing window. */
  indoorEnd: Date | null;
  /** Date to move transplants outside, or direct-sow date. */
  outdoorStart: Date;
  /** First expected harvest date. */
  harvestStart: Date;
  /** Last date of the harvest window. */
  harvestEnd: Date;
  /**
   * Approximate end of storage period (4 weeks after harvest end).
   * null for crops that are not normally stored.
   */
  storageEnd: Date | null;
}

/** Parse a "MM-DD" climate frost-date string into a full Date for `year`. */
function parseFrostDate(mmdd: string, year: number): Date {
  const [mm, dd] = mmdd.split('-').map(Number);
  return new Date(year, mm - 1, dd);
}

/** Return a new Date that is `weeks` weeks after (or before, if negative) `date`. */
function addWeeks(date: Date, weeks: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + Math.round(weeks * 7));
  return d;
}

/** Return a new Date that is `days` days after `date`. */
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Calculate sowing, transplanting, harvest, and storage windows for a crop
 * given the garden's climate configuration and a target calendar year.
 *
 * Algorithm:
 *  1. Indoor sowing start = last_frost − sow_indoor_weeks_before_last_frost
 *     (indoor window spans 2 weeks)
 *  2. Outdoor date = last_frost + transplant_weeks_after_last_frost
 *     (negative weeks = the crop tolerates frost and goes out early)
 *  3. Harvest start = outdoor date + avg(days_to_harvest[0], days_to_harvest[1])
 *  4. Harvest end   = harvest start + harvest_window_weeks
 *  5. Storage end   = harvest end + 4 weeks  (root / bulb crops only)
 */
export function getSowingWindow(
  crop: Crop,
  climate: ClimateConfig,
  year: number = new Date().getFullYear(),
): SowingWindow {
  const lastFrost = parseFrostDate(climate.last_frost, year);

  let indoorStart: Date | null = null;
  let indoorEnd: Date | null = null;
  if (crop.sow_indoor_weeks_before_last_frost > 0) {
    indoorStart = addWeeks(lastFrost, -crop.sow_indoor_weeks_before_last_frost);
    indoorEnd = addWeeks(indoorStart, 2);
  }

  const outdoorStart = addWeeks(lastFrost, crop.transplant_weeks_after_last_frost);

  const avgDays = (crop.days_to_harvest[0] + crop.days_to_harvest[1]) / 2;
  const harvestStart = addDays(outdoorStart, avgDays);
  const harvestEnd = addWeeks(harvestStart, crop.harvest_window_weeks);

  // Storage applies to root / bulb crops and a few others
  const storageGroups = ['root_veg', 'allium_family', 'solanaceae', 'umbelliferae'];
  const hasStorage =
    storageGroups.includes(crop.rotation_group) ||
    ['potato', 'garlic', 'onion', 'beet', 'carrot'].includes(crop.id);
  const storageEnd = hasStorage ? addWeeks(harvestEnd, 4) : null;

  return { indoorStart, indoorEnd, outdoorStart, harvestStart, harvestEnd, storageEnd };
}

// ─────────────────────────────────────────────────────────────────────────────
// Companion-planting helper
// ─────────────────────────────────────────────────────────────────────────────

export type CompanionRelationship = 'companion' | 'antagonist' | 'neutral';

export interface CompanionResult {
  relationship: CompanionRelationship;
  /** Short human-readable explanation of the relationship. */
  reason: string;
}

/**
 * Determine the companion-planting relationship between two crops.
 *
 * The lookup is bidirectional: if A lists B as a companion OR B lists A as a
 * companion the result is 'companion'. Antagonism takes priority over
 * companionship when present in either direction.
 */
export function checkCompanionship(cropA: Crop, cropB: Crop): CompanionResult {
  if (cropA.id === cropB.id) {
    return { relationship: 'neutral', reason: 'Same crop.' };
  }

  const aDislikesB = cropA.antagonists.includes(cropB.id);
  const bDislikesA = cropB.antagonists.includes(cropA.id);
  const aLikesB = cropA.companions.includes(cropB.id);
  const bLikesA = cropB.companions.includes(cropA.id);

  if (aDislikesB || bDislikesA) {
    const who = aDislikesB ? cropA.name_en : cropB.name_en;
    const other = aDislikesB ? cropB.name_en : cropA.name_en;
    return {
      relationship: 'antagonist',
      reason: `${who} inhibits or competes with ${other}.`,
    };
  }

  if (aLikesB || bLikesA) {
    const who = aLikesB ? cropA.name_en : cropB.name_en;
    const other = aLikesB ? cropB.name_en : cropA.name_en;
    return {
      relationship: 'companion',
      reason: `${who} benefits from growing near ${other}.`,
    };
  }

  return {
    relationship: 'neutral',
    reason: `No known strong interaction between ${cropA.name_en} and ${cropB.name_en}.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Family colour palette
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Display colour for each plant family used in timeline bars and matrix cells.
 * Keys are lower-cased family names as stored in the crop database.
 */
export const FAMILY_COLORS: Record<string, string> = {
  solanaceae:      '#EF5350',
  brassicaceae:    '#66BB6A',
  fabaceae:        '#FDD835',
  apiaceae:        '#AB47BC',
  amaryllidaceae:  '#EC407A',
  cucurbitaceae:   '#FF7043',
  asteraceae:      '#29B6F6',
  chenopodiaceae:  '#EF9A9A',
  lamiaceae:       '#A5D6A7',
  rosaceae:        '#F48FB1',
  poaceae:         '#DCE775',
  polygonaceae:    '#FFCC80',
  boraginaceae:    '#80DEEA',
  hydrophyllaceae: '#CE93D8',
};

/** Return the display colour for a crop family (case-insensitive lookup). */
export function getFamilyColor(family: string): string {
  return FAMILY_COLORS[family.toLowerCase()] ?? '#90A4AE';
}

// ============================================================================
// Crop recommendation engine
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CropRecommendation {
  crop: Crop;
  score: number;       // 0–100
  reasons: string[];   // human-readable rationale
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert USDA zone string like "5b" to a numeric value (5.5). */
function parseUsdaZone(zone: string): number {
  const base = parseInt(zone, 10);
  if (isNaN(base)) return 6;
  const suffix = zone.slice(-1).toLowerCase();
  return base + (suffix === 'b' ? 0.5 : 0);
}

/** Calculate how many plants of this crop fit in the zone area (row-spacing model). */
export function calcPlantQty(crop: Crop, zone: Zone): number {
  const area_cm2 = zone.width_m * zone.depth_m * 10_000;
  const plant_area_cm2 =
    crop.spacing_in_row_cm * crop.spacing_between_rows_cm;
  return Math.max(1, Math.floor(area_cm2 / plant_area_cm2));
}

/** Calculate SFG (Square Foot Gardening) plant count for a zone. */
export function calcSFGQty(crop: Crop, zone: Zone): number {
  if (!crop.sfg_per_square) return calcPlantQty(crop, zone);
  const sqft = zone.width_m * zone.depth_m * 10.764;
  return Math.max(1, Math.floor(sqft * crop.sfg_per_square));
}

// ---------------------------------------------------------------------------
// Core recommendation engine
// ---------------------------------------------------------------------------

/**
 * Recommend the best crops for a zone, scored and ranked.
 *
 * Scoring factors:
 *  1. Zone type compatibility  (25 pts)
 *  2. Climate / USDA zone fit  (25 pts)
 *  3. Sun requirement match    (20 pts)
 *  4. Growing-season fit       (15 pts)
 *  5. Companion synergy        (15 pts)
 */
export function recommendCropsForZone(
  zone: Zone,
  climate: ClimateConfig,
  assignedCropIds: string[] = [],
  limit = 5,
): CropRecommendation[] {
  const usdaNum = parseUsdaZone(climate.usda_zone);

  const results: CropRecommendation[] = crops.map((crop) => {
    let score = 0;
    const reasons: string[] = [];

    // 1. Zone type compatibility (25 pts)
    if (crop.zone_types.includes(zone.type)) {
      score += 25;
      reasons.push(`Ideal for ${zone.type.replace(/_/g, ' ')}`);
    } else {
      const relatedTypes: Record<string, string[]> = {
        raised_bed: ['in_ground_bed', 'container'],
        in_ground_bed: ['raised_bed'],
        container: ['raised_bed', 'herb_spiral'],
        herb_spiral: ['raised_bed', 'container', 'perennial_bed'],
        perennial_bed: ['in_ground_bed', 'raised_bed'],
        greenhouse: ['polytunnel', 'cold_frame'],
        polytunnel: ['greenhouse', 'cold_frame'],
        cold_frame: ['greenhouse', 'polytunnel', 'raised_bed'],
        three_sisters: ['raised_bed', 'in_ground_bed'],
        strawberry_bed: ['raised_bed', 'container'],
        wildflower_strip: ['green_manure_strip'],
        green_manure_strip: ['wildflower_strip'],
        propagation_bed: ['raised_bed', 'cold_frame'],
        experimental_bed: ['raised_bed', 'in_ground_bed'],
      };
      const related = relatedTypes[zone.type] ?? [];
      if (crop.zone_types.some((zt) => related.includes(zt))) {
        score += 10;
        reasons.push('Adaptable to this zone type');
      }
    }

    // 2. Climate / USDA zone (25 pts)
    if (usdaNum >= crop.usda_min && usdaNum <= crop.usda_max) {
      score += 25;
      reasons.push(`Suited to USDA ${climate.usda_zone}`);
    } else if (usdaNum >= crop.usda_min - 1 && usdaNum <= crop.usda_max + 1) {
      score += 12;
      reasons.push('Marginal climate fit – protection advisable');
    }

    // 3. Sun requirement (20 pts)
    // Use a heuristic: assume full sun unless zone category is 'structure'
    if (crop.sun === 'full') {
      score += 20;
    } else if (crop.sun === 'partial') {
      score += 15;
      reasons.push('Tolerates partial shade');
    } else {
      score += 8;
      reasons.push('Shade-tolerant');
    }

    // 4. Growing-season fit (15 pts)
    const growingDays = climate.growing_season_days;
    const cropMinDays = crop.days_to_harvest[0];
    if (cropMinDays <= growingDays - 14) {
      score += 15;
      reasons.push(`Harvest in ${cropMinDays} days (season: ${growingDays} days)`);
    } else if (cropMinDays <= growingDays) {
      score += 8;
      reasons.push('Tight fit for growing season');
    } else if (!crop.frost_sensitive) {
      score += 4;
      reasons.push('Cold-hardy, use season extenders');
    }

    // 5. Companion synergy (15 pts)
    if (assignedCropIds.length > 0) {
      const synergistic = crop.companions.filter((c) =>
        assignedCropIds.includes(c),
      );
      const antagonistic = crop.antagonists.filter((c) =>
        assignedCropIds.includes(c),
      );
      if (synergistic.length > 0) {
        const bonus = Math.min(15, synergistic.length * 7);
        score += bonus;
        reasons.push(`Companion of: ${synergistic.join(', ')}`);
      }
      if (antagonistic.length > 0) {
        score -= antagonistic.length * 10;
        reasons.push(`Conflicts with: ${antagonistic.join(', ')}`);
      }
    }

    score = Math.max(0, Math.min(100, score));

    return { crop, score, reasons };
  });

  return results
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Companion analysis helpers
// ---------------------------------------------------------------------------

/** Return the IDs of already-assigned crops that are companions of cropId. */
export function getCompanionIds(cropId: string, assignedIds: string[]): string[] {
  const crop = crops.find((c) => c.id === cropId);
  if (!crop) return [];
  return assignedIds.filter((id) => crop.companions.includes(id));
}

/** Return true if the two crops are antagonists (in either direction). */
export function areAntagonists(cropIdA: string, cropIdB: string): boolean {
  const a = crops.find((c) => c.id === cropIdA);
  const b = crops.find((c) => c.id === cropIdB);
  if (!a || !b) return false;
  return a.antagonists.includes(cropIdB) || b.antagonists.includes(cropIdA);
}

// ============================================================================
// Shopping list generator
// ============================================================================

/**
 * Generate a categorised shopping list from a set of zones and their crop
 * assignments for the given season plan.
 *
 * Categories:
 *  - seeds        : crops that can be direct-sown
 *  - seedlings    : crops that must be started indoors (sow_indoor_weeks > 0
 *                   and direct_sow === false)
 *  - amendments   : compost, lime / sulphur adjustments derived from soil pH
 *                   and heavy-feeder crop counts
 *  - infrastructure: netting, stakes, fleece, mulch based on zone types /
 *                    crop requirements
 */
export function generateShoppingList(
  zones: Zone[],
  season: SeasonPlan,
  climate: ClimateConfig,
): ShoppingListItem[] {
  const items: ShoppingListItem[] = [];

  // Index zone geometries for quick lookup
  const zoneMap = new Map<string, Zone>(zones.map((z) => [z.id, z]));

  // Gather all crop assignments from the season
  const assignmentsByZone: Map<string, string[]> = new Map();
  for (const za of season.crop_assignments) {
    assignmentsByZone.set(za.zone_id, za.crops.map((c) => c.crop_id));
  }

  // ── Seeds & Seedlings ──────────────────────────────────────────────────────

  // Accumulate per-crop totals across zones
  const cropTotals: Map<string, { crop: Crop; qty: number; area_m2: number }> = new Map();

  for (const za of season.crop_assignments) {
    const zone = zoneMap.get(za.zone_id);
    if (!zone) continue;
    const area = zone.width_m * zone.depth_m;

    for (const ca of za.crops) {
      const crop = crops.find((c) => c.id === ca.crop_id);
      if (!crop) continue;
      const qty = ca.qty > 0 ? ca.qty : calcPlantQty(crop, zone);
      const existing = cropTotals.get(crop.id);
      if (existing) {
        existing.qty += qty;
        existing.area_m2 += area;
      } else {
        cropTotals.set(crop.id, { crop, qty, area_m2: area });
      }
    }
  }

  for (const { crop, qty, area_m2 } of Array.from(cropTotals.values())) {
    const variety = crop.name_latin ? `(${crop.name_latin})` : '';
    const areaStr = `${area_m2.toFixed(1)} m²`;

    if (crop.direct_sow) {
      // Annuals/biennials that are direct-sown → Seeds
      items.push({
        category: 'seeds',
        name: `${crop.emoji} ${crop.name_en} seeds ${variety}`.trim(),
        quantity: `${qty} plants / ${areaStr}`,
        notes: crop.notes_fi || undefined,
      });
    } else if (crop.sow_indoor_weeks_before_last_frost > 0) {
      // Must be started indoors → Seedlings / Transplants
      const weeksStr = `Start ${crop.sow_indoor_weeks_before_last_frost} wks before last frost`;
      items.push({
        category: 'seedlings',
        name: `${crop.emoji} ${crop.name_en} transplants ${variety}`.trim(),
        quantity: `${qty} plants / ${areaStr}`,
        notes: weeksStr,
      });
    } else {
      // Perennials / others → Seeds as fallback
      items.push({
        category: 'seeds',
        name: `${crop.emoji} ${crop.name_en} ${crop.type === 'perennial' ? 'plants' : 'seeds'} ${variety}`.trim(),
        quantity: `${qty} / ${areaStr}`,
        notes: crop.type === 'perennial' ? 'Perennial – plant once' : undefined,
      });
    }
  }

  // ── Soil Amendments ────────────────────────────────────────────────────────

  const totalGrowingArea = zones
    .filter((z) => z.category === 'growing')
    .reduce((sum, z) => sum + z.width_m * z.depth_m, 0);

  if (totalGrowingArea > 0) {
    // Compost: ~5 cm depth per m²  (1 bag ≈ 50 L ≈ covers 1 m² at 5 cm)
    const compostBags = Math.ceil(totalGrowingArea);
    items.push({
      category: 'amendments',
      name: '🌱 Garden compost / well-rotted manure',
      quantity: `${compostBags} × 50L bags`,
      notes: `For ${totalGrowingArea.toFixed(1)} m² growing area (5 cm mulch layer)`,
    });
  }

  // pH correction
  if (climate.soil_ph < 6.0) {
    const deficit = (6.0 - climate.soil_ph).toFixed(1);
    items.push({
      category: 'amendments',
      name: '🪨 Garden lime (calcium carbonate)',
      quantity: `~${Math.ceil(totalGrowingArea * 0.15)} kg`,
      notes: `Raise pH by ~${deficit} units (current pH ${climate.soil_ph})`,
    });
  } else if (climate.soil_ph > 7.2) {
    const excess = (climate.soil_ph - 7.2).toFixed(1);
    items.push({
      category: 'amendments',
      name: '🧪 Sulphur / acidifying fertiliser',
      quantity: `~${Math.ceil(totalGrowingArea * 0.1)} kg`,
      notes: `Lower pH by ~${excess} units (current pH ${climate.soil_ph})`,
    });
  }

  // Heavy feeders → extra fertiliser
  const heavyFeederCount = Array.from(cropTotals.values()).filter(
    ({ crop }) => crop.feeder === 'heavy',
  ).length;
  if (heavyFeederCount > 0) {
    items.push({
      category: 'amendments',
      name: '🌿 Balanced granular fertiliser (NPK 5-5-5)',
      quantity: `${Math.ceil(totalGrowingArea * 0.05)} kg`,
      notes: `${heavyFeederCount} heavy-feeding crop type${heavyFeederCount > 1 ? 's' : ''} detected`,
    });
  }

  // ── Infrastructure ─────────────────────────────────────────────────────────

  const hasGreenhouse = zones.some((z) =>
    ['greenhouse', 'polytunnel', 'cold_frame'].includes(z.type),
  );
  const hasTallCrops = Array.from(cropTotals.keys()).some((id) => {
    const c = crops.find((x) => x.id === id);
    return c && ['tomato', 'cucumber', 'peas', 'beans', 'squash'].includes(c.id);
  });
  const hasFrostSensitive = Array.from(cropTotals.values()).some(
    ({ crop }) => crop.frost_sensitive,
  );
  const hasRaisedBeds = zones.some((z) =>
    z.type === 'raised_bed' || z.type === 'three_sisters',
  );

  if (hasTallCrops) {
    items.push({
      category: 'infrastructure',
      name: '🪵 Bamboo canes / stakes (1.8 m)',
      quantity: `${Math.ceil(Array.from(cropTotals.values()).filter(({ crop }) => ['tomato', 'cucumber', 'peas', 'beans', 'squash'].includes(crop.id)).reduce((s, { qty }) => s + qty, 0) * 1.2)} canes`,
      notes: 'For climbing / tall crops',
    });
    items.push({
      category: 'infrastructure',
      name: '🕸️ Garden twine / trellis netting (1.8 m wide)',
      quantity: `${Math.ceil(totalGrowingArea / 4)} m`,
      notes: 'Support netting for climbers',
    });
  }

  if (hasFrostSensitive && !hasGreenhouse) {
    items.push({
      category: 'infrastructure',
      name: '🧣 Horticultural fleece / frost cloth (17 gsm)',
      quantity: `${Math.ceil(totalGrowingArea * 1.1)} m²`,
      notes: 'Frost protection for tender crops',
    });
  }

  if (hasRaisedBeds) {
    items.push({
      category: 'infrastructure',
      name: '🪲 Fine mesh anti-insect netting (0.8 mm)',
      quantity: `${Math.ceil(totalGrowingArea * 0.6)} m²`,
      notes: 'Carrot fly, cabbage white butterfly, aphid barrier',
    });
    items.push({
      category: 'infrastructure',
      name: '🌾 Straw / wood chip mulch',
      quantity: `${Math.ceil(totalGrowingArea * 0.05 * 1000)} L`,
      notes: 'Moisture retention and weed suppression (5 cm depth)',
    });
  }

  return items;
}

// ============================================================================
// Rotation violation checker
// ============================================================================

/**
 * Check whether planting `cropId` in `zone` violates crop rotation rules,
 * given what was planted in the same zone in `previousSeasonCropIds`.
 *
 * Returns an object describing any violation found.
 */
export interface RotationViolation {
  cropId: string;
  cropName: string;
  previousCropId: string;
  previousCropName: string;
  reason: string;
  severity: 'warning' | 'error';
}

export function checkRotationViolation(
  cropId: string,
  previousSeasonCropIds: string[],
): RotationViolation | null {
  const crop = crops.find((c) => c.id === cropId);
  if (!crop || previousSeasonCropIds.length === 0) return null;

  for (const prevId of previousSeasonCropIds) {
    const prevCrop = crops.find((c) => c.id === prevId);
    if (!prevCrop) continue;

    // Direct rotation violation: same rotation_group grown consecutively
    if (
      crop.rotation_avoid_after.includes(prevCrop.rotation_group) ||
      crop.rotation_avoid_after.includes(prevId)
    ) {
      return {
        cropId,
        cropName: crop.name_en,
        previousCropId: prevId,
        previousCropName: prevCrop.name_en,
        reason: `${crop.name_en} should not follow ${prevCrop.name_en} (same rotation group: ${prevCrop.rotation_group})`,
        severity: 'error',
      };
    }

    // Same rotation group as previous crop (less strict than explicit avoid_after)
    if (
      crop.rotation_group === prevCrop.rotation_group &&
      crop.rotation_group !== 'other' &&
      crop.rotation_group !== ''
    ) {
      return {
        cropId,
        cropName: crop.name_en,
        previousCropId: prevId,
        previousCropName: prevCrop.name_en,
        reason: `${crop.name_en} and ${prevCrop.name_en} share the same rotation group (${crop.rotation_group}) – rotate to a different family`,
        severity: 'warning',
      };
    }
  }

  return null;
}
