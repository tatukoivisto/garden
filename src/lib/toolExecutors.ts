/**
 * toolExecutors.ts — Tool executor registry for the garden planner AI.
 *
 * Each executor receives the current garden working copy and returns:
 * - result: data sent back to Gemini as the function response
 * - actions: AIAction[] accumulated and executed at end of loop
 *
 * Mutation executors also modify the working copy so subsequent
 * tool calls see the updated state.
 */

import type { Garden, Zone, AIAction, CropAssignment } from '@/types';
import { zoneTemplates } from '@/data/zones';
import { cropMap } from '@/data/crops';
import { areAntagonists, calcPlantQty } from '@/lib/ruleEngine';
import {
  findBestPosition,
  findOverlaps,
  checkBoundary,
  calculateBedDimensions,
  zoneToRect,
  type SemanticLocation,
} from '@/lib/spatialSolver';

function uuid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolExecResult {
  result: Record<string, unknown>;
  actions: AIAction[];
}

type ToolExecutor = (
  args: Record<string, unknown>,
  garden: Garden,
  selectedZoneIds: string[],
) => ToolExecResult;

// ---------------------------------------------------------------------------
// Fuzzy zone finder
// ---------------------------------------------------------------------------

function fuzzyFindZones(garden: Garden, query: string): Zone[] {
  const q = query.toLowerCase().trim();

  // Exact ID match
  const byId = garden.zones.find((z) => z.id === q);
  if (byId) return [byId];

  // Partial ID match (first 6 chars)
  const byPartialId = garden.zones.filter((z) => z.id.startsWith(q) || z.id.slice(0, 6) === q);
  if (byPartialId.length > 0) return byPartialId;

  // Name match (case-insensitive contains)
  const byName = garden.zones.filter((z) => z.name.toLowerCase().includes(q));
  if (byName.length > 0) return byName;

  // Type match
  const byType = garden.zones.filter((z) => z.type.toLowerCase().replace(/_/g, ' ').includes(q));
  if (byType.length > 0) return byType;

  return [];
}

function resolveZoneId(garden: Garden, id?: string, name?: string): Zone | null {
  if (id) {
    const zones = fuzzyFindZones(garden, id);
    if (zones.length > 0) return zones[0];
  }
  if (name) {
    const zones = fuzzyFindZones(garden, name);
    if (zones.length > 0) return zones[0];
  }
  return null;
}

/** Match AI-generated zone type strings to valid types. */
function resolveZoneType(raw: string | undefined): string {
  if (!raw) return 'raised_bed';
  if (zoneTemplates.find((t) => t.type === raw)) return raw;
  const normalized = raw.toLowerCase().replace(/[\s_-]/g, '');
  const match = zoneTemplates.find((t) => t.type.replace(/_/g, '') === normalized);
  return match?.type ?? 'custom';
}

function zoneSnapshot(z: Zone, garden: Garden) {
  const activeSeason = garden.seasons.find((s) => s.id === garden.active_season);
  const crops = activeSeason?.crop_assignments.find((a) => a.zone_id === z.id)?.crops ?? [];
  return {
    id: z.id,
    name: z.name,
    type: z.type,
    x_m: z.x_m,
    y_m: z.y_m,
    width_m: z.width_m,
    depth_m: z.depth_m,
    rotation_deg: z.rotation_deg,
    notes: z.notes || undefined,
    crops: crops.map((c) => `${c.crop_id}×${c.qty}`),
  };
}

// ---------------------------------------------------------------------------
// Tool executors
// ---------------------------------------------------------------------------

const getGardenState: ToolExecutor = (args, garden) => {
  const includeCrops = (args.include_crops ?? true) as boolean;
  const includeClimate = (args.include_climate ?? true) as boolean;

  const zones = garden.zones.map((z) => zoneSnapshot(z, garden));

  const totalZoneArea = garden.zones.reduce((sum, z) => sum + z.width_m * z.depth_m, 0);
  const gardenArea = garden.width_m * garden.depth_m;

  const result: Record<string, unknown> = {
    garden_name: garden.name,
    garden_width_m: garden.width_m,
    garden_depth_m: garden.depth_m,
    south_edge: garden.south_edge,
    coordinate_system: '(0,0) is top-left, x goes right, y goes down',
    zone_count: garden.zones.length,
    zones,
    free_area_m2: Math.round((gardenArea - totalZoneArea) * 100) / 100,
  };

  if (includeCrops) {
    const activeSeason = garden.seasons.find((s) => s.id === garden.active_season);
    result.season = activeSeason
      ? { year: activeSeason.year, season: activeSeason.season }
      : 'No active season';
    result.crop_assignments = activeSeason?.crop_assignments.map((a) => {
      const zone = garden.zones.find((z) => z.id === a.zone_id);
      return {
        zone_name: zone?.name ?? a.zone_id,
        crops: a.crops.map((c) => ({ crop_id: c.crop_id, qty: c.qty })),
      };
    }) ?? [];
  }

  if (includeClimate) {
    const c = garden.climate;
    result.climate = {
      location: c.location,
      usda_zone: c.usda_zone,
      soil_type: c.soil_type,
      soil_ph: c.soil_ph,
      last_frost: c.last_frost,
      first_frost: c.first_frost,
      growing_season_days: c.growing_season_days,
    };
  }

  return { result, actions: [] };
};

