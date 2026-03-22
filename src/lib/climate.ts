/**
 * Climate detection and lookup utilities for the Kitchen Garden Planner.
 *
 * Uses the Open-Meteo API (https://open-meteo.com/) for historical weather
 * data and geocoding. No API key required.
 */

import type { ClimateConfig, SoilType, WindExposure } from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPEN_METEO_GEO = 'https://geocoding-api.open-meteo.com/v1';
const OPEN_METEO_ARCHIVE = 'https://archive-api.open-meteo.com/v1';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect a full ClimateConfig for the given coordinates.
 *
 * Fetches the previous full calendar year's daily min/max temperature and
 * precipitation from Open-Meteo Archive, then derives:
 *   - Frost dates (last spring / first autumn)
 *   - Annual rainfall
 *   - USDA hardiness zone estimate
 *   - Finnish hardiness zone estimate
 *   - Growing season length
 *   - Summer sun angle and solstice daylight hours
 *   - Estimated soil type and pH
 *   - Wind exposure
 *
 * Falls back gracefully to latitude-based estimates if the network call fails.
 */
export async function detectClimateFromLocation(
  lat: number,
  lng: number,
): Promise<ClimateConfig> {
  const year = new Date().getFullYear() - 1; // use last complete year
  const startDate = `${year}-01-01`;
  const endDate   = `${year}-12-31`;

  const archiveUrl =
    `${OPEN_METEO_ARCHIVE}/archive` +
    `?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&daily=temperature_2m_min,temperature_2m_max,precipitation_sum` +
    `&timezone=auto`;

  // Latitude-based fallbacks applied before the fetch so we always have values
  const fallbackFrost = estimateFrostDates(lat);
  let lastFrost   = fallbackFrost.lastFrost;
  let firstFrost  = fallbackFrost.firstFrost;
  let annualRainfall = estimateRainfallFromLat(lat);

  try {
    const resp = await fetch(archiveUrl);
    if (resp.ok) {
      const data = (await resp.json()) as {
        daily?: {
          time: string[];
          temperature_2m_min: (number | null)[];
          temperature_2m_max: (number | null)[];
          precipitation_sum: (number | null)[];
        };
      };

      if (data.daily) {
        const { time, temperature_2m_min, precipitation_sum } = data.daily;

        // ── Annual rainfall ────────────────────────────────────────────────
        annualRainfall = Math.round(
          precipitation_sum.reduce<number>((sum, v) => sum + (v ?? 0), 0),
        );

        // ── Derive frost dates from daily minimum temperatures ─────────────
        // "Frost" = tmin ≤ 0 °C
        const FROST_C = 0;
        let springFrostLastIdx  = -1;
        let autumnFrostFirstIdx = -1;

        for (let i = 0; i < time.length; i++) {
          const month = parseInt(time[i].slice(5, 7), 10);
          const tmin  = temperature_2m_min[i] ?? 99;

          // Spring: any frost before Jul 1
          if (month <= 6 && tmin <= FROST_C) {
            springFrostLastIdx = i;
          }
          // Autumn: first frost from Jul 1 onwards
          if (month >= 7 && autumnFrostFirstIdx === -1 && tmin <= FROST_C) {
            autumnFrostFirstIdx = i;
          }
        }

        if (springFrostLastIdx >= 0) lastFrost  = time[springFrostLastIdx].slice(5);  // MM-DD
        if (autumnFrostFirstIdx >= 0) firstFrost = time[autumnFrostFirstIdx].slice(5); // MM-DD
      }
    }
  } catch {
    // Network failure – latitude-based fallbacks remain in effect
  }

  const usda_zone            = getUSDAZone(lat, lng);
  const finnish_zone         = getFinnishZone(lat, lng);
  const growing_season_days  = calculateGrowingSeason(lastFrost, firstFrost);
  const soil_type            = estimateSoilType(lat, lng);
  const soil_ph              = estimateSoilPH(lat, soil_type);
  const sun_angle_summer_deg = Math.round(Math.max(0, Math.min(90, 90 - lat + 23.44)));
  const daylight_hours_solstice = calculateDaylightHours(lat, 172); // ~Jun 21

  // Coarse wind-exposure heuristic from latitude
  const wind_exposure: WindExposure =
    lat > 62 ? 'exposed' : lat > 50 ? 'moderate' : 'sheltered';

  return {
    location: `${lat.toFixed(2)}, ${lng.toFixed(2)}`,
    lat,
    lng,
    usda_zone,
    finnish_zone,
    soil_type,
    soil_ph,
    annual_rainfall_mm: annualRainfall,
    last_frost:  lastFrost,
    first_frost: firstFrost,
    growing_season_days,
    wind_exposure,
    slope_facing: 'south',
    sun_angle_summer_deg,
    daylight_hours_solstice,
    auto_detected: true,
    detection_source: 'gps',
  };
}

