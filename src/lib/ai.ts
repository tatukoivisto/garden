/**
 * ai.ts — Gemini AI integration layer for the Kitchen Garden Planner.
 *
 * Handles:
 *  - Chat message sending with rich garden context
 *  - AI response parsing (text + embedded ACTION commands)
 *  - Garden photo analysis via Gemini Vision
 *  - Natural-language garden plan generation
 *  - Graceful fallback when no API key is present
 */

import type { Garden, Zone, ClimateConfig, CropAssignment } from '@/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GardenContext {
  summary: string;
  zones: string;
  crops: string;
  climate: string;
  companions: string;
  rotation: string;
  season: string;
}

export interface AIAction {
  type: 'add_zone' | 'move_zone' | 'assign_crops' | 'update_climate' | string;
  payload: Record<string, unknown>;
}

export interface AIResponse {
  text: string;
  actions: AIAction[];
}

export interface GeneratedPlan {
  zones: Partial<Zone>[];
  cropAssignments: { zoneId: string; crops: CropAssignment[] }[];
  climate?: Partial<ClimateConfig>;
}

// ---------------------------------------------------------------------------
// Companion planting knowledge (inline — no external import needed)
// ---------------------------------------------------------------------------

const KNOWN_COMPANIONS: Record<string, string[]> = {
  tomato: ['basil', 'parsley', 'carrot', 'marigold'],
  basil: ['tomato', 'pepper'],
  carrot: ['onion', 'leek', 'rosemary', 'sage', 'tomato'],
  onion: ['carrot', 'lettuce', 'chamomile'],
  lettuce: ['carrot', 'radish', 'strawberry', 'onion'],
  cucumber: ['dill', 'sunflower', 'nasturtium'],
  bean: ['carrot', 'cucumber', 'cabbage'],
  pea: ['carrot', 'turnip', 'radish', 'bean'],
  cabbage: ['dill', 'chamomile', 'sage', 'thyme'],
  potato: ['bean', 'corn', 'cabbage', 'marigold'],
};

const KNOWN_ANTAGONISTS: Record<string, string[]> = {
  tomato: ['fennel', 'potato', 'brassica'],
  onion: ['bean', 'pea'],
  fennel: ['tomato', 'pepper', 'bean', 'kohlrabi'],
  potato: ['tomato', 'sunflower', 'cucumber'],
};

// ---------------------------------------------------------------------------
// Season helpers
// ---------------------------------------------------------------------------

function getCurrentSeason(lat: number): string {
  const month = new Date().getMonth() + 1; // 1-based
  const isNorthern = lat >= 0;

  if (isNorthern) {
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'autumn';
    return 'winter';
  } else {
    if (month >= 3 && month <= 5) return 'autumn';
    if (month >= 6 && month <= 8) return 'winter';
    if (month >= 9 && month <= 11) return 'spring';
    return 'summer';
  }
}

function getMonthName(): string {
  return new Date().toLocaleString('en-US', { month: 'long' });
}

// ---------------------------------------------------------------------------
// Garden context builder
// ---------------------------------------------------------------------------

