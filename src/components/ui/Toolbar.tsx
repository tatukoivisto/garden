'use client';

import { useGardenStore } from '@/store/gardenStore';

function IconButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={[
        'inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50',
        disabled
          ? 'opacity-20 cursor-not-allowed text-white/30'
          : active
          ? 'bg-emerald-500/20 text-emerald-400'
          : 'text-white/50 hover:bg-white/[0.06] hover:text-white/80',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export default function Toolbar() {
  const {
    garden,
    canvas,
    undoStack,
    redoStack,
    undo,
    redo,
    setZoom,
    toggleGrid,
    toggleSnap,
    showPalette,
    setShowPalette,
    disclosureLevel,
    setDisclosureLevel,
  } = useGardenStore();

  const zoomPct = Math.round((canvas.zoom ?? 1) * 100);
  const gardenName = garden?.name ?? 'Garden';

  return (
    <header
      role="toolbar"
      aria-label="Canvas toolbar"
      className="flex items-center gap-1 px-3 h-11 bg-[#141a16] border-b border-white/[0.06] select-none"
    >
      {/* Garden name */}
      <div className="flex items-center gap-2 mr-3">
        <span className="text-emerald-400 text-sm">🌱</span>
        <span className="text-xs font-semibold text-white/70 truncate max-w-[120px]">{gardenName}</span>
      </div>

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      {/* Undo / Redo */}
      <IconButton onClick={undo} disabled={undoStack.length === 0} title="Undo (⌘Z)">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 8a5 5 0 1 0 1.2-3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><polyline points="1,4 3,8 7,6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" /></svg>
      </IconButton>
      <IconButton onClick={redo} disabled={redoStack.length === 0} title="Redo (⌘⇧Z)">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M13 8a5 5 0 1 1-1.2-3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><polyline points="15,4 13,8 9,6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" /></svg>
      </IconButton>

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      {/* Zoom */}
      <IconButton onClick={() => setZoom(Math.max((canvas.zoom ?? 1) - 0.15, 0.1))} title="Zoom out (-)">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" /><line x1="5" y1="7" x2="9" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </IconButton>
      <button
        type="button"
        onClick={() => setZoom(1)}
        title="Reset zoom"
        className="min-w-[38px] h-7 px-1.5 rounded-md text-[11px] font-mono text-white/50 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
      >
        {zoomPct}%
      </button>
      <IconButton onClick={() => setZoom(Math.min((canvas.zoom ?? 1) + 0.15, 10))} title="Zoom in (+)">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" /><line x1="5" y1="7" x2="9" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><line x1="7" y1="5" x2="7" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </IconButton>

      {/* Advanced controls — only at disclosure level 3+ */}
      {disclosureLevel >= 3 && (
        <>
          <div className="w-px h-5 bg-white/[0.08] mx-1" />

          {/* Toggles */}
          <IconButton onClick={toggleGrid} active={canvas.showGrid} title="Grid (G)">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.4" /><rect x="9.5" y="1.5" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.4" /><rect x="1.5" y="9.5" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.4" /><rect x="9.5" y="9.5" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.4" /></svg>
          </IconButton>
          <IconButton onClick={toggleSnap} active={canvas.snapToGrid} title="Snap (S)">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.4" /><rect x="9" y="9" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.4" /><path d="M7 4.5H8.5A1 1 0 0 1 9.5 5.5V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" /><circle cx="9" cy="9" r="1" fill="currentColor" /></svg>
          </IconButton>
        </>
      )}

      <div className="flex-1" />

      {/* Advanced mode toggle */}
      <button
        onClick={() => setDisclosureLevel(disclosureLevel >= 3 ? 1 : 3)}
        title={disclosureLevel >= 3 ? 'Simple mode' : 'Advanced tools'}
        className={[
          'flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[10px] font-medium transition-all',
          disclosureLevel >= 3
            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
            : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04]',
        ].join(' ')}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M6.5 2v1.5M6.5 12.5V14M2 6.5h1.5M12.5 6.5H14M3.88 3.88l1.06 1.06M11.06 11.06l1.06 1.06M3.88 9.12l1.06-1.06M11.06 4.94l1.06-1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3" />
        </svg>
        {disclosureLevel >= 3 ? 'Advanced' : 'More tools'}
      </button>

      {/* Palette toggle — only in advanced mode */}
      {disclosureLevel >= 3 && (
        <IconButton onClick={() => setShowPalette(!showPalette)} active={showPalette} title="Zones panel">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" /><rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" /><rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" /><rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" /></svg>
        </IconButton>
      )}
    </header>
  );
}