// ---------------------------------------------------------------------------
// USDA Hardiness Zone
// ---------------------------------------------------------------------------

/**
 * Estimate USDA hardiness zone from coordinates using a latitude-based
 * temperature model with a coastal-western-Europe correction.
 *
 * Zones are defined by average annual extreme minimum temperature (°C).
 * This function maps the estimated temperature to the closest half-zone.
 */
export function getUSDAZone(lat: number, lng: number): string {
  // Zone name → lower bound (°C) of average annual extreme minimum
  const ZONES: Array<[string, number]> = [
    ['1a', -51], ['1b', -48],
    ['2a', -45], ['2b', -42],
    ['3a', -40], ['3b', -37],
    ['4a', -34], ['4b', -31],
    ['5a', -29], ['5b', -26],
    ['6a', -23], ['6b', -21],
    ['7a', -18], ['7b', -15],
    ['8a', -12], ['8b', -9],
    ['9a', -7],  ['9b', -4],
    ['10a', -1], ['10b', 2],
    ['11a', 4],  ['11b', 7],
    ['12a', 10], ['12b', 13],
  ];

  // Estimate average annual extreme minimum temp (°C) from latitude
  let tMin: number;

  if (lat >= 70)      { tMin = -52; }
  else if (lat >= 60) { tMin = -35 - (lat - 60) * 1.7; }  // 60°N → -35, 70°N → -52
  else if (lat >= 45) { tMin = -18 - (lat - 45) * 1.13; } // 45°N → -18, 60°N → -35
  else if (lat >= 30) { tMin =   0 - (lat - 30) * 1.2;  } // 30°N →   0, 45°N → -18
  else                { tMin =  12; }                      // tropics

  // Coastal western Europe is much milder than the continental model predicts
  const isWesternCoastal =
    (lng >= -10 && lng <= 15  && lat >= 45 && lat <= 63) || // Atlantic Europe
    (lng >= -130 && lng <= -115 && lat >= 40 && lat <= 55); // US / CA Pacific coast
  if (isWesternCoastal) tMin += 10;

  // Find the highest zone whose lower bound does not exceed tMin
  for (let i = ZONES.length - 1; i >= 0; i--) {
    if (tMin >= ZONES[i][1]) return ZONES[i][0];
  }
  return '1a';
}

// ---------------------------------------------------------------------------
// Finnish Hardiness Zone
// ---------------------------------------------------------------------------

/**
 * Estimate Finnish Plant Hardiness Zone (I–VIII) primarily from latitude.
 *
 * Zone I is warmest (southern coast, lat < 60°N).
 * Zone VIII is coldest (northern Lapland, lat ≥ 69°N).
 */
export function getFinnishZone(lat: number, _lng: number): string {
  if (lat < 60.0) return 'I';
  if (lat < 61.5) return 'II';
  if (lat < 63.0) return 'III';
  if (lat < 64.5) return 'IV';
  if (lat < 66.0) return 'V';
  if (lat < 67.5) return 'VI';
  if (lat < 69.0) return 'VII';
  return 'VIII';
}