export function buildGardenContext(garden: Garden): GardenContext {
  // --- summary ---
  const summary = [
    `Garden: "${garden.name}"`,
    `Size: ${garden.width_m}m × ${garden.depth_m}m`,
    `Lifecycle: ${garden.lifecycle}`,
    `Bed system: ${garden.bed_system}`,
    `South edge faces: ${garden.south_edge}`,
  ].join(', ');

  // --- zones ---
  const zonesText =
    garden.zones.length === 0
      ? 'No zones placed yet.'
      : garden.zones
          .map(
            (z) =>
              `[${z.id.slice(0, 6)}] "${z.name}" (${z.type}) ` +
              `${z.width_m}m×${z.depth_m}m at (${z.x_m.toFixed(1)},${z.y_m.toFixed(1)})` +
              (z.notes ? ` — ${z.notes}` : ''),
          )
          .join('\n');

  // --- crops from active season ---
  const activeSeason = garden.seasons.find((s) => s.id === garden.active_season);
  let cropsText = 'No crops assigned yet.';
  if (activeSeason && activeSeason.crop_assignments.length > 0) {
    cropsText = activeSeason.crop_assignments
      .map(({ zone_id, crops }) => {
        const zone = garden.zones.find((z) => z.id === zone_id);
        const zoneName = zone ? `"${zone.name}"` : zone_id.slice(0, 6);
        const cropList = crops.map((c) => `${c.crop_id}×${c.qty}`).join(', ');
        return `${zoneName}: ${cropList}`;
      })
      .join('\n');
  }

  // --- climate ---
  const c = garden.climate;
  const season = getCurrentSeason(c.lat);
  const climateText = [
    `Location: ${c.location} (${c.lat.toFixed(2)}°, ${c.lng.toFixed(2)}°)`,
    `USDA zone: ${c.usda_zone}`,
    `Soil: ${c.soil_type} pH ${c.soil_ph}`,
    `Annual rainfall: ${c.annual_rainfall_mm}mm`,
    `Last frost: ${c.last_frost}, First frost: ${c.first_frost}`,
    `Growing season: ${c.growing_season_days} days`,
    `Wind: ${c.wind_exposure}, Slope: ${c.slope_facing}`,
    `Summer sun angle: ${c.sun_angle_summer_deg}°, Solstice daylight: ${c.daylight_hours_solstice}h`,
  ].join('; ');

  // --- companion issues ---
  const companionIssues: string[] = [];
  if (activeSeason) {
    const allCropIds = activeSeason.crop_assignments.flatMap((ca) =>
      ca.crops.map((c) => c.crop_id.toLowerCase()),
    );
    for (const cropId of allCropIds) {
      const antagonists = KNOWN_ANTAGONISTS[cropId];
      if (antagonists) {
        for (const ant of antagonists) {
          if (allCropIds.includes(ant)) {
            companionIssues.push(`${cropId} conflicts with ${ant}`);
          }
        }
      }
    }
  }
  const companionsText =
    companionIssues.length > 0
      ? `Issues: ${companionIssues.join('; ')}`
      : 'No companion conflicts detected.';

  // --- rotation ---
  const rotationText =
    garden.seasons.length <= 1
      ? 'First season — no rotation history.'
      : `${garden.seasons.length} seasons on record.`;

  // --- current season ---
  const seasonText = `${season} (${getMonthName()}, year ${new Date().getFullYear()})`;

  return {
    summary,
    zones: zonesText,
    crops: cropsText,
    climate: climateText,
    companions: companionsText,
    rotation: rotationText,
    season: seasonText,
  };
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(ctx: GardenContext): string {
  return `You are GardenAI — the expert AI assistant embedded in the Kitchen Garden Planner.
You are a knowledgeable, warm, and practical gardening advisor with deep expertise in:
- Companion planting (benefits, antagonists, guilds)
- Crop rotation (family groupings, soil nutrient cycles)
- Seasonal scheduling and succession sowing
- Climate-adapted growing (USDA zones, soil types, frost dates)
- Organic pest and disease management
- Raised bed, in-ground, and container growing systems

YOUR GARDEN STATE RIGHT NOW
===========================
${ctx.summary}

Zones placed:
${ctx.zones}

Crops assigned (active season):
${ctx.crops}

Climate:
${ctx.climate}

Companion analysis:
${ctx.companions}

Rotation history:
${ctx.rotation}

Current season: ${ctx.season}

RESPONSE GUIDELINES
===================
1. Be concise but complete. Use bullet points and bold text (**text**) for clarity.
2. Always tailor advice to the specific garden state above — reference zone names, crop names, and climate details.
3. When you want to make a change to the garden, embed a structured ACTION command in your response using this exact format:
   [ACTION:action_type:{JSON_payload}]

   Available actions:
   - Add a new zone:      [ACTION:add_zone:{"type":"raised_bed","name":"Bed A","x_m":0,"y_m":0,"width_m":1.2,"depth_m":3}]
   - Move a zone:         [ACTION:move_zone:{"id":"zone-id","x_m":2.5,"y_m":1.0}]
   - Assign crops:        [ACTION:assign_crops:{"zoneId":"zone-id","crops":[{"crop_id":"tomato","qty":4}]}]
   - Update climate:      [ACTION:update_climate:{"usda_zone":"6a","last_frost":"05-01"}]

4. Only embed ACTION commands when you are confident the change is correct and the user asked for it or clearly expects it.
5. Explain each action in plain language before or after the ACTION tag.
6. For photo analysis, describe what you see, identify plants and issues, and suggest concrete improvements.
7. Never make up crop or zone IDs — only reference IDs that appear in the garden state above.
8. If the garden has no zones yet, start by suggesting a sensible layout for the space and climate.

You are helpful, encouraging, and scientifically accurate.`;
}

// ---------------------------------------------------------------------------
// AI response parser
// ---------------------------------------------------------------------------

const ACTION_REGEX = /\[ACTION:([a-z_]+):(\{[\s\S]*?\})\]/g;

export function parseAIResponse(rawText: string): { text: string; actions: AIAction[] } {
  const actions: AIAction[] = [];
  let cleanText = rawText;

  let match: RegExpExecArray | null;
  // Reset regex state
  ACTION_REGEX.lastIndex = 0;

  while ((match = ACTION_REGEX.exec(rawText)) !== null) {
    const actionType = match[1];
    const jsonStr = match[2];
    try {
      const payload = JSON.parse(jsonStr) as Record<string, unknown>;
      actions.push({ type: actionType, payload });
    } catch {
      // Malformed JSON — skip this action
      console.warn('[GardenAI] Failed to parse action payload:', jsonStr);
    }
    // Remove the action tag from display text
    cleanText = cleanText.replace(match[0], '').trim();
  }

  // Clean up extra blank lines left by removed action tags
  cleanText = cleanText.replace(/\n{3,}/g, '\n\n').trim();

  return { text: cleanText, actions };
}

// ---------------------------------------------------------------------------
// Gemini API caller (shared for text and vision)
// ---------------------------------------------------------------------------

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

async function callGeminiAPI(
  model: string,
  contents: GeminiContent[],
  systemInstruction: string,
): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }

  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      maxOutputTokens: 2048,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }
  return text;
}

