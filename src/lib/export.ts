/**
 * Export / import utilities for the Kitchen Garden Planner.
 *
 * Functions:
 *   exportAsPNG          – render an SVG element to a high-DPI PNG Blob
 *   exportAsSVG          – serialise an SVGElement to an SVG string
 *   exportAsJSON         – serialise a Garden to pretty-printed JSON
 *   importFromJSON       – parse JSON and return a Garden (with Date coercion)
 *   exportCropPlanCSV    – CSV of all zone/crop assignments for the active season
 *   exportShoppingListCSV– CSV of a shopping list
 *   generateHTMLReport   – complete standalone HTML garden report with inline styles
 */

import type { Garden, ShoppingListItem, Zone } from '@/types';
import { cropMap } from '@/data/crops';

// ---------------------------------------------------------------------------
// PNG export
// ---------------------------------------------------------------------------

/**
 * Render an SVGElement to a PNG Blob at 2× pixel density.
 *
 * The SVG is serialised to a data URI, drawn onto an off-screen <canvas>,
 * then converted to a PNG Blob. Works in any modern browser environment;
 * throws in Node/SSR contexts where `document` is unavailable.
 */
export async function exportAsPNG(
  svgElement: SVGElement,
  width: number,
  height: number,
): Promise<Blob> {
  const serializer = new XMLSerializer();
  const svgStr     = serializer.serializeToString(svgElement);

  // Ensure the SVG has explicit width/height attributes so the <img> loads at
  // the expected size (some browsers ignore viewBox without these).
  const sized = svgStr.replace(
    /^<svg /,
    `<svg width="${width}" height="${height}" `,
  );

  const svgBlob  = new Blob([sized], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(svgBlob);

  return new Promise<Blob>((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const SCALE = 2; // 2× for retina / high-DPI
      const canvas = document.createElement('canvas');
      canvas.width  = width  * SCALE;
      canvas.height = height * SCALE;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('exportAsPNG: could not get 2D canvas context'));
        return;
      }

      ctx.scale(SCALE, SCALE);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('exportAsPNG: canvas.toBlob returned null'));
          }
        },
        'image/png',
      );
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`exportAsPNG: image failed to load – ${String(err)}`));
    };

    img.src = objectUrl;
  });
}

// ---------------------------------------------------------------------------
// SVG export
// ---------------------------------------------------------------------------

/**
 * Serialise an SVGElement to a well-formed SVG string.
 *
 * The returned string can be saved directly as a .svg file or embedded in
 * HTML. An XML declaration and standalone attribute are NOT added so the
 * string can be inlined in HTML documents.
 */
export function exportAsSVG(svgElement: SVGElement): string {
  const serializer = new XMLSerializer();
  return serializer.serializeToString(svgElement);
}

// ---------------------------------------------------------------------------
// JSON export / import
// ---------------------------------------------------------------------------

/**
 * Serialise a Garden to a pretty-printed JSON string.
 *
 * Date objects are serialised by JSON.stringify's default ISO-8601 conversion.
 * Use `importFromJSON` to round-trip the data back to a Garden.
 */
export function exportAsJSON(garden: Garden): string {
  return JSON.stringify(garden, null, 2);
}

/**
 * Parse a JSON string produced by `exportAsJSON` and return a typed Garden.
 *
 * Coerces ISO date strings back to Date objects for `created`, `modified`,
 * `chat_history[].timestamp` and `voice_notes[].timestamp`.
 *
 * Throws a SyntaxError if the JSON is malformed; throws a TypeError if the
 * parsed value is not an object.
 */
export function importFromJSON(json: string): Garden {
  const raw = JSON.parse(json) as Garden;

  if (typeof raw !== 'object' || raw === null) {
    throw new TypeError('importFromJSON: expected a JSON object');
  }

  // Coerce top-level dates
  if (typeof raw.created  === 'string') raw.created  = new Date(raw.created);
  if (typeof raw.modified === 'string') raw.modified = new Date(raw.modified);

  // Coerce chat message timestamps
  if (Array.isArray(raw.chat_history)) {
    raw.chat_history = raw.chat_history.map((m) => ({
      ...m,
      timestamp:
        typeof m.timestamp === 'string' ? new Date(m.timestamp) : m.timestamp,
    }));
  }

  // Coerce voice note timestamps
  if (Array.isArray(raw.voice_notes)) {
    raw.voice_notes = raw.voice_notes.map((v) => ({
      ...v,
      timestamp:
        typeof v.timestamp === 'string' ? new Date(v.timestamp) : v.timestamp,
    }));
  }

  return raw;
}

