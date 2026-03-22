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

import type { Garden, Zone, ClimateConfig, CropAssignment, AIAction, AIStructuredResponse, AISuggestion, ChatMessage } from '@/types';

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
  selectedZones: string;
  gardenWidth_m: string;
  gardenDepth_m: string;
  gardenWidth_m_num: number;
  gardenDepth_m_num: number;
  southEdge: string;
}

export interface AIResponse {
  text: string;
  actions: AIAction[];
  suggestions: AISuggestion[];
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

export function buildGardenContext(garden: Garden, selectedZoneIds: string[] = []): GardenContext {
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

  // --- selected zones ---
  let selectedZonesText = 'No zones selected.';
  if (selectedZoneIds.length > 0) {
    const selected = garden.zones.filter((z) => selectedZoneIds.includes(z.id));
    if (selected.length > 0) {
      selectedZonesText = 'CURRENTLY SELECTED:\n' + selected
        .map((z) => {
          let detail = `"${z.name}" (${z.type}) ${z.width_m}m×${z.depth_m}m at (${z.x_m.toFixed(1)},${z.y_m.toFixed(1)})`;
          if (z.notes) detail += ` — ${z.notes}`;
          // Include crops for this zone
          if (activeSeason) {
            const assignment = activeSeason.crop_assignments.find((a) => a.zone_id === z.id);
            if (assignment) {
              detail += ` | Crops: ${assignment.crops.map((c) => `${c.crop_id}×${c.qty}`).join(', ')}`;
            }
          }
          return `  → [${z.id.slice(0, 6)}] ${detail}`;
        })
        .join('\n');
    }
  }

  return {
    summary,
    zones: zonesText,
    crops: cropsText,
    climate: climateText,
    companions: companionsText,
    rotation: rotationText,
    season: seasonText,
    selectedZones: selectedZonesText,
    gardenWidth_m: String(garden.width_m),
    gardenDepth_m: String(garden.depth_m),
    gardenWidth_m_num: garden.width_m,
    gardenDepth_m_num: garden.depth_m,
    southEdge: garden.south_edge,
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

CANVAS COORDINATE SYSTEM
========================
The garden canvas uses a standard screen coordinate system:
- (0, 0) is the TOP-LEFT corner of the garden.
- x increases to the RIGHT, y increases DOWNWARD.
- The garden boundary (the main plot area) is ${ctx.gardenWidth_m}m wide × ${ctx.gardenDepth_m}m deep. When the user says "the garden area", "the whole area", "same size", or "another area", they mean this ${ctx.gardenWidth_m}m × ${ctx.gardenDepth_m}m boundary.
- "Top of canvas" = low y values. "Bottom of canvas" = high y values.
- "Left" = low x values. "Right" = high x values.
- South edge of the garden faces: ${ctx.southEdge} (this is the compass direction, NOT a coordinate — e.g. "top" means the top edge of the canvas is the south side).
- To place a zone in the "top right": use high x, LOW y (e.g. x=${Math.max(0, ctx.gardenWidth_m_num - 4)}, y=1).
- To place a zone in the "bottom left": use low x, HIGH y (e.g. x=1, y=${Math.max(0, ctx.gardenDepth_m_num - 4)}).
- Zones CAN be placed outside the garden boundary (e.g. negative coordinates, or beyond ${ctx.gardenWidth_m}m/${ctx.gardenDepth_m}m). Use this for satellite areas, additional plots, or structures near the garden.
- To add an area "next to" the garden, place it just outside the boundary (e.g. x_m=${ctx.gardenWidth_m_num + 1} for right side, y_m=${ctx.gardenDepth_m_num + 1} for below).
- You can also resize the garden boundary itself using the resize_garden action.

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

${ctx.selectedZones}

RESPONSE FORMAT
===============
You MUST respond with ONLY valid JSON — no text before or after it. Match this exact schema:
{
  "message": "Your response text with **markdown** formatting",
  "actions": [
    {
      "type": "action_type",
      "description": "Short human-readable description of what this does",
      "payload": { ... }
    }
  ],
  "suggestions": [
    { "label": "Short button text", "prompt": "Full follow-up prompt" }
  ]
}

Valid zone types: raised_bed, in_ground_bed, strawberry_bed, three_sisters, herb_spiral, perennial_bed, propagation_bed, experimental_bed, wildflower_strip, green_manure_strip, container, greenhouse, cold_frame, polytunnel, compost_station, tool_store, seating_area, water_barrel, path, gate, fence, custom.

The "custom" type can represent ANYTHING not in the list above — ditches, ponds, sheds, bee hives, dog runs, rock gardens, etc. When using "custom", always provide a descriptive "name" and appropriate "color".

Available action types and their payloads:
- add_zone: {"type":"in_ground_bed","name":"Bed A","x_m":0,"y_m":0,"width_m":1.2,"depth_m":3,"color":"#A5D6A7"}
- remove_zone: {"id":"zone-id"}
- move_zone: {"id":"zone-id","x_m":2.5,"y_m":1.0}
- resize_zone: {"id":"zone-id","width_m":2,"depth_m":4}
- rename_zone: {"id":"zone-id","name":"New Name"}
- rotate_zone: {"id":"zone-id"}
- assign_crops: {"zoneId":"zone-id","crops":[{"crop_id":"tomato","qty":4}]}
- update_climate: {"usda_zone":"6a","last_frost":"05-01"}
- resize_garden: {"width_m":20,"depth_m":40} (resizes the garden boundary area)

RULES:
1. **ACT FIRST, EXPLAIN AFTER.** When the user describes something they want, DO IT immediately with actions. Don't ask clarifying questions unless truly ambiguous. If you're 70% sure what they want, just do it — they can undo with Ctrl+Z.
2. Be concise. Use bullet points and **bold** for clarity. Explain what you did *after* doing it.
3. Tailor advice to the specific garden state — reference zone names and climate.
4. Always include a "description" for each action explaining what it does.
5. Never make up zone IDs — only use IDs from the garden state above.
6. Always include 2-4 relevant follow-up suggestions.
7. When the user references "it", "this", "that", or uses vague pronouns, check the CURRENTLY SELECTED zones first, then the most recently discussed zone in the conversation.
8. For any zone type not in the standard list, use type "custom" with a descriptive name, appropriate color, and sensible dimensions.
9. Place new zones intelligently — avoid overlaps, calculate coordinates relative to existing zones. If placing "between" two zones, average their positions. If placing "next to" a zone, offset from its edge.
10. The "message" field supports markdown: **bold**, *italic*, bullet lists, numbered lists.`;
}

// ---------------------------------------------------------------------------
// AI response parser
// ---------------------------------------------------------------------------

/**
 * Extract the outermost JSON object from text using brace-matching.
 * Handles text/code fences before and after the JSON block.
 */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Parse an AI response that may be structured JSON or freeform text.
 * Handles both the new JSON format and legacy [ACTION:...] format for backwards compat.
 */
export function parseAIResponse(rawText: string): AIResponse {
  // Try parsing as structured JSON first
  const trimmed = rawText.trim();
  const jsonStr = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Build candidates: clean response, code-fenced block, brace-matched extraction
  const jsonCandidates = [jsonStr];

  // Extract JSON from within ```json ... ``` code fences
  const codeFenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeFenceMatch) {
    jsonCandidates.push(codeFenceMatch[1].trim());
  }

  // Extract outermost JSON object via brace-matching (handles text before/after)
  const braceParsed = extractJsonObject(rawText);
  if (braceParsed) {
    jsonCandidates.push(braceParsed);
  }

  for (const candidate of jsonCandidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        message?: string;
        actions?: Array<{ type: string; description?: string; payload?: Record<string, unknown> }>;
        suggestions?: AISuggestion[];
      };
      if (parsed.message !== undefined) {
        return {
          text: parsed.message,
          actions: (parsed.actions ?? []).map((a) => ({
            type: a.type,
            description: a.description ?? a.type.replace(/_/g, ' '),
            payload: a.payload ?? {},
          })),
          suggestions: parsed.suggestions ?? [],
        };
      }
    } catch {
      // Not valid JSON — try next candidate
    }
  }

  // Legacy [ACTION:type:{payload}] format
  const ACTION_REGEX = /\[ACTION:([a-z_]+):(\{[\s\S]*?\})\]/g;
  const actions: AIAction[] = [];
  let cleanText = rawText;

  let match: RegExpExecArray | null;
  while ((match = ACTION_REGEX.exec(rawText)) !== null) {
    const actionType = match[1];
    const payloadStr = match[2];
    try {
      const payload = JSON.parse(payloadStr) as Record<string, unknown>;
      actions.push({ type: actionType, description: actionType.replace(/_/g, ' '), payload });
    } catch {
      console.warn('[GardenAI] Failed to parse action payload:', payloadStr);
    }
    cleanText = cleanText.replace(match[0], '').trim();
  }

  cleanText = cleanText.replace(/\n{3,}/g, '\n\n').trim();

  return { text: cleanText, actions, suggestions: [] };
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
      maxOutputTokens: 4096,
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
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };

  // Gemini 2.5 may return thinking + response as separate parts — extract only non-thought text
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join('');
  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }
  return text;
}

// ---------------------------------------------------------------------------
// Streaming Gemini API caller
// ---------------------------------------------------------------------------

export async function streamGeminiAPI(
  model: string,
  contents: GeminiContent[],
  systemInstruction: string,
  onChunk: (text: string) => void,
): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }

  const url = `${GEMINI_API_BASE}/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      maxOutputTokens: 4096,
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

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        // Gemini 2.5 may return thinking parts — skip those
        const parts = parsed.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          if (part.text && !part.thought) {
            fullText += part.text;
            onChunk(part.text);
          }
        }
      } catch {
        // skip malformed SSE lines
      }
    }
  }

  return fullText;
}