// ---------------------------------------------------------------------------
// Fallback responses (rule-based, no API key required)
// ---------------------------------------------------------------------------

function buildFallbackResponse(message: string, ctx: GardenContext): string {
  const lower = message.toLowerCase();
  const season = ctx.season.split(' ')[0]; // e.g. "spring"

  if (lower.includes('companion') || lower.includes('friend')) {
    return (
      `**Companion Planting Basics** (offline mode)\n\n` +
      `Classic companions for your garden:\n` +
      `- **Tomatoes + Basil**: Basil repels aphids and whitefly, improves tomato flavour.\n` +
      `- **Carrots + Onions**: Each deters the other's main pest (carrot fly / onion fly).\n` +
      `- **Beans + Corn + Squash** (Three Sisters): Nitrogen fixing, climbing support, ground cover.\n\n` +
      `${ctx.companions}\n\n` +
      `_Connect a Gemini API key for personalised companion analysis._`
    );
  }

  if (lower.includes('rotation') || lower.includes('rotate')) {
    return (
      `**Crop Rotation Guide** (offline mode)\n\n` +
      `Follow this four-year family rotation:\n` +
      `1. **Brassicas** (cabbage, kale, broccoli)\n` +
      `2. **Legumes** (peas, beans) — fix nitrogen for the next crop\n` +
      `3. **Roots** (carrot, parsnip, beetroot)\n` +
      `4. **Alliums + Potatoes** (onion, leek, potato)\n\n` +
      `Current state: ${ctx.rotation}\n\n` +
      `_Add a Gemini API key for personalised rotation planning._`
    );
  }

  if (lower.includes('what to plant') || lower.includes('plant now') || lower.includes('sow')) {
    const suggestions: Record<string, string[]> = {
      spring: ['Lettuce', 'Spinach', 'Peas', 'Broad beans', 'Onion sets', 'Potatoes', 'Beetroot'],
      summer: ['Courgette', 'French beans', 'Basil', 'Cucumber', 'Sweetcorn', 'Squash'],
      autumn: ['Garlic', 'Overwintering onions', 'Winter salads', 'Kale', 'Spring cabbage'],
      winter: ['Broad beans (mild areas)', 'Garlic', 'Planning for spring'],
    };
    const list = suggestions[season] ?? suggestions['spring'];
    return (
      `**What to Plant in ${season.charAt(0).toUpperCase() + season.slice(1)}** (offline mode)\n\n` +
      `For your climate (${ctx.climate.split(';')[0]}):\n\n` +
      list.map((c) => `- ${c}`).join('\n') +
      `\n\n_Add a Gemini API key for personalised, climate-specific sowing advice._`
    );
  }

  if (lower.includes('generate') || lower.includes('plan') || lower.includes('design')) {
    return (
      `**Garden Plan Generator** (offline mode)\n\n` +
      `Your current garden: ${ctx.summary}\n\n` +
      `To generate a full plan I need a Gemini API key. In the meantime:\n` +
      `1. Start by adding raised beds via the palette on the left.\n` +
      `2. Aim for 1.2 m wide beds so you can reach the centre from both sides.\n` +
      `3. Leave 60 cm paths between beds.\n` +
      `4. Place tall crops (sweetcorn, tomatoes) on the north side to avoid shade.\n\n` +
      `_Set NEXT_PUBLIC_GEMINI_API_KEY to unlock AI-generated plans._`
    );
  }

  // Generic fallback
  return (
    `**GardenAI — Offline Mode**\n\n` +
    `I can't reach the Gemini API right now (no API key configured).\n\n` +
    `Your garden snapshot:\n` +
    `- ${ctx.summary}\n` +
    `- Season: ${ctx.season}\n` +
    `- ${ctx.companions}\n\n` +
    `Try asking about **companion planting**, **crop rotation**, or **what to plant now** ` +
    `for rule-based advice without an API key.\n\n` +
    `_To unlock full AI features, add your Gemini key as NEXT_PUBLIC_GEMINI_API_KEY._`
  );
}