// ---------------------------------------------------------------------------
// Frost dates
// ---------------------------------------------------------------------------

/**
 * Estimate last-spring-frost and first-autumn-frost dates from latitude.
 *
 * Returns dates in MM-DD format. The model is a linear interpolation across
 * the temperate zone (30°N–70°N):
 *
 *   30°N: last frost ≈ Feb 15 (DOY  46), first frost ≈ Dec 01 (DOY 335)
 *   70°N: last frost ≈ Jun 15 (DOY 166), first frost ≈ Sep 01 (DOY 244)
 */
export function estimateFrostDates(lat: number): {
  lastFrost: string;
  firstFrost: string;
} {
  const clamped = Math.max(30, Math.min(70, lat));
  const t = (clamped - 30) / 40; // 0 → 1

  const lastFrostDoy  = Math.round(46  + t * 120); // DOY 46 → 166
  const firstFrostDoy = Math.round(335 - t * 91);  // DOY 335 → 244

  return {
    lastFrost:  doyToMMDD(lastFrostDoy),
    firstFrost: doyToMMDD(firstFrostDoy),
  };
}

// ---------------------------------------------------------------------------
// Growing season
// ---------------------------------------------------------------------------

/**
 * Calculate growing season length in days from last-frost to first-frost.
 * Both arguments must be in MM-DD format.
 */
export function calculateGrowingSeason(
  lastFrost: string,
  firstFrost: string,
): number {
  const [lm, ld] = lastFrost.split('-').map(Number);
  const [fm, fd] = firstFrost.split('-').map(Number);
  const REF_YEAR = 2024;
  const t0 = new Date(REF_YEAR, lm - 1, ld).getTime();
  const t1 = new Date(REF_YEAR, fm - 1, fd).getTime();
  return Math.max(0, Math.round((t1 - t0) / 86_400_000));
}

// ---------------------------------------------------------------------------
// Soil type estimation
// ---------------------------------------------------------------------------

/**
 * Estimate soil type from geographic coordinates and optional ISO country code.
 *
 * Uses coarse regional heuristics. For production accuracy, query a dataset
 * such as ISRIC SoilGrids or the FAO Harmonized World Soil Database.
 */
export function estimateSoilType(
  lat: number,
  lng: number,
  country?: string,
): SoilType {
  // Finland / Scandinavia
  const isFinland =
    country === 'FI' ||
    country === 'fi' ||
    (lat >= 59 && lat <= 70 && lng >= 20 && lng <= 32);
  if (isFinland) {
    if (lat < 61)  return 'clay_loam';
    if (lat < 64)  return 'clay';
    return 'peat';
  }

  // Arctic / sub-arctic
  if (lat > 65) return 'peat';

  // Atlantic western Europe (UK, Ireland, France, Benelux, Germany west)
  if (lng >= -10 && lng <= 15 && lat >= 47 && lat <= 62) return 'loam';

  // Mediterranean basin
  if (lat >= 35 && lat <= 47 && lng >= -5 && lng <= 40) return 'sandy_loam';

  // Central Europe
  if (lat >= 47 && lat <= 56 && lng >= 10 && lng <= 25) return 'loam';

  // Eastern Europe / Steppe
  if (lat >= 45 && lat <= 56 && lng >= 25 && lng <= 50) return 'clay_loam';

  // North America east of Rockies
  if (lng >= -100 && lng <= -60 && lat >= 35 && lat <= 55) return 'loam';

  // North America west coast
  if (lng >= -130 && lng <= -100 && lat >= 35 && lat <= 55) return 'sandy_loam';

  // Default / tropics / unclassified
  return 'loam';
}

// ---------------------------------------------------------------------------
// Geocoding
// ---------------------------------------------------------------------------