// ---------------------------------------------------------------------------
// Conversation history → Gemini contents
// ---------------------------------------------------------------------------

const MAX_HISTORY_MESSAGES = 20;

/**
 * Convert chat history + current message into Gemini's multi-turn contents array.
 * Merges consecutive same-role messages (Gemini requires alternating roles).
 */
function buildContents(chatHistory: ChatMessage[], currentMessage: string): GeminiContent[] {
  const raw: GeminiContent[] = [];

  const recent = chatHistory.slice(-MAX_HISTORY_MESSAGES);
  for (const msg of recent) {
    raw.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    });
  }

  // Add the current user message
  raw.push({ role: 'user', parts: [{ text: currentMessage }] });

  // Merge consecutive same-role messages (Gemini requirement)
  const merged: GeminiContent[] = [];
  for (const content of raw) {
    if (merged.length > 0 && merged[merged.length - 1].role === content.role) {
      merged[merged.length - 1].parts[0].text += '\n' + content.parts[0].text!;
    } else {
      merged.push(content);
    }
  }

  // Ensure the first message is from 'user' (Gemini requirement)
  if (merged.length > 0 && merged[0].role !== 'user') {
    merged.shift();
  }

  return merged;
}

/**
 * Stream a chat message with callbacks for text chunks and completed actions.
 */
