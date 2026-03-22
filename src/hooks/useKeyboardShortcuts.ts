'use client';

/**
 * useKeyboardShortcuts
 *
 * Registers global keyboard shortcuts for the garden planner.
 * Only active when `enabled` is true (default) and when the focus
 * is not inside a text input / textarea / contenteditable element,
 * so typing in chat or notes fields is never intercepted.
 *
 * Shortcuts:
 *   Cmd/Ctrl+Z          → Undo
 *   Cmd/Ctrl+Shift+Z    → Redo
 *   R                   → Rotate selected zone
 *   Delete / Backspace  → Delete selected zone(s)
 *   Escape              → Deselect all
 *   G                   → Toggle grid
 *   C                   → Toggle companion indicators
 *   H                   → Toggle sun heatmap
 *   S                   → Toggle snap-to-grid
 *   + / =               → Zoom in
 *   -                   → Zoom out
 *   0                   → Reset zoom to 100 %
 *   ?                   → Show keyboard shortcuts help modal
 */

import { useEffect, useCallback } from 'react';
import { useGardenStore } from '@/store/gardenStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseKeyboardShortcutsOptions {
  /** Set to false to temporarily disable all shortcuts (e.g. while a modal is open). */
  enabled?: boolean;
  /** Called when the user presses "?" — host component opens the help modal. */
  onShowHelp?: () => void;
  /** Called when fit-to-screen should be triggered (canvas responsibility). */
  onFitToScreen?: () => void;
}

// ---------------------------------------------------------------------------
// Helper: detect if the current focus target is an editable element.
// ---------------------------------------------------------------------------

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (target.isContentEditable) return true;
  // Also skip inside a [role="textbox"] or [role="searchbox"]
  const role = target.getAttribute('role');
  return role === 'textbox' || role === 'searchbox' || role === 'combobox';
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export function useKeyboardShortcuts({
  enabled = true,
  onShowHelp,
  onFitToScreen,
}: UseKeyboardShortcutsOptions = {}) {
  const {
    canvas,
    undo,
    redo,
    rotateZone,
    removeZone,
    deselectAll,
    toggleGrid,
    toggleCompanions,
    toggleSunHeatmap,
    toggleSnap,
    setZoom,
  } = useGardenStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;
      if (isEditableTarget(e.target)) return;

      const meta = e.metaKey || e.ctrlKey;
      const shift = e.shiftKey;
      const key = e.key;

      // ── Undo / Redo ────────────────────────────────────────────────
      if (meta && key === 'z' && !shift) {
        e.preventDefault();
        undo();
        return;
      }
      if (meta && ((key === 'z' && shift) || key === 'y')) {
        e.preventDefault();
        redo();
        return;
      }

      // Don't process single-key shortcuts if any modifier key is held,
      // to avoid clashing with browser / OS shortcuts.
      if (meta || e.altKey) return;

      switch (key) {
        // ── Zone manipulation ───────────────────────────────────────
        case 'r':
        case 'R': {
          // Rotate the first selected zone (if any)
          const [firstId] = canvas.selectedZoneIds;
          if (firstId) {
            e.preventDefault();
            rotateZone(firstId);
          }
          break;
        }

        case 'Delete':
        case 'Backspace': {
          // Delete all selected zones
          if (canvas.selectedZoneIds.length > 0) {
            e.preventDefault();
            // Remove each selected zone (store handles undo per-zone)
            canvas.selectedZoneIds.forEach((id) => removeZone(id));
            deselectAll();
          }
          break;
        }

        case 'Escape': {
          e.preventDefault();
          deselectAll();
          break;
        }

        // ── Canvas overlays ─────────────────────────────────────────
        case 'g':
        case 'G': {
          e.preventDefault();
          toggleGrid();
          break;
        }

        case 'c':
        case 'C': {
          e.preventDefault();
          toggleCompanions();
          break;
        }

        case 'h':
        case 'H': {
          e.preventDefault();
          toggleSunHeatmap();
          break;
        }

        case 's':
        case 'S': {
          e.preventDefault();
          toggleSnap();
          break;
        }

        // ── Zoom ────────────────────────────────────────────────────
        case '+':
        case '=': {
          e.preventDefault();
          setZoom(Math.min((canvas.zoom ?? 1) + 0.1, 10));
          break;
        }

        case '-': {
          e.preventDefault();
          setZoom(Math.max((canvas.zoom ?? 1) - 0.1, 0.1));
          break;
        }

        case '0': {
          e.preventDefault();
          setZoom(1);
          break;
        }

        case 'f':
        case 'F': {
          e.preventDefault();
          onFitToScreen?.();
          break;
        }

        // ── Help modal ──────────────────────────────────────────────
        case '?': {
          e.preventDefault();
          onShowHelp?.();
          break;
        }

        default:
          break;
      }
    },
    [
      enabled,
      canvas.selectedZoneIds,
      canvas.zoom,
      undo,
      redo,
      rotateZone,
      removeZone,
      deselectAll,
      toggleGrid,
      toggleCompanions,
      toggleSunHeatmap,
      toggleSnap,
      setZoom,
      onShowHelp,
      onFitToScreen,
    ],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// ---------------------------------------------------------------------------
// Static shortcut definitions – used to render the help modal
// ---------------------------------------------------------------------------

export interface ShortcutEntry {
  keys: string[];
  description: string;
  category: 'history' | 'selection' | 'canvas' | 'zoom' | 'navigation';
}

export const KEYBOARD_SHORTCUTS: ShortcutEntry[] = [
  // History
  { keys: ['⌘Z'],       description: 'Undo',                  category: 'history' },
  { keys: ['⌘⇧Z'],      description: 'Redo',                  category: 'history' },

  // Selection / zone actions
  { keys: ['R'],        description: 'Rotate selected zone',  category: 'selection' },
  { keys: ['Del', '⌫'], description: 'Delete selected zone',  category: 'selection' },
  { keys: ['Esc'],      description: 'Deselect all',          category: 'selection' },

  // Canvas overlays
  { keys: ['G'],        description: 'Toggle grid',           category: 'canvas' },
  { keys: ['C'],        description: 'Toggle companion view', category: 'canvas' },
  { keys: ['H'],        description: 'Toggle sun heatmap',    category: 'canvas' },
  { keys: ['S'],        description: 'Toggle snap to grid',   category: 'canvas' },

  // Zoom
  { keys: ['+'],        description: 'Zoom in',               category: 'zoom' },
  { keys: ['-'],        description: 'Zoom out',              category: 'zoom' },
  { keys: ['0'],        description: 'Reset zoom to 100%',    category: 'zoom' },
  { keys: ['F'],        description: 'Fit garden to screen',  category: 'zoom' },

  // Navigation
  { keys: ['?'],        description: 'Show this help',        category: 'navigation' },
];
