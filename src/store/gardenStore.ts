import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Garden,
  Zone,
  CropAssignment,
  ChatMessage,
  SeasonPlan,
  CanvasState,
  UndoAction,
  BedSystem,
  SouthEdge,
  ClimateConfig,
} from '@/types';

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

function uuid(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const MAX_UNDO = 50;

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

const DEFAULT_CLIMATE: ClimateConfig = {
  location: 'Helsinki, Finland',
  lat: 60.17,
  lng: 24.94,
  usda_zone: '5b',
  finnish_zone: 'IV',
  soil_type: 'clay_loam',
  soil_ph: 6.2,
  annual_rainfall_mm: 660,
  last_frost: '05-15',
  first_frost: '10-01',
  growing_season_days: 140,
  wind_exposure: 'moderate',
  slope_facing: 'south',
  sun_angle_summer_deg: 53,
  daylight_hours_solstice: 18.5,
  auto_detected: false,
  detection_source: 'manual',
};

function makeDefaultSeason(): SeasonPlan {
  return {
    id: uuid(),
    year: new Date().getFullYear(),
    season: 'full_year',
    crop_assignments: [],
  };
}

function makeDefaultGarden(name: string, width_m: number, depth_m: number): Garden {
  const season = makeDefaultSeason();
  return {
    id: uuid(),
    name,
    width_m,
    depth_m,
    south_edge: 'top',
    bed_system: 'metric',
    unit_system: 'metric',
    climate: { ...DEFAULT_CLIMATE },
    zones: [],
    seasons: [season],
    active_season: season.id,
    lifecycle: 'designing',
    chat_history: [],
    voice_notes: [],
    created: new Date(),
    modified: new Date(),
  };
}

const DEFAULT_CANVAS_STATE: CanvasState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  selectedZoneIds: [],
  draggingZoneId: null,
  resizingZoneId: null,
  resizeHandle: null,
  dragStartX: 0,
  dragStartY: 0,
  showGrid: true,
  showCompanions: false,
  showSunHeatmap: false,
  snapToGrid: true,
};

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface GardenStoreState {
  // Garden data
  garden: Garden | null;

  // Canvas interaction state
  canvas: CanvasState;

  // UI state
  activePanelTab: string;
  showPalette: boolean;
  showTimeline: boolean;
  showMatrix: boolean;
  isLoading: boolean;
  disclosureLevel: 0 | 1 | 2 | 3 | 4;

  // Undo / redo
  undoStack: UndoAction[];
  redoStack: UndoAction[];

  // -------------------------------------------------------------------------
  // Garden-level actions
  // -------------------------------------------------------------------------
  initGarden: (garden: Garden) => void;
  createNewGarden: (name: string, width_m: number, depth_m: number) => void;

  // -------------------------------------------------------------------------
  // Zone actions
  // -------------------------------------------------------------------------
  addZone: (zone: Zone) => void;
  updateZone: (id: string, partial: Partial<Zone>) => void;
  removeZone: (id: string) => void;
  moveZone: (id: string, x_m: number, y_m: number) => void;
  resizeZone: (id: string, width_m: number, depth_m: number) => void;
  rotateZone: (id: string) => void;
  duplicateZone: (id: string) => void;
  lockZone: (id: string) => void;
  unlockZone: (id: string) => void;

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------
  selectZone: (id: string) => void;
  deselectAll: () => void;
  toggleZoneSelection: (id: string) => void;
  selectMultiple: (ids: string[]) => void;

  // -------------------------------------------------------------------------
  // Crop assignments
  // -------------------------------------------------------------------------
  assignCrops: (zoneId: string, seasonId: string, crops: CropAssignment[]) => void;

  // -------------------------------------------------------------------------
  // Chat
  // -------------------------------------------------------------------------
  addChatMessage: (msg: ChatMessage) => void;

  // -------------------------------------------------------------------------
  // Garden settings
  // -------------------------------------------------------------------------
  setClimate: (config: ClimateConfig) => void;
  setBedSystem: (system: BedSystem) => void;
  setSouthEdge: (edge: SouthEdge) => void;

  // -------------------------------------------------------------------------
  // Seasons
  // -------------------------------------------------------------------------
  addSeason: (season: SeasonPlan) => void;
  setActiveSeason: (id: string) => void;

  // -------------------------------------------------------------------------
  // Canvas controls
  // -------------------------------------------------------------------------
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  toggleGrid: () => void;
  toggleCompanions: () => void;
  toggleSunHeatmap: () => void;
  toggleSnap: () => void;

  // -------------------------------------------------------------------------
  // Undo / redo
  // -------------------------------------------------------------------------
  undo: () => void;
  redo: () => void;

  // -------------------------------------------------------------------------
  // UI
  // -------------------------------------------------------------------------
  setActivePanelTab: (tab: string) => void;
  setShowPalette: (show: boolean) => void;
  setShowTimeline: (show: boolean) => void;
  setShowMatrix: (show: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setDisclosureLevel: (level: 0 | 1 | 2 | 3 | 4) => void;

  // -------------------------------------------------------------------------
  // Persistence helpers
  // -------------------------------------------------------------------------
  saveToLocalStorage: () => void;
  loadFromLocalStorage: () => void;
  exportAsJSON: () => string;
  importFromJSON: (json: string) => void;
}

// ---------------------------------------------------------------------------
// Internal undo helpers (used inside store actions)
// ---------------------------------------------------------------------------

/**
 * Push an UndoAction onto the undoStack and clear the redoStack.
 * Trims the undoStack to MAX_UNDO entries.
 */
function pushUndo(
  get: () => GardenStoreState,
  set: (fn: (s: GardenStoreState) => GardenStoreState) => void,
  action: UndoAction,
) {
  set((s) => ({
    ...s,
    undoStack: [...s.undoStack.slice(-(MAX_UNDO - 1)), action],
    redoStack: [],
  }));
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useGardenStore = create<GardenStoreState>()(
  persist(
    (set, get) => {
      // -----------------------------------------------------------------------
      // Internal zone mutation helpers (pure functions, no side-effects)
      // -----------------------------------------------------------------------

      /** Replace a zone in the zones array by id. */
      function replaceZone(zones: Zone[], updated: Zone): Zone[] {
        return zones.map((z) => (z.id === updated.id ? updated : z));
      }

      /** Find a zone by id; returns undefined when not found. */
      function findZone(id: string): Zone | undefined {
        return get().garden?.zones.find((z) => z.id === id);
      }

      /** Resolve current garden; throws when no garden is loaded. */
      function requireGarden(): Garden {
        const g = get().garden;
        if (!g) throw new Error('No garden loaded');
        return g;
      }

      // -----------------------------------------------------------------------
      // Zone mutation with undo/redo capture
      // -----------------------------------------------------------------------

      function zoneAction(
        description: string,
        applyFn: (zones: Zone[]) => Zone[],
        reverseFn: (zones: Zone[]) => Zone[],
      ) {
        const garden = requireGarden();
        const beforeZones = garden.zones;

        const nextZones = applyFn(beforeZones);

        set((s) => ({
          ...s,
          garden: s.garden
            ? { ...s.garden, zones: nextZones, modified: new Date() }
            : s.garden,
        }));

        const undoAction: UndoAction = {
          type: 'zone',
          description,
          undo: () => {
            set((s) => ({
              ...s,
              garden: s.garden
                ? { ...s.garden, zones: reverseFn(s.garden.zones), modified: new Date() }
                : s.garden,
            }));
          },
          redo: () => {
            set((s) => ({
              ...s,
              garden: s.garden
                ? { ...s.garden, zones: applyFn(s.garden.zones), modified: new Date() }
                : s.garden,
            }));
          },
        };

        pushUndo(get, set, undoAction);
      }

      // -----------------------------------------------------------------------
      // Return the full store object
      // -----------------------------------------------------------------------

      return {
        // -------------------------------------------------------------------
        // Initial state
        // -------------------------------------------------------------------
        garden: null,
        canvas: { ...DEFAULT_CANVAS_STATE },
        activePanelTab: 'zones',
        showPalette: true,
        showTimeline: false,
        showMatrix: false,
        isLoading: false,
        disclosureLevel: 1,
        undoStack: [],
        redoStack: [],

        // -------------------------------------------------------------------
        // Garden-level
        // -------------------------------------------------------------------

        initGarden(garden) {
          set((s) => ({
            ...s,
            garden,
            undoStack: [],
            redoStack: [],
          }));
        },

        createNewGarden(name, width_m, depth_m) {
          const garden = makeDefaultGarden(name, width_m, depth_m);
          set((s) => ({
            ...s,
            garden,
            undoStack: [],
            redoStack: [],
            canvas: { ...DEFAULT_CANVAS_STATE },
          }));
        },

        // -------------------------------------------------------------------
        // Zone actions
        // -------------------------------------------------------------------

        addZone(zone) {
          zoneAction(
            `Add zone "${zone.name}"`,
            (zones) => [...zones, zone],
            (zones) => zones.filter((z) => z.id !== zone.id),
          );
        },

        updateZone(id, partial) {
          const before = findZone(id);
          if (!before) return;

          zoneAction(
            `Update zone "${before.name}"`,
            (zones) => replaceZone(zones, { ...before, ...partial }),
            (zones) => replaceZone(zones, before),
          );
        },

        removeZone(id) {
          const before = findZone(id);
          if (!before) return;

          zoneAction(
            `Remove zone "${before.name}"`,
            (zones) => zones.filter((z) => z.id !== id),
            (zones) => [...zones, before],
          );
        },

        moveZone(id, x_m, y_m) {
          const before = findZone(id);
          if (!before) return;

          const after: Zone = { ...before, x_m, y_m };

          zoneAction(
            `Move zone "${before.name}"`,
            (zones) => replaceZone(zones, after),
            (zones) => replaceZone(zones, before),
          );
        },

        resizeZone(id, width_m, depth_m) {
          const before = findZone(id);
          if (!before) return;

          const after: Zone = { ...before, width_m, depth_m };

          zoneAction(
            `Resize zone "${before.name}"`,
            (zones) => replaceZone(zones, after),
            (zones) => replaceZone(zones, before),
          );
        },

        rotateZone(id) {
          const before = findZone(id);
          if (!before) return;

          const nextRotation: 0 | 90 = before.rotation_deg === 0 ? 90 : 0;
          const after: Zone = { ...before, rotation_deg: nextRotation };

          zoneAction(
            `Rotate zone "${before.name}"`,
            (zones) => replaceZone(zones, after),
            (zones) => replaceZone(zones, before),
          );
        },

        duplicateZone(id) {
          const source = findZone(id);
          if (!source) return;

          const duplicate: Zone = {
            ...source,
            id: uuid(),
            name: `${source.name} (copy)`,
            x_m: source.x_m + 0.5,
            y_m: source.y_m + 0.5,
            locked: false,
          };

          zoneAction(
            `Duplicate zone "${source.name}"`,
            (zones) => [...zones, duplicate],
            (zones) => zones.filter((z) => z.id !== duplicate.id),
          );
        },

        lockZone(id) {
          const before = findZone(id);
          if (!before) return;

          zoneAction(
            `Lock zone "${before.name}"`,
            (zones) => replaceZone(zones, { ...before, locked: true }),
            (zones) => replaceZone(zones, before),
          );
        },

        unlockZone(id) {
          const before = findZone(id);
          if (!before) return;

          zoneAction(
            `Unlock zone "${before.name}"`,
            (zones) => replaceZone(zones, { ...before, locked: false }),
            (zones) => replaceZone(zones, before),
          );
        },

        // -------------------------------------------------------------------
        // Selection
        // -------------------------------------------------------------------

        selectZone(id) {
          set((s) => ({
            ...s,
            canvas: { ...s.canvas, selectedZoneIds: [id] },
          }));
        },

        deselectAll() {
          set((s) => ({
            ...s,
            canvas: { ...s.canvas, selectedZoneIds: [] },
          }));
        },

        toggleZoneSelection(id) {
          set((s) => {
            const already = s.canvas.selectedZoneIds.includes(id);
            return {
              ...s,
              canvas: {
                ...s.canvas,
                selectedZoneIds: already
                  ? s.canvas.selectedZoneIds.filter((i) => i !== id)
                  : [...s.canvas.selectedZoneIds, id],
              },
            };
          });
        },

        selectMultiple(ids) {
          set((s) => ({
            ...s,
            canvas: { ...s.canvas, selectedZoneIds: ids },
          }));
        },

        // -------------------------------------------------------------------
        // Crop assignments
        // -------------------------------------------------------------------

        assignCrops(zoneId, seasonId, crops) {
          const garden = requireGarden();

          const beforeSeasons = garden.seasons;
          const targetSeason = beforeSeasons.find((s) => s.id === seasonId);
          if (!targetSeason) return;

          const beforeAssignments = targetSeason.crop_assignments;

          // Build updated seasons: replace or add the zone assignment
          function applyAssignment(seasons: SeasonPlan[]): SeasonPlan[] {
            return seasons.map((season) => {
              if (season.id !== seasonId) return season;
              const otherAssignments = season.crop_assignments.filter(
                (ca) => ca.zone_id !== zoneId,
              );
              return {
                ...season,
                crop_assignments: [...otherAssignments, { zone_id: zoneId, crops }],
              };
            });
          }

          function reverseAssignment(seasons: SeasonPlan[]): SeasonPlan[] {
            return seasons.map((season) => {
              if (season.id !== seasonId) return season;
              return { ...season, crop_assignments: beforeAssignments };
            });
          }

          const nextSeasons = applyAssignment(beforeSeasons);

          set((s) => ({
            ...s,
            garden: s.garden
              ? { ...s.garden, seasons: nextSeasons, modified: new Date() }
              : s.garden,
          }));

          const undoAction: UndoAction = {
            type: 'crops',
            description: `Assign crops to zone in season`,
            undo: () => {
              set((s) => ({
                ...s,
                garden: s.garden
                  ? {
                      ...s.garden,
                      seasons: reverseAssignment(s.garden.seasons),
                      modified: new Date(),
                    }
                  : s.garden,
              }));
            },
            redo: () => {
              set((s) => ({
                ...s,
                garden: s.garden
                  ? {
                      ...s.garden,
                      seasons: applyAssignment(s.garden.seasons),
                      modified: new Date(),
                    }
                  : s.garden,
              }));
            },
          };

          pushUndo(get, set, undoAction);
        },

        // -------------------------------------------------------------------
        // Chat
        // -------------------------------------------------------------------

        addChatMessage(msg) {
          set((s) => ({
            ...s,
            garden: s.garden
              ? {
                  ...s.garden,
                  chat_history: [...s.garden.chat_history, msg],
                  modified: new Date(),
                }
              : s.garden,
          }));
        },

        // -------------------------------------------------------------------
        // Garden settings
        // -------------------------------------------------------------------

        setClimate(config) {
          set((s) => ({
            ...s,
            garden: s.garden
              ? { ...s.garden, climate: config, modified: new Date() }
              : s.garden,
          }));
        },

        setBedSystem(system) {
          set((s) => ({
            ...s,
            garden: s.garden
              ? { ...s.garden, bed_system: system, modified: new Date() }
              : s.garden,
          }));
        },

        setSouthEdge(edge) {
          set((s) => ({
            ...s,
            garden: s.garden
              ? { ...s.garden, south_edge: edge, modified: new Date() }
              : s.garden,
          }));
        },

        // -------------------------------------------------------------------
        // Seasons
        // -------------------------------------------------------------------

        addSeason(season) {
          set((s) => ({
            ...s,
            garden: s.garden
              ? {
                  ...s.garden,
                  seasons: [...s.garden.seasons, season],
                  modified: new Date(),
                }
              : s.garden,
          }));
        },

        setActiveSeason(id) {
          set((s) => ({
            ...s,
            garden: s.garden
              ? { ...s.garden, active_season: id, modified: new Date() }
              : s.garden,
          }));
        },

        // -------------------------------------------------------------------
        // Canvas controls
        // -------------------------------------------------------------------

        setZoom(zoom) {
          set((s) => ({
            ...s,
            canvas: { ...s.canvas, zoom: Math.max(0.1, Math.min(zoom, 10)) },
          }));
        },

        setPan(x, y) {
          set((s) => ({
            ...s,
            canvas: { ...s.canvas, panX: x, panY: y },
          }));
        },

        toggleGrid() {
          set((s) => ({
            ...s,
            canvas: { ...s.canvas, showGrid: !s.canvas.showGrid },
          }));
        },

        toggleCompanions() {
          set((s) => ({
            ...s,
            canvas: { ...s.canvas, showCompanions: !s.canvas.showCompanions },
          }));
        },

        toggleSunHeatmap() {
          set((s) => ({
            ...s,
            canvas: { ...s.canvas, showSunHeatmap: !s.canvas.showSunHeatmap },
          }));
        },

        toggleSnap() {
          set((s) => ({
            ...s,
            canvas: { ...s.canvas, snapToGrid: !s.canvas.snapToGrid },
          }));
        },

        // -------------------------------------------------------------------
        // Undo / redo
        // -------------------------------------------------------------------

        undo() {
          const { undoStack, redoStack } = get();
          if (undoStack.length === 0) return;

          const action = undoStack[undoStack.length - 1];
          action.undo();

          set((s) => ({
            ...s,
            undoStack: s.undoStack.slice(0, -1),
            redoStack: [...s.redoStack, action],
          }));
        },

        redo() {
          const { redoStack } = get();
          if (redoStack.length === 0) return;

          const action = redoStack[redoStack.length - 1];
          action.redo();

          set((s) => ({
            ...s,
            redoStack: s.redoStack.slice(0, -1),
            undoStack: [...s.undoStack, action],
          }));
        },

        // -------------------------------------------------------------------
        // UI
        // -------------------------------------------------------------------

        setActivePanelTab(tab) {
          set((s) => ({ ...s, activePanelTab: tab }));
        },

        setShowPalette(show) {
          set((s) => ({ ...s, showPalette: show }));
        },

        setShowTimeline(show) {
          set((s) => ({ ...s, showTimeline: show }));
        },

        setShowMatrix(show) {
          set((s) => ({ ...s, showMatrix: show }));
        },

        setIsLoading(loading) {
          set((s) => ({ ...s, isLoading: loading }));
        },

        setDisclosureLevel(level) {
          set((s) => ({ ...s, disclosureLevel: level }));
        },

        // -------------------------------------------------------------------
        // Persistence helpers
        // -------------------------------------------------------------------

        saveToLocalStorage() {
          // The persist middleware handles auto-save; this is an explicit trigger
          // that can be called imperatively. We touch `modified` to ensure the
          // middleware detects the change.
          set((s) => ({
            ...s,
            garden: s.garden ? { ...s.garden, modified: new Date() } : s.garden,
          }));
        },

        loadFromLocalStorage() {
          // The persist middleware rehydrates state automatically on mount.
          // This method is provided for explicit programmatic rehydration.
          const raw = localStorage.getItem('garden-planner');
          if (!raw) return;
          try {
            const parsed = JSON.parse(raw) as { state?: Partial<GardenStoreState> };
            if (parsed.state?.garden) {
              set((s) => ({
                ...s,
                garden: parsed.state!.garden as Garden,
                undoStack: [],
                redoStack: [],
              }));
            }
          } catch {
            // silently ignore parse errors
          }
        },

        exportAsJSON() {
          const garden = get().garden;
          return JSON.stringify(garden, null, 2);
        },

        importFromJSON(json) {
          try {
            const garden = JSON.parse(json) as Garden;
            // Coerce date strings back to Date objects
            if (typeof garden.created === 'string') {
              garden.created = new Date(garden.created);
            }
            if (typeof garden.modified === 'string') {
              garden.modified = new Date(garden.modified);
            }
            if (Array.isArray(garden.chat_history)) {
              garden.chat_history = garden.chat_history.map((m) => ({
                ...m,
                timestamp:
                  typeof m.timestamp === 'string' ? new Date(m.timestamp) : m.timestamp,
              }));
            }
            set((s) => ({
              ...s,
              garden,
              undoStack: [],
              redoStack: [],
            }));
          } catch (err) {
            console.error('[gardenStore] importFromJSON failed:', err);
            throw err;
          }
        },
      };
    },
    {
      name: 'garden-planner',
      // Persist only the garden data and essential UI preferences; omit
      // transient canvas interaction state and undo stacks.
      partialize: (state) => ({
        garden: state.garden,
        activePanelTab: state.activePanelTab,
        disclosureLevel: state.disclosureLevel,
        showPalette: state.showPalette,
        showTimeline: state.showTimeline,
        showMatrix: state.showMatrix,
        canvas: {
          zoom: state.canvas.zoom,
          panX: state.canvas.panX,
          panY: state.canvas.panY,
          showGrid: state.canvas.showGrid,
          showCompanions: state.canvas.showCompanions,
          showSunHeatmap: state.canvas.showSunHeatmap,
          snapToGrid: state.canvas.snapToGrid,
          // Transient drag/selection state is NOT persisted
          selectedZoneIds: [],
          draggingZoneId: null,
          resizingZoneId: null,
          resizeHandle: null,
          dragStartX: 0,
          dragStartY: 0,
        } satisfies CanvasState,
      }),
    },
  ),
);
