'use client';

/**
 * TwinOverlay – SVG <g> overlay that renders digital-twin status badges on top
 * of each garden zone that has a `latest_snapshot`.
 *
 * Drop this inside the main canvas <svg> element, rendered at the same
 * coordinate space as the zones (pixelsPerMeter scaling already applied by the
 * parent canvas).
 */

import type { Zone } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TwinOverlayProps {
  zones: Zone[];
  pixelsPerMeter: number;
  /** Called when the user clicks the camera icon on a zone. */
  onPhotoClick?: (zoneId: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GROWTH_STAGE_EMOJI: Record<string, string> = {
  germinating: '🌱',
  seedling: '🌱',
  vegetative: '🌿',
  flowering: '🌸',
  fruiting: '🍅',
  harvest_ready: '✅',
  dormant: '🟫',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a fill colour for a health score badge.
 *   8–10 → green
 *   6–7  → yellow
 *   4–5  → orange
 *   1–3  → red
 */
function healthColor(score: number): { fill: string; text: string } {
  if (score >= 8) return { fill: '#22c55e', text: '#fff' };
  if (score >= 6) return { fill: '#eab308', text: '#fff' };
  if (score >= 4) return { fill: '#f97316', text: '#fff' };
  return { fill: '#ef4444', text: '#fff' };
}

// ---------------------------------------------------------------------------
// Sub-components (pure SVG fragments)
// ---------------------------------------------------------------------------

/** Small circular health-score badge positioned at the top-right corner of the zone. */
function HealthBadge({
  score,
  cx,
  cy,
}: {
  score: number;
  cx: number;
  cy: number;
}) {
  const { fill, text } = healthColor(score);
  const r = 9;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke="white" strokeWidth={1.5} />
      <text
        x={cx}
        y={cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={8}
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
        fill={text}
      >
        {score}
      </text>
    </g>
  );
}

/** Growth-stage emoji centred below the zone name area. */
function GrowthStageEmoji({
  stage,
  x,
  y,
}: {
  stage: string;
  x: number;
  y: number;
}) {
  const emoji = GROWTH_STAGE_EMOJI[stage] ?? '🌿';
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={13}
      fontFamily="system-ui, sans-serif"
    >
      {emoji}
    </text>
  );
}

/** Row of small alert icons below the growth-stage emoji. */
function AlertBadges({
  hasPest,
  hasDisease,
  hasWeeds,
  lowWater,
  harvestReady,
  x,
  y,
}: {
  hasPest: boolean;
  hasDisease: boolean;
  hasWeeds: boolean;
  lowWater: boolean;
  harvestReady: boolean;
  x: number;
  y: number;
}) {
  const badges: { emoji: string; title: string }[] = [];
  if (harvestReady) badges.push({ emoji: '✂️', title: 'Harvest ready' });
  if (hasPest) badges.push({ emoji: '🐛', title: 'Pests detected' });
  if (hasDisease) badges.push({ emoji: '🍂', title: 'Disease detected' });
  if (hasWeeds) badges.push({ emoji: '🌾', title: 'Weeds present' });
  if (lowWater) badges.push({ emoji: '💧', title: 'Needs water' });

  if (badges.length === 0) return null;

  const spacing = 16;
  const totalWidth = badges.length * spacing;
  const startX = x - totalWidth / 2 + spacing / 2;

  return (
    <g>
      {badges.map((badge, i) => (
        <text
          key={badge.title}
          x={startX + i * spacing}
          y={y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
          fontFamily="system-ui, sans-serif"
        >
          <title>{badge.title}</title>
          {badge.emoji}
        </text>
      ))}
    </g>
  );
}

/** Small camera icon that is clickable if photos exist. */
function PhotoIndicator({
  x,
  y,
  count,
  onClick,
}: {
  x: number;
  y: number;
  count: number;
  onClick?: () => void;
}) {
  if (count === 0) return null;

  return (
    <g
      style={{ cursor: 'pointer' }}
      onClick={onClick}
      role="button"
      aria-label={`${count} photo${count !== 1 ? 's' : ''}`}
    >
      {/* Background pill */}
      <rect
        x={x - 14}
        y={y - 8}
        width={28}
        height={16}
        rx={4}
        fill="rgba(0,0,0,0.55)"
      />
      {/* Camera emoji */}
      <text
        x={x - 4}
        y={y + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={10}
        fontFamily="system-ui, sans-serif"
      >
        📷
      </text>
      {/* Photo count */}
      <text
        x={x + 6}
        y={y + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={7}
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
        fill="white"
      >
        {count}
      </text>
    </g>
  );
}

/** Warning badge shown when detected crops don't match planned crops. */
function DriftBadge({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={9} fill="#f59e0b" stroke="white" strokeWidth={1.5} />
      <text
        x={cx}
        y={cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={9}
        fontFamily="system-ui, sans-serif"
      >
        <title>Detected crops differ from plan</title>
        ⚠
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TwinOverlay({
  zones,
  pixelsPerMeter,
  onPhotoClick,
}: TwinOverlayProps) {
  const zonesWithSnapshot = zones.filter((z) => z.latest_snapshot != null);

  return (
    <g pointerEvents="none">
      {zonesWithSnapshot.map((zone) => {
        const snap = zone.latest_snapshot!;

        // Convert zone metres → SVG pixels
        const px = zone.x_m * pixelsPerMeter;
        const py = zone.y_m * pixelsPerMeter;
        const pw = zone.width_m * pixelsPerMeter;
        const ph = zone.depth_m * pixelsPerMeter;

        // Centre of zone
        const cx = px + pw / 2;
        const cy = py + ph / 2;

        // Derived flags
        const hasPest = snap.pests.length > 0;
        const hasDisease = snap.diseases.length > 0;
        const hasWeeds = snap.weeds.severity !== 'none';
        const lowWater = snap.soil.moisture === 'dry';
        const harvestReady = snap.harvest_readiness.ready;
        const photoCount = snap.photo_urls.length;

        // Detect crop drift: planned crop IDs vs detected species names
        // We do a loose check – if detected crops exist and none of the names
        // appear in the zone's notes/name, flag it.
        const plannedNames = zone.name.toLowerCase();
        const driftDetected =
          snap.crops_detected.length > 0 &&
          snap.crops_detected.every(
            (c) =>
              !plannedNames.includes(c.species.toLowerCase().slice(0, 4)),
          );

        // Layout: health badge at top-right, emoji centred in zone,
        // alerts below emoji, camera at bottom-left, drift at top-left.
        const BADGE_INSET = 10; // px from corner
        const healthBadgeCx = px + pw - BADGE_INSET;
        const healthBadgeCy = py + BADGE_INSET;

        const emojiY = cy - 8;
        const alertY = cy + 10;
        const cameraX = px + BADGE_INSET + 14;
        const cameraY = py + ph - BADGE_INSET;

        const driftBadgeCx = px + BADGE_INSET;
        const driftBadgeCy = py + BADGE_INSET;

        return (
          <g key={zone.id}>
            {/* Health score badge – top-right */}
            <HealthBadge
              score={snap.health_score}
              cx={healthBadgeCx}
              cy={healthBadgeCy}
            />

            {/* Growth-stage emoji – vertical centre */}
            <GrowthStageEmoji stage={snap.growth_stage} x={cx} y={emojiY} />

            {/* Alert row – below emoji */}
            <AlertBadges
              hasPest={hasPest}
              hasDisease={hasDisease}
              hasWeeds={hasWeeds}
              lowWater={lowWater}
              harvestReady={harvestReady}
              x={cx}
              y={alertY}
            />

            {/* Camera / photo indicator – bottom-left (needs pointer events) */}
            <g pointerEvents="all">
              <PhotoIndicator
                x={cameraX}
                y={cameraY}
                count={photoCount}
                onClick={() => onPhotoClick?.(zone.id)}
              />
            </g>

            {/* Drift warning – top-left */}
            {driftDetected && (
              <DriftBadge cx={driftBadgeCx} cy={driftBadgeCy} />
            )}
          </g>
        );
      })}
    </g>
  );
}