// ---------------------------------------------------------------------------
// Crop plan CSV
// ---------------------------------------------------------------------------

/**
 * Generate a CSV export of all crop assignments in the garden's active season.
 *
 * Columns: Zone, Zone Type, Crop (EN), Crop (FI), Latin Name, Qty,
 *          Sow Date, Harvest Date, Notes
 *
 * Returns a UTF-8 CSV string with a BOM so Excel opens it correctly.
 */
export function exportCropPlanCSV(garden: Garden): string {
  const BOM = '\uFEFF';
  const HEADER = [
    'Zone',
    'Zone Type',
    'Area (m²)',
    'Crop (English)',
    'Crop (Finnish)',
    'Latin Name',
    'Qty',
    'Sow Date',
    'Harvest Date',
    'Notes',
  ].join(',');

  const activeSeason = garden.seasons.find((s) => s.id === garden.active_season);
  if (!activeSeason) return `${BOM}${HEADER}\n`;

  const zoneMap = new Map<string, Zone>(garden.zones.map((z) => [z.id, z]));
  const rows: string[] = [HEADER];

  for (const assignment of activeSeason.crop_assignments) {
    const zone = zoneMap.get(assignment.zone_id);
    const zoneName = csvCell(zone?.name ?? assignment.zone_id);
    const zoneType = csvCell(zone?.type ?? '');
    const area     = zone ? (zone.width_m * zone.depth_m).toFixed(1) : '';

    for (const ca of assignment.crops) {
      const crop = cropMap[ca.crop_id];
      rows.push(
        [
          zoneName,
          zoneType,
          area,
          csvCell(crop?.name_en   ?? ca.crop_id),
          csvCell(crop?.name_fi   ?? ''),
          csvCell(crop?.name_latin ?? ''),
          String(ca.qty),
          csvCell(ca.sow_date     ?? ''),
          csvCell(ca.harvest_date ?? ''),
          csvCell(ca.notes        ?? ''),
        ].join(','),
      );
    }
  }

  return `${BOM}${rows.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Shopping list CSV
// ---------------------------------------------------------------------------

/**
 * Generate a CSV export of a shopping list.
 *
 * Columns: Category, Item, Quantity, Notes
 *
 * Returns a UTF-8 CSV string with a BOM.
 */
export function exportShoppingListCSV(items: ShoppingListItem[]): string {
  const BOM    = '\uFEFF';
  const HEADER = 'Category,Item,Quantity,Notes';
  const rows   = [HEADER];

  for (const item of items) {
    rows.push(
      [
        csvCell(item.category),
        csvCell(item.name),
        csvCell(item.quantity),
        csvCell(item.notes ?? ''),
      ].join(','),
    );
  }

  return `${BOM}${rows.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// HTML report
// ---------------------------------------------------------------------------

/**
 * Generate a complete standalone HTML document summarising the garden plan.
 *
 * The report includes:
 *   - Garden metadata (name, size, lifecycle, bed system)
 *   - Climate summary table (location, USDA zone, Finnish zone, frost dates,
 *     growing season, rainfall, soil, sun)
 *   - Zone inventory table (name, type, dimensions, area, locked status)
 *   - Crop plan table for the active season (zone, crop, qty, sow/harvest dates)
 *   - Companion planting notes drawn from the crop database
 *   - Footer with generation timestamp
 *
 * All styles are inlined so the file is self-contained.
 */
export function generateHTMLReport(garden: Garden): string {
  const activeSeason = garden.seasons.find((s) => s.id === garden.active_season);
  const generatedOn  = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  // ── Climate section ────────────────────────────────────────────────────────
  const c = garden.climate;
  const climateRows = [
    ['Location',       c.location || `${c.lat.toFixed(2)}°, ${c.lng.toFixed(2)}°`],
    ['USDA Zone',      c.usda_zone],
    ['Finnish Zone',   c.finnish_zone],
    ['Last Frost',     c.last_frost],
    ['First Frost',    c.first_frost],
    ['Growing Season', `${c.growing_season_days} days`],
    ['Annual Rainfall',`${c.annual_rainfall_mm} mm`],
    ['Soil Type',      c.soil_type.replace(/_/g, ' ')],
    ['Soil pH',        String(c.soil_ph)],
    ['Wind Exposure',  c.wind_exposure],
    ['Sun Angle (summer)', `${c.sun_angle_summer_deg}°`],
    ['Daylight (solstice)', `${c.daylight_hours_solstice} h`],
  ]
    .map(
      ([k, v]) =>
        `<tr><td class="dt">${esc(k)}</td><td>${esc(v)}</td></tr>`,
    )
    .join('');

  // ── Zone table ─────────────────────────────────────────────────────────────
  const zoneTableRows = garden.zones
    .map((zone) => {
      const area   = (zone.width_m * zone.depth_m).toFixed(1);
      const locked = zone.locked ? '<span class="badge locked">locked</span>' : '';
      return `<tr>
        <td style="border-left:4px solid ${esc(zone.color)};padding-left:8px">
          ${esc(zone.name)}${locked}
        </td>
        <td>${esc(zone.type.replace(/_/g, ' '))}</td>
        <td>${esc(zone.category)}</td>
        <td>${zone.width_m} m × ${zone.depth_m} m</td>
        <td class="num">${area} m²</td>
        <td class="note">${esc(zone.notes)}</td>
      </tr>`;
    })
    .join('');

  // ── Crop plan table ────────────────────────────────────────────────────────
  let cropTableRows = '';
  const companionNotes: string[] = [];

  if (activeSeason) {
    const zoneMap = new Map<string, Zone>(garden.zones.map((z) => [z.id, z]));

    for (const assignment of activeSeason.crop_assignments) {
      const zone = zoneMap.get(assignment.zone_id);

      for (const ca of assignment.crops) {
        const crop = cropMap[ca.crop_id];
        const name_en = crop?.name_en ?? ca.crop_id;
        const name_fi = crop?.name_fi ?? '';
        const emoji   = crop?.emoji ?? '';

        cropTableRows += `<tr>
          <td>${esc(zone?.name ?? assignment.zone_id)}</td>
          <td>${esc(emoji)} ${esc(name_en)}</td>
          <td>${esc(name_fi)}</td>
          <td class="num">${ca.qty}</td>
          <td>${esc(ca.sow_date     ?? '')}</td>
          <td>${esc(ca.harvest_date ?? '')}</td>
          <td class="note">${esc(ca.notes ?? '')}</td>
        </tr>`;

        // Collect companion notes
        if (crop && crop.companions.length > 0) {
          companionNotes.push(
            `<li><strong>${esc(emoji)} ${esc(name_en)}</strong> grows well with: ${
              crop.companions.map((id) => {
                const c2 = cropMap[id];
                return c2 ? `${c2.emoji} ${esc(c2.name_en)}` : esc(id);
              }).join(', ')
            }${
              crop.antagonists.length > 0
                ? `. Keep away from: ${crop.antagonists.map((id) => {
                    const c2 = cropMap[id];
                    return c2 ? `${c2.emoji} ${esc(c2.name_en)}` : esc(id);
                  }).join(', ')}.`
                : ''
            }</li>`,
          );
        }
      }
    }
  }

  const cropSection =
    cropTableRows
      ? `<h2>Crop Plan – ${activeSeason?.year ?? ''}</h2>
         <table>
           <thead><tr>
             <th>Zone</th><th>Crop</th><th>Finnish</th>
             <th>Qty</th><th>Sow Date</th><th>Harvest Date</th><th>Notes</th>
           </tr></thead>
           <tbody>${cropTableRows}</tbody>
         </table>`
      : `<h2>Crop Plan</h2><p class="muted">No crops assigned yet.</p>`;

  const companionSection =
    companionNotes.length > 0
      ? `<h2>Companion Planting Notes</h2><ul class="companions">${companionNotes.join('')}</ul>`
      : '';

  // ── Summary statistics ─────────────────────────────────────────────────────
  const totalArea       = (garden.width_m * garden.depth_m).toFixed(0);
  const growingArea     = garden.zones
    .filter((z) => z.category === 'growing')
    .reduce((sum, z) => sum + z.width_m * z.depth_m, 0)
    .toFixed(1);
  const structureCount  = garden.zones.filter((z) => z.category === 'structure').length;
  const growingCount    = garden.zones.filter((z) => z.category === 'growing').length;

  // ── Full HTML document ─────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(garden.name)} – Garden Plan Report</title>
  <style>
    /* Reset & base */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 14px;
      line-height: 1.6;
      color: #2c2c2c;
      background: #fafaf7;
      max-width: 960px;
      margin: 0 auto;
      padding: 32px 24px 64px;
    }

    /* Header */
    header {
      border-bottom: 3px solid #3a6b35;
      padding-bottom: 16px;
      margin-bottom: 32px;
    }
    header h1 {
      font-size: 2rem;
      color: #2d5a27;
      letter-spacing: -0.5px;
    }
    header .meta {
      font-family: system-ui, sans-serif;
      font-size: 12px;
      color: #777;
      margin-top: 4px;
    }

    /* Section headings */
    h2 {
      font-size: 1.2rem;
      color: #3a6b35;
      border-bottom: 2px solid #c5dfc2;
      padding-bottom: 6px;
      margin: 32px 0 12px;
    }

    /* Summary stats bar */
    .stats {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      background: #eef5ec;
      border: 1px solid #c5dfc2;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 24px;
    }
    .stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 80px;
    }
    .stat .value {
      font-size: 1.5rem;
      font-weight: bold;
      color: #2d5a27;
      font-family: system-ui, sans-serif;
    }
    .stat .label {
      font-size: 11px;
      color: #666;
      text-align: center;
      font-family: system-ui, sans-serif;
    }

    /* Tables */
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 12px 0 24px;
      font-family: system-ui, sans-serif;
      font-size: 13px;
    }
    thead th {
      background: #3a6b35;
      color: #fff;
      padding: 8px 10px;
      text-align: left;
      font-weight: 600;
    }
    tbody tr:nth-child(even) { background: #f4f8f3; }
    tbody tr:hover           { background: #e6f0e4; }
    td {
      padding: 7px 10px;
      border-bottom: 1px solid #dde8db;
      vertical-align: top;
    }
    td.dt   { font-weight: 600; color: #444; white-space: nowrap; }
    td.num  { text-align: right; white-space: nowrap; }
    td.note { color: #555; font-style: italic; max-width: 200px; }

    /* Climate table */
    .climate-table { max-width: 520px; }
    .climate-table td:first-child { width: 180px; }

    /* Badges */
    .badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 10px;
      font-size: 10px;
      font-family: system-ui, sans-serif;
      margin-left: 6px;
      vertical-align: middle;
    }
    .badge.locked { background: #f0e0b0; color: #7a5a00; }

    /* Companion list */
    .companions {
      list-style: none;
      padding: 0;
    }
    .companions li {
      padding: 6px 0 6px 16px;
      border-bottom: 1px solid #e8ede7;
      font-size: 13px;
      font-family: system-ui, sans-serif;
    }
    .companions li:last-child { border-bottom: none; }

    /* Muted text */
    .muted { color: #888; font-style: italic; font-family: system-ui, sans-serif; }

    /* Footer */
    footer {
      margin-top: 48px;
      padding-top: 16px;
      border-top: 1px solid #ddd;
      font-size: 11px;
      color: #aaa;
      font-family: system-ui, sans-serif;
      text-align: center;
    }

    @media print {
      body { background: #fff; padding: 16px; }
      header, h2 { page-break-after: avoid; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>

<header>
  <h1>${esc(garden.name)}</h1>
  <div class="meta">
    ${esc(garden.width_m + ' m × ' + garden.depth_m + ' m')} &nbsp;·&nbsp;
    Bed system: ${esc(garden.bed_system.replace(/_/g, ' '))} &nbsp;·&nbsp;
    Lifecycle: ${esc(garden.lifecycle.replace(/_/g, ' '))} &nbsp;·&nbsp;
    Generated: ${esc(generatedOn)}
  </div>
</header>

<div class="stats">
  <div class="stat"><span class="value">${totalArea}</span><span class="label">Total area (m²)</span></div>
  <div class="stat"><span class="value">${growingArea}</span><span class="label">Growing area (m²)</span></div>
  <div class="stat"><span class="value">${growingCount}</span><span class="label">Growing zones</span></div>
  <div class="stat"><span class="value">${structureCount}</span><span class="label">Structures</span></div>
  <div class="stat"><span class="value">${c.growing_season_days}</span><span class="label">Growing days</span></div>
  <div class="stat"><span class="value">${c.usda_zone}</span><span class="label">USDA Zone</span></div>
  <div class="stat"><span class="value">${esc(c.finnish_zone)}</span><span class="label">Finnish Zone</span></div>
</div>

<h2>Climate &amp; Site</h2>
<table class="climate-table">
  <tbody>${climateRows}</tbody>
</table>

<h2>Zone Inventory</h2>
<table>
  <thead>
    <tr>
      <th>Zone Name</th>
      <th>Type</th>
      <th>Category</th>
      <th>Dimensions</th>
      <th>Area</th>
      <th>Notes</th>
    </tr>
  </thead>
  <tbody>${zoneTableRows}</tbody>
</table>

${cropSection}

${companionSection}

<footer>
  Kitchen Garden Planner report &nbsp;·&nbsp; ${esc(garden.name)} &nbsp;·&nbsp; ${esc(generatedOn)}
</footer>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Escape a string for safe insertion into HTML content. */
function esc(s: string | number | undefined | null): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/**
 * Wrap a value in double-quotes for CSV, escaping any internal double-quotes
 * by doubling them (RFC 4180).
 */
function csvCell(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}