const findZone: ToolExecutor = (args, garden) => {
  const query = args.query as string;
  const found = fuzzyFindZones(garden, query);

  return {
    result: {
      found: found.length > 0,
      count: found.length,
      zones: found.map((z) => zoneSnapshot(z, garden)),
    },
    actions: [],
  };
};

const getAvailableSpace: ToolExecutor = (args, garden) => {
  const width = args.width_m as number;
  const depth = args.depth_m as number;
  const prefer = (args.prefer_location as SemanticLocation) ?? 'auto';
  const nearZoneId = args.near_zone_id as string | undefined;
  const minGap = (args.min_gap_m as number) ?? 0.3;

  const positions = findBestPosition(
    width, depth, garden.zones, garden.width_m, garden.depth_m,
    { prefer, nearZoneId, minGap },
  );

  return {
    result: {
      fits: positions.length > 0,
      best_position: positions[0] ? { x_m: positions[0].x_m, y_m: positions[0].y_m } : null,
      alternatives: positions.slice(1, 4).map((p) => ({
        x_m: p.x_m, y_m: p.y_m, reason: p.reason,
      })),
      garden_full: positions.length === 0,
    },
    actions: [],
  };
};

const checkPlacement: ToolExecutor = (args, garden) => {
  const rect = {
    x: args.x_m as number,
    y: args.y_m as number,
    w: args.width_m as number,
    h: args.depth_m as number,
  };
  const excludeId = args.exclude_zone_id as string | undefined;

  const overlaps = findOverlaps(rect, garden.zones, excludeId);
  const boundary = checkBoundary(rect, garden.width_m, garden.depth_m);

  const warnings: string[] = [];
  if (!boundary.inBounds) {
    warnings.push(`Zone extends outside garden boundary`);
  }

  return {
    result: {
      valid: overlaps.length === 0,
      overlaps: overlaps.map((o) => ({
        zone_id: o.zone_id,
        zone_name: o.zone_name,
        overlap_m2: o.overlap_m2,
      })),
      out_of_bounds: !boundary.inBounds,
      warnings,
    },
    actions: [],
  };
};

const calculateBedSize: ToolExecutor = (args) => {
  const crops = args.crops as Array<{ crop_id: string; qty: number }>;
  const maxWidth = (args.max_width_m as number) ?? 1.2;

  const result = calculateBedDimensions(crops, maxWidth);

  return { result: result as unknown as Record<string, unknown>, actions: [] };
};

