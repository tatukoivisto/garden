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
 * │              │                             │ (w-80, right)          │
 * ├──────────────┴─────────────────────────────┴────────────────────────┤
 * │ SeasonalTimeline (collapsible, h-[220px])                           │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Mobile layout (<lg):
 * - Bottom nav bar: Chat | Map | Status | More
 * - Active tab dictates which panel fills the screen
 *
 * Modal overlays (rendered above everything):
 * - Companion Matrix      (showMatrix store flag)
 * - Shopping List         (local state toggle)
 * - MultiYear View        (local state toggle)
 * - Site Settings         (local state toggle)
 * - Digital Twin Panel    (local state toggle)
 * - Keyboard shortcuts    (triggered by ? key)
 */

import React, { useCallback, useState } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import { useKeyboardShortcuts, KEYBOARD_SHORTCUTS } from '@/hooks/useKeyboardShortcuts';
import Toolbar from '@/components/ui/Toolbar';
import ZonePalette from '@/components/panels/ZonePalette';
import AIChat from '@/components/chat/AIChat';
import ZoneDetail from '@/components/panels/ZoneDetail';
import ShoppingList from '@/components/panels/ShoppingList';
import SiteSettings from '@/components/panels/SiteSettings';
import MultiYearView from '@/components/panels/MultiYearView';
import TwinPanel from '@/components/panels/TwinPanel';
import GardenCanvas from '@/components/canvas/GardenCanvas';
import SeasonalTimeline from '@/components/timeline/SeasonalTimeline';
import CompanionMatrix from '@/components/matrix/CompanionMatrix';

// ---------------------------------------------------------------------------
// Inline icon primitives
// ---------------------------------------------------------------------------

function IconChat() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M2 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6l-4 3V4Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMap() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <polygon
        points="1,4 7,2 13,4 19,2 19,16 13,18 7,16 1,18"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none"
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
    </svg>
  );
}

function IconMore() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="4" cy="10" r="1.5" fill="currentColor" />
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
      <circle cx="4" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" fill="white" />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" fill="white" />
      <circle cx="12" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" fill="white" />
    </svg>
  );
}

function IconShopping() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 3h10l-1.5 7H4.5L3 3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="5.5" cy="13" r="1" fill="currentColor" />
      <circle cx="11" cy="13" r="1" fill="currentColor" />
      <path d="M1 1h2l0.5 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1" y="3" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <line x1="1" y1="7" x2="15" y2="7" stroke="currentColor" strokeWidth="1.2" />
      <line x1="5" y1="1" x2="5" y2="5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="11" y1="1" x2="11" y2="5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconMatrix() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor" opacity="0.3" />
      <rect x="9" y="1" width="6" height="6" rx="1" fill="currentColor" opacity="0.6" />
      <rect x="1" y="9" width="6" height="6" rx="1" fill="currentColor" opacity="0.6" />
      <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconTwin() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="6" cy="8" r="4" stroke="currentColor" strokeWidth="1.4" />
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
      <line x1="4" y1="7" x2="4" y2="7.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="7" y1="7" x2="7" y2="7.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="10" y1="7" x2="10" y2="7.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="13" y1="7" x2="13" y2="7.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="4" y1="10" x2="12" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Generic modal wrapper
// ---------------------------------------------------------------------------

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  width?: string;
  children: React.ReactNode;
}

