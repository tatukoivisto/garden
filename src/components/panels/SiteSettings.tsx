'use client';

/**
 * SiteSettings – collapsible site/climate settings panel.
 *
 * Exposes every field of ClimateConfig in an editable form:
 *   Location · USDA Zone · Finnish Zone · Soil type · Soil pH
 *   Annual rainfall · Last/First frost dates · Wind exposure
 *   Slope facing · (calculated) Growing season / Sun angle / Daylight hours
 *
 * Auto-detected fields are badged.  A "Re-detect from location" button calls
 * the browser Geolocation API and populates climate estimates.
 *
 * Changes are written to the store via setClimate().
 */

import { useCallback, useEffect, useState } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import type { ClimateConfig, SoilType, WindExposure } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const USDA_ZONES: string[] = [];
for (let n = 1; n <= 13; n++) {
  USDA_ZONES.push(`${n}a`, `${n}b`);
}

const FINNISH_ZONES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

const SOIL_TYPES: { value: SoilType; label: string }[] = [
  { value: 'sand',       label: 'Sand' },
  { value: 'sandy_loam', label: 'Sandy-loam' },
  { value: 'loam',       label: 'Loam' },
  { value: 'clay_loam',  label: 'Clay-loam' },
  { value: 'clay',       label: 'Clay' },
  { value: 'peat',       label: 'Peat' },
];

const WIND_EXPOSURES: { value: WindExposure; label: string }[] = [
  { value: 'sheltered', label: 'Sheltered' },
  { value: 'moderate',  label: 'Moderate' },
  { value: 'exposed',   label: 'Exposed' },
];