const placeZone: ToolExecutor = (args, garden) => {
  const rawType = args.type as string;
  const resolvedType = resolveZoneType(rawType);
  const template = zoneTemplates.find((t) => t.type === resolvedType) ?? zoneTemplates[0];

  const name = (args.name as string) ?? template.label;
  const width = (args.width_m as number) ?? template.defaultWidth_m;
  const depth = (args.depth_m as number) ?? template.defaultDepth_m;
  const color = (args.color as string) ?? template.defaultColor;
  const notes = (args.notes as string) ?? '';

  // Determine position
  let x: number;
  let y: number;

  if (args.x_m !== undefined && args.y_m !== undefined) {
    // Explicit coordinates
    x = args.x_m as number;
    y = args.y_m as number;
  } else {
    // Semantic placement
    const location = (args.location as SemanticLocation) ?? 'auto';
    const nearZoneId = args.near_zone_id as string | undefined;
    const nearSide = args.near_side as string | undefined;
    const isOutsidePlacement = location.startsWith('outside-');

    const positions = findBestPosition(
      width, depth, garden.zones, garden.width_m, garden.depth_m,
      { prefer: location, nearZoneId, nearSide: nearSide as 'left' | 'right' | 'above' | 'below', allowOutside: isOutsidePlacement },
    );

    if (positions.length === 0) {
      return {
        result: {
          success: false,
          zone_id: null,
          error: `No space available for a ${width}m × ${depth}m zone. Try using resize_garden to expand the canvas, or use location "outside-right"/"outside-below" to place it beyond the garden boundary.`,
        },
        actions: [],
      };
    }

    x = positions[0].x_m;
    y = positions[0].y_m;
  }

  // Validate placement
  const overlaps = findOverlaps(
    { x, y, w: width, h: depth },
    garden.zones,
  );

  if (overlaps.length > 0) {
    // Try to auto-resolve by finding nearby valid position
    const positions = findBestPosition(
      width, depth, garden.zones, garden.width_m, garden.depth_m,
      { prefer: 'auto' },
    );
    if (positions.length > 0) {
      x = positions[0].x_m;
      y = positions[0].y_m;
    } else {
      return {
        result: {
          success: false,
          zone_id: null,
          error: `Position (${x}, ${y}) overlaps with ${overlaps.map((o) => o.zone_name).join(', ')}. No alternative position found.`,
        },
        actions: [],
      };
    }
  }

  const zoneId = uuid();
  const zone: Zone = {
    id: zoneId,
    type: resolvedType as Zone['type'],
    category: template.category,
    name,
    x_m: x,
    y_m: y,
    width_m: width,
    depth_m: depth,
    rotation_deg: 0,
    shape: template.defaultShape,
    color,
    locked: false,
    notes,
    health_history: [],
    photos: [],
  };

  // Add to working copy
  garden.zones.push(zone);

  return {
    result: {
      success: true,
      zone_id: zoneId,
      zone_name: name,
      placed_at: { x_m: x, y_m: y },
      actual_width_m: width,
      actual_depth_m: depth,
    },
    actions: [
      {
        type: 'add_zone',
        description: `Add ${name} at (${x}, ${y})`,
        payload: {
          type: resolvedType,
          name,
          x_m: x,
          y_m: y,
          width_m: width,
          depth_m: depth,
          color,
          notes,
        },
      },
    ],
  };
};

const modifyZone: ToolExecutor = (args, garden) => {
  const zoneId = args.zone_id as string;
  const zone = resolveZoneId(garden, zoneId);

  if (!zone) {
    return {
      result: { success: false, error: `Zone not found: ${zoneId}` },
      actions: [],
    };
  }

  const changes: string[] = [];
  const actions: AIAction[] = [];

  // --- Resize ---
  if (args.width_m !== undefined || args.depth_m !== undefined) {
    const newW = (args.width_m as number) ?? zone.width_m;
    const newD = (args.depth_m as number) ?? zone.depth_m;
    zone.width_m = newW;
    zone.depth_m = newD;
    changes.push(`Resized to ${newW}m × ${newD}m`);
    actions.push({
      type: 'resize_zone',
      description: `Resize ${zone.name} to ${newW}m × ${newD}m`,
      payload: { id: zone.id, width_m: newW, depth_m: newD },
    });
  }

  // --- Move (semantic or explicit) ---
  if (args.move_to_location !== undefined) {
    const location = args.move_to_location as SemanticLocation;
    const zr = zoneToRect(zone);
    const positions = findBestPosition(
      zr.w, zr.h, garden.zones, garden.width_m, garden.depth_m,
      { prefer: location, excludeZoneId: zone.id },
    );
    if (positions.length > 0) {
      zone.x_m = positions[0].x_m;
      zone.y_m = positions[0].y_m;
      changes.push(`Moved to ${location} (${positions[0].x_m}, ${positions[0].y_m})`);
      actions.push({
        type: 'move_zone',
        description: `Move ${zone.name} to ${location}`,
        payload: { id: zone.id, x_m: positions[0].x_m, y_m: positions[0].y_m },
      });
    } else {
      changes.push(`Could not find valid position for ${location}`);
    }
  } else if (args.move_to_x_m !== undefined && args.move_to_y_m !== undefined) {
    const newX = args.move_to_x_m as number;
    const newY = args.move_to_y_m as number;
    const zr = zoneToRect(zone);
    const overlaps = findOverlaps(
      { x: newX, y: newY, w: zr.w, h: zr.h },
      garden.zones,
      zone.id,
    );
    if (overlaps.length > 0) {
      return {
        result: {
          success: false,
          zone_name: zone.name,
          error: `Moving to (${newX}, ${newY}) would overlap with ${overlaps.map((o) => o.zone_name).join(', ')}`,
          overlaps,
        },
        actions: [],
      };
    }
    zone.x_m = newX;
    zone.y_m = newY;
    changes.push(`Moved to (${newX}, ${newY})`);
    actions.push({
      type: 'move_zone',
      description: `Move ${zone.name} to (${newX}, ${newY})`,
      payload: { id: zone.id, x_m: newX, y_m: newY },
    });
  }

  // --- Rename ---
  if (args.name !== undefined) {
    const newName = args.name as string;
    zone.name = newName;
    changes.push(`Renamed to "${newName}"`);
    actions.push({
      type: 'rename_zone',
      description: `Rename to ${newName}`,
      payload: { id: zone.id, name: newName },
    });
  }

  // --- Rotate ---
  if (args.rotate === true) {
    zone.rotation_deg = zone.rotation_deg === 0 ? 90 : 0;
    changes.push(`Rotated to ${zone.rotation_deg}°`);
    actions.push({
      type: 'rotate_zone',
      description: `Rotate ${zone.name}`,
      payload: { id: zone.id },
    });
  }

  // --- Notes ---
  if (args.notes !== undefined) {
    zone.notes = args.notes as string;
    changes.push('Updated notes');
  }

  return {
    result: {
      success: changes.length > 0,
      zone_name: zone.name,
      zone_id: zone.id,
      changes,
      current_position: { x_m: zone.x_m, y_m: zone.y_m },
      current_size: { width_m: zone.width_m, depth_m: zone.depth_m },
    },
    actions,
  };
};

