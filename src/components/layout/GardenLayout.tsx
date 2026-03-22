'use client';

/**
 * GardenLayout.tsx — Primary application shell rendered when a garden is loaded.
 *
 * Desktop layout (lg+):
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ Toolbar (full width, h-12)                                           │
 * ├──────────────┬─────────────────────────────┬────────────────────────┤
 * │ ZonePalette  │                             │ AIChat                 │
 * │ (w-60, left) │   GardenCanvas              │ ─────────────          │
 * │ collapsible  │   (flex-1, fills space)     │ ZoneDetail (below)     │
 * │              │                             │ (w-90, right)          │
 * ├──────────────┴─────────────────────────────┴────────────────────────┤
 * │ SeasonalTimeline (collapsible, h-[200px])                           │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Mobile layout (<lg):
 * - Bottom nav bar: Chat | Map | Status | More
 * - Active tab dictates which panel fills the screen
 * - Canvas is always rendered (behind panels) for performance
 *
 * Modal overlays (rendered above everything):
 * - Companion Matrix      (showMatrix store flag)
 * - Shopping List         (local state toggle)
 * - Digital Twin Panel    (local state toggle)
 * - Keyboard shortcuts    (triggered by ? key)
 */

import React, { useCallback, useState } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import { useKeyboardShortcuts, KEYBOARD_SHORTCUTS } from '@/hooks/useKeyboardShortcuts';
import Toolbar from '@/components/ui/Toolbar';
import ZonePalette from '@/components/panels/ZonePalette';
import AIChat from '@/components/chat/AIChat';
import ShoppingList from '@/components/panels/ShoppingList';
import TwinPanel from '@/components/panels/TwinPanel';

// ---------------------------------------------------------------------------
// Inline icon primitives (self-contained, no external dependency)
// ---------------------------------------------------------------------------

function IconChat() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M2 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6l-4 3V4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMap() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <polygon
        points="1,4 7,2 13,4 19,2 19,16 13,18 7,16 1,18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />
      <line x1="7" y1="2" x2="7" y2="16" stroke="currentColor" strokeWidth="1.3" />
      <line x1="13" y1="4" x2="13" y2="18" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function IconStatus() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="2" y="12" width="3" height="6" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="7" y="8" width="3" height="10" rx="1" fill="currentColor" opacity="0.8" />
      <rect x="12" y="4" width="3" height="14" rx="1" fill="currentColor" />
      <rect x="17" y="1" width="1.5" height="17" rx="0.75" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="4"  cy="10" r="1.5" fill="currentColor" />
      <circle cx="10" cy="10" r="1.5" fill="currentColor" />
      <circle cx="16" cy="10" r="1.5" fill="currentColor" />
    </svg>
  );
}

function IconPalette() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconTimeline() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="4"  cy="8" r="2" stroke="currentColor" strokeWidth="1.4" fill="white" />
      <circle cx="8"  cy="8" r="2" stroke="currentColor" strokeWidth="1.4" fill="white" />
      <circle cx="12" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" fill="white" />
    </svg>
  );
}

function IconShopping() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 3h10l-1.5 7H4.5L3 3Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="5.5" cy="13" r="1" fill="currentColor" />
      <circle cx="11"  cy="13" r="1" fill="currentColor" />
      <path d="M1 1h2l0.5 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconTwin() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="6"  cy="8" r="4" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10" cy="8" r="4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <polyline points="10,3 5,8 10,13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <polyline points="6,3 11,8 6,13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <polyline points="3,6 8,11 13,6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronUp() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <polyline points="3,10 8,5 13,10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconKeyboard() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1" y="4" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <line x1="4" y1="7" x2="4" y2="7.01"   stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="7" y1="7" x2="7" y2="7.01"   stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="10" y1="7" x2="10" y2="7.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="13" y1="7" x2="13" y2="7.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="4" y1="10" x2="12" y2="10"   stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Canvas placeholder (no canvas component built yet — renders a stub)
// ---------------------------------------------------------------------------

