import type {
  Garden,
  Zone,
  GardenSnapshot,
  ZoneSnapshot,
  CropAssignment,
  ClimateConfig,
  WeatherData,
  GpsPoint,
  ActionItem,
  CropDetection,
  PestDetection,
  DiseaseDetection,
} from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uuid(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomInt(min: number, max: number): number {
  return Math.floor(randomBetween(min, max + 1));
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

const GROWTH_STAGES = [
  'germinating',
  'seedling',
  'vegetative',
  'flowering',
  'fruiting',
  'harvest_ready',
  'dormant',
];

const GROWTH_STAGE_EMOJIS: Record<string, string> = {
  germinating: '🌱',
  seedling: '🌱',
  vegetative: '🌿',
  flowering: '🌸',
  fruiting: '🍅',
  harvest_ready: '✅',
  dormant: '🟫',
};

function growthStageFromDaysSincePlanting(days: number): string {
  if (days < 7) return 'germinating';
  if (days < 21) return 'seedling';
  if (days < 45) return 'vegetative';
  if (days < 65) return 'flowering';
  if (days < 85) return 'fruiting';
  if (days < 100) return 'harvest_ready';
  return 'dormant';
}

function makeDefaultWeather(): WeatherData {
  return {
    date: todayISO(),
    temp_avg_c: 18,
    temp_max_c: 23,
    temp_min_c: 12,
    rain_mm_7d: 22,
    rain_mm_today: 0,
    humidity_pct: 65,
    wind_kmh: 12,
    uv_index: 5,
    daylight_hours: 16,
    gdd_accumulated: 420,
  };
}

// ---------------------------------------------------------------------------
// 1. processVideoUpdate
// ---------------------------------------------------------------------------

/**
 * Simulates the video processing pipeline (FFmpeg keyframe extraction +
 * Gemini Vision analysis).  In the browser we can't run FFmpeg natively,
 * so this builds metadata from the File object and then falls back to
 * generateMockSnapshot.  In production this would:
 *   1. Upload to a server-side API route that runs FFmpeg
 *   2. Extract keyframes at ~1 fps
 *   3. Match each frame to a garden zone via GPS
 *   4. Call Gemini Vision on each matched frame
 */
export async function processVideoUpdate(
  file: File,
  garden: Garden,
): Promise<GardenSnapshot> {
  // Simulate async processing delay
  await new Promise((r) => setTimeout(r, 800));

  const snapshot = generateMockSnapshot(garden);

  // Enrich snapshot with file metadata for provenance
  return {
    ...snapshot,
    video_update_id: `video_${file.name.replace(/\W+/g, '_')}_${Date.now()}`,
  };
}

// ---------------------------------------------------------------------------
// 2. analyzeFrameWithGemini
// ---------------------------------------------------------------------------

/**
 * Sends a base64-encoded video frame to Gemini Vision API and returns a
 * structured ZoneSnapshot.  Falls back to mock data when no API key is
 * configured.
 */
export async function analyzeFrameWithGemini(
  imageBase64: string,
  zoneContext: {
    zoneName: string;
    plannedCrops: string[];
    plantedDate: string;
    climate: ClimateConfig;
  },
): Promise<ZoneSnapshot> {
  const apiKey =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_GEMINI_API_KEY
      : undefined;

  if (!apiKey) {
    // No API key – return plausible mock data
    return buildMockZoneSnapshot(`mock_zone_${Date.now()}`, {
      name: zoneContext.zoneName,
      plannedCropNames: zoneContext.plannedCrops,
      plantedDate: zoneContext.plantedDate,
    });
  }

  const prompt = `You are an expert horticulturalist analysing a garden zone photograph.

Zone: ${zoneContext.zoneName}
Planned crops: ${zoneContext.plannedCrops.join(', ')}
Planting date: ${zoneContext.plantedDate}
Climate zone: ${zoneContext.climate.usda_zone} (${zoneContext.climate.location})

Respond ONLY with a valid JSON object matching this exact schema:
{
  "health_score": <1-10>,
  "growth_stage": "<germinating|seedling|vegetative|flowering|fruiting|harvest_ready|dormant>",
  "growth_vs_expected": "<ahead|on-track|behind|stalled>",
  "coverage_pct": <0-100>,
  "crops_detected": [{"species":"","confidence":0,"count_estimate":0,"health":0,"height_cm":0,"issues":[]}],
  "weeds": {"severity":"<none|low|moderate|high>","types":[]},
  "pests": [{"type":"","confidence":0,"severity":"<low|moderate|high>"}],
  "diseases": [{"type":"","confidence":0,"affected_area_pct":0}],
  "soil": {"moisture":"<dry|moist|wet>","mulch_pct":0,"bare_pct":0},
  "action_items": [{"priority":"<high|medium|low>","action":""}],
  "harvest_readiness": {"ready":false,"days_to_harvest":0}
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: imageBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const json = await response.json();
    const text: string =
      json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Extract JSON block from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in Gemini response');
    const parsed = JSON.parse(jsonMatch[0]);

    const zoneId = `zone_gemini_${Date.now()}`;
    return {
      zone_id: zoneId,
      health_score: parsed.health_score ?? 7,
      growth_stage: parsed.growth_stage ?? 'vegetative',
      growth_vs_expected: parsed.growth_vs_expected ?? 'on-track',
      coverage_pct: parsed.coverage_pct ?? 70,
      crops_detected: (parsed.crops_detected ?? []) as CropDetection[],
      weeds: parsed.weeds ?? { severity: 'none', types: [] },
      pests: (parsed.pests ?? []) as PestDetection[],
      diseases: (parsed.diseases ?? []) as DiseaseDetection[],
      soil: parsed.soil ?? { moisture: 'moist', mulch_pct: 20, bare_pct: 10 },
      action_items: ((parsed.action_items ?? []) as {
        priority: 'high' | 'medium' | 'low';
        action: string;
      }[]).map((item) => ({
        priority: item.priority,
        action: item.action,
        zone_id: zoneId,
        auto_generated: true,
        completed: false,
      })),
      harvest_readiness: parsed.harvest_readiness ?? {
        ready: false,
        days_to_harvest: 30,
      },
      photo_urls: [],
      thumbnail_url: '',
      gemini_response: parsed,
    };
  } catch (err) {
    console.warn('Gemini Vision call failed, using mock data:', err);
    return buildMockZoneSnapshot(`mock_zone_${Date.now()}`, {
      name: zoneContext.zoneName,
      plannedCropNames: zoneContext.plannedCrops,
      plantedDate: zoneContext.plantedDate,
    });
  }
}

// ---------------------------------------------------------------------------
// 3. buildVisionPrompt
// ---------------------------------------------------------------------------

/**
 * Builds the structured Gemini Vision prompt for a specific zone.
 * Based on spec section 13e.
 */
export function buildVisionPrompt(
  zone: Zone,
  crops: CropAssignment[],
  climate: ClimateConfig,
  weather?: WeatherData,
): string {
  const cropList = crops
    .map((c) => `${c.crop_id} (qty: ${c.qty}${c.sow_date ? `, sown: ${c.sow_date}` : ''})`)
    .join(', ');

  const weatherSection = weather
    ? `
## Current Weather Conditions
- Date: ${weather.date}
- Temperature: ${weather.temp_min_c}–${weather.temp_max_c}°C (avg ${weather.temp_avg_c}°C)
- Rainfall last 7 days: ${weather.rain_mm_7d} mm
- Humidity: ${weather.humidity_pct}%
- Wind: ${weather.wind_kmh} km/h
- UV Index: ${weather.uv_index}
- GDD accumulated: ${weather.gdd_accumulated}`
    : '';

  return `You are an expert horticulturalist and plant pathologist analysing a photograph of a kitchen garden zone.

## Zone Details
- Name: ${zone.name}
- Type: ${zone.type}
- Dimensions: ${zone.width_m}m × ${zone.depth_m}m
- Shape: ${zone.shape}
- Notes: ${zone.notes || 'none'}

## Planned Crops
${cropList || 'No crops assigned'}

## Climate Context
- Location: ${climate.location}
- USDA Zone: ${climate.usda_zone}
- Soil type: ${climate.soil_type} (pH ${climate.soil_ph})
- Last frost: ${climate.last_frost} | First frost: ${climate.first_frost}
- Growing season: ${climate.growing_season_days} days
- Wind exposure: ${climate.wind_exposure}
${weatherSection}

## Analysis Instructions
Examine the photograph carefully and respond ONLY with a valid JSON object:

{
  "health_score": <integer 1-10, where 10 is perfect health>,
  "growth_stage": "<one of: germinating, seedling, vegetative, flowering, fruiting, harvest_ready, dormant>",
  "growth_vs_expected": "<one of: ahead, on-track, behind, stalled>",
  "coverage_pct": <0-100, percentage of bed covered by crops>,
  "crops_detected": [
    {
      "species": "<common name>",
      "confidence": <0.0-1.0>,
      "count_estimate": <integer or null>,
      "health": <1-10>,
      "height_cm": <estimated height in cm>,
      "issues": ["<list any visible problems>"]
    }
  ],
  "weeds": {
    "severity": "<none|low|moderate|high>",
    "types": ["<weed species if identifiable>"]
  },
  "pests": [
    {
      "type": "<pest name>",
      "confidence": <0.0-1.0>,
      "severity": "<low|moderate|high>"
    }
  ],
  "diseases": [
    {
      "type": "<disease name>",
      "confidence": <0.0-1.0>,
      "affected_area_pct": <0-100>
    }
  ],
  "soil": {
    "moisture": "<dry|moist|wet>",
    "mulch_pct": <0-100>,
    "bare_pct": <0-100>
  },
  "action_items": [
    {
      "priority": "<high|medium|low>",
      "action": "<specific actionable recommendation>"
    }
  ],
  "harvest_readiness": {
    "ready": <true|false>,
    "days_to_harvest": <estimated days, 0 if ready now>
  }
}

Be specific and actionable. Identify visible issues early. Consider the climate context when assessing growth stage expectations.`;
}

// ---------------------------------------------------------------------------
// 4. generateMockSnapshot
// ---------------------------------------------------------------------------

/**
 * Creates a realistic mock GardenSnapshot for demo/testing purposes.
 * Useful when no Gemini API key is available.
 */
export function generateMockSnapshot(garden: Garden): GardenSnapshot {
  const growingZones = garden.zones.filter(
    (z) =>
      z.category === 'growing' &&
      z.type !== 'compost_station' &&
      z.type !== 'path' &&
      z.type !== 'gate' &&
      z.type !== 'fence',
  );

  const activeSeason = garden.seasons.find(
    (s) => s.id === garden.active_season,
  );

  const zoneSnapshots: ZoneSnapshot[] = growingZones.map((zone) => {
    const assignment = activeSeason?.crop_assignments.find(
      (ca) => ca.zone_id === zone.id,
    );
    const firstCrop = assignment?.crops[0];
    const plantedDate = firstCrop?.sow_date ?? null;

    const daysSincePlanting = plantedDate
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(plantedDate).getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : randomInt(20, 60);

    const cropNames =
      assignment?.crops.map((c) => c.crop_id) ??
      [];

    return buildMockZoneSnapshot(zone.id, {
      name: zone.name,
      plannedCropNames: cropNames,
      plantedDate: plantedDate ?? undefined,
      daysSincePlanting,
    });
  });

  return {
    id: uuid(),
    garden_id: garden.id,
    video_update_id: `mock_${uuid()}`,
    date: todayISO(),
    weather: makeDefaultWeather(),
    zones: zoneSnapshots,
  };
}

// ---------------------------------------------------------------------------
// Internal mock zone builder
// ---------------------------------------------------------------------------

function buildMockZoneSnapshot(
  zoneId: string,
  opts: {
    name: string;
    plannedCropNames?: string[];
    plantedDate?: string;
    daysSincePlanting?: number;
  },
): ZoneSnapshot {
  const days = opts.daysSincePlanting ?? randomInt(20, 60);
  const growthStage = growthStageFromDaysSincePlanting(days);

  const healthScore = randomInt(6, 9);
  const hasPest = Math.random() < 0.2;
  const hasDisease = Math.random() < 0.1;
  const hasWeeds = Math.random() < 0.35;
  const harvestReady = growthStage === 'harvest_ready';

  const pests: PestDetection[] = hasPest
    ? [
        {
          type: ['aphids', 'slugs', 'caterpillars', 'whitefly'][
            randomInt(0, 3)
          ],
          confidence: parseFloat(randomBetween(0.6, 0.9).toFixed(2)),
          severity: (['low', 'moderate', 'high'] as const)[randomInt(0, 2)],
        },
      ]
    : [];

  const diseases: DiseaseDetection[] = hasDisease
    ? [
        {
          type: ['powdery mildew', 'blight', 'rust', 'damping off'][
            randomInt(0, 3)
          ],
          confidence: parseFloat(randomBetween(0.5, 0.85).toFixed(2)),
          affected_area_pct: randomInt(5, 30),
        },
      ]
    : [];

  const crops: CropDetection[] =
    opts.plannedCropNames && opts.plannedCropNames.length > 0
      ? opts.plannedCropNames.slice(0, 3).map((name) => ({
          species: name,
          confidence: parseFloat(randomBetween(0.7, 0.95).toFixed(2)),
          count_estimate: randomInt(3, 20),
          health: randomInt(6, 9),
          height_cm: randomInt(10, 60),
          issues:
            hasPest && Math.random() < 0.5
              ? ['pest damage visible']
              : hasDisease && Math.random() < 0.4
              ? ['leaf discolouration']
              : [],
        }))
      : [];

  const actionItems: ActionItem[] = [];

  if (hasPest) {
    actionItems.push({
      priority: pests[0].severity === 'high' ? 'high' : 'medium',
      action: `Treat ${pests[0].type} – inspect undersides of leaves and apply appropriate control`,
      zone_id: zoneId,
      auto_generated: true,
      completed: false,
    });
  }

  if (hasDisease) {
    actionItems.push({
      priority: 'high',
      action: `${diseases[0].type} detected on ${diseases[0].affected_area_pct}% of canopy – remove affected tissue and improve air circulation`,
      zone_id: zoneId,
      auto_generated: true,
      completed: false,
    });
  }

  if (hasWeeds) {
    actionItems.push({
      priority: 'low',
      action: 'Hand-weed bed and apply mulch to suppress regrowth',
      zone_id: zoneId,
      auto_generated: true,
      completed: false,
    });
  }

  if (harvestReady) {
    actionItems.push({
      priority: 'high',
      action: 'Crops appear harvest-ready – check and harvest promptly to maintain quality',
      zone_id: zoneId,
      auto_generated: true,
      completed: false,
    });
  }

  if (healthScore <= 6) {
    actionItems.push({
      priority: 'medium',
      action: 'Overall health below target – consider foliar feed and check watering schedule',
      zone_id: zoneId,
      auto_generated: true,
      completed: false,
    });
  }

  const growthVsExpected = ((): ZoneSnapshot['growth_vs_expected'] => {
    const r = Math.random();
    if (r < 0.15) return 'ahead';
    if (r < 0.6) return 'on-track';
    if (r < 0.85) return 'behind';
    return 'stalled';
  })();

  return {
    zone_id: zoneId,
    health_score: healthScore,
    growth_stage: growthStage,
    growth_vs_expected: growthVsExpected,
    coverage_pct: randomInt(40, 95),
    crops_detected: crops,
    weeds: {
      severity: hasWeeds
        ? (['low', 'moderate', 'high'] as const)[randomInt(0, 2)]
        : 'none',
      types: hasWeeds
        ? [['bindweed', 'chickweed', 'dandelion', 'couch grass'][randomInt(0, 3)]]
        : [],
    },
    pests,
    diseases,
    soil: {
      moisture: (['dry', 'moist', 'wet'] as const)[randomInt(0, 2)],
      mulch_pct: randomInt(10, 50),
      bare_pct: randomInt(5, 30),
    },
    action_items: actionItems,
    harvest_readiness: {
      ready: harvestReady,
      days_to_harvest: harvestReady ? 0 : randomInt(5, 40),
    },
    photo_urls: [],
    thumbnail_url: '',
    gemini_response: {},
  };
}

// ---------------------------------------------------------------------------
// 5. calculateHealthTrend
// ---------------------------------------------------------------------------

/**
 * Extracts a time-series health trend for a specific zone from a list of
 * historical GardenSnapshots.
 */
export function calculateHealthTrend(
  snapshots: GardenSnapshot[],
  zoneId: string,
): { date: string; score: number }[] {
  return snapshots
    .map((snap) => {
      const zoneSnap = snap.zones.find((z) => z.zone_id === zoneId);
      if (!zoneSnap) return null;
      return { date: snap.date, score: zoneSnap.health_score };
    })
    .filter((item): item is { date: string; score: number } => item !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// 6. generateWeeklyReport
// ---------------------------------------------------------------------------

/**
 * Creates a plain-text weekly garden status report suitable for email or
 * push notification.
 */
export function generateWeeklyReport(
  garden: Garden,
  snapshot: GardenSnapshot,
): string {
  const lines: string[] = [];

  lines.push(`# Weekly Garden Report – ${garden.name}`);
  lines.push(`Date: ${snapshot.date}`);
  lines.push(`Weather: avg ${snapshot.weather.temp_avg_c}°C, rain last 7d: ${snapshot.weather.rain_mm_7d} mm`);
  lines.push('');

  const allActions = snapshot.zones.flatMap((z) => z.action_items);
  const highPriority = allActions.filter((a) => a.priority === 'high' && !a.completed);
  const mediumPriority = allActions.filter((a) => a.priority === 'medium' && !a.completed);
  const lowPriority = allActions.filter((a) => a.priority === 'low' && !a.completed);

  const avgHealth =
    snapshot.zones.length > 0
      ? (
          snapshot.zones.reduce((sum, z) => sum + z.health_score, 0) /
          snapshot.zones.length
        ).toFixed(1)
      : 'N/A';

  lines.push(`## Overall Health: ${avgHealth}/10`);
  lines.push(`Zones monitored: ${snapshot.zones.length}`);
  lines.push('');

  // Zone summaries
  lines.push('## Zone Summary');
  for (const z of snapshot.zones) {
    const zone = garden.zones.find((gz) => gz.id === z.zone_id);
    const name = zone?.name ?? z.zone_id;
    const stageEmoji = GROWTH_STAGE_EMOJIS[z.growth_stage] ?? '🌿';
    lines.push(
      `- ${name}: Health ${z.health_score}/10 ${stageEmoji} ${z.growth_stage} (${z.growth_vs_expected})`,
    );
    if (z.pests.length > 0) {
      lines.push(`  ⚠ Pests: ${z.pests.map((p) => p.type).join(', ')}`);
    }
    if (z.diseases.length > 0) {
      lines.push(`  ⚠ Disease: ${z.diseases.map((d) => d.type).join(', ')}`);
    }
    if (z.harvest_readiness.ready) {
      lines.push(`  ✂ Ready to harvest!`);
    }
  }
  lines.push('');

  // Action items
  if (highPriority.length > 0) {
    lines.push('## 🔴 Urgent Actions');
    for (const a of highPriority) {
      const zone = garden.zones.find((z) => z.id === a.zone_id);
      lines.push(`- [${zone?.name ?? a.zone_id}] ${a.action}`);
    }
    lines.push('');
  }

  if (mediumPriority.length > 0) {
    lines.push('## 🟡 This Week');
    for (const a of mediumPriority) {
      const zone = garden.zones.find((z) => z.id === a.zone_id);
      lines.push(`- [${zone?.name ?? a.zone_id}] ${a.action}`);
    }
    lines.push('');
  }

  if (lowPriority.length > 0) {
    lines.push('## 🟢 When You Have Time');
    for (const a of lowPriority) {
      const zone = garden.zones.find((z) => z.id === a.zone_id);
      lines.push(`- [${zone?.name ?? a.zone_id}] ${a.action}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('Generated by Kitchen Garden Planner Digital Twin');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 7. matchFrameToZone
// ---------------------------------------------------------------------------

/**
 * Matches a GPS point to the most likely garden zone using a simple
 * proportional coordinate mapping.  Returns the zone id or null if no
 * match is found.
 *
 * Algorithm:
 *   1. Map garden corners (NW, NE, SE, SW) to (0,0)–(width,depth) space
 *   2. Interpolate the GPS point into garden-local coordinates
 *   3. Check which zone bounding box contains the point
 */
export function matchFrameToZone(
  gpsPoint: GpsPoint,
  gardenCorners: GpsPoint[],
  zones: Zone[],
): string | null {
  if (gardenCorners.length < 2) return null;

  // Use first two corners to establish a simple lat/lng → metre mapping
  const nw = gardenCorners[0];
  const ne = gardenCorners[1] ?? gardenCorners[0];

  // Degrees to approximate metres (good enough for small gardens)
  const latPerM = 1 / 111320;
  const lngPerM = 1 / (111320 * Math.cos((nw.lat * Math.PI) / 180));

  const totalWidthM = Math.abs(ne.lng - nw.lng) / lngPerM;
  const totalDepthM =
    gardenCorners.length >= 4
      ? Math.abs(gardenCorners[3].lat - nw.lat) / latPerM
      : totalWidthM;

  if (totalWidthM < 0.1 || totalDepthM < 0.1) return null;

  const localX = ((gpsPoint.lng - nw.lng) / lngPerM);
  const localY = ((nw.lat - gpsPoint.lat) / latPerM);

  for (const zone of zones) {
    if (zone.category !== 'growing') continue;
    if (
      localX >= zone.x_m &&
      localX <= zone.x_m + zone.width_m &&
      localY >= zone.y_m &&
      localY <= zone.y_m + zone.depth_m
    ) {
      return zone.id;
    }
  }

  return null;
}