export async function streamChatMessage(
  message: string,
  gardenContext: GardenContext,
  onTextChunk: (text: string) => void,
  onComplete: (response: AIResponse) => void,
  chatHistory?: ChatMessage[],
): Promise<AIResponse> {
  const systemPrompt = buildSystemPrompt(gardenContext);
  let fullText = '';

  try {
    fullText = await streamGeminiAPI(
      'gemini-2.5-flash',
      buildContents(chatHistory ?? [], message),
      systemPrompt,
      onTextChunk,
    );
  } catch (err) {
    const isNoKey = err instanceof Error && err.message === 'GEMINI_API_KEY_MISSING';
    if (isNoKey) {
      const fallback = buildFallbackResponse(message, gardenContext);
      onTextChunk(fallback);
      const response: AIResponse = { text: fallback, actions: [], suggestions: [] };
      onComplete(response);
      return response;
    }
    throw err;
  }

  const response = parseAIResponse(fullText);
  onComplete(response);
  return response;
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
  chatHistory?: ChatMessage[],
): Promise<AIResponse> {
  const systemPrompt = buildSystemPrompt(gardenContext);

  let rawText: string;
  try {
    rawText = await callGeminiAPI(
      'gemini-2.5-flash',
      buildContents(chatHistory ?? [], message),
      systemPrompt,
    );
  } catch (err) {
    const isNoKey = err instanceof Error && err.message === 'GEMINI_API_KEY_MISSING';
    if (isNoKey) {
      const fallback = buildFallbackResponse(message, gardenContext);
      return { text: fallback, actions: [], suggestions: [] };
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
      'gemini-2.5-flash',
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
        suggestions: [],
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
      'gemini-2.5-flash',
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