function GardenCanvasPlaceholder({ className = '' }: { className?: string }) {
  const garden = useGardenStore((s) => s.garden);
  const canvas = useGardenStore((s) => s.canvas);

  return (
    <div
      className={[
        'relative flex-1 overflow-hidden bg-garden-cream',
        className,
      ].join(' ')}
      style={{
        backgroundImage: canvas.showGrid
          ? `
              linear-gradient(to right, rgba(74,124,89,0.12) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(74,124,89,0.12) 1px, transparent 1px)
            `
          : undefined,
        backgroundSize: canvas.showGrid ? '40px 40px' : undefined,
      }}
    >
      {/* Centre label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none select-none">
        <div className="w-20 h-20 rounded-2xl bg-garden-leaf/10 flex items-center justify-center">
          <span className="text-4xl" role="img" aria-label="Seedling">🌱</span>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-garden-leaf-dark">
            {garden?.name ?? 'My Garden'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {garden ? `${garden.width_m} × ${garden.depth_m} m` : ''}
            {garden && garden.zones.length > 0
              ? ` · ${garden.zones.length} zone${garden.zones.length !== 1 ? 's' : ''}`
              : ' · Drag zones from the palette to get started'}
          </p>
        </div>
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-3 left-3 px-2 py-1 rounded-md bg-white/80 border border-gray-200 text-xs font-mono text-gray-600 shadow-sm">
        {Math.round((canvas.zoom ?? 1) * 100)}%
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seasonal Timeline placeholder
// ---------------------------------------------------------------------------

function SeasonalTimeline() {
  const garden = useGardenStore((s) => s.garden);
  const activeSeason = garden?.seasons.find((s) => s.id === garden.active_season);

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const today = new Date();
  const currentMonth = today.getMonth(); // 0-based

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <IconTimeline />
          <span className="text-xs font-semibold text-gray-700">Seasonal Timeline</span>
          {activeSeason && (
            <span className="px-1.5 py-0.5 rounded-full bg-garden-leaf/10 text-[10px] font-medium text-garden-leaf-dark">
              {activeSeason.year} · {activeSeason.season.replace('_', ' ')}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">
          {garden?.zones.length ?? 0} growing zones
        </span>
      </div>

      {/* Month grid */}
      <div className="flex-1 overflow-x-auto px-4 py-3">
        <div
          className="grid gap-x-1 h-full"
          style={{ gridTemplateColumns: `120px repeat(12, minmax(60px, 1fr))` }}
        >
          {/* Zone label column header */}
          <div className="flex items-end pb-1">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Zone</span>
          </div>

          {/* Month headers */}
          {MONTHS.map((m, i) => (
            <div
              key={m}
              className={[
                'flex items-end justify-center pb-1',
                i === currentMonth ? 'text-garden-leaf font-bold' : 'text-gray-400',
              ].join(' ')}
            >
              <span className="text-[10px] font-medium">{m}</span>
            </div>
          ))}

          {/* Today line (overlay) — rendered relative inside the container */}
          {/* Zone rows */}
          {garden && garden.zones.slice(0, 6).map((zone) => (
            <React.Fragment key={zone.id}>
              {/* Zone name */}
              <div className="flex items-center pr-2 py-1">
                <div
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0 mr-1.5"
                  style={{ backgroundColor: zone.color }}
                />
                <span className="text-[11px] text-gray-600 truncate">{zone.name}</span>
              </div>

              {/* Month cells — placeholder activity bars */}
              {MONTHS.map((m, i) => {
                // Simple heuristic: show a "planted" bar in the middle months
                const isActive = i >= 3 && i <= 8;
                const isCurrentMonth = i === currentMonth;
                return (
                  <div
                    key={m}
                    className={[
                      'flex items-center py-1',
                      isCurrentMonth ? 'bg-garden-leaf/5 rounded' : '',
                    ].join(' ')}
                  >
                    {isActive && (
                      <div
                        className="w-full h-4 rounded-sm"
                        style={{ backgroundColor: zone.color + '80' }}
                        title={`${zone.name} active in ${m}`}
                      />
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}

          {/* Empty state */}
          {(!garden || garden.zones.length === 0) && (
            <div className="col-span-13 flex items-center justify-center py-4">
              <p className="text-xs text-gray-400">
                Add zones to see the seasonal planting timeline
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Keyboard Shortcuts Help Modal
// ---------------------------------------------------------------------------

interface KeyboardHelpModalProps {
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  history:   'History',
  selection: 'Selection & Zones',
  canvas:    'Canvas Overlays',
  zoom:      'Zoom & Navigation',
  navigation:'Help',
};

function KeyboardHelpModal({ onClose }: KeyboardHelpModalProps) {
  // Group shortcuts by category
  const groups = KEYBOARD_SHORTCUTS.reduce<Record<string, typeof KEYBOARD_SHORTCUTS>>(
    (acc, s) => {
      if (!acc[s.category]) acc[s.category] = [];
      acc[s.category].push(s);
      return acc;
    },
    {},
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kb-help-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <IconKeyboard />
            <h2 id="kb-help-title" className="text-base font-semibold text-gray-800">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            className="
              w-8 h-8 rounded-full flex items-center justify-center
              text-gray-400 hover:text-gray-700 hover:bg-gray-100
              transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garden-leaf
            "
          >
            <IconClose />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {Object.entries(groups).map(([category, shortcuts]) => (
            <div key={category}>
              <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                {CATEGORY_LABELS[category] ?? category}
              </h3>
              <div className="space-y-1">
                {shortcuts.map((s) => (
                  <div key={s.keys.join('+')} className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-700">{s.description}</span>
                    <div className="flex items-center gap-1 ml-4 flex-shrink-0">
                      {s.keys.map((k) => (
                        <kbd
                          key={k}
                          className="
                            inline-flex items-center justify-center
                            min-w-[28px] h-6 px-1.5
                            rounded-md border border-gray-300 bg-gray-100
                            text-[11px] font-mono font-medium text-gray-600
                            shadow-[0_1px_0_rgba(0,0,0,0.15)]
                          "
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-[11px] text-gray-400 text-center">
            Shortcuts are disabled when typing in text fields
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile bottom nav tab type
// ---------------------------------------------------------------------------

type MobileTab = 'chat' | 'map' | 'status' | 'more';

// ---------------------------------------------------------------------------
// More drawer (mobile)
// ---------------------------------------------------------------------------

interface MobileMoreDrawerProps {
  onClose: () => void;
  onShowShopping: () => void;
  onShowTwin: () => void;
  onShowShortcuts: () => void;
  showPalette: boolean;
  onTogglePalette: () => void;
}

function MobileMoreDrawer({
  onClose,
  onShowShopping,
  onShowTwin,
  onShowShortcuts,
  showPalette,
  onTogglePalette,
}: MobileMoreDrawerProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-full bg-white rounded-t-2xl shadow-2xl pb-safe animate-slide-up">
        <div className="w-12 h-1 rounded-full bg-gray-300 mx-auto mt-3 mb-4" />

        <div className="px-4 pb-6 space-y-1">
          {[
            {
              label: 'Shopping List',
              icon: <IconShopping />,
              action: () => { onShowShopping(); onClose(); },
            },
            {
              label: 'Digital Twin',
              icon: <IconTwin />,
              action: () => { onShowTwin(); onClose(); },
            },
            {
              label: showPalette ? 'Hide Zone Palette' : 'Show Zone Palette',
              icon: <IconPalette />,
              action: () => { onTogglePalette(); onClose(); },
            },
            {
              label: 'Keyboard Shortcuts',
              icon: <IconKeyboard />,
              action: () => { onShowShortcuts(); onClose(); },
            },
          ].map(({ label, icon, action }) => (
            <button
              key={label}
              type="button"
              onClick={action}
              className="
                w-full flex items-center gap-3 px-4 py-3 rounded-xl
                text-gray-700 hover:bg-gray-50 active:bg-gray-100
                transition-colors text-sm font-medium
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garden-leaf
              "
            >
              <span className="text-garden-leaf">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main layout component
// ---------------------------------------------------------------------------

export default function GardenLayout() {
  const {
    showPalette,
    setShowPalette,
    showTimeline,
    setShowTimeline,
    showMatrix,
    setShowMatrix,
  } = useGardenStore();

  // Local modal / overlay state
  const [showShopping, setShowShopping]   = useState(false);
  const [showTwin,     setShowTwin]       = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Mobile tab navigation
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat');
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  // fit-to-screen stub (canvas will implement this later)
  const handleFitToScreen = useCallback(() => {
    // Canvas component will subscribe to this event — for now a no-op
  }, []);

  // Wire keyboard shortcuts
  useKeyboardShortcuts({
    enabled: !showShortcuts && !showShopping && !showTwin,
    onShowHelp: () => setShowShortcuts(true),
    onFitToScreen: handleFitToScreen,
  });

  // Export handler stub
  const handleExport = useCallback((format: string) => {
    // TODO: wire up to export utilities
    console.log('[GardenLayout] export requested:', format);
  }, []);

  // Share handler stub
  const handleShare = useCallback(() => {
    // TODO: wire up to share utilities
    console.log('[GardenLayout] share requested');
  }, []);

  // Settings handler — opens Site Settings modal (future)
  const handleSettings = useCallback(() => {
    setShowMatrix(true); // temporary: reuse matrix flag as settings indicator
  }, [setShowMatrix]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-garden-cream">

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <Toolbar
        onExport={handleExport}
        onShare={handleShare}
        onSettings={handleSettings}
        onFitToScreen={handleFitToScreen}
      />

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Left panel: Zone Palette (desktop only) ─────────────────────── */}
        <aside
          aria-label="Zone palette"
          className={[
            'hidden lg:flex flex-col',
            'bg-white border-r border-gray-200 shadow-sm',
            'transition-[width] duration-300 ease-in-out overflow-hidden',
            showPalette ? 'w-60' : 'w-10',
          ].join(' ')}
        >
          {/* Collapse / expand toggle */}
          <button
            type="button"
            onClick={() => setShowPalette(!showPalette)}
            aria-label={showPalette ? 'Collapse palette' : 'Expand palette'}
            title={showPalette ? 'Collapse palette' : 'Expand palette'}
            className="
              flex items-center justify-center w-full h-10 flex-shrink-0
              border-b border-gray-100 text-gray-400
              hover:text-garden-leaf hover:bg-gray-50
              transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-garden-leaf
            "
          >
            {showPalette ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500 px-3">
                <IconPalette />
                <span className="flex-1 text-left">Zones</span>
                <IconChevronLeft />
              </span>
            ) : (
              <IconChevronRight />
            )}
          </button>

          {/* Palette content */}
          {showPalette && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <ZonePalette />
            </div>
          )}
        </aside>

        {/* ── Centre: Canvas ────────────────────────────────────────────────── */}
        <main
          className="flex-1 min-w-0 flex flex-col relative"
          aria-label="Garden canvas"
        >
          {/* On mobile: show canvas only when Map tab is active */}
          <div
            className={[
              'flex-1 min-h-0',
              // Mobile: hide unless on map tab
              'hidden lg:flex',
              // When mobile map tab is active, show it
              mobileTab === 'map' ? '!flex' : '',
            ].join(' ')}
          >
            <GardenCanvasPlaceholder className="flex-1" />
          </div>

          {/* Mobile: Chat panel (shown in the main area when chat tab active) */}
          <div
            className={[
              'flex-1 min-h-0 flex flex-col lg:hidden',
              mobileTab === 'chat' ? 'flex' : 'hidden',
            ].join(' ')}
          >
            <AIChat />
          </div>

          {/* Mobile: Status panel */}
          {mobileTab === 'status' && (
            <div className="flex-1 min-h-0 flex flex-col lg:hidden">
              <TwinPanel />
            </div>
          )}
        </main>

        {/* ── Right panel: AI Chat + Zone Detail (desktop only) ───────────── */}
        <aside
          className="
            hidden lg:flex flex-col
            w-[360px] flex-shrink-0
            bg-white border-l border-gray-200 shadow-sm
          "
          aria-label="AI assistant and zone detail"
        >
          {/* Chat fills the top portion */}
          <div className="flex-1 min-h-0 flex flex-col border-b border-gray-100">
            <AIChat />
          </div>

          {/* Additional action buttons at the bottom of the right panel */}
          <div className="flex-shrink-0 p-3 space-y-1 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setShowShopping(true)}
              className="
                w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
                text-gray-600 hover:bg-garden-leaf/5 hover:text-garden-leaf
                transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garden-leaf
              "
            >
              <IconShopping />
              Shopping List
            </button>
            <button
              type="button"
              onClick={() => setShowTwin(true)}
              className="
                w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
                text-gray-600 hover:bg-garden-leaf/5 hover:text-garden-leaf
                transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garden-leaf
              "
            >
              <IconTwin />
              Digital Twin
            </button>
          </div>
        </aside>
      </div>

      {/* ── Seasonal Timeline (desktop only, collapsible) ─────────────────── */}
      <div
        className={[
          'hidden lg:flex flex-col flex-shrink-0',
          'bg-white border-t border-gray-200',
          'transition-[height] duration-300 ease-in-out overflow-hidden',
          showTimeline ? 'h-[200px]' : 'h-10',
        ].join(' ')}
        aria-label="Seasonal timeline"
      >
        {/* Timeline toggle strip */}
        <button
          type="button"
          onClick={() => setShowTimeline(!showTimeline)}
          aria-label={showTimeline ? 'Collapse timeline' : 'Expand timeline'}
          className="
            flex-shrink-0 flex items-center justify-between w-full h-10 px-4
            text-gray-500 hover:text-garden-leaf hover:bg-gray-50
            transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-garden-leaf
            border-b border-gray-100
          "
        >
          <div className="flex items-center gap-2 text-xs font-medium">
            <IconTimeline />
            Seasonal Timeline
          </div>
          {showTimeline ? <IconChevronDown /> : <IconChevronUp />}
        </button>

        {/* Timeline body */}
        {showTimeline && (
          <div className="flex-1 min-h-0">
            <SeasonalTimeline />
          </div>
        )}
      </div>

      {/* ── Mobile bottom navigation ──────────────────────────────────────── */}
      <nav
        className="
          lg:hidden flex-shrink-0
          flex items-stretch
          bg-white border-t border-gray-200 shadow-lg
          safe-area-inset-bottom
        "
        aria-label="Mobile navigation"
      >
        {(
          [
            { tab: 'chat'   as MobileTab, label: 'Chat',   icon: <IconChat /> },
            { tab: 'map'    as MobileTab, label: 'Map',    icon: <IconMap /> },
            { tab: 'status' as MobileTab, label: 'Status', icon: <IconStatus /> },
          ] as const
        ).map(({ tab, label, icon }) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMobileTab(tab)}
            aria-current={mobileTab === tab ? 'page' : undefined}
            className={[
              'flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-garden-leaf',
              mobileTab === tab
                ? 'text-garden-leaf border-t-2 border-garden-leaf bg-garden-leaf/5'
                : 'text-gray-400 hover:text-gray-600',
            ].join(' ')}
          >
            {icon}
            {label}
          </button>
        ))}

        {/* More button */}
        <button
          type="button"
          onClick={() => setMobileMoreOpen(true)}
          className="
            flex-1 flex flex-col items-center justify-center gap-1 py-2
            text-[10px] font-medium text-gray-400 hover:text-gray-600
            transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-garden-leaf
          "
        >
          <IconMore />
          More
        </button>
      </nav>

      {/* ── Modal overlays ────────────────────────────────────────────────── */}

      {/* Keyboard shortcuts help */}
      {showShortcuts && (
        <KeyboardHelpModal onClose={() => setShowShortcuts(false)} />
      )}

      {/* Shopping list modal */}
      {showShopping && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Shopping list"
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowShopping(false)}
            aria-hidden
          />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2 text-gray-800 font-semibold text-sm">
                <IconShopping />
                Shopping List
              </div>
              <button
                type="button"
                onClick={() => setShowShopping(false)}
                aria-label="Close shopping list"
                className="
                  w-8 h-8 rounded-full flex items-center justify-center
                  text-gray-400 hover:text-gray-700 hover:bg-gray-100
                  transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garden-leaf
                "
              >
                <IconClose />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ShoppingList />
            </div>
          </div>
        </div>
      )}

      {/* Digital twin modal */}
      {showTwin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Digital twin panel"
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowTwin(false)}
            aria-hidden
          />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2 text-gray-800 font-semibold text-sm">
                <IconTwin />
                Digital Twin
              </div>
              <button
                type="button"
                onClick={() => setShowTwin(false)}
                aria-label="Close digital twin"
                className="
                  w-8 h-8 rounded-full flex items-center justify-center
                  text-gray-400 hover:text-gray-700 hover:bg-gray-100
                  transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garden-leaf
                "
              >
                <IconClose />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <TwinPanel />
            </div>
          </div>
        </div>
      )}

      {/* Mobile more drawer */}
      {mobileMoreOpen && (
        <MobileMoreDrawer
          onClose={() => setMobileMoreOpen(false)}
          onShowShopping={() => setShowShopping(true)}
          onShowTwin={() => setShowTwin(true)}
          onShowShortcuts={() => setShowShortcuts(true)}
          showPalette={showPalette}
          onTogglePalette={() => setShowPalette(!showPalette)}
        />
      )}
    </div>
  );
}
