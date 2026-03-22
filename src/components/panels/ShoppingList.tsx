'use client';

/**
 * ShoppingList – auto-generated shopping list panel for the Kitchen Garden Planner.
 *
 * Derives every item from the active season's crop assignments via the rule
 * engine's generateShoppingList helper.  Four collapsible categories:
 *   🌱 Seeds · 🌿 Seedlings/Transplants · 🧪 Soil Amendments · 🔧 Infrastructure
 *
 * Features:
 *   - Per-item acquired checkbox (persisted in local component state)
 *   - Copy as plain text
 *   - Export as CSV download
 *   - Responsive single-column layout
 */

import { useCallback, useMemo, useState } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import { generateShoppingList } from '@/lib/ruleEngine';
import type { ShoppingListItem } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Category = ShoppingListItem['category'];

interface CategoryMeta {
  key: Category;
  label: string;
  icon: string;
  emptyHint: string;
  accent: string;      // Tailwind bg class for the section header strip
  iconBg: string;      // Tailwind bg class for the icon chip
}

const CATEGORIES: CategoryMeta[] = [
  {
    key: 'seeds',
    label: 'Seeds',
    icon: '🌱',
    emptyHint: 'Assign direct-sow crops to zones to see seed requirements.',
    accent: 'bg-garden-sprout/10',
    iconBg: 'bg-garden-sprout/20',
  },
  {
    key: 'seedlings',
    label: 'Seedlings / Transplants',
    icon: '🌿',
    emptyHint: 'Assign indoor-start crops to zones to see seedling requirements.',
    accent: 'bg-garden-leaf/10',
    iconBg: 'bg-garden-leaf/20',
  },
  {
    key: 'amendments',
    label: 'Soil Amendments',
    icon: '🧪',
    emptyHint: 'Soil amendment suggestions appear once you have growing zones.',
    accent: 'bg-garden-bark/10',
    iconBg: 'bg-garden-bark/20',
  },
  {
    key: 'infrastructure',
    label: 'Infrastructure',
    icon: '🔧',
    emptyHint: 'Infrastructure items appear once crops are assigned.',
    accent: 'bg-garden-sky/10',
    iconBg: 'bg-garden-sky/20',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function itemKey(item: ShoppingListItem): string {
  return `${item.category}::${item.name}`;
}

function itemsToPlainText(items: ShoppingListItem[]): string {
  const sections = CATEGORIES.map(({ key, label, icon }) => {
    const section = items.filter((i) => i.category === key);
    if (section.length === 0) return '';
    const lines = section.map(
      (i) => `  [ ] ${i.name}  —  ${i.quantity}${i.notes ? `  (${i.notes})` : ''}`,
    );
    return [`${icon} ${label}`, ...lines].join('\n');
  }).filter(Boolean);
  return sections.join('\n\n');
}

function itemsToCSV(items: ShoppingListItem[]): string {
  const header = 'Category,Name,Quantity,Notes,Acquired';
  const rows = items.map((i) =>
    [i.category, i.name, i.quantity, i.notes ?? '', 'false']
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  return [header, ...rows].join('\n');
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface SectionProps {
  meta: CategoryMeta;
  items: ShoppingListItem[];
  acquired: Set<string>;
  onToggleAcquired: (key: string) => void;
}

function Section({ meta, items, acquired, onToggleAcquired }: SectionProps) {
  const [open, setOpen] = useState(true);
  const acquiredCount = items.filter((i) => acquired.has(itemKey(i))).length;

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          'w-full flex items-center gap-2 px-4 py-3 text-left transition-colors duration-100',
          meta.accent,
          'hover:brightness-95',
        ].join(' ')}
        aria-expanded={open}
      >
        {/* Icon chip */}
        <span
          className={[
            'inline-flex items-center justify-center w-7 h-7 rounded-lg text-base flex-shrink-0',
            meta.iconBg,
          ].join(' ')}
          aria-hidden
        >
          {meta.icon}
        </span>

        <span className="flex-1 font-semibold text-sm text-gray-800">{meta.label}</span>

        {/* Badge */}
        <span className="text-xs text-gray-500 font-medium">
          {acquiredCount}/{items.length}
        </span>

        {/* Chevron */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden
          className={[
            'flex-shrink-0 text-gray-500 transition-transform duration-200',
            open ? 'rotate-0' : '-rotate-90',
          ].join(' ')}
        >
          <polyline
            points="2,4 7,10 12,4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Body */}
      {open && (
        <div className="divide-y divide-gray-100">
          {items.length === 0 ? (
            <p className="px-4 py-4 text-xs text-gray-400 italic">{meta.emptyHint}</p>
          ) : (
            items.map((item) => {
              const key = itemKey(item);
              const done = acquired.has(key);
              return (
                <label
                  key={key}
                  className={[
                    'flex items-start gap-3 px-4 py-3 cursor-pointer select-none',
                    'transition-colors duration-100 hover:bg-gray-50',
                    done ? 'opacity-50' : '',
                  ].join(' ')}
                >
                  {/* Checkbox */}
                  <span className="mt-0.5 flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => onToggleAcquired(key)}
                      className="
                        w-4 h-4 rounded border-gray-300 text-garden-leaf
                        focus:ring-garden-leaf focus:ring-offset-0
                        cursor-pointer
                      "
                    />
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={[
                        'text-sm font-medium text-gray-800 leading-snug',
                        done ? 'line-through' : '',
                      ].join(' ')}
                    >
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.quantity}</p>
                    {item.notes && (
                      <p className="text-xs text-gray-400 mt-0.5 italic">{item.notes}</p>
                    )}
                  </div>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ShoppingList() {
  const garden = useGardenStore((s) => s.garden);

  // Acquired state: set of item keys that the user has ticked
  const [acquired, setAcquired] = useState<Set<string>>(new Set());

  // Copy-to-clipboard feedback
  const [copied, setCopied] = useState(false);

  // Derive active season plan
  const activeSeason = useMemo(() => {
    if (!garden) return null;
    return garden.seasons.find((s) => s.id === garden.active_season) ?? null;
  }, [garden]);

  // Generate the shopping list
  const allItems = useMemo<ShoppingListItem[]>(() => {
    if (!garden || !activeSeason) return [];
    return generateShoppingList(garden.zones, activeSeason, garden.climate);
  }, [garden, activeSeason]);

  const totalAcquired = Array.from(acquired).filter((k) =>
    allItems.some((i) => itemKey(i) === k),
  ).length;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleToggleAcquired = useCallback((key: string) => {
    setAcquired((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleCopyText = useCallback(async () => {
    const text = itemsToPlainText(allItems);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for environments where clipboard API is unavailable
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [allItems]);

  const handleExportCSV = useCallback(() => {
    const csv = itemsToCSV(allItems);
    const year = activeSeason?.year ?? new Date().getFullYear();
    downloadCSV(csv, `shopping-list-${year}.csv`);
  }, [allItems, activeSeason]);

  // ── Empty state ──────────────────────────────────────────────────────────────

  if (!garden) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
        <span className="text-4xl" aria-hidden>🛒</span>
        <p className="text-sm text-gray-500">No garden loaded yet.</p>
        <p className="text-xs text-gray-400">Create or open a garden to generate your shopping list.</p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const seasonLabel = activeSeason
    ? `${activeSeason.year} ${activeSeason.season.replace('_', ' ')}`
    : 'Current Season';

  return (
    <div className="flex flex-col h-full">
      {/* ── Panel header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Shopping List</h2>
          <p className="text-xs text-gray-500 mt-0.5">{seasonLabel}</p>
        </div>

        {/* Progress pill */}
        {allItems.length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-garden-sprout/20 text-garden-leaf-dark text-xs font-medium">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
              <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.5" />
              {totalAcquired > 0 && (
                <path
                  d="M3 5l1.5 1.5L7 3.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>
            {totalAcquired}/{allItems.length} acquired
          </span>
        )}
      </div>

      {/* ── Scrollable list ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {allItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <span className="text-5xl" aria-hidden>🌿</span>
            <p className="text-sm font-medium text-gray-600">No items yet</p>
            <p className="text-xs text-gray-400 max-w-[220px]">
              Assign crops to growing zones in the active season plan to generate
              your shopping list automatically.
            </p>
          </div>
        ) : (
          CATEGORIES.map((meta) => (
            <Section
              key={meta.key}
              meta={meta}
              items={allItems.filter((i) => i.category === meta.key)}
              acquired={acquired}
              onToggleAcquired={handleToggleAcquired}
            />
          ))
        )}
      </div>

      {/* ── Action footer ─────────────────────────────────────────────── */}
      {allItems.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50/60">
          {/* Clear acquired */}
          {acquired.size > 0 && (
            <button
              type="button"
              onClick={() => setAcquired(new Set())}
              className="
                text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2
                transition-colors duration-100 mr-auto
              "
            >
              Clear acquired
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {/* Copy as text */}
            <button
              type="button"
              onClick={handleCopyText}
              className="
                inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium
                border border-gray-200 bg-white text-gray-700
                hover:bg-gray-50 hover:border-gray-300 hover:text-gray-900
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garden-leaf
                transition-colors duration-100
              "
            >
              {copied ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                    <path d="M2 6.5l3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                    <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M9 4V2.5A1.5 1.5 0 0 0 7.5 1h-5A1.5 1.5 0 0 0 1 2.5v5A1.5 1.5 0 0 0 2.5 9H4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  Copy text
                </>
              )}
            </button>

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              className="
                inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium
                bg-garden-leaf text-white
                hover:bg-garden-leaf-dark
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garden-leaf focus-visible:ring-offset-2
                transition-colors duration-100
              "
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                <path d="M6.5 1v7M4 6l2.5 3L9 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M1.5 9.5v1.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Export CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