// ---------------------------------------------------------------------------
// Public API — sendChatMessage
// ---------------------------------------------------------------------------

export async function sendChatMessage(
  message: string,
  gardenContext: GardenContext,
): Promise<AIResponse> {
  const systemPrompt = buildSystemPrompt(gardenContext);

  let rawText: string;
  try {
    rawText = await callGeminiAPI(
      'gemini-1.5-flash',
      [{ role: 'user', parts: [{ text: message }] }],
      systemPrompt,
    );
  } catch (err) {
    const isNoKey = err instanceof Error && err.message === 'GEMINI_API_KEY_MISSING';
    if (isNoKey) {
      const fallback = buildFallbackResponse(message, gardenContext);
      return { text: fallback, actions: [] };
    }
    throw err;
  }

  return parseAIResponse(rawText);
}

// ---------------------------------------------------------------------------
// Public API — analyzeGardenPhoto
// ---------------------------------------------------------------------------

export async function analyzeGardenPhoto(
  imageBase64: string,
  gardenContext: GardenContext,
): Promise<AIResponse> {
  const systemPrompt =
    buildSystemPrompt(gardenContext) +
    `\n\nPHOTO ANALYSIS MODE
====================
The user has submitted a garden photo. Your task:
1. Identify every plant species visible and their approximate health.
2. Detect any visible pests, diseases, nutrient deficiencies, or weed pressure.
3. Assess growth stage vs expected for the current season.
4. Suggest concrete immediate actions (water, feed, treat, harvest).
5. If the layout is visible, suggest any improvements to the digital twin.
6. Use ACTION commands where you want to update zone data.`;

  // Strip data: prefix if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  let rawText: string;
  try {
    rawText = await callGeminiAPI(
      'gemini-1.5-flash',
      [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Data,
              },
            },
            {
              text: 'Please analyse this garden photo and provide detailed observations and recommendations.',
            },
          ],
        },
      ],
      systemPrompt,
    );
  } catch (err) {
    const isNoKey = err instanceof Error && err.message === 'GEMINI_API_KEY_MISSING';
    if (isNoKey) {
      return {
        text:
          '**Photo Analysis — Offline Mode**\n\nPhoto analysis requires a Gemini API key. ' +
          'Add NEXT_PUBLIC_GEMINI_API_KEY to your environment to enable vision features.',
        actions: [],
      };
    }
    throw err;
  }

  return parseAIResponse(rawText);
}

// ---------------------------------------------------------------------------
// Public API — generateGardenPlan
// ---------------------------------------------------------------------------

