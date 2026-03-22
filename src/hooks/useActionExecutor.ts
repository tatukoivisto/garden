/**
 * Hook that executes AI actions against the garden store.
 *
 * Two modes:
 * - `executeActions(actions)` — executes immediately (used when user approves)
 * - `stageActions(actions)` — stages as pending for user approval
 */

import { useCallback } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import { zoneTemplates } from '@/data/zones';
import type { Zone, AIAction, PendingAction } from '@/types';

function uuid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Match AI-generated zone type strings (e.g. "ingroundbed") to valid types (e.g. "in_ground_bed"). */
function resolveZoneType(raw: string | undefined): string {
  if (!raw) return 'raised_bed';
  if (zoneTemplates.find((t) => t.type === raw)) return raw;
  const normalized = raw.toLowerCase().replace(/[\s_-]/g, '');
  const match = zoneTemplates.find((t) => t.type.replace(/_/g, '') === normalized);
  return match?.type ?? 'custom';
}

export function useActionExecutor() {
  const store = useGardenStore();

  const executeAction = useCallback(
    (action: AIAction): string | null => {
      try {
        switch (action.type) {
          case 'add_zone': {
            const p = action.payload as any;
            const resolvedType = resolveZoneType(p.type);
            const template = zoneTemplates.find((t) => t.type === resolvedType) ?? zoneTemplates[0];
            const zone: Zone = {
              id: uuid(),
              type: resolvedType as any,
              category: template.category,
              name: p.name ?? template.label,
              x_m: p.x_m ?? 0,
              y_m: p.y_m ?? 0,
              width_m: p.width_m ?? template.defaultWidth_m,
              depth_m: p.depth_m ?? template.defaultDepth_m,
              rotation_deg: 0,
              shape: p.shape ?? template.defaultShape,
              color: p.color ?? template.defaultColor,
              locked: false,
              notes: p.notes ?? '',
              health_history: [],
              photos: [],
            };
            store.addZone(zone);
            return `Added ${zone.name}`;
          }
          case 'remove_zone': {
            const p = action.payload as any;
            if (p.id) {
              store.removeZone(p.id);
              return 'Removed zone';
            }
            return null;
          }
          case 'move_zone': {
            const p = action.payload as any;
            if (p.id && p.x_m !== undefined && p.y_m !== undefined) {
              store.moveZone(p.id, p.x_m, p.y_m);
              return 'Moved zone';
            }
            return null;
          }
          case 'resize_zone': {
            const p = action.payload as any;
            if (p.id) {
              store.resizeZone(p.id, p.width_m, p.depth_m);
              return 'Resized zone';
            }
            return null;
          }
          case 'rename_zone': {
            const p = action.payload as any;
            if (p.id && p.name) {
              store.updateZone(p.id, { name: p.name });
              return `Renamed to ${p.name}`;
            }
            return null;
          }
          case 'rotate_zone': {
            const p = action.payload as any;
            if (p.id) {
              store.rotateZone(p.id);
              return 'Rotated zone';
            }
            return null;
          }
          case 'assign_crops': {
            const p = action.payload as any;
            const garden = store.garden;
            if (p.zoneId && p.crops && garden) {
              store.assignCrops(p.zoneId, garden.active_season, p.crops);
              return 'Assigned crops';
            }
            return null;
          }
          case 'update_climate': {
            const garden = store.garden;
            if (garden) {
              store.setClimate({ ...garden.climate, ...(action.payload as object) });
              return 'Updated climate';
            }
            return null;
          }
          case 'resize_garden': {
            const p = action.payload as any;
            if (p.width_m !== undefined && p.depth_m !== undefined) {
              store.resizeGarden(p.width_m, p.depth_m);
              return `Resized garden to ${p.width_m}m × ${p.depth_m}m`;
            }
            return null;
          }
          default:
            return null;
        }
      } catch (err) {
        console.error('[ActionExecutor] Error:', err);
        return null;
      }
    },
    [store],
  );

  /** Execute multiple actions immediately. Returns labels for each. */
  const executeActions = useCallback(
    (actions: AIAction[]): string[] => {
      const labels: string[] = [];
      for (const action of actions) {
        const label = executeAction(action);
        if (label) labels.push(label);
      }
      return labels;
    },
    [executeAction],
  );

  /** Stage actions as pending for user approval. */
  const stageActions = useCallback(
    (actions: AIAction[]) => {
      const pending: PendingAction[] = actions.map((action) => ({
        id: uuid(),
        action,
        status: 'pending' as const,
      }));
      store.stagePendingActions(pending);
    },
    [store],
  );

  /** Execute all approved pending actions and clear them. */
  const executeApproved = useCallback(() => {
    const pending = useGardenStore.getState().pendingActions;
    const approved = pending.filter((p) => p.status === 'approved');
    const labels = executeActions(approved.map((p) => p.action));
    store.clearPending();

    // Show canvas if zones were added
    if (approved.some((p) => p.action.type === 'add_zone') && !useGardenStore.getState().canvasVisible) {
      store.setCanvasVisible(true);
    }

    return labels;
  }, [executeActions, store]);

  return { executeActions, executeAction, stageActions, executeApproved };
}