/**
 * Geocode a free-text location query using the Open-Meteo Geocoding API.
 *
 * Returns the top result's coordinates and a human-readable display name.
 * Throws an Error if no results are found or the request fails.
 */
export async function geocodeLocation(
  query: string,
): Promise<{ lat: number; lng: number; name: string }> {
  const url =
    `${OPEN_METEO_GEO}/search` +
    `?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(
      `Geocoding request failed: ${resp.status} ${resp.statusText}`,
    );
  }

  const data = (await resp.json()) as {
    results?: {
      latitude: number;
      longitude: number;
      name: string;
      country?: string;
      admin1?: string;
    }[];
  };

  if (!data.results || data.results.length === 0) {
    throw new Error(`No geocoding results found for "${query}"`);
  }

  const top = data.results[0];
  const parts = [top.name, top.admin1, top.country].filter(Boolean);
  return {
    lat: top.latitude,
    lng: top.longitude,
    name: parts.join(', '),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert a day-of-year (1–365) to a MM-DD string.
 * Uses a fixed non-leap reference year (2023).
 */
function doyToMMDD(doy: number): string {
  // new Date(year, 0, doy) treats doy=1 as Jan 1
  const d = new Date(2023, 0, Math.max(1, Math.min(365, doy)));
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

/**
 * Estimate potential daylight hours for a given latitude and day of year.
 * Uses the Spencer solar declination formula and the sunrise hour-angle equation.
 */
function calculateDaylightHours(lat_deg: number, dayOfYear: number): number {
  const DEG = Math.PI / 180;
  const B   = (2 * Math.PI * (dayOfYear - 1)) / 365;

  // Spencer (1971) declination in radians
  const decl =
    (0.006918 -
      0.399912 * Math.cos(B) +
      0.070257 * Math.sin(B) -
      0.006758 * Math.cos(2 * B) +
      0.000907 * Math.sin(2 * B) -
      0.002697 * Math.cos(3 * B) +
      0.001480 * Math.sin(3 * B)) *
    (180 / Math.PI) *
    DEG;

  const phi      = lat_deg * DEG;
  const cosOmega = -Math.tan(phi) * Math.tan(decl);
  const clamped  = Math.max(-1, Math.min(1, cosOmega));
  const omega    = Math.acos(clamped); // sunrise hour angle (radians)
  const hours    = (2 * omega) / (15 * DEG);
  return Math.round(hours * 10) / 10;
}

/**
 * Estimate soil pH from latitude and soil type.
 * Higher latitudes and peaty soils trend acidic; clay and loam trend neutral.
 */
function estimateSoilPH(lat: number, soilType: SoilType): number {
  const base: Record<SoilType, number> = {
    sand:       6.5,
    sandy_loam: 6.3,
    loam:       6.5,
    clay_loam:  6.2,
    clay:       5.9,
    peat:       5.1,
  };
  let ph = base[soilType] ?? 6.5;
  if (lat > 60) ph -= 0.3; // northern soils trend acidic due to leaching / organic acids
  return Math.round(ph * 10) / 10;
}

/**
 * Very coarse annual rainfall estimate (mm) based solely on latitude.
 * Used as a fallback when the Open-Meteo archive request fails.
 */
function estimateRainfallFromLat(lat: number): number {
  // Rough band model (mm/year):
  // 0–15°N: 1200 (tropics)
  // 15–30°N: 500 (sub-tropical dry)
  // 30–45°N: 700 (Mediterranean / mid-lat)
  // 45–60°N: 750 (temperate)
  // 60–70°N: 650 (boreal / Nordic)
  // 70°N+:   300 (arctic)
  const absLat = Math.abs(lat);
  if (absLat < 15)  return 1200;
  if (absLat < 30)  return 500;
  if (absLat < 45)  return 700;
  if (absLat < 60)  return 750;
  if (absLat < 70)  return 650;
  return 300;
}
