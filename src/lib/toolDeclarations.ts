/**
 * toolDeclarations.ts — Gemini function declarations for the garden planner AI tools.
 *
 * These JSON schemas are sent to the Gemini API so it can call our tools.
 */

export const TOOL_DECLARATIONS = [
  {
    functionDeclarations: [
      // ── QUERY TOOLS ──────────────────────────────────────────────────────────
      {
        name: 'get_garden_state',
        description:
          'Get the current garden layout including all zones, their positions, sizes, and assigned crops. Call this first to understand the garden before making changes.',
        parameters: {
          type: 'object',
          properties: {
            include_crops: {
              type: 'boolean',
              description: 'Include crop assignments (default true)',
            },
            include_climate: {
              type: 'boolean',
              description: 'Include climate info (default true)',
            },
          },
        },
      },
      {
        name: 'find_zone',
        description:
          'Find a zone by name, type, or partial ID. Use when the user refers to a zone by name or description.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Zone name, type, or partial ID to search for',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_available_space',
        description:
          'Find where a zone of the given size can fit without overlapping existing zones. Returns the best position and alternatives.',
        parameters: {
          type: 'object',
          properties: {
            width_m: { type: 'number', description: 'Zone width in meters' },
            depth_m: { type: 'number', description: 'Zone depth in meters' },
            prefer_location: {
              type: 'string',
              enum: [
                'auto',
                'top-left',
                'top-right',
                'bottom-left',
                'bottom-right',
                'center',
                'next-to',
              ],
              description: 'Preferred placement area',
            },
            near_zone_id: {
              type: 'string',
              description: 'For next-to placement, the zone ID to place near',
            },
            min_gap_m: {
              type: 'number',
              description: 'Minimum gap from other zones in meters (default 0.3)',
            },
          },
          required: ['width_m', 'depth_m'],
        },
      },

      // ── VALIDATION TOOLS ─────────────────────────────────────────────────────
      {
        name: 'check_placement',
        description:
          'Check if placing a zone at specific coordinates would overlap existing zones or go out of bounds.',
        parameters: {
          type: 'object',
          properties: {
            x_m: { type: 'number', description: 'X position in meters' },
            y_m: { type: 'number', description: 'Y position in meters' },
            width_m: { type: 'number', description: 'Width in meters' },
            depth_m: { type: 'number', description: 'Depth in meters' },
            exclude_zone_id: {
              type: 'string',
              description: 'Zone ID to exclude from overlap check (for move operations)',
            },
          },
          required: ['x_m', 'y_m', 'width_m', 'depth_m'],
        },
      },
      {
        name: 'calculate_bed_size',
        description:
          'Calculate the optimal bed dimensions for given crops and quantities based on plant spacing requirements.',
        parameters: {
          type: 'object',
          properties: {
            crops: {
              type: 'array',
              description: 'Crops and quantities to fit',
              items: {
                type: 'object',
                properties: {
                  crop_id: { type: 'string', description: 'Crop identifier (e.g. "tomato", "asparagus")' },
                  qty: { type: 'number', description: 'Number of plants' },
                },
                required: ['crop_id', 'qty'],
              },
            },
            max_width_m: {
              type: 'number',
              description: 'Maximum bed width in meters (default 1.2)',
            },
          },
          required: ['crops'],
        },
      },

      // ── MUTATION TOOLS ───────────────────────────────────────────────────────
      {
        name: 'place_zone',
        description:
          'Place a new zone in the garden. Use semantic location (top-left, next-to, etc.) to let the system calculate optimal coordinates, or provide explicit x_m/y_m. Built-in overlap detection.',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description:
                'Zone type: raised_bed, in_ground_bed, strawberry_bed, three_sisters, herb_spiral, perennial_bed, propagation_bed, experimental_bed, wildflower_strip, green_manure_strip, container, greenhouse, cold_frame, polytunnel, compost_station, tool_store, seating_area, water_barrel, path, gate, fence, or custom',
            },
            name: { type: 'string', description: 'Display name for the zone' },
            x_m: { type: 'number', description: 'Explicit X position (optional if using location)' },
            y_m: { type: 'number', description: 'Explicit Y position (optional if using location)' },
            location: {
              type: 'string',
              enum: ['auto', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'center', 'next-to', 'outside-right', 'outside-below', 'outside-left', 'outside-above'],
              description: 'Semantic placement. Use outside-* to place a new area beyond the garden boundary (e.g. a separate forest garden, orchard, etc.)',
            },
            near_zone_id: {
              type: 'string',
              description: 'For next-to placement, the zone to place near',
            },
            near_side: {
              type: 'string',
              enum: ['left', 'right', 'above', 'below'],
              description: 'Which side of the near_zone to place on',
            },
            width_m: { type: 'number', description: 'Width in meters (defaults from zone template)' },
            depth_m: { type: 'number', description: 'Depth in meters (defaults from zone template)' },
            color: { type: 'string', description: 'Hex color (defaults from zone template)' },
            notes: { type: 'string', description: 'Notes about the zone' },
          },
          required: ['type', 'name'],
        },
      },
      {
        name: 'modify_zone',
        description:
          'Move, resize, rename, or rotate an existing zone. Only include fields you want to change. Validates that changes do not cause overlaps.',
        parameters: {
          type: 'object',
          properties: {
            zone_id: { type: 'string', description: 'Zone ID to modify' },
            move_to_x_m: { type: 'number', description: 'New X position' },
            move_to_y_m: { type: 'number', description: 'New Y position' },
            move_to_location: {
              type: 'string',
              enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'],
              description: 'Semantic position to move to (alternative to explicit coordinates)',
            },
            width_m: { type: 'number', description: 'New width in meters' },
            depth_m: { type: 'number', description: 'New depth in meters' },
            name: { type: 'string', description: 'New display name' },
            rotate: { type: 'boolean', description: 'Toggle rotation 0/90 degrees' },
            notes: { type: 'string', description: 'New notes' },
          },
          required: ['zone_id'],
        },
      },
      {
        name: 'remove_zone',
        description: 'Remove a zone from the garden by ID or name.',
        parameters: {
          type: 'object',
          properties: {
            zone_id: { type: 'string', description: 'Zone ID to remove' },
            zone_name: {
              type: 'string',
              description: 'Alternative: remove by fuzzy name match',
            },
          },
        },
      },
      {
        name: 'assign_crops',
        description:
          'Assign crops to a zone. Returns capacity and companion planting warnings.',
        parameters: {
          type: 'object',
          properties: {
            zone_id: { type: 'string', description: 'Zone ID to assign crops to' },
            crops: {
              type: 'array',
              description: 'Crops to assign',
              items: {
                type: 'object',
                properties: {
                  crop_id: { type: 'string', description: 'Crop identifier' },
                  qty: { type: 'number', description: 'Number of plants' },
                },
                required: ['crop_id', 'qty'],
              },
            },
          },
          required: ['zone_id', 'crops'],
        },
      },
      {
        name: 'update_climate',
        description: 'Update the garden climate configuration.',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string' },
            usda_zone: { type: 'string' },
            soil_type: { type: 'string' },
            soil_ph: { type: 'number' },
            last_frost: { type: 'string', description: 'Last frost date MM-DD' },
            first_frost: { type: 'string', description: 'First frost date MM-DD' },
          },
        },
      },
      {
        name: 'resize_garden',
        description: 'Resize the main garden canvas/boundary. Use this to expand the garden area when new zones need more space, or to accommodate additional garden areas.',
        parameters: {
          type: 'object',
          properties: {
            width_m: { type: 'number', description: 'New garden width in meters' },
            depth_m: { type: 'number', description: 'New garden depth in meters' },
          },
          required: ['width_m', 'depth_m'],
        },
      },
    ],
  },
];