const SLOPE_FACINGS = [
  'Flat', 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW',
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive a rough USDA zone from latitude (very simplified).
 * Real implementations query a hardiness-zone API or offline dataset.
 */
function latToUsdaZone(lat: number): string {
  if (lat > 65) return '2a';
  if (lat > 60) return '5b';
  if (lat > 55) return '6b';
  if (lat > 50) return '7b';
  if (lat > 45) return '8b';
  if (lat > 40) return '9b';
  return '10b';
}

/**
 * Derive Finnish growing zone from latitude (coarse mapping).
 */
function latToFinnishZone(lat: number): string {
  if (lat > 68) return 'VIII';
  if (lat > 65) return 'VII';
  if (lat > 63) return 'VI';
  if (lat > 61) return 'V';
  if (lat > 59) return 'IV';
  if (lat > 57) return 'III';
  if (lat > 55) return 'II';
  return 'I';
}

/**
 * Estimate growing season days from last/first frost strings (MM-DD).
 */
function calcGrowingSeason(lastFrost: string, firstFrost: string): number {
  try {
    const [lm, ld] = lastFrost.split('-').map(Number);
    const [fm, fd] = firstFrost.split('-').map(Number);
    const last = new Date(2000, lm - 1, ld);
    const first = new Date(2000, fm - 1, fd);
    // If first frost is "before" last frost in calendar, assume next year
    const diff = first.getTime() - last.getTime();
    const days = Math.round(diff / 86_400_000);
    return days > 0 ? days : days + 365;
  } catch {
    return 140;
  }
}

/**
 * Approximate solar elevation angle at summer solstice solar noon.
 * sun_angle ≈ 90 − |lat − 23.45|
 */
function calcSunAngle(lat: number): number {
  return Math.round(90 - Math.abs(lat - 23.45));
}

/**
 * Approximate daylight hours at summer solstice using sunrise equation.
 */
function calcDaylightHours(lat: number): number {
  const decl = 23.45 * (Math.PI / 180);
  const phi = lat * (Math.PI / 180);
  const cosOmega = -Math.tan(phi) * Math.tan(decl);
  const clamped = Math.max(-1, Math.min(1, cosOmega));
  const omega = Math.acos(clamped);
  return Math.round((2 * omega * (180 / Math.PI)) / 15 * 10) / 10;
}

/**
 * Coarse annual rainfall estimate from latitude (mm).
 * Very rough – just for default population on geolocation detect.
 */
function latToRainfall(lat: number): number {
  if (lat > 65) return 400;
  if (lat > 58) return 650;
  if (lat > 50) return 750;
  if (lat > 42) return 700;
  if (lat > 35) return 500;
  return 600;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Small badge shown when a field value was auto-detected. */
function AutoBadge({ source }: { source: ClimateConfig['detection_source'] }) {
  const labels: Record<ClimateConfig['detection_source'], string> = {
    gps:        'GPS',
    ip:         'IP',
    manual:     'manual',
    photo_exif: 'EXIF',
  };
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-garden-sprout/25 text-garden-leaf-dark leading-none">
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
        <circle cx="4" cy="4" r="3" stroke="currentColor" strokeWidth="1.2" />
        <path d="M2.5 4l1 1 2-2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      auto · {labels[source]}
    </span>
  );
}

/** Collapsible section wrapper. */
function SettingsSection({
  title,
  icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="
          w-full flex items-center gap-2 px-4 py-3
          bg-gray-50 hover:bg-gray-100 text-left transition-colors duration-100
        "
        aria-expanded={open}
      >
        <span className="text-base" aria-hidden>{icon}</span>
        <span className="flex-1 text-sm font-semibold text-gray-800">{title}</span>
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden
          className={['text-gray-400 transition-transform duration-200', open ? 'rotate-0' : '-rotate-90'].join(' ')}
        >
          <polyline points="2,4 7,10 12,4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <div className="px-4 py-4 space-y-4">{children}</div>}
    </div>
  );
}

/** A single labelled field row. */
function Field({
  label,
  auto,
  source,
  children,
}: {
  label: string;
  auto?: boolean;
  source?: ClimateConfig['detection_source'];
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <label className="block text-xs font-medium text-gray-600">{label}</label>
        {auto && source && <AutoBadge source={source} />}
      </div>
      {children}
    </div>
  );
}

const INPUT_CLS = `
  w-full h-9 rounded-lg border border-gray-200 px-3 text-sm text-gray-800
  bg-white focus:outline-none focus:ring-2 focus:ring-garden-leaf focus:border-transparent
  placeholder-gray-300 transition-colors duration-100
`;

const SELECT_CLS = `
  w-full h-9 rounded-lg border border-gray-200 pl-3 pr-8 text-sm text-gray-800
  bg-white focus:outline-none focus:ring-2 focus:ring-garden-leaf focus:border-transparent
  appearance-none bg-no-repeat cursor-pointer transition-colors duration-100
`;

const CHEVRON_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpolyline points='2,4 6,8 10,4' stroke='%236b7280' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;

const READONLY_CLS = `
  w-full h-9 rounded-lg border border-gray-100 px-3 text-sm text-gray-600
  bg-gray-50/80 cursor-default select-all
`;

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function SiteSettings() {
  const garden  = useGardenStore((s) => s.garden);
  const setClimate = useGardenStore((s) => s.setClimate);

  // Local editing copy so changes are batched before writing to store
  const [cfg, setCfg] = useState<ClimateConfig | null>(null);

  // Detection state
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);

  // Sync local copy when garden changes (e.g. undo/redo or initial load)
  useEffect(() => {
    if (garden?.climate) {
      setCfg({ ...garden.climate });
    }
  }, [garden?.climate]);

  // ── Update helper ──────────────────────────────────────────────────────────

  const update = useCallback(
    <K extends keyof ClimateConfig>(key: K, value: ClimateConfig[K]) => {
      setCfg((prev) => {
        if (!prev) return prev;
        const next: ClimateConfig = { ...prev, [key]: value, detection_source: 'manual' };

        // Auto-recalculate derived fields when inputs change
        if (key === 'last_frost' || key === 'first_frost') {
          next.growing_season_days = calcGrowingSeason(
            key === 'last_frost' ? String(value) : prev.last_frost,
            key === 'first_frost' ? String(value) : prev.first_frost,
          );
        }
        if (key === 'lat') {
          const lat = Number(value);
          next.sun_angle_summer_deg  = calcSunAngle(lat);
          next.daylight_hours_solstice = calcDaylightHours(lat);
        }
        return next;
      });
    },
    [],
  );

  // Persist to store when local state changes
  useEffect(() => {
    if (!cfg) return;
    setClimate(cfg);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);

  // ── Geolocation detect ────────────────────────────────────────────────────

  const detectFromLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setDetectError('Geolocation not supported by this browser.');
      return;
    }
    setDetecting(true);
    setDetectError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCfg((prev) => {
          if (!prev) return prev;
          const lastFrost = prev.last_frost;
          const firstFrost = prev.first_frost;
          return {
            ...prev,
            lat:  latitude,
            lng:  longitude,
            usda_zone: latToUsdaZone(latitude),
            finnish_zone: latToFinnishZone(latitude),
            annual_rainfall_mm: latToRainfall(latitude),
            growing_season_days: calcGrowingSeason(lastFrost, firstFrost),
            sun_angle_summer_deg: calcSunAngle(latitude),
            daylight_hours_solstice: calcDaylightHours(latitude),
            auto_detected: true,
            detection_source: 'gps',
          };
        });
        setDetecting(false);
      },
      (err) => {
        setDetectError(
          err.code === 1
            ? 'Location access denied. Please allow location in browser settings.'
            : 'Could not determine location. Try again or enter manually.',
        );
        setDetecting(false);
      },
      { timeout: 10_000 },
    );
  }, []);

  // ── Guard ─────────────────────────────────────────────────────────────────

  if (!garden || !cfg) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
        <span className="text-4xl" aria-hidden>🌍</span>
        <p className="text-sm text-gray-500">No garden loaded.</p>
        <p className="text-xs text-gray-400">Create or open a garden to configure site settings.</p>
      </div>
    );
  }

  const isAuto = cfg.auto_detected;
  const src    = cfg.detection_source;

  // Growing season (read-only, derived)
  const growingDays = calcGrowingSeason(cfg.last_frost, cfg.first_frost);

  return (
    <div className="flex flex-col h-full">
      {/* ── Panel header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Site & Climate Settings</h2>
          <p className="text-xs text-gray-500 mt-0.5">{cfg.location || 'Unknown location'}</p>
        </div>

        {/* Detection source badge */}
        <span className={[
          'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide',
          isAuto
            ? 'bg-garden-sprout/20 text-garden-leaf-dark'
            : 'bg-gray-100 text-gray-500',
        ].join(' ')}>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
            <circle cx="4" cy="4" r="3" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          {isAuto ? src : 'manual'}
        </span>
      </div>

      {/* ── Scrollable body ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* ── Re-detect button ── */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={detectFromLocation}
            disabled={detecting}
            className="
              w-full inline-flex items-center justify-center gap-2 h-10 rounded-xl
              border-2 border-dashed border-garden-leaf/40
              text-sm font-medium text-garden-leaf hover:border-garden-leaf hover:bg-garden-leaf/5
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garden-leaf
              disabled:opacity-50 disabled:cursor-wait
              transition-colors duration-150
            "
          >
            {detecting ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" strokeDasharray="8 8" />
                </svg>
                Detecting location…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
                  <circle cx="7" cy="7" r="1.5" fill="currentColor" />
                  <line x1="7" y1="1" x2="7" y2="3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <line x1="7" y1="11" x2="7" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <line x1="1" y1="7" x2="3" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <line x1="11" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                Re-detect from browser location
              </>
            )}
          </button>

          {detectError && (
            <p className="text-xs text-red-500 px-1">{detectError}</p>
          )}
        </div>

        {/* ── Location ────────────────────────────────────────────────── */}
        <SettingsSection title="Location" icon="📍">
          <Field label="Location name" auto={isAuto} source={src}>
            <input
              type="text"
              value={cfg.location}
              onChange={(e) => update('location', e.target.value)}
              placeholder="e.g. Helsinki, Finland"
              className={INPUT_CLS}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude">
              <input
                type="number"
                value={cfg.lat}
                step="0.01"
                min="-90"
                max="90"
                onChange={(e) => update('lat', parseFloat(e.target.value) || 0)}
                className={INPUT_CLS}
              />
            </Field>
            <Field label="Longitude">
              <input
                type="number"
                value={cfg.lng}
                step="0.01"
                min="-180"
                max="180"
                onChange={(e) => update('lng', parseFloat(e.target.value) || 0)}
                className={INPUT_CLS}
              />
            </Field>
          </div>
        </SettingsSection>

        {/* ── Hardiness zones ─────────────────────────────────────────── */}
        <SettingsSection title="Hardiness Zones" icon="🌡️">
          <div className="grid grid-cols-2 gap-3">
            <Field label="USDA Zone" auto={isAuto} source={src}>
              <select
                value={cfg.usda_zone}
                onChange={(e) => update('usda_zone', e.target.value)}
                className={SELECT_CLS}
                style={{
                  backgroundImage: CHEVRON_BG,
                  backgroundPosition: 'right 8px center',
                  backgroundSize: '12px',
                }}
              >
                {USDA_ZONES.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </Field>
            <Field label="Finnish Zone" auto={isAuto} source={src}>
              <select
                value={cfg.finnish_zone}
                onChange={(e) => update('finnish_zone', e.target.value)}
                className={SELECT_CLS}
                style={{
                  backgroundImage: CHEVRON_BG,
                  backgroundPosition: 'right 8px center',
                  backgroundSize: '12px',
                }}
              >
                {FINNISH_ZONES.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </Field>
          </div>
        </SettingsSection>

        {/* ── Soil ────────────────────────────────────────────────────── */}
        <SettingsSection title="Soil" icon="🌍">
          <Field label="Soil type">
            <select
              value={cfg.soil_type}
              onChange={(e) => update('soil_type', e.target.value as SoilType)}
              className={SELECT_CLS}
              style={{
                backgroundImage: CHEVRON_BG,
                backgroundPosition: 'right 8px center',
                backgroundSize: '12px',
              }}
            >
              {SOIL_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>

          <Field label={`Soil pH — ${cfg.soil_ph.toFixed(1)}`}>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={4.0}
                max={8.0}
                step={0.1}
                value={cfg.soil_ph}
                onChange={(e) => update('soil_ph', parseFloat(e.target.value))}
                className="flex-1 accent-garden-leaf cursor-pointer"
              />
              <span className={[
                'w-12 text-center text-sm font-semibold rounded-lg py-1',
                cfg.soil_ph < 6.0 ? 'bg-amber-100 text-amber-700' :
                cfg.soil_ph > 7.2 ? 'bg-blue-100 text-blue-700' :
                'bg-garden-sprout/20 text-garden-leaf-dark',
              ].join(' ')}>
                {cfg.soil_ph.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 px-0.5 mt-0.5">
              <span>4.0 acid</span>
              <span>7.0 neutral</span>
              <span>8.0 alkaline</span>
            </div>
          </Field>
        </SettingsSection>

        {/* ── Climate ─────────────────────────────────────────────────── */}
        <SettingsSection title="Climate" icon="🌧️">
          <Field label={`Annual rainfall — ${cfg.annual_rainfall_mm} mm`} auto={isAuto} source={src}>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={200}
                max={2000}
                step={10}
                value={cfg.annual_rainfall_mm}
                onChange={(e) => update('annual_rainfall_mm', parseInt(e.target.value))}
                className="flex-1 accent-garden-leaf cursor-pointer"
              />
              <span className="w-16 text-center text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg py-1">
                {cfg.annual_rainfall_mm} mm
              </span>
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 px-0.5 mt-0.5">
              <span>200 mm dry</span>
              <span>2000 mm wet</span>
            </div>
          </Field>
        </SettingsSection>

        {/* ── Frost dates ─────────────────────────────────────────────── */}
        <SettingsSection title="Frost Dates" icon="❄️">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Last frost (spring)" auto={isAuto} source={src}>
              <input
                type="text"
                value={cfg.last_frost}
                onChange={(e) => update('last_frost', e.target.value)}
                placeholder="MM-DD"
                maxLength={5}
                pattern="\d{2}-\d{2}"
                className={INPUT_CLS}
              />
            </Field>
            <Field label="First frost (autumn)" auto={isAuto} source={src}>
              <input
                type="text"
                value={cfg.first_frost}
                onChange={(e) => update('first_frost', e.target.value)}
                placeholder="MM-DD"
                maxLength={5}
                pattern="\d{2}-\d{2}"
                className={INPUT_CLS}
              />
            </Field>
          </div>

          {/* Growing season – calculated */}
          <Field label="Growing season (calculated)">
            <div className={READONLY_CLS + ' flex items-center'}>
              <span className="text-garden-leaf-dark font-semibold mr-1">{growingDays}</span>
              <span className="text-gray-500">days</span>
            </div>
          </Field>
        </SettingsSection>

        {/* ── Exposure ────────────────────────────────────────────────── */}
        <SettingsSection title="Exposure" icon="🌬️" defaultOpen={false}>
          <Field label="Wind exposure">
            <div className="flex gap-2">
              {WIND_EXPOSURES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => update('wind_exposure', value)}
                  className={[
                    'flex-1 py-2 rounded-lg text-xs font-medium border transition-colors duration-100',
                    cfg.wind_exposure === value
                      ? 'bg-garden-leaf text-white border-garden-leaf'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-garden-leaf/50 hover:text-garden-leaf',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Slope facing">
            <div className="grid grid-cols-3 gap-1.5">
              {SLOPE_FACINGS.map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => update('slope_facing', dir.toLowerCase())}
                  className={[
                    'py-1.5 rounded-lg text-xs font-medium border transition-colors duration-100',
                    cfg.slope_facing === dir.toLowerCase() || cfg.slope_facing === dir
                      ? 'bg-garden-leaf text-white border-garden-leaf'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-garden-leaf/40 hover:text-garden-leaf',
                  ].join(' ')}
                >
                  {dir}
                </button>
              ))}
            </div>
          </Field>
        </SettingsSection>

        {/* ── Solar ───────────────────────────────────────────────────── */}
        <SettingsSection title="Solar (calculated)" icon="☀️" defaultOpen={false}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sun angle at solstice">
              <div className={READONLY_CLS + ' flex items-center gap-1'}>
                <span className="text-garden-sun font-semibold">{cfg.sun_angle_summer_deg}°</span>
              </div>
            </Field>
            <Field label="Daylight at solstice">
              <div className={READONLY_CLS + ' flex items-center gap-1'}>
                <span className="text-garden-sun font-semibold">{cfg.daylight_hours_solstice}</span>
                <span className="text-gray-500 text-xs">hrs</span>
              </div>
            </Field>
          </div>
          <p className="text-[11px] text-gray-400">
            Calculated from latitude {cfg.lat.toFixed(2)}°. Values are for summer
            solstice at solar noon on a flat, unobstructed site.
          </p>
        </SettingsSection>

      </div>
    </div>
  );
}
