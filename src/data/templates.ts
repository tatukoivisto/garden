/**
 * Built-in garden templates for the Kitchen Garden Planner.
 *
 * Each template ships with a pre-configured Garden skeleton (zones, bed
 * system, rough size) and SVG preview data used by the StartScreen gallery.
 *
 * The flagship template is the Salo Kitchen Garden (22 × 15 m), a real-world
 * Finnish allotment layout with greenhouse, raised beds, herb spiral and more.
 */

import type { GardenTemplate, Zone } from '@/types';

// ---------------------------------------------------------------------------
// SVG thumbnail helpers
// ---------------------------------------------------------------------------

interface ThumbRect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  rx?: number;
}

interface ThumbEllipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill: string;
}

/** Returns a minimal inline SVG data-URI for use in template gallery cards. */
function makeSvgThumbnail(
  rects: ThumbRect[],
  ellipses: ThumbEllipse[] = [],
): string {
  const rectShapes = rects
    .map(
      (r) =>
        `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${r.fill}" rx="${r.rx ?? 2}"/>`,
    )
    .join('');
  const ellipseShapes = ellipses
    .map(
      (e) =>
        `<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" fill="${e.fill}"/>`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80">
  <rect width="120" height="80" fill="#F5F0E8" rx="4"/>
  ${rectShapes}${ellipseShapes}
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ---------------------------------------------------------------------------
// Zone factory helpers – produce fully-typed Zone objects
// ---------------------------------------------------------------------------

type ZoneInit = Omit<Zone, 'health_history' | 'photos' | 'locked'> &
  Partial<Pick<Zone, 'locked'>>;

function z(init: ZoneInit): Zone {
  return {
    locked: false,
    health_history: [],
    photos: [],
    ...init,
  };
}

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

export const gardenTemplates: GardenTemplate[] = [
  // ── 1. FLAGSHIP – Salo Kitchen Garden 22 × 15 m ──────────────────────────
  {
    id: 'salo_kitchen_22x15',
    name: 'Salo Kitchen Garden 22×15m',
    description:
      'The flagship Finnish kitchen-garden layout. A full-scale 22 × 15 m allotment with greenhouse, cold frame, six 30-inch market-garden beds, strawberry bed, Three Sisters block, herb spiral, propagation nursery, experimental bed, rhubarb & comfrey corner, perennial crops, tool store, compost, seating area, wildflower strip and green-manure strip.',
    tags: ['flagship', 'kitchen-garden', 'finnish', 'market-garden', '22x15'],
    thumbnail: makeSvgThumbnail(
      [
        // Greenhouse (west side, top)
        { x: 2,  y: 2,  w: 20, h: 44, fill: '#81D4FA' },
        // Cold frame
        { x: 25, y: 2,  w: 10, h: 14, fill: '#90CAF9' },
        // Six raised beds (centre block)
        { x: 25, y: 20, w: 56, h: 5,  fill: '#A5D6A7' },
        { x: 25, y: 27, w: 56, h: 5,  fill: '#C8E6C9' },
        { x: 25, y: 34, w: 56, h: 5,  fill: '#A5D6A7' },
        { x: 25, y: 41, w: 56, h: 5,  fill: '#C8E6C9' },
        { x: 25, y: 48, w: 56, h: 5,  fill: '#A5D6A7' },
        { x: 25, y: 55, w: 56, h: 5,  fill: '#C8E6C9' },
        // Strawberry bed (south)
        { x: 25, y: 63, w: 35, h: 9,  fill: '#FFCDD2' },
        // Three Sisters (south-east)
        { x: 63, y: 63, w: 18, h: 9,  fill: '#DCEDC8' },
        // Perennial crops (NE corner)
        { x: 84, y: 2,  w: 34, h: 20, fill: '#C8E6C9' },
        // Tool store (east)
        { x: 84, y: 25, w: 34, h: 14, fill: '#BCAAA4' },
        // Compost (east, below tool store)
        { x: 84, y: 42, w: 34, h: 12, fill: '#FFCC80' },
        // Seating area (NW corner, by gate)
        { x: 2,  y: 49, w: 20, h: 10, fill: '#EFEBE9' },
        // Gate
        { x: 2,  y: 62, w: 8,  h: 5,  fill: '#A1887F' },
        // Wildflower strip (south boundary)
        { x: 2,  y: 72, w: 116, h: 6, fill: '#F1F8E9' },
        // Green manure strip (north boundary)
        { x: 2,  y: 2,  w: 0,  h: 0,  fill: 'transparent' }, // placeholder kept for alignment
      ],
      [
        // Herb spiral (between greenhouse and beds)
        { cx: 18, cy: 13, rx: 8, ry: 6, fill: '#CE93D8' },
      ],
    ),
    garden: {
      name: 'Salo Kitchen Garden',
      width_m: 15,
      depth_m: 22,
      south_edge: 'top',
      bed_system: 'market_30in',
      unit_system: 'metric',
      zones: [
        // ── Greenhouse (west side) ──────────────────────────────────────────
        z({
          id: 'salo_greenhouse',
          type: 'greenhouse',
          category: 'structure',
          name: 'Greenhouse',
          x_m: 0,
          y_m: 12,
          width_m: 3,
          depth_m: 10,
          rotation_deg: 0,
          shape: 'rect',
          color: '#81D4FA',
          notes: '3 × 10 m unheated glass greenhouse, tomatoes & cucumbers',
        }),

        // ── Cold Frame ──────────────────────────────────────────────────────
        z({
          id: 'salo_cold_frame',
          type: 'cold_frame',
          category: 'structure',
          name: 'Cold Frame',
          x_m: 3.5,
          y_m: 18,
          width_m: 1.5,
          depth_m: 4,
          rotation_deg: 0,
          shape: 'rect',
          color: '#90CAF9',
          notes: 'Cold frame for hardening off seedlings',
        }),

        // ── Six 30-inch market-garden beds (A–F) ───────────────────────────
        // Beds run east-west; 9 m long × 0.76 m (30 in) wide; 0.3 m paths between.
        // x origin at 3.5 m (east of greenhouse), beds stacked south-to-north
        // starting at y = 1.5 m with 1.06 m pitch (0.76 + 0.30).
        ...(['A', 'B', 'C', 'D', 'E', 'F'] as const).map((letter, i) =>
          z({
            id: `salo_bed_${letter.toLowerCase()}`,
            type: 'raised_bed',
            category: 'growing',
            name: `Bed ${letter}`,
            x_m: 3.5,
            y_m: 1.5 + i * 1.06,
            width_m: 9,
            depth_m: 0.76,
            rotation_deg: 0,
            shape: 'rect',
            color: i % 2 === 0 ? '#A5D6A7' : '#C8E6C9',
            notes: '30-inch market-garden bed',
          }),
        ),

        // ── Strawberry bed (south side) ─────────────────────────────────────
        z({
          id: 'salo_strawberry',
          type: 'strawberry_bed',
          category: 'growing',
          name: 'Strawberry Bed',
          x_m: 0,
          y_m: 0,
          width_m: 6,
          depth_m: 2,
          rotation_deg: 0,
          shape: 'rect',
          color: '#FFCDD2',
          notes: 'Everbearing strawberries – Senga Sengana & Polka',
        }),

        // ── Three Sisters block (south) ─────────────────────────────────────
        z({
          id: 'salo_three_sisters',
          type: 'three_sisters',
          category: 'growing',
          name: 'Three Sisters',
          x_m: 7,
          y_m: 0,
          width_m: 3.6,
          depth_m: 2,
          rotation_deg: 0,
          shape: 'rect',
          color: '#DCEDC8',
          notes: 'Sweetcorn, climbing beans, butternut squash',
        }),

        // ── Herb Spiral (between greenhouse and main beds) ──────────────────
        z({
          id: 'salo_herb_spiral',
          type: 'herb_spiral',
          category: 'growing',
          name: 'Herb Spiral',
          x_m: 0,
          y_m: 8,
          width_m: 2.8,
          depth_m: 3.6,
          rotation_deg: 0,
          shape: 'ellipse',
          color: '#CE93D8',
          notes: 'Stone spiral – thyme & sage at top, chives & parsley at base',
        }),

        // ── Propagation Nursery (west side, mid) ───────────────────────────
        z({
          id: 'salo_propagation',
          type: 'propagation_bed',
          category: 'growing',
          name: 'Propagation Nursery',
          x_m: 0,
          y_m: 4.5,
          width_m: 3,
          depth_m: 2.5,
          rotation_deg: 0,
          shape: 'rect',
          color: '#C8E6C9',
          notes: 'Seedling trays, plug plants, potting bench',
        }),

        // ── Experimental Bed (west, below propagation) ─────────────────────
        z({
          id: 'salo_experimental',
          type: 'experimental_bed',
          category: 'growing',
          name: 'Experimental Bed',
          x_m: 0,
          y_m: 7.2,
          width_m: 3,
          depth_m: 2.2,
          rotation_deg: 0,
          shape: 'rect',
          color: '#E1BEE7',
          notes: 'Trial varieties, new cultivars, soil-amendment tests',
        }),

        // ── Rhubarb & Comfrey (west, below experimental) ───────────────────
        z({
          id: 'salo_rhubarb_comfrey',
          type: 'perennial_bed',
          category: 'growing',
          name: 'Rhubarb & Comfrey',
          x_m: 0,
          y_m: 9.6,
          width_m: 3,
          depth_m: 1.9,
          rotation_deg: 0,
          shape: 'rect',
          color: '#C8E6C9',
          notes: 'Rhubarb crowns + comfrey for liquid feed and mulch',
        }),

        // ── Perennial Crops (NE corner) ─────────────────────────────────────
        z({
          id: 'salo_perennial_crops',
          type: 'perennial_bed',
          category: 'growing',
          name: 'Perennial Crops',
          x_m: 12,
          y_m: 17.2,
          width_m: 3,
          depth_m: 4.8,
          rotation_deg: 0,
          shape: 'rect',
          color: '#C8E6C9',
          notes: 'Asparagus, artichoke, lovage, sorrel',
        }),

        // ── Tool Store (east side) ──────────────────────────────────────────
        z({
          id: 'salo_tool_store',
          type: 'tool_store',
          category: 'structure',
          name: 'Tool Store',
          x_m: 12,
          y_m: 12,
          width_m: 3,
          depth_m: 2.3,
          rotation_deg: 0,
          shape: 'rect',
          color: '#BCAAA4',
          locked: true,
          notes: 'Timber shed – tools, irrigation kit, seeds',
        }),

        // ── Compost Station (east, below tool store) ────────────────────────
        z({
          id: 'salo_compost',
          type: 'compost_station',
          category: 'structure',
          name: 'Compost',
          x_m: 12,
          y_m: 14.6,
          width_m: 3,
          depth_m: 2.1,
          rotation_deg: 0,
          shape: 'rect',
          color: '#FFCC80',
          notes: 'Three-bay compost system – hot/active/mature',
        }),

        // ── Seating Area (NW corner by gate) ────────────────────────────────
        z({
          id: 'salo_seating',
          type: 'seating_area',
          category: 'structure',
          name: 'Seating Area',
          x_m: 0,
          y_m: 20.1,
          width_m: 4,
          depth_m: 1.9,
          rotation_deg: 0,
          shape: 'rect',
          color: '#EFEBE9',
          notes: 'Hardwood bench and table, sheltered spot',
        }),

        // ── Wildflower Strip (south boundary, full width) ───────────────────
        z({
          id: 'salo_wildflower',
          type: 'wildflower_strip',
          category: 'growing',
          name: 'Wildflower Strip',
          x_m: 0,
          y_m: 21,
          width_m: 15,
          depth_m: 1.2,
          rotation_deg: 0,
          shape: 'rect',
          color: '#F1F8E9',
          notes: 'Native wildflower mix – cornflower, poppy, phacelia for pollinators',
        }),

        // ── Green Manure Strip (north boundary, full width) ─────────────────
        z({
          id: 'salo_green_manure',
          type: 'green_manure_strip',
          category: 'growing',
          name: 'Green Manure Strip',
          x_m: 0,
          y_m: 0,
          width_m: 15,
          depth_m: 1,
          rotation_deg: 0,
          shape: 'rect',
          color: '#F1F8E9',
          notes: 'Winter rye / phacelia / clover rotation',
        }),

        // ── Gate (NW corner, bottom-left of garden) ─────────────────────────
        z({
          id: 'salo_gate',
          type: 'gate',
          category: 'structure',
          name: 'Gate',
          x_m: 0,
          y_m: 20,
          width_m: 1.2,
          depth_m: 1,
          rotation_deg: 0,
          shape: 'rect',
          color: '#A1887F',
          locked: true,
          notes: 'Main entrance gate – faces access track',
        }),
      ],
    },
  },

  // ── 2. Beginner 4 × 8 Raised Bed ─────────────────────────────────────────
  {
    id: 'beginner_4x8',
    name: 'Beginner 4×8 Raised Bed',
    description:
      'A single 4 × 8 ft (1.2 × 2.4 m) raised bed with access paths on all sides. The ideal first garden – easy to build, easy to manage.',
    tags: ['beginner', 'small', 'raised-bed'],
    thumbnail: makeSvgThumbnail([
      { x: 20, y: 10, w: 80, h: 60, fill: '#A5D6A7' },
      { x: 5,  y: 10, w: 13, h: 60, fill: '#E8E0C8' },  // left path
      { x: 102, y: 10, w: 13, h: 60, fill: '#E8E0C8' }, // right path
      { x: 5,  y: 5,  w: 110, h: 3,  fill: '#E8E0C8' }, // top path
      { x: 5,  y: 72, w: 110, h: 3,  fill: '#E8E0C8' }, // bottom path
    ]),
    garden: {
      name: 'Beginner Garden',
      width_m: 5,
      depth_m: 9,
      south_edge: 'top',
      bed_system: 'metric',
      unit_system: 'metric',
      zones: [
        z({
          id: 'beg_bed_a',
          type: 'raised_bed',
          category: 'growing',
          name: 'Raised Bed',
          x_m: 0.6,
          y_m: 0.6,
          width_m: 1.2,
          depth_m: 2.4,
          rotation_deg: 0,
          shape: 'rect',
          color: '#A5D6A7',
          notes: '4 × 8 ft starter raised bed',
        }),
        z({
          id: 'beg_path_l',
          type: 'path',
          category: 'structure',
          name: 'Left Path',
          x_m: 0,
          y_m: 0,
          width_m: 0.5,
          depth_m: 9,
          rotation_deg: 0,
          shape: 'rect',
          color: '#E8E0C8',
          locked: true,
          notes: '',
        }),
        z({
          id: 'beg_path_r',
          type: 'path',
          category: 'structure',
          name: 'Right Path',
          x_m: 2,
          y_m: 0,
          width_m: 0.5,
          depth_m: 9,
          rotation_deg: 0,
          shape: 'rect',
          color: '#E8E0C8',
          locked: true,
          notes: '',
        }),
      ],
    },
  },

  // ── 3. Beginner 20 × 20 Plot ──────────────────────────────────────────────
  {
    id: 'beginner_20x20',
    name: 'Beginner 20×20 Plot',
    description:
      'Four generously-sized raised beds separated by 60 cm access paths – a classic allotment starter layout for a 20 × 20 m plot.',
    tags: ['beginner', 'medium'],
    thumbnail: makeSvgThumbnail([
      // 4 beds in a 2×2 grid
      { x: 5,  y: 5,  w: 52, h: 34, fill: '#A5D6A7' },
      { x: 63, y: 5,  w: 52, h: 34, fill: '#C8E6C9' },
      { x: 5,  y: 43, w: 52, h: 34, fill: '#C8E6C9' },
      { x: 63, y: 43, w: 52, h: 34, fill: '#A5D6A7' },
      // centre cross paths
      { x: 57, y: 5,  w: 6,  h: 72, fill: '#E8E0C8' },
      { x: 5,  y: 39, w: 110, h: 4, fill: '#E8E0C8' },
    ]),
    garden: {
      name: 'Beginner Plot',
      width_m: 20,
      depth_m: 20,
      south_edge: 'top',
      bed_system: 'metric',
      unit_system: 'metric',
      zones: [
        // 4 beds (each ~8.7 × 9.2 m with 0.6 m paths between)
        ...(['NW', 'NE', 'SW', 'SE'] as const).map((pos, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          return z({
            id: `b20_bed_${pos.toLowerCase()}`,
            type: 'raised_bed' as const,
            category: 'growing' as const,
            name: `Bed ${pos}`,
            x_m: col * 9.7,
            y_m: row * 9.8,
            width_m: 9.1,
            depth_m: 9.2,
            rotation_deg: 0 as const,
            shape: 'rect' as const,
            color: (i % 2 === 0) ? '#A5D6A7' : '#C8E6C9',
            notes: 'Large allotment bed – rotate crops annually',
          });
        }),
        // central cross path (horizontal)
        z({
          id: 'b20_path_h',
          type: 'path',
          category: 'structure',
          name: 'Centre Path (H)',
          x_m: 0,
          y_m: 9.7,
          width_m: 20,
          depth_m: 0.6,
          rotation_deg: 0,
          shape: 'rect',
          color: '#E8E0C8',
          locked: true,
          notes: '',
        }),
        // central cross path (vertical)
        z({
          id: 'b20_path_v',
          type: 'path',
          category: 'structure',
          name: 'Centre Path (V)',
          x_m: 9.7,
          y_m: 0,
          width_m: 0.6,
          depth_m: 20,
          rotation_deg: 0,
          shape: 'rect',
          color: '#E8E0C8',
          locked: true,
          notes: '',
        }),
      ],
    },
  },

  // ── 4. Small Kitchen Garden 3 × 6 m ──────────────────────────────────────
  {
    id: 'small_kitchen_3x6',
    name: 'Small Kitchen Garden 3×6',
    description:
      'Compact patio or balcony kitchen garden in just 3 × 6 m. Combines containers, a small raised bed and an herb spiral to maximise yield in a tight urban space.',
    tags: ['small', 'patio', 'balcony'],
    thumbnail: makeSvgThumbnail(
      [
        // raised bed (rear)
        { x: 5,  y: 5,  w: 110, h: 30, fill: '#A5D6A7' },
        // containers (front row)
        { x: 5,  y: 45, w: 20, h: 20, fill: '#A5D6A7' },
        { x: 30, y: 45, w: 20, h: 20, fill: '#DCEDC8' },
        { x: 55, y: 45, w: 20, h: 20, fill: '#FFCDD2' },
        { x: 80, y: 45, w: 20, h: 20, fill: '#A5D6A7' },
        { x: 105, y: 45, w: 10, h: 20, fill: '#DCEDC8' },
      ],
      [
        // herb spiral (centre)
        { cx: 90, cy: 22, rx: 16, ry: 12, fill: '#CE93D8' },
      ],
    ),
    garden: {
      name: 'Patio Kitchen Garden',
      width_m: 3,
      depth_m: 6,
      south_edge: 'top',
      bed_system: 'metric',
      unit_system: 'metric',
      zones: [
        z({
          id: 'patio_raised_bed',
          type: 'raised_bed',
          category: 'growing',
          name: 'Main Raised Bed',
          x_m: 0,
          y_m: 3.5,
          width_m: 3,
          depth_m: 1.2,
          rotation_deg: 0,
          shape: 'rect',
          color: '#A5D6A7',
          notes: 'Salad leaves, radishes, spring onions',
        }),
        z({
          id: 'patio_herb_spiral',
          type: 'herb_spiral',
          category: 'growing',
          name: 'Herb Spiral',
          x_m: 0.1,
          y_m: 0.5,
          width_m: 1.4,
          depth_m: 1.8,
          rotation_deg: 0,
          shape: 'ellipse',
          color: '#CE93D8',
          notes: 'Basil, thyme, rosemary, chives, parsley',
        }),
        // Four containers along the south edge
        ...(['Tomato', 'Pepper', 'Courgette', 'Kale'] as const).map((name, i) =>
          z({
            id: `patio_container_${i}`,
            type: 'container' as const,
            category: 'growing' as const,
            name,
            x_m: i * 0.7,
            y_m: 5.5,
            width_m: 0.5,
            depth_m: 0.5,
            rotation_deg: 0 as const,
            shape: 'rect' as const,
            color: '#DCEDC8',
            notes: `Container pot – ${name}`,
          }),
        ),
      ],
    },
  },

  // ── 5. Family 20 × 40 Plot ────────────────────────────────────────────────
  {
    id: 'family_20x40',
    name: 'Family 20×40 Plot',
    description:
      'A spacious 20 × 40 m family allotment with six productive beds, a polytunnel, compost station, tool store and wildflower corners. Structured for four-year crop rotation.',
    tags: ['family', 'large'],
    thumbnail: makeSvgThumbnail([
      // polytunnel (top)
      { x: 5,  y: 3,  w: 110, h: 12, fill: '#81D4FA' },
      // 6 beds (2 rows of 3)
      { x: 5,  y: 19, w: 32, h: 22, fill: '#A5D6A7' },
      { x: 44, y: 19, w: 32, h: 22, fill: '#C8E6C9' },
      { x: 83, y: 19, w: 32, h: 22, fill: '#A5D6A7' },
      { x: 5,  y: 45, w: 32, h: 22, fill: '#C8E6C9' },
      { x: 44, y: 45, w: 32, h: 22, fill: '#DCEDC8' },
      { x: 83, y: 45, w: 32, h: 22, fill: '#A5D6A7' },
      // tool store
      { x: 83, y: 68, w: 15, h: 9, fill: '#BCAAA4' },
      // compost
      { x: 100, y: 68, w: 15, h: 9, fill: '#FFCC80' },
      // paths between rows/columns
      { x: 37, y: 19, w: 6,  h: 48, fill: '#E8E0C8' },
      { x: 76, y: 19, w: 6,  h: 48, fill: '#E8E0C8' },
      { x: 5,  y: 41, w: 110, h: 3, fill: '#E8E0C8' },
    ]),
    garden: {
      name: 'Family Allotment',
      width_m: 20,
      depth_m: 40,
      south_edge: 'top',
      bed_system: 'metric',
      unit_system: 'metric',
      zones: [
        // Polytunnel at north end
        z({
          id: 'fam40_polytunnel',
          type: 'polytunnel',
          category: 'structure',
          name: 'Polytunnel',
          x_m: 0,
          y_m: 34,
          width_m: 20,
          depth_m: 5,
          rotation_deg: 0,
          shape: 'rect',
          color: '#81D4FA',
          notes: '4 m wide polytunnel – tomatoes, cucumbers, peppers',
        }),
        // 6 growing beds (3 columns × 2 rows)
        ...([
          { id: 'fam40_bed_1', name: 'Bed 1 – Brassicas',   x: 0,    y: 20.4, col: '#A5D6A7' },
          { id: 'fam40_bed_2', name: 'Bed 2 – Roots',       x: 7.3,  y: 20.4, col: '#C8E6C9' },
          { id: 'fam40_bed_3', name: 'Bed 3 – Legumes',     x: 14.6, y: 20.4, col: '#DCEDC8' },
          { id: 'fam40_bed_4', name: 'Bed 4 – Alliums',     x: 0,    y: 10.2, col: '#C8E6C9' },
          { id: 'fam40_bed_5', name: 'Bed 5 – Potatoes',    x: 7.3,  y: 10.2, col: '#A5D6A7' },
          { id: 'fam40_bed_6', name: 'Bed 6 – Salad/Herbs', x: 14.6, y: 10.2, col: '#DCEDC8' },
        ] as const).map(({ id, name, x, y, col }) =>
          z({
            id,
            type: 'raised_bed' as const,
            category: 'growing' as const,
            name,
            x_m: x,
            y_m: y,
            width_m: 6.6,
            depth_m: 9.6,
            rotation_deg: 0 as const,
            shape: 'rect' as const,
            color: col,
            notes: 'Four-year crop rotation bed',
          }),
        ),
        // Tool store
        z({
          id: 'fam40_tool_store',
          type: 'tool_store',
          category: 'structure',
          name: 'Tool Store',
          x_m: 0,
          y_m: 0,
          width_m: 4,
          depth_m: 3,
          rotation_deg: 0,
          shape: 'rect',
          color: '#BCAAA4',
          locked: true,
          notes: 'Main shed – tools, irrigation, seed storage',
        }),
        // Compost (two bays)
        z({
          id: 'fam40_compost',
          type: 'compost_station',
          category: 'structure',
          name: 'Compost Bays',
          x_m: 5,
          y_m: 0,
          width_m: 4,
          depth_m: 3,
          rotation_deg: 0,
          shape: 'rect',
          color: '#FFCC80',
          notes: 'Three-bay compost system',
        }),
        // Wildflower strip (south end)
        z({
          id: 'fam40_wildflower',
          type: 'wildflower_strip',
          category: 'growing',
          name: 'Wildflower Strip',
          x_m: 0,
          y_m: 39,
          width_m: 20,
          depth_m: 1,
          rotation_deg: 0,
          shape: 'rect',
          color: '#F1F8E9',
          notes: 'Annual wildflower mix for biodiversity and beneficial insects',
        }),
        // Horizontal path (between bed rows)
        z({
          id: 'fam40_path_h',
          type: 'path',
          category: 'structure',
          name: 'Cross Path',
          x_m: 0,
          y_m: 20,
          width_m: 20,
          depth_m: 0.6,
          rotation_deg: 0,
          shape: 'rect',
          color: '#E8E0C8',
          locked: true,
          notes: '',
        }),
        // Two vertical paths (between bed columns)
        z({
          id: 'fam40_path_v1',
          type: 'path',
          category: 'structure',
          name: 'Path 1',
          x_m: 6.6,
          y_m: 10,
          width_m: 0.7,
          depth_m: 20,
          rotation_deg: 0,
          shape: 'rect',
          color: '#E8E0C8',
          locked: true,
          notes: '',
        }),
        z({
          id: 'fam40_path_v2',
          type: 'path',
          category: 'structure',
          name: 'Path 2',
          x_m: 13.9,
          y_m: 10,
          width_m: 0.7,
          depth_m: 20,
          rotation_deg: 0,
          shape: 'rect',
          color: '#E8E0C8',
          locked: true,
          notes: '',
        }),
      ],
    },
  },

  // ── 6. Square Foot Garden 4 × 4 ft ───────────────────────────────────────
  {
    id: 'sfg_4x4',
    name: 'Square Foot Garden 4×4',
    description:
      'Classic 4 × 4 ft (1.2 × 1.2 m) Square Foot Garden. Maximum yield from the smallest possible footprint using the 1-ft grid system.',
    tags: ['sfg', 'beginner', 'small'],
    thumbnail: makeSvgThumbnail(
      Array.from({ length: 4 }, (_, r) =>
        Array.from({ length: 4 }, (_, c) => ({
          x: 4 + c * 28,
          y: 4 + r * 18,
          w: 25,
          h: 15,
          fill: r % 2 === c % 2 ? '#A5D6A7' : '#DCEDC8',
        })),
      ).flat(),
    ),
    garden: {
      name: 'Square Foot Garden',
      width_m: 2,
      depth_m: 2,
      south_edge: 'top',
      bed_system: 'sfg_1ft',
      unit_system: 'imperial',
      zones: [
        z({
          id: 'sfg_main_bed',
          type: 'raised_bed',
          category: 'growing',
          name: 'SFG Bed',
          x_m: 0,
          y_m: 0,
          width_m: 1.2,
          depth_m: 1.2,
          rotation_deg: 0,
          shape: 'rect',
          color: '#A5D6A7',
          notes: '4 × 4 ft SFG bed divided into 16 × 1 ft squares',
        }),
      ],
    },
  },

  // ── 7. Market Garden 30-inch Beds ─────────────────────────────────────────
  {
    id: 'market_garden_30in',
    name: 'Market Garden 30" Beds',
    description:
      'High-density Fortier-style market garden with eight 30-inch (76 cm) beds on 12-inch (30 cm) paths in a 15 × 30 m field block. Includes coldframes and a tool/pack shed.',
    tags: ['market-garden', 'professional'],
    thumbnail: makeSvgThumbnail([
      // 8 beds
      ...Array.from({ length: 8 }, (_, i) => ({
        x: 5 + i * 14,
        y: 10,
        w: 10,
        h: 62,
        fill: i % 2 === 0 ? '#A5D6A7' : '#C8E6C9',
      })),
      // paths between beds
      ...Array.from({ length: 7 }, (_, i) => ({
        x: 15 + i * 14,
        y: 10,
        w: 4,
        h: 62,
        fill: '#E8E0C8',
      })),
      // head-land path (top)
      { x: 5, y: 5, w: 110, h: 4, fill: '#E8E0C8' },
      // tool shed (bottom right)
      { x: 90, y: 74, w: 25, h: 5, fill: '#BCAAA4' },
    ]),
    garden: {
      name: 'Market Garden',
      width_m: 15,
      depth_m: 30,
      south_edge: 'top',
      bed_system: 'market_30in',
      unit_system: 'metric',
      zones: [
        // 8 × 30-inch in-ground market beds (0.76 m × 25 m)
        ...Array.from({ length: 8 }, (_, i) =>
          z({
            id: `mkt_bed_${i + 1}`,
            type: 'in_ground_bed' as const,
            category: 'growing' as const,
            name: `Bed ${i + 1}`,
            x_m: 1 + i * 1.07,          // 0.76 m bed + 0.31 m path pitch
            y_m: 1,
            width_m: 0.76,
            depth_m: 25,
            rotation_deg: 0 as const,
            shape: 'rect' as const,
            color: i % 2 === 0 ? '#A5D6A7' : '#C8E6C9',
            notes: '30-inch market bed',
          }),
        ),
        // Head-land path (north end)
        z({
          id: 'mkt_headland_n',
          type: 'path',
          category: 'structure',
          name: 'Headland (North)',
          x_m: 0,
          y_m: 26.5,
          width_m: 15,
          depth_m: 1,
          rotation_deg: 0,
          shape: 'rect',
          color: '#E8E0C8',
          locked: true,
          notes: '',
        }),
        // Head-land path (south end)
        z({
          id: 'mkt_headland_s',
          type: 'path',
          category: 'structure',
          name: 'Headland (South)',
          x_m: 0,
          y_m: 0,
          width_m: 15,
          depth_m: 1,
          rotation_deg: 0,
          shape: 'rect',
          color: '#E8E0C8',
          locked: true,
          notes: '',
        }),
        // 2 × cold frames
        z({
          id: 'mkt_cold_frame_1',
          type: 'cold_frame',
          category: 'structure',
          name: 'Cold Frame 1',
          x_m: 0,
          y_m: 27.8,
          width_m: 1.5,
          depth_m: 1,
          rotation_deg: 0,
          shape: 'rect',
          color: '#90CAF9',
          notes: 'Early seedling production',
        }),
        z({
          id: 'mkt_cold_frame_2',
          type: 'cold_frame',
          category: 'structure',
          name: 'Cold Frame 2',
          x_m: 1.7,
          y_m: 27.8,
          width_m: 1.5,
          depth_m: 1,
          rotation_deg: 0,
          shape: 'rect',
          color: '#90CAF9',
          notes: 'Late season extension',
        }),
        // Tool / pack shed
        z({
          id: 'mkt_tool_store',
          type: 'tool_store',
          category: 'structure',
          name: 'Tool & Pack Shed',
          x_m: 11,
          y_m: 27,
          width_m: 4,
          depth_m: 3,
          rotation_deg: 0,
          shape: 'rect',
          color: '#BCAAA4',
          locked: true,
          notes: 'Tools, harvest crates, washing station, seed store',
        }),
        // Compost row (north-west corner)
        z({
          id: 'mkt_compost',
          type: 'compost_station',
          category: 'structure',
          name: 'Compost Bays',
          x_m: 0,
          y_m: 27.8,
          width_m: 3,
          depth_m: 2,
          rotation_deg: 0,
          shape: 'rect',
          color: '#FFCC80',
          notes: 'Three-bay hot compost system',
        }),
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Lookup helper
// ---------------------------------------------------------------------------

/** Return a template by its id, or undefined if not found. */
export function getTemplate(id: string): GardenTemplate | undefined {
  return gardenTemplates.find((t) => t.id === id);
}