export async function generateGardenPlan(
  description: string,
  climate: ClimateConfig,
): Promise<GeneratedPlan> {
  const season = getCurrentSeason(climate.lat);

  const systemPrompt = `You are a garden layout designer. The user will describe the garden they want, and you must respond with ONLY a valid JSON object — no markdown, no explanation text, just raw JSON.

The JSON must follow this schema exactly:
{
  "zones": [
    {
      "type": "raised_bed",
      "name": "Bed A",
      "x_m": 0,
      "y_m": 0,
      "width_m": 1.2,
      "depth_m": 3,
      "rotation_deg": 0,
      "shape": "rect",
      "color": "#A5D6A7",
      "notes": "Optional notes"
    }
  ],
  "cropAssignments": [
    {
      "zoneId": "ZONE_NAME_AS_KEY",
      "crops": [
        { "crop_id": "tomato", "qty": 4 }
      ]
    }
  ],
  "climate": {
    "usda_zone": "5b"
  }
}

Use the zone name (e.g. "Bed A") as the zoneId in cropAssignments — the app will match them by name.
Valid zone types: raised_bed, in_ground_bed, herb_spiral, three_sisters, strawberry_bed, perennial_bed, greenhouse, cold_frame, polytunnel, container, compost_station, tool_store, path, wildflower_strip.
Valid crop_ids (use English lowercase): tomato, basil, carrot, onion, lettuce, cucumber, bean, pea, cabbage, potato, beetroot, courgette, pepper, aubergine, leek, garlic, parsley, dill, sage, thyme, rosemary, strawberry, raspberry, mint, fennel.
Place zones in a logical grid layout. Leave 0.6 m gap between beds for paths.
Consider the current season (${season}) and climate zone (${climate.usda_zone}) for crop selection.`;

  let rawText: string;
  try {
    rawText = await callGeminiAPI(
      'gemini-1.5-flash',
      [{ role: 'user', parts: [{ text: description }] }],
      systemPrompt,
    );
  } catch (err) {
    const isNoKey = err instanceof Error && err.message === 'GEMINI_API_KEY_MISSING';
    if (isNoKey) {
      // Return a sensible default plan
      return buildDefaultPlan(climate);
    }
    throw err;
  }

  // Strip markdown code fences if present
  const jsonStr = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const plan = JSON.parse(jsonStr) as GeneratedPlan;
    return plan;
  } catch {
    console.error('[GardenAI] Failed to parse generated plan JSON:', jsonStr);
    return buildDefaultPlan(climate);
  }
}

// ---------------------------------------------------------------------------
// Default plan (fallback for generateGardenPlan without API key)
// ---------------------------------------------------------------------------

function buildDefaultPlan(climate: ClimateConfig): GeneratedPlan {
  const season = getCurrentSeason(climate.lat);
  const isCold = parseInt(climate.usda_zone?.replace(/[ab]/i, '') ?? '6', 10) <= 5;

  const zones: Partial<Zone>[] = [
    {
      type: 'raised_bed',
      name: 'Bed A',
      x_m: 0,
      y_m: 0,
      width_m: 1.2,
      depth_m: 3,
      rotation_deg: 0,
      shape: 'rect',
      color: '#A5D6A7',
      notes: 'Main vegetable bed',
    },
    {
      type: 'raised_bed',
      name: 'Bed B',
      x_m: 1.8,
      y_m: 0,
      width_m: 1.2,
      depth_m: 3,
      rotation_deg: 0,
      shape: 'rect',
      color: '#C8E6C9',
      notes: 'Secondary vegetable bed',
    },
    {
      type: 'herb_spiral',
      name: 'Herb Spiral',
      x_m: 3.6,
      y_m: 0.4,
      width_m: 2.8,
      depth_m: 2.2,
      rotation_deg: 0,
      shape: 'ellipse',
      color: '#CE93D8',
      notes: 'Mixed herbs',
    },
    {
      type: 'compost_station',
      name: 'Compost',
      x_m: 0,
      y_m: 3.6,
      width_m: 2,
      depth_m: 1.5,
      rotation_deg: 0,
      shape: 'rect',
      color: '#FFCC80',
      notes: 'Two-bay compost system',
    },
  ];

  const springCrops = [
    { crop_id: 'lettuce', qty: 6 },
    { crop_id: 'pea', qty: 12 },
    { crop_id: 'carrot', qty: 20 },
  ];
  const summerCrops = [
    { crop_id: 'tomato', qty: 4 },
    { crop_id: 'courgette', qty: 2 },
    { crop_id: 'bean', qty: 10 },
  ];
  const coldCrops = [
    { crop_id: 'cabbage', qty: 4 },
    { crop_id: 'leek', qty: 8 },
    { crop_id: 'beetroot', qty: 12 },
  ];

  const bedACrops =
    season === 'spring' ? springCrops : season === 'summer' && !isCold ? summerCrops : coldCrops;

  return {
    zones,
    cropAssignments: [
      { zoneId: 'Bed A', crops: bedACrops },
      {
        zoneId: 'Herb Spiral',
        crops: [
          { crop_id: 'basil', qty: 3 },
          { crop_id: 'parsley', qty: 2 },
          { crop_id: 'thyme', qty: 2 },
          { crop_id: 'rosemary', qty: 1 },
        ],
      },
    ],
  };
}