const removeZone: ToolExecutor = (args, garden) => {
  const zone = resolveZoneId(garden, args.zone_id as string, args.zone_name as string);

  if (!zone) {
    return {
      result: {
        success: false,
        error: `Zone not found: ${args.zone_id ?? args.zone_name}`,
      },
      actions: [],
    };
  }

  // Remove from working copy
  const idx = garden.zones.findIndex((z) => z.id === zone.id);
  if (idx >= 0) garden.zones.splice(idx, 1);

  return {
    result: {
      success: true,
      removed_zone_name: zone.name,
      removed_zone_id: zone.id,
    },
    actions: [
      {
        type: 'remove_zone',
        description: `Remove ${zone.name}`,
        payload: { id: zone.id },
      },
    ],
  };
};

const assignCrops: ToolExecutor = (args, garden) => {
  const zoneId = args.zone_id as string;
  const zone = resolveZoneId(garden, zoneId);

  if (!zone) {
    return {
      result: { success: false, error: `Zone not found: ${zoneId}` },
      actions: [],
    };
  }

  const requestedCrops = args.crops as Array<{ crop_id: string; qty: number }>;
  const assigned: Array<{ crop_id: string; qty: number; fits: boolean }> = [];
  const companionWarnings: string[] = [];

  // Check capacity
  for (const { crop_id, qty } of requestedCrops) {
    const crop = cropMap[crop_id.toLowerCase()];
    if (crop) {
      const maxQty = calcPlantQty(crop, zone);
      assigned.push({ crop_id, qty, fits: qty <= maxQty });
    } else {
      assigned.push({ crop_id, qty, fits: true }); // unknown crop, allow
    }
  }

  // Check companion conflicts between assigned crops
  const cropIds = requestedCrops.map((c) => c.crop_id.toLowerCase());
  for (let i = 0; i < cropIds.length; i++) {
    for (let j = i + 1; j < cropIds.length; j++) {
      if (areAntagonists(cropIds[i], cropIds[j])) {
        companionWarnings.push(`${cropIds[i]} conflicts with ${cropIds[j]}`);
      }
    }
  }

  const cropAssignments: CropAssignment[] = requestedCrops.map((c) => ({
    crop_id: c.crop_id,
    qty: c.qty,
  }));

  return {
    result: {
      success: true,
      zone_name: zone.name,
      zone_id: zone.id,
      assigned,
      companion_warnings: companionWarnings,
    },
    actions: [
      {
        type: 'assign_crops',
        description: `Assign crops to ${zone.name}`,
        payload: { zoneId: zone.id, crops: cropAssignments },
      },
    ],
  };
};

const updateClimate: ToolExecutor = (args, garden) => {
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value !== undefined) updates[key] = value;
  }

  return {
    result: {
      success: true,
      updated_fields: Object.keys(updates),
    },
    actions: [
      {
        type: 'update_climate',
        description: 'Update climate settings',
        payload: updates,
      },
    ],
  };
};

const resizeGarden: ToolExecutor = (args) => {
  const width = args.width_m as number;
  const depth = args.depth_m as number;

  return {
    result: {
      success: true,
      new_width_m: width,
      new_depth_m: depth,
    },
    actions: [
      {
        type: 'resize_garden',
        description: `Resize garden to ${width}m × ${depth}m`,
        payload: { width_m: width, depth_m: depth },
      },
    ],
  };
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const TOOL_REGISTRY: Record<string, ToolExecutor> = {
  get_garden_state: getGardenState,
  find_zone: findZone,
  get_available_space: getAvailableSpace,
  check_placement: checkPlacement,
  calculate_bed_size: calculateBedSize,
  place_zone: placeZone,
  modify_zone: modifyZone,
  remove_zone: removeZone,
  assign_crops: assignCrops,
  update_climate: updateClimate,
  resize_garden: resizeGarden,
};