function Modal({ open, onClose, title, icon, width = 'max-w-2xl', children }: ModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={[
          'relative w-full bg-white rounded-2xl shadow-2xl overflow-hidden',
          'flex flex-col max-h-[90vh] animate-slide-up',
          width,
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2 text-gray-800 font-semibold text-sm">
            {icon}
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
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
          {children}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Keyboard Shortcuts Help Modal
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  history:    'History',
  selection:  'Selection & Zones',
  canvas:     'Canvas Overlays',
  zoom:       'Zoom & Navigation',
  navigation: 'Help',
};

function KeyboardHelpModal({ onClose }: { onClose: () => void }) {
  const groups = KEYBOARD_SHORTCUTS.reduce<Record<string, typeof KEYBOARD_SHORTCUTS>>(
    (acc, s) => {
      if (!acc[s.category]) acc[s.category] = [];
      acc[s.category].push(s);
      return acc;
    },
    {},
  );

  return (
    <Modal open onClose={onClose} title="Keyboard Shortcuts" icon={<IconKeyboard />} width="max-w-lg">
      <div className="px-6 py-5 space-y-5">
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
                          min-w-[28px] h-6 px-1.5 rounded-md
                          border border-gray-300 bg-gray-100
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
        <p className="text-[11px] text-gray-400 text-center border-t border-gray-100 pt-4">
          Shortcuts are disabled when typing in text fields
        </p>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Mobile bottom nav tab type
// ---------------------------------------------------------------------------

type MobileTab = 'chat' | 'map' | 'status' | 'more';

// ---------------------------------------------------------------------------
// Mobile more drawer
// ---------------------------------------------------------------------------

interface MobileMoreDrawerProps {
  onClose: () => void;
  onShowShopping: () => void;
  onShowTwin: () => void;
  onShowShortcuts: () => void;
  onShowMatrix: () => void;
  onShowMultiYear: () => void;
  onShowSettings: () => void;
  showPalette: boolean;
  onTogglePalette: () => void;
}

function MobileMoreDrawer({
  onClose,
  onShowShopping,
  onShowTwin,
  onShowShortcuts,
  onShowMatrix,
  onShowMultiYear,
  onShowSettings,
  showPalette,
  onTogglePalette,
}: MobileMoreDrawerProps) {
  const items = [
    { label: 'Shopping List',       icon: <IconShopping />, action: () => { onShowShopping(); onClose(); } },
    { label: 'Companion Matrix',    icon: <IconMatrix />,   action: () => { onShowMatrix(); onClose(); } },
    { label: 'Multi-Year Planner',  icon: <IconCalendar />, action: () => { onShowMultiYear(); onClose(); } },
    { label: 'Site Settings',       icon: <IconSettings />, action: () => { onShowSettings(); onClose(); } },
    { label: 'Digital Twin',        icon: <IconTwin />,     action: () => { onShowTwin(); onClose(); } },
    {
      label: showPalette ? 'Hide Zone Palette' : 'Show Zone Palette',
      icon: <IconPalette />,
      action: () => { onTogglePalette(); onClose(); },
    },
    { label: 'Keyboard Shortcuts',  icon: <IconKeyboard />, action: () => { onShowShortcuts(); onClose(); } },
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-full bg-white rounded-t-2xl shadow-2xl pb-safe animate-slide-up">
        <div className="w-12 h-1 rounded-full bg-gray-300 mx-auto mt-3 mb-4" />
        <div className="px-4 pb-6 space-y-1">
          {items.map(({ label, icon, action }) => (
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
// Right panel tab system (desktop)
// ---------------------------------------------------------------------------

type RightTab = 'chat' | 'zone';

function RightPanelTabs({
  activeTab,
  onChange,
  hasSelection,
}: {
  activeTab: RightTab;
  onChange: (t: RightTab) => void;
  hasSelection: boolean;
}) {
  return (
    <div className="flex border-b border-gray-100 bg-gray-50/60 flex-shrink-0">
      {(['chat', 'zone'] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={[
            'flex-1 py-2 text-xs font-semibold transition-colors duration-100',
            activeTab === tab
              ? 'text-garden-leaf border-b-2 border-garden-leaf bg-white'
              : 'text-gray-500 hover:text-gray-700 hover:bg-white/60',
          ].join(' ')}
        >
          {tab === 'chat' ? 'AI Chat' : (
            <span className="flex items-center justify-center gap-1">
              Zone Detail
              {hasSelection && (
                <span className="w-1.5 h-1.5 rounded-full bg-garden-leaf inline-block" />
              )}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main layout component
// ---------------------------------------------------------------------------

export default function GardenLayout() {
  const {
    showPalette, setShowPalette,
    showTimeline, setShowTimeline,
    showMatrix, setShowMatrix,
    canvas,
  } = useGardenStore();

  // Local modal state
  const [showShopping,  setShowShopping]  = useState(false);
  const [showTwin,      setShowTwin]      = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showMultiYear, setShowMultiYear] = useState(false);
  const [showSettings,  setShowSettings]  = useState(false);

  // Right panel tab
  const [rightTab, setRightTab] = useState<RightTab>('chat');
  const hasSelection = canvas.selectedZoneIds.length > 0;

  // Auto-switch to zone tab when something is selected
  React.useEffect(() => {
    if (hasSelection) setRightTab('zone');
  }, [hasSelection]);

  // Mobile tab navigation
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat');
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  // Canvas fit-to-screen stub
  const handleFitToScreen = useCallback(() => {}, []);

  // Wire keyboard shortcuts
  useKeyboardShortcuts({
    enabled: !showShortcuts && !showShopping && !showTwin && !showMultiYear && !showSettings && !showMatrix,
    onShowHelp: () => setShowShortcuts(true),
    onFitToScreen: handleFitToScreen,
  });

  // Export handler stub
  const handleExport = useCallback((format: string) => {
    console.log('[GardenLayout] export requested:', format);
  }, []);

  // Share handler stub
  const handleShare = useCallback(() => {
    console.log('[GardenLayout] share requested');
  }, []);

  // Settings opens SiteSettings modal
  const handleSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-garden-cream">

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <Toolbar
        onExport={handleExport}
        onShare={handleShare}
        onSettings={handleSettings}
        onFitToScreen={handleFitToScreen}
      />

      {/* ── Main content area ──────────────────────────────────────────────── */}
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
              transition-colors focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-inset focus-visible:ring-garden-leaf
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
          {/* Desktop canvas — always rendered */}
          <div
            className={[
              'flex-1 min-h-0',
              'hidden lg:flex',
              mobileTab === 'map' ? '!flex' : '',
            ].join(' ')}
          >
            <GardenCanvas />
          </div>

          {/* Mobile: Chat panel */}
          <div
            className={[
              'flex-1 min-h-0 flex flex-col lg:hidden',
              mobileTab === 'chat' ? 'flex' : 'hidden',
            ].join(' ')}
          >
            <AIChat />
          </div>

          {/* Mobile: Status / Twin panel */}
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
            w-80 flex-shrink-0
            bg-white border-l border-gray-200 shadow-sm
          "
          aria-label="AI assistant and zone detail"
        >
          {/* Tab switcher */}
          <RightPanelTabs
            activeTab={rightTab}
            onChange={setRightTab}
            hasSelection={hasSelection}
          />

          {/* Tab content */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* AI Chat — hidden but mounted when not active to preserve state */}
            <div className={['flex-1 min-h-0 flex flex-col', rightTab === 'chat' ? 'flex' : 'hidden'].join(' ')}>
              <AIChat />
            </div>
            {/* Zone Detail */}
            <div className={['flex-1 min-h-0 flex flex-col', rightTab === 'zone' ? 'flex' : 'hidden'].join(' ')}>
              <ZoneDetail />
            </div>
          </div>

          {/* Quick-access footer buttons */}
          <div className="flex-shrink-0 px-3 py-2 border-t border-gray-100 flex items-center gap-1 flex-wrap">
            {[
              { label: 'Shop',     icon: <IconShopping />, action: () => setShowShopping(true) },
              { label: 'Matrix',   icon: <IconMatrix />,   action: () => setShowMatrix(true) },
              { label: 'Seasons',  icon: <IconCalendar />, action: () => setShowMultiYear(true) },
              { label: 'Settings', icon: <IconSettings />, action: () => setShowSettings(true) },
            ].map(({ label, icon, action }) => (
              <button
                key={label}
                type="button"
                onClick={action}
                className="
                  flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium
                  text-gray-500 hover:bg-garden-leaf/5 hover:text-garden-leaf
                  transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garden-leaf
                "
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </aside>
      </div>

      {/* ── Seasonal Timeline (desktop, collapsible) ─────────────────────── */}
      <div
        className={[
          'hidden lg:flex flex-col flex-shrink-0',
          'bg-white border-t border-gray-200',
          'transition-[height] duration-300 ease-in-out overflow-hidden',
          showTimeline ? 'h-[220px]' : 'h-10',
        ].join(' ')}
        aria-label="Seasonal timeline"
      >
        {/* Toggle strip */}
        <button
          type="button"
          onClick={() => setShowTimeline(!showTimeline)}
          aria-label={showTimeline ? 'Collapse timeline' : 'Expand timeline'}
          className="
            flex-shrink-0 flex items-center justify-between w-full h-10 px-4
            text-gray-500 hover:text-garden-leaf hover:bg-gray-50
            transition-colors focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-inset focus-visible:ring-garden-leaf
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
          <div className="flex-1 min-h-0 relative">
            <SeasonalTimeline />
          </div>
        )}
      </div>

      {/* ── Mobile bottom navigation ────────────────────────────────────── */}
      <nav
        className="
          lg:hidden flex-shrink-0
          flex items-stretch
          bg-white border-t border-gray-200 shadow-lg
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
        <button
          type="button"
          onClick={() => setMobileMoreOpen(true)}
          className="
            flex-1 flex flex-col items-center justify-center gap-1 py-2
            text-[10px] font-medium text-gray-400 hover:text-gray-600
            transition-colors focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-inset focus-visible:ring-garden-leaf
          "
        >
          <IconMore />
          More
        </button>
      </nav>

      {/* ── Modal overlays ──────────────────────────────────────────────── */}

      {showShortcuts && (
        <KeyboardHelpModal onClose={() => setShowShortcuts(false)} />
      )}

      <Modal
        open={showShopping}
        onClose={() => setShowShopping(false)}
        title="Shopping List"
        icon={<IconShopping />}
        width="max-w-lg"
      >
        <ShoppingList />
      </Modal>

      <Modal
        open={showMatrix}
        onClose={() => setShowMatrix(false)}
        title="Companion Planting Matrix"
        icon={<IconMatrix />}
        width="max-w-3xl"
      >
        <CompanionMatrix />
      </Modal>

      <Modal
        open={showMultiYear}
        onClose={() => setShowMultiYear(false)}
        title="Multi-Year Planner"
        icon={<IconCalendar />}
        width="max-w-3xl"
      >
        <MultiYearView />
      </Modal>

      <Modal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        title="Site Settings"
        icon={<IconSettings />}
        width="max-w-xl"
      >
        <SiteSettings />
      </Modal>

      <Modal
        open={showTwin}
        onClose={() => setShowTwin(false)}
        title="Digital Twin"
        icon={<IconTwin />}
        width="max-w-2xl"
      >
        <TwinPanel />
      </Modal>

      {/* Mobile more drawer */}
      {mobileMoreOpen && (
        <MobileMoreDrawer
          onClose={() => setMobileMoreOpen(false)}
          onShowShopping={() => setShowShopping(true)}
          onShowTwin={() => setShowTwin(true)}
          onShowShortcuts={() => setShowShortcuts(true)}
          onShowMatrix={() => setShowMatrix(true)}
          onShowMultiYear={() => setShowMultiYear(true)}
          onShowSettings={() => setShowSettings(true)}
          showPalette={showPalette}
          onTogglePalette={() => setShowPalette(!showPalette)}
        />
      )}
    </div>
  );
}
