'use client';

/**
 * Toolbar – the primary action bar rendered above the garden canvas.
 *
 * Groups (left → right):
 *   1. Undo / Redo  +  Zoom controls
 *   2. Bed-system selector  +  Season selector
 *   3. Toggle buttons  (Grid, Companions, Sun Heatmap, Snap)
 *   4. Export dropdown  +  Share  +  Settings
 *
 * On narrow viewports overflow items collapse into a "More ▾" dropdown.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { useGardenStore } from '@/store/gardenStore';
import type { BedSystem } from '@/types';

// ---------------------------------------------------------------------------
// Inline SVG icon primitives
// ---------------------------------------------------------------------------

function IconUndo() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8a5 5 0 1 0 1.2-3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <polyline points="1,4 3,8 7,6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function IconRedo() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M13 8a5 5 0 1 1-1.2-3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <polyline points="15,4 13,8 9,6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function IconZoomOut() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="5" y1="7" x2="9" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconZoomIn() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="5" y1="7" x2="9" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="7" y1="5" x2="7" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconFit() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <polyline points="5,2 2,2 2,5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="11,2 14,2 14,5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="5,14 2,14 2,11" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="11,14 14,14 14,11" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9.5" y="1.5" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1.5" y="9.5" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8" y1="1" x2="8" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="13" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="1" y1="8" x2="3" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="13" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="3.05" y1="3.05" x2="4.46" y2="4.46" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="11.54" y1="11.54" x2="12.95" y2="12.95" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12.95" y1="3.05" x2="11.54" y2="4.46" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="4.46" y1="11.54" x2="3.05" y2="12.95" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconCompanion() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="5.5" cy="9.5" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10.5" cy="9.5" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4 C8 2 10 1 10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function IconSnap() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="2" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="9" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 4.5 H8.5 A1 1 0 0 1 9.5 5.5 V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <circle cx="9" cy="9" r="1" fill="currentColor" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 2 v8 m-3-3 3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 11.5 v1.5 a1 1 0 0 0 1 1 h9 a1 1 0 0 0 1-1 v-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconShare() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="12.5" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="3.5" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12.5" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <line x1="5" y1="7.2" x2="11" y2="4.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="5" y1="8.8" x2="11" y2="11.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 1.5 v1.3 M8 13.2 v1.3 M1.5 8 h1.3 M13.2 8 h1.3
           M3.4 3.4 l0.9 0.9 M11.7 11.7 l0.9 0.9
           M12.6 3.4 l-0.9 0.9 M4.3 11.7 l-0.9 0.9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <polyline points="2,4 6,8 10,4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface IconButtonProps {
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  className?: string;
}

function IconButton({ onClick, active, disabled, title, children, className = '' }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={[
        'inline-flex items-center justify-center w-8 h-8 rounded-md text-sm transition-colors duration-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garden-leaf focus-visible:ring-offset-1',
        disabled
          ? 'opacity-30 cursor-not-allowed text-gray-400'
          : active
          ? 'bg-garden-leaf text-white shadow-inner'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Bed system + season selectors data
// ---------------------------------------------------------------------------

const BED_SYSTEM_OPTIONS: { value: BedSystem; label: string }[] = [
  { value: 'market_30in',      label: 'Market Garden 30"' },
  { value: 'biointensive_4ft', label: 'Bio-intensive 4\''},
  { value: 'sfg_1ft',          label: 'SFG 1\'' },
  { value: 'metric',           label: 'Metric' },
  { value: 'custom',           label: 'Custom' },
];

const SEASON_OPTIONS = [
  { value: 'spring',    label: 'Spring' },
  { value: 'full_year', label: 'Full Year' },
  { value: 'autumn',    label: 'Autumn' },
] as const;

type SeasonValue = 'spring' | 'full_year' | 'autumn';

// ---------------------------------------------------------------------------
// Export formats
// ---------------------------------------------------------------------------

const EXPORT_OPTIONS = [
  { value: 'png',         label: 'PNG Image' },
  { value: 'svg',         label: 'SVG Vector' },
  { value: 'pdf',         label: 'PDF Document' },
  { value: 'csv',         label: 'CSV Crop List' },
  { value: 'json',        label: 'JSON Data' },
  { value: 'html_report', label: 'HTML Report' },
] as const;

type ExportFormat = typeof EXPORT_OPTIONS[number]['value'];

// ---------------------------------------------------------------------------
// Dropdown component
// ---------------------------------------------------------------------------

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
}

function Dropdown({ trigger, children, align = 'left' }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: globalThis.MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && (
        <div
          className={[
            'absolute z-50 top-full mt-1 min-w-[160px] bg-white rounded-lg shadow-lg',
            'border border-gray-200 py-1 text-sm',
            align === 'right' ? 'right-0' : 'left-0',
          ].join(' ')}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps {
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

function DropdownItem({ onClick, children, className = '' }: DropdownItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full text-left px-3 py-1.5 text-gray-700 hover:bg-gray-50 hover:text-gray-900',
        'transition-colors duration-100 focus-visible:outline-none focus-visible:bg-gray-100',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Divider
// ---------------------------------------------------------------------------

function Divider() {
  return <div className="w-px h-6 bg-gray-200 mx-1 self-center" aria-hidden />;
}

// ---------------------------------------------------------------------------
// Toolbar component
// ---------------------------------------------------------------------------

export interface ToolbarProps {
  /** Called when user picks an export format */
  onExport?: (format: ExportFormat) => void;
  /** Called when user clicks Share */
  onShare?: () => void;
  /** Called when user clicks Settings */
  onSettings?: () => void;
  /** Called when fit-to-screen is triggered */
  onFitToScreen?: () => void;
  /** Called when a season selection changes */
  onSeasonChange?: (year: number, season: SeasonValue) => void;
}

