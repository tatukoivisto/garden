'use client';

import React, { useState, useCallback } from 'react';
import { zoneTemplates, getGrowingZones, getStructureZones } from '@/data/zones';
import type { ZoneTemplate } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Drag-data key used by both the palette and GardenCanvas
// ─────────────────────────────────────────────────────────────────────────────
export const PALETTE_DRAG_KEY = 'application/x-garden-zone-type';

// ─────────────────────────────────────────────────────────────────────────────
// Section header
// ─────────────────────────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function PaletteSection({ title, count, open, onToggle, children }: SectionProps) {
  return (
    <div className="mb-1">
      {/* Header */}
      <button
        onClick={onToggle}
        className="
          w-full flex items-center justify-between
          px-3 py-2 rounded-lg
          text-xs font-semibold tracking-wide uppercase
          text-garden-leaf-dark/80
          hover:bg-garden-cream-dark
          transition-colors duration-150
          select-none
        "
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          <span
            className={`
              inline-block w-3.5 h-3.5 transition-transform duration-200
              ${open ? 'rotate-90' : 'rotate-0'}
            `}
          >
            {/* Chevron */}
            <svg viewBox="0 0 12 12" fill="currentColor" className="w-full h-full">
              <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          {title}
        </span>
        <span className="
          text-[10px] font-normal text-garden-stone
          bg-garden-cream-dark rounded-full px-1.5 py-0.5
        ">
          {count}
        </span>
      </button>

      {/* Items */}
      {open && (
        <div className="mt-0.5 space-y-0.5 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual palette item
// ─────────────────────────────────────────────────────────────────────────────

interface ZoneItemProps {
  template: ZoneTemplate;
  compact?: boolean; // used in mobile horizontal layout
}

function ZoneItem({ template, compact = false }: ZoneItemProps) {
  const [dragging, setDragging] = useState(false);

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData(PALETTE_DRAG_KEY, template.type);
      // Also set plain text so other drop targets can read it
      e.dataTransfer.setData('text/plain', template.type);
      setDragging(true);

      // Create a translucent drag ghost
      const ghost = document.createElement('div');
      ghost.textContent = template.label;
      ghost.style.cssText = `
        position: fixed; top: -200px; left: -200px;
        padding: 6px 10px; border-radius: 8px;
        background: ${template.defaultColor}; color: #2F5E3A;
        font-size: 12px; font-weight: 600; font-family: inherit;
        border: 2px solid rgba(0,0,0,0.15); white-space: nowrap;
        pointer-events: none;
      `;
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
      requestAnimationFrame(() => document.body.removeChild(ghost));
    },
    [template],
  );

  const handleDragEnd = useCallback(() => setDragging(false), []);

  const colorStyle = {
    borderLeftColor: template.defaultColor,
    backgroundColor: `${template.defaultColor}20`, // 12 % tint
  };

  if (compact) {
    // Mobile: compact card shown in horizontal row
    return (
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        title={`${template.label} — ${template.description}`}
        className={`
          flex-none w-20 flex flex-col items-center gap-1
          p-2 rounded-xl cursor-grab active:cursor-grabbing
          border border-transparent
          transition-all duration-150
          hover:border-garden-leaf/40 hover:shadow-md
          ${dragging ? 'opacity-50 scale-95' : 'opacity-100 scale-100'}
        `}
        style={{ backgroundColor: `${template.defaultColor}30` }}
      >
        <div
          className="w-8 h-8 rounded-lg border-2 flex-none"
          style={{
            borderColor: template.defaultColor,
            backgroundColor: `${template.defaultColor}60`,
          }}
        />
        <span className="text-[10px] font-medium text-garden-soil text-center leading-tight line-clamp-2">
          {template.label}
        </span>
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      style={colorStyle}
      className={`
        group flex items-start gap-2.5
        px-3 py-2.5 rounded-lg
        border-l-[3px]
        cursor-grab active:cursor-grabbing
        transition-all duration-150
        hover:shadow-sm hover:brightness-95
        ${dragging ? 'opacity-50 scale-[0.97] ring-2 ring-garden-leaf/30' : 'opacity-100 scale-100'}
      `}
      title={`Drag to canvas — ${template.description}\nDefault: ${template.defaultWidth_m} m × ${template.defaultDepth_m} m`}
    >
      {/* Colour swatch */}
      <div
        className="flex-none mt-0.5 w-5 h-5 rounded border"
        style={{
          backgroundColor: template.defaultColor,
          borderColor: `${template.defaultColor}88`,
          boxShadow: `0 0 0 1px rgba(0,0,0,0.08)`,
        }}
      />

      {/* Text block */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-1">
          <span className="text-xs font-semibold text-garden-soil truncate">
            {template.label}
          </span>
          <span className="flex-none text-[10px] text-garden-stone whitespace-nowrap">
            {template.defaultWidth_m}&thinsp;×&thinsp;{template.defaultDepth_m}&thinsp;m
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-garden-soil/60 leading-snug line-clamp-1">
          {template.description}
        </p>
      </div>

      {/* Drag hint — visible on hover */}
      <div className="
        flex-none self-center opacity-0 group-hover:opacity-40
        transition-opacity duration-150
      ">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-garden-stone fill-current">
          <circle cx="5" cy="4" r="1.2" />
          <circle cx="11" cy="4" r="1.2" />
          <circle cx="5" cy="8" r="1.2" />
          <circle cx="11" cy="8" r="1.2" />
          <circle cx="5" cy="12" r="1.2" />
          <circle cx="11" cy="12" r="1.2" />
        </svg>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ZonePalette() {
  const [searchQuery, setSearchQuery] = useState('');
  const [growingOpen, setGrowingOpen] = useState(true);
  const [structureOpen, setStructureOpen] = useState(true);

  // Filter all templates by search query
  const query = searchQuery.trim().toLowerCase();
  const filterFn = (t: ZoneTemplate) =>
    query === '' ||
    t.label.toLowerCase().includes(query) ||
    t.description.toLowerCase().includes(query) ||
    t.type.toLowerCase().includes(query);

  const growingZones = getGrowingZones().filter(filterFn);
  const structureZones = getStructureZones().filter(filterFn);
  const hasResults = growingZones.length > 0 || structureZones.length > 0;

  return (
    <>
      {/* ── DESKTOP sidebar (hidden on mobile) ─────────────────────────── */}
      <aside
        className="
          hidden md:flex flex-col
          w-56 min-h-0 flex-shrink-0
          bg-white/80 backdrop-blur-sm
          border-r border-garden-cream-dark
          overflow-hidden
        "
        aria-label="Zone palette"
      >
        {/* Header */}
        <div className="
          flex items-center gap-2 px-3 pt-3 pb-2
          border-b border-garden-cream-dark
        ">
          <svg
            viewBox="0 0 20 20"
            className="w-4 h-4 text-garden-leaf flex-none fill-current"
            aria-hidden
          >
            <rect x="2" y="2" width="7" height="7" rx="1.5" />
            <rect x="11" y="2" width="7" height="7" rx="1.5" />
            <rect x="2" y="11" width="7" height="7" rx="1.5" />
            <rect x="11" y="11" width="7" height="7" rx="1.5" />
          </svg>
          <h2 className="text-xs font-semibold text-garden-soil tracking-wide uppercase">
            Zone Palette
          </h2>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-garden-cream-dark">
          <div className="relative">
            <svg
              viewBox="0 0 16 16"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-garden-stone fill-none stroke-current"
              strokeWidth="1.5"
              aria-hidden
            >
              <circle cx="6.5" cy="6.5" r="4.5" />
              <line x1="10.5" y1="10.5" x2="14" y2="14" />
            </svg>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter zones…"
              className="
                w-full pl-7 pr-2 py-1.5 text-xs
                rounded-lg border border-garden-cream-dark
                bg-garden-cream/60
                text-garden-soil placeholder:text-garden-stone
                focus:outline-none focus:ring-2 focus:ring-garden-leaf/40
                focus:border-garden-leaf/50
                transition-shadow duration-150
              "
            />
          </div>
        </div>

        {/* Drag hint */}
        <p className="px-3 py-1.5 text-[10px] text-garden-stone/70 italic border-b border-garden-cream-dark/60">
          Drag a zone onto the canvas to place it
        </p>

        {/* Sections */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {!hasResults && (
            <p className="px-2 py-3 text-xs text-garden-stone text-center italic">
              No zones match &ldquo;{searchQuery}&rdquo;
            </p>
          )}

          {growingZones.length > 0 && (
            <PaletteSection
              title="Growing Areas"
              count={growingZones.length}
              open={growingOpen}
              onToggle={() => setGrowingOpen((v) => !v)}
            >
              {growingZones.map((t) => (
                <ZoneItem key={t.type} template={t} />
              ))}
            </PaletteSection>
          )}

          {structureZones.length > 0 && (
            <PaletteSection
              title="Structures & Infrastructure"
              count={structureZones.length}
              open={structureOpen}
              onToggle={() => setStructureOpen((v) => !v)}
            >
              {structureZones.map((t) => (
                <ZoneItem key={t.type} template={t} />
              ))}
            </PaletteSection>
          )}
        </div>

        {/* Footer count */}
        <div className="px-3 py-2 border-t border-garden-cream-dark">
          <p className="text-[10px] text-garden-stone text-center">
            {zoneTemplates.length} zone types available
          </p>
        </div>
      </aside>

      {/* ── MOBILE horizontal bar (visible only on mobile) ─────────────── */}
      <div
        className="
          md:hidden fixed bottom-0 left-0 right-0 z-30
          bg-white/95 backdrop-blur-sm
          border-t border-garden-cream-dark
          shadow-[0_-2px_12px_rgba(0,0,0,0.08)]
        "
        aria-label="Zone palette (mobile)"
      >
        {/* Mobile search */}
        <div className="flex items-center gap-2 px-3 pt-2 pb-1">
          <div className="relative flex-1">
            <svg
              viewBox="0 0 16 16"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-garden-stone fill-none stroke-current"
              strokeWidth="1.5"
              aria-hidden
            >
              <circle cx="6.5" cy="6.5" r="4.5" />
              <line x1="10.5" y1="10.5" x2="14" y2="14" />
            </svg>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter zones…"
              className="
                w-full pl-7 pr-2 py-1 text-xs
                rounded-lg border border-garden-cream-dark
                bg-garden-cream/60
                text-garden-soil placeholder:text-garden-stone
                focus:outline-none focus:ring-2 focus:ring-garden-leaf/40
              "
            />
          </div>
          <span className="text-[10px] text-garden-stone whitespace-nowrap">
            Drag to place
          </span>
        </div>

        {/* Horizontal scroll strip */}
        <div className="overflow-x-auto flex gap-2 px-3 pb-3 pt-1 no-scrollbar">
          {/* Group label chips + items */}
          {growingZones.length > 0 && (
            <>
              <div className="
                flex-none self-center px-2 py-1 rounded-full
                bg-garden-leaf/10 text-garden-leaf-dark
                text-[10px] font-semibold tracking-wide uppercase whitespace-nowrap
              ">
                Growing
              </div>
              {growingZones.map((t) => (
                <ZoneItem key={t.type} template={t} compact />
              ))}
            </>
          )}

          {structureZones.length > 0 && (
            <>
              <div className="
                flex-none self-center px-2 py-1 rounded-full
                bg-garden-bark/10 text-garden-bark
                text-[10px] font-semibold tracking-wide uppercase whitespace-nowrap ml-1
              ">
                Structures
              </div>
              {structureZones.map((t) => (
                <ZoneItem key={t.type} template={t} compact />
              ))}
            </>
          )}

          {!hasResults && (
            <p className="flex-none self-center px-4 text-xs text-garden-stone italic">
              No zones match &ldquo;{searchQuery}&rdquo;
            </p>
          )}
        </div>
      </div>
    </>
  );
}