export default function Toolbar({
  onExport,
  onShare,
  onSettings,
  onFitToScreen,
  onSeasonChange,
}: ToolbarProps) {
  const {
    garden,
    canvas,
    undoStack,
    redoStack,
    undo,
    redo,
    setZoom,
    toggleGrid,
    toggleCompanions,
    toggleSunHeatmap,
    toggleSnap,
    setBedSystem,
    setActiveSeason,
  } = useGardenStore();

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts – Cmd/Ctrl+Z  /  Cmd/Ctrl+Shift+Z
  // ---------------------------------------------------------------------------
  useEffect(() => {
    function handleKey(e: globalThis.KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [undo, redo]);

  // ---------------------------------------------------------------------------
  // Zoom helpers
  // ---------------------------------------------------------------------------
  const zoomPct = Math.round((canvas.zoom ?? 1) * 100);

  function zoomIn() {
    setZoom(Math.min((canvas.zoom ?? 1) + 0.1, 10));
  }
  function zoomOut() {
    setZoom(Math.max((canvas.zoom ?? 1) - 0.1, 0.1));
  }

  // ---------------------------------------------------------------------------
  // Bed system
  // ---------------------------------------------------------------------------
  const currentBedSystem = garden?.bed_system ?? 'metric';

  // ---------------------------------------------------------------------------
  // Season
  // ---------------------------------------------------------------------------
  const activeSeason = garden?.seasons.find((s) => s.id === garden.active_season);
  const seasonYear = activeSeason?.year ?? new Date().getFullYear();
  const seasonSeason: SeasonValue = (activeSeason?.season ?? 'full_year') as SeasonValue;

  function handleSeasonSelect(year: number, season: SeasonValue) {
    // Find matching season in garden
    const match = garden?.seasons.find(
      (s) => s.year === year && s.season === season,
    );
    if (match) {
      setActiveSeason(match.id);
    }
    onSeasonChange?.(year, season);
  }

  // Year options: current year ± 1
  const thisYear = new Date().getFullYear();
  const yearOptions = [thisYear - 1, thisYear, thisYear + 1];

  // ---------------------------------------------------------------------------
  // "More" dropdown state for overflow items
  // ---------------------------------------------------------------------------
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    function handleClick(e: globalThis.MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [moreOpen]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <header
      role="toolbar"
      aria-label="Canvas toolbar"
      className="
        flex items-center gap-1 px-3 h-12
        bg-white/95 backdrop-blur-sm
        border-b border-gray-200
        shadow-sm
        select-none
      "
    >
      {/* ── Group 1: Undo / Redo + Zoom ─────────────────────────────── */}
      <div className="flex items-center gap-0.5">
        <IconButton
          onClick={undo}
          disabled={undoStack.length === 0}
          title="Undo (Cmd+Z)"
        >
          <IconUndo />
        </IconButton>
        <IconButton
          onClick={redo}
          disabled={redoStack.length === 0}
          title="Redo (Cmd+Shift+Z)"
        >
          <IconRedo />
        </IconButton>
      </div>

      <Divider />

      <div className="flex items-center gap-0.5">
        <IconButton onClick={zoomOut} title="Zoom out">
          <IconZoomOut />
        </IconButton>

        {/* Zoom level display – click to reset to 100 % */}
        <button
          type="button"
          onClick={() => setZoom(1)}
          title="Reset zoom to 100%"
          className="
            min-w-[44px] h-8 px-1 rounded-md text-xs font-mono font-medium
            text-gray-600 hover:bg-gray-100 hover:text-gray-900
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garden-leaf
            transition-colors duration-100
          "
        >
          {zoomPct}%
        </button>

        <IconButton onClick={zoomIn} title="Zoom in">
          <IconZoomIn />
        </IconButton>

        <IconButton onClick={onFitToScreen} title="Fit to screen">
          <IconFit />
        </IconButton>
      </div>

      <Divider />

      {/* ── Group 2: Bed system + Season selectors ───────────────────── */}
      <div className="hidden sm:flex items-center gap-1.5">
        {/* Bed system */}
        <select
          value={currentBedSystem}
          onChange={(e) => setBedSystem(e.target.value as BedSystem)}
          title="Bed system"
          aria-label="Bed system"
          className="
            h-8 pl-2 pr-6 rounded-md text-xs font-medium text-gray-700
            border border-gray-200 bg-white
            hover:border-gray-300
            focus:outline-none focus:ring-2 focus:ring-garden-leaf
            appearance-none bg-no-repeat
            cursor-pointer transition-colors duration-100
          "
          style={{
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpolyline points=\'2,4 6,8 10,4\' stroke=\'%236b7280\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E")',
            backgroundPosition: 'right 6px center',
            backgroundSize: '12px',
          }}
        >
          {BED_SYSTEM_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Season: year + season name */}
        <div className="flex items-center gap-1">
          <select
            value={seasonYear}
            onChange={(e) => handleSeasonSelect(Number(e.target.value), seasonSeason)}
            aria-label="Season year"
            className="
              h-8 pl-2 pr-5 rounded-md text-xs font-medium text-gray-700
              border border-gray-200 bg-white
              hover:border-gray-300
              focus:outline-none focus:ring-2 focus:ring-garden-leaf
              appearance-none bg-no-repeat cursor-pointer
            "
            style={{
              backgroundImage:
                'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpolyline points=\'2,4 6,8 10,4\' stroke=\'%236b7280\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E")',
              backgroundPosition: 'right 4px center',
              backgroundSize: '10px',
            }}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <select
            value={seasonSeason}
            onChange={(e) => handleSeasonSelect(seasonYear, e.target.value as SeasonValue)}
            aria-label="Season"
            className="
              h-8 pl-2 pr-6 rounded-md text-xs font-medium text-gray-700
              border border-gray-200 bg-white
              hover:border-gray-300
              focus:outline-none focus:ring-2 focus:ring-garden-leaf
              appearance-none bg-no-repeat cursor-pointer
            "
            style={{
              backgroundImage:
                'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpolyline points=\'2,4 6,8 10,4\' stroke=\'%236b7280\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E")',
              backgroundPosition: 'right 6px center',
              backgroundSize: '10px',
            }}
          >
            {SEASON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Spacer – pushes right group to the end */}
      <div className="flex-1" />

      {/* ── Group 3: Toggle buttons ──────────────────────────────────── */}
      <div className="hidden md:flex items-center gap-0.5">
        <IconButton
          onClick={toggleGrid}
          active={canvas.showGrid}
          title="Toggle grid"
        >
          <IconGrid />
        </IconButton>
        <IconButton
          onClick={toggleCompanions}
          active={canvas.showCompanions}
          title="Show companion planting"
        >
          <IconCompanion />
        </IconButton>
        <IconButton
          onClick={toggleSunHeatmap}
          active={canvas.showSunHeatmap}
          title="Toggle sun heatmap"
        >
          <IconSun />
        </IconButton>
        <IconButton
          onClick={toggleSnap}
          active={canvas.snapToGrid}
          title="Snap to grid"
        >
          <IconSnap />
        </IconButton>
      </div>

      <Divider />

      {/* ── Group 4: Export + Share + Settings ──────────────────────── */}
      <div className="flex items-center gap-0.5">
        {/* Export dropdown */}
        <Dropdown
          align="right"
          trigger={
            <button
              type="button"
              title="Export"
              aria-label="Export"
              className="
                inline-flex items-center gap-1 h-8 px-2 rounded-md text-xs font-medium
                text-gray-600 border border-gray-200
                hover:bg-gray-50 hover:border-gray-300 hover:text-gray-900
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garden-leaf
                transition-colors duration-100 cursor-pointer
              "
            >
              <IconDownload />
              <span className="hidden sm:inline">Export</span>
              <IconChevronDown />
            </button>
          }
        >
          {EXPORT_OPTIONS.map((opt) => (
            <DropdownItem
              key={opt.value}
              onClick={() => onExport?.(opt.value)}
            >
              {opt.label}
            </DropdownItem>
          ))}
        </Dropdown>

        {/* Share */}
        <IconButton onClick={onShare} title="Share">
          <IconShare />
        </IconButton>

        {/* Settings */}
        <IconButton onClick={onSettings} title="Settings">
          <IconSettings />
        </IconButton>
      </div>

      {/* ── "More" overflow (visible on small screens) ──────────────── */}
      <div ref={moreRef} className="relative md:hidden">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          title="More options"
          className="
            inline-flex items-center gap-1 h-8 px-2 rounded-md text-xs font-medium
            text-gray-600 hover:bg-gray-100
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garden-leaf
          "
        >
          More
          <IconChevronDown />
        </button>

        {moreOpen && (
          <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 text-sm">
            {/* Bed system (shown when sm selector hidden) */}
            <div className="sm:hidden px-3 py-2 border-b border-gray-100">
              <p className="text-xs text-gray-500 mb-1 font-medium">Bed System</p>
              <select
                value={currentBedSystem}
                onChange={(e) => {
                  setBedSystem(e.target.value as BedSystem);
                  setMoreOpen(false);
                }}
                className="w-full text-xs border border-gray-200 rounded px-1.5 py-1"
              >
                {BED_SYSTEM_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Toggles */}
            <div className="px-1 py-1 border-b border-gray-100">
              {[
                { label: 'Grid', active: canvas.showGrid,       action: toggleGrid,        icon: <IconGrid /> },
                { label: 'Companions', active: canvas.showCompanions, action: toggleCompanions, icon: <IconCompanion /> },
                { label: 'Sun Heatmap', active: canvas.showSunHeatmap, action: toggleSunHeatmap, icon: <IconSun /> },
                { label: 'Snap to Grid', active: canvas.snapToGrid,  action: toggleSnap,       icon: <IconSnap /> },
              ].map(({ label, active, action, icon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => { action(); setMoreOpen(false); }}
                  className={[
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-gray-700',
                    'hover:bg-gray-50 transition-colors',
                    active ? 'text-garden-leaf font-medium' : '',
                  ].join(' ')}
                >
                  {icon}
                  {label}
                  {active && (
                    <span className="ml-auto text-xs text-garden-leaf">On</span>
                  )}
                </button>
              ))}
            </div>

            {/* Export items */}
            <div className="px-1 py-1">
              <p className="px-2 py-1 text-xs text-gray-400 font-medium uppercase tracking-wide">Export</p>
              {EXPORT_OPTIONS.map((opt) => (
                <DropdownItem
                  key={opt.value}
                  onClick={() => { onExport?.(opt.value); setMoreOpen(false); }}
                >
                  {opt.label}
                </DropdownItem>
              ))}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
