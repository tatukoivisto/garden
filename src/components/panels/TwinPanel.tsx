'use client';

/**
 * TwinPanel – digital-twin detail panel.
 *
 * Shown when the user activates the "Twin" tab in the sidebar.  Provides:
 *   - Video drag-and-drop upload with progress simulation
 *   - Zone health card grid
 *   - SVG health-trend sparkline for the selected zone
 *   - Prioritised action-items list
 *   - Side-by-side photo comparison for the selected zone
 *   - Last-updated timestamp with manual refresh button
 */

import { useCallback, useRef, useState } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import {
  processVideoUpdate,
  generateMockSnapshot,
  calculateHealthTrend,
} from '@/lib/digitalTwin';
import type { GardenSnapshot, Zone, ZoneSnapshot, ActionItem } from '@/types';

// ---------------------------------------------------------------------------
// Constants & helpers
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

function healthColorClass(score: number): string {
  if (score >= 8) return 'bg-green-500 text-white';
  if (score >= 6) return 'bg-yellow-400 text-white';
  if (score >= 4) return 'bg-orange-400 text-white';
  return 'bg-red-500 text-white';
}

function healthRingColor(score: number): string {
  if (score >= 8) return '#22c55e';
  if (score >= 6) return '#eab308';
  if (score >= 4) return '#f97316';
  return '#ef4444';
}

function priorityColorClass(priority: ActionItem['priority']): string {
  switch (priority) {
    case 'high':   return 'border-l-red-500 bg-red-50';
    case 'medium': return 'border-l-yellow-400 bg-yellow-50';
    case 'low':    return 'border-l-green-500 bg-green-50';
  }
}

function priorityDotClass(priority: ActionItem['priority']): string {
  switch (priority) {
    case 'high':   return 'bg-red-500';
    case 'medium': return 'bg-yellow-400';
    case 'low':    return 'bg-green-500';
  }
}

function timeAgo(date: Date | string): string {
  const ms = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(ms / 60_000);
  const hours   = Math.floor(ms / 3_600_000);
  const days    = Math.floor(ms / 86_400_000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

// ---------------------------------------------------------------------------
// Health trend sparkline (pure SVG)
// ---------------------------------------------------------------------------

interface SparklineProps {
  data: { date: string; score: number }[];
  width?: number;
  height?: number;
}

function HealthSparkline({ data, width = 260, height = 60 }: SparklineProps) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-14 text-xs text-slate-400">
        Not enough data for trend chart
      </div>
    );
  }

  const padX = 8;
  const padY = 6;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const minScore = Math.max(0, Math.min(...data.map((d) => d.score)) - 1);
  const maxScore = Math.min(10, Math.max(...data.map((d) => d.score)) + 1);
  const scoreRange = maxScore - minScore || 1;

  function toX(i: number) {
    return padX + (i / (data.length - 1)) * innerW;
  }
  function toY(score: number) {
    return padY + innerH - ((score - minScore) / scoreRange) * innerH;
  }

  const linePath =
    data
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(d.score).toFixed(1)}`)
      .join(' ');

  const areaPath = `${linePath} L ${toX(data.length - 1).toFixed(1)} ${(padY + innerH).toFixed(1)} L ${padX} ${(padY + innerH).toFixed(1)} Z`;

  const lastScore = data[data.length - 1].score;
  const dotColor  = healthRingColor(lastScore);

  return (
    <svg width={width} height={height} aria-label="Health trend">
      {/* Horizontal grid lines at 4, 6, 8 */}
      {[4, 6, 8].map((v) => (
        <line
          key={v}
          x1={padX}
          x2={padX + innerW}
          y1={toY(v)}
          y2={toY(v)}
          stroke="#e2e8f0"
          strokeWidth={1}
        />
      ))}
      {/* Score labels */}
      {[4, 6, 8].map((v) => (
        <text
          key={v}
          x={padX - 2}
          y={toY(v) + 3}
          textAnchor="end"
          fontSize={7}
          fontFamily="system-ui, sans-serif"
          fill="#94a3b8"
        >
          {v}
        </text>
      ))}
      {/* Filled area */}
      <path d={areaPath} fill="#4A7C59" fillOpacity={0.12} />
      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke="#4A7C59"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Data points */}
      {data.map((d, i) => (
        <circle
          key={i}
          cx={toX(i)}
          cy={toY(d.score)}
          r={3}
          fill={i === data.length - 1 ? dotColor : '#4A7C59'}
          stroke="white"
          strokeWidth={1.5}
        />
      ))}
      {/* Date labels: first and last only */}
      <text
        x={toX(0)}
        y={height - 1}
        textAnchor="middle"
        fontSize={7}
        fontFamily="system-ui, sans-serif"
        fill="#94a3b8"
      >
        {data[0].date.slice(5)}
      </text>
      <text
        x={toX(data.length - 1)}
        y={height - 1}
        textAnchor="middle"
        fontSize={7}
        fontFamily="system-ui, sans-serif"
        fill="#94a3b8"
      >
        {data[data.length - 1].date.slice(5)}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Zone health card
// ---------------------------------------------------------------------------

interface ZoneCardProps {
  zone: Zone;
  snapshot: ZoneSnapshot;
  selected: boolean;
  onClick: () => void;
}

function ZoneCard({ zone, snapshot, selected, onClick }: ZoneCardProps) {
  const stageEmoji = GROWTH_STAGE_EMOJI[snapshot.growth_stage] ?? '🌿';
  const hasPest    = snapshot.pests.length > 0;
  const hasDisease = snapshot.diseases.length > 0;
  const hasWeeds   = snapshot.weeds.severity !== 'none';

  return (
    <button
      onClick={onClick}
      className={[
        'w-full text-left rounded-xl border-2 p-3 transition-all duration-150 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garden-primary',
        selected
          ? 'border-garden-primary shadow-md bg-garden-primary/5'
          : 'border-slate-200 bg-white hover:border-slate-300',
      ].join(' ')}
    >
      {/* Top row: zone name + health badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-slate-700 leading-tight">
          {zone.name}
        </span>
        <span
          className={`flex-shrink-0 w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center ${healthColorClass(snapshot.health_score)}`}
        >
          {snapshot.health_score}
        </span>
      </div>

      {/* Growth stage + emoji */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-base leading-none">{stageEmoji}</span>
        <span className="text-[10px] text-slate-500 capitalize">
          {snapshot.growth_stage.replace(/_/g, ' ')}
        </span>
        <span
          className={`ml-auto text-[9px] px-1.5 py-0.5 rounded font-medium ${
            snapshot.growth_vs_expected === 'ahead'
              ? 'bg-green-100 text-green-700'
              : snapshot.growth_vs_expected === 'on-track'
              ? 'bg-blue-100 text-blue-700'
              : snapshot.growth_vs_expected === 'behind'
              ? 'bg-orange-100 text-orange-700'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {snapshot.growth_vs_expected}
        </span>
      </div>

      {/* Alert icons */}
      {(hasPest || hasDisease || hasWeeds || snapshot.harvest_readiness.ready) && (
        <div className="flex gap-1 flex-wrap">
          {snapshot.harvest_readiness.ready && (
            <span title="Harvest ready" className="text-xs">✂️</span>
          )}
          {hasPest && (
            <span title={`Pest: ${snapshot.pests[0].type}`} className="text-xs">🐛</span>
          )}
          {hasDisease && (
            <span title={`Disease: ${snapshot.diseases[0].type}`} className="text-xs">🍂</span>
          )}
          {hasWeeds && (
            <span title={`Weeds: ${snapshot.weeds.severity}`} className="text-xs">🌾</span>
          )}
          {snapshot.soil.moisture === 'dry' && (
            <span title="Soil dry" className="text-xs">💧</span>
          )}
        </div>
      )}

      {/* Photo thumbnail if available */}
      {snapshot.thumbnail_url && (
        <div className="mt-2 rounded overflow-hidden bg-slate-100 h-16">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={snapshot.thumbnail_url}
            alt={`${zone.name} thumbnail`}
            className="w-full h-full object-cover"
          />
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main TwinPanel component
// ---------------------------------------------------------------------------

export default function TwinPanel() {
  const garden = useGardenStore((s) => s.garden);
  const updateZone = useGardenStore((s) => s.updateZone);

  // Latest full snapshot
  const [snapshot, setSnapshot] = useState<GardenSnapshot | null>(null);
  // Simulated list of historical snapshots for the trend chart
  const [snapshotHistory, setSnapshotHistory] = useState<GardenSnapshot[]>([]);
  // The zone currently highlighted in the detail view
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------------------
  // Derived selections
  // -------------------------------------------------------------------------

  const selectedZone = garden?.zones.find((z) => z.id === selectedZoneId) ?? null;
  const selectedZoneSnap = snapshot?.zones.find((z) => z.zone_id === selectedZoneId) ?? null;

  const trendData = selectedZoneId
    ? calculateHealthTrend(snapshotHistory, selectedZoneId)
    : [];

  const allActionItems: ActionItem[] = snapshot
    ? snapshot.zones
        .flatMap((z) => z.action_items)
        .filter((a) => !a.completed)
        .sort((a, b) => {
          const order = { high: 0, medium: 1, low: 2 };
          return order[a.priority] - order[b.priority];
        })
    : [];

  // -------------------------------------------------------------------------
  // Upload handler
  // -------------------------------------------------------------------------

  const processFile = useCallback(
    async (file: File) => {
      if (!garden) return;
      if (!file.type.startsWith('video/') && !file.type.startsWith('image/')) {
        setUploadError('Please upload a video or image file.');
        return;
      }

      setUploading(true);
      setUploadProgress(0);
      setUploadError(null);

      // Simulate staged upload progress
      const progressSteps = [10, 25, 45, 65, 80, 92, 100];
      for (const step of progressSteps) {
        await new Promise<void>((r) =>
          setTimeout(r, 200 + Math.random() * 300),
        );
        setUploadProgress(step);
      }

      try {
        const newSnapshot = await processVideoUpdate(file, garden);
        setSnapshot(newSnapshot);
        setSnapshotHistory((prev) => [...prev, newSnapshot].slice(-12)); // keep last 12

        // Persist latest_snapshot into each zone in the store
        for (const zoneSnap of newSnapshot.zones) {
          updateZone(zoneSnap.zone_id, { latest_snapshot: zoneSnap });
        }

        setLastUpdated(new Date());

        // Auto-select first zone with issues if nothing selected
        if (!selectedZoneId && newSnapshot.zones.length > 0) {
          const withIssues = newSnapshot.zones.find(
            (z) => z.pests.length > 0 || z.diseases.length > 0 || z.harvest_readiness.ready,
          );
          setSelectedZoneId(withIssues?.zone_id ?? newSnapshot.zones[0].zone_id);
        }
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : 'Processing failed',
        );
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    },
    [garden, selectedZoneId, updateZone],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // Reset input so the same file can be re-selected
      e.target.value = '';
    },
    [processFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleDemoSnapshot = useCallback(() => {
    if (!garden) return;
    const mock = generateMockSnapshot(garden);
    setSnapshot(mock);
    setSnapshotHistory((prev) => [...prev, mock].slice(-12));
    for (const zoneSnap of mock.zones) {
      updateZone(zoneSnap.zone_id, { latest_snapshot: zoneSnap });
    }
    setLastUpdated(new Date());
    if (!selectedZoneId && mock.zones.length > 0) {
      setSelectedZoneId(mock.zones[0].zone_id);
    }
  }, [garden, selectedZoneId, updateZone]);

  // -------------------------------------------------------------------------
  // Zones with snapshot data
  // -------------------------------------------------------------------------

  const zonesWithData: { zone: Zone; snap: ZoneSnapshot }[] = garden
    ? garden.zones
        .filter((z) => z.category === 'growing')
        .flatMap((zone) => {
          const snap =
            snapshot?.zones.find((s) => s.zone_id === zone.id) ??
            zone.latest_snapshot;
          return snap ? [{ zone, snap }] : [];
        })
    : [];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!garden) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-slate-400">
        No garden loaded.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-3 py-3 text-sm">

      {/* ── Header: last-update timestamp ─────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          {lastUpdated ? (
            <>Last updated <span className="font-medium text-slate-700">{timeAgo(lastUpdated)}</span></>
          ) : (
            <span className="italic">No data yet</span>
          )}
        </div>
        {snapshot && (
          <button
            onClick={handleDemoSnapshot}
            className="text-xs text-garden-primary hover:text-garden-primary/80 font-medium"
          >
            Refresh mock
          </button>
        )}
      </div>

      {/* ── Video upload area ─────────────────────────────────────────────── */}
      <div>
        <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
          Upload walkthrough video
        </h3>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={[
            'relative rounded-xl border-2 border-dashed p-5 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer',
            dragOver
              ? 'border-garden-primary bg-garden-primary/5'
              : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100',
            uploading ? 'pointer-events-none opacity-70' : '',
          ].join(' ')}
        >
          <span className="text-3xl select-none">🎬</span>
          <p className="text-xs text-slate-500 text-center">
            {dragOver
              ? 'Drop video to process'
              : 'Drag & drop a walkthrough video or click to browse'}
          </p>
          <p className="text-[10px] text-slate-400">MP4, MOV, WebM · image/JPEG also accepted</p>

          {/* Progress bar */}
          {uploading && (
            <div className="w-full mt-2">
              <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                <span>Processing…</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-1.5">
                <div
                  className="bg-garden-primary h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,image/*"
          className="hidden"
          onChange={handleFileInput}
        />

        {uploadError && (
          <p className="mt-1 text-xs text-red-500">{uploadError}</p>
        )}

        {/* Demo button when no snapshot exists */}
        {!snapshot && !uploading && (
          <button
            onClick={handleDemoSnapshot}
            className="mt-2 w-full rounded-lg border border-garden-primary/40 py-1.5 text-xs font-medium text-garden-primary hover:bg-garden-primary/5 transition-colors"
          >
            Generate demo snapshot
          </button>
        )}
      </div>

      {/* ── Zone health cards ─────────────────────────────────────────────── */}
      {zonesWithData.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
            Zone health
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {zonesWithData.map(({ zone, snap }) => (
              <ZoneCard
                key={zone.id}
                zone={zone}
                snapshot={snap}
                selected={selectedZoneId === zone.id}
                onClick={() =>
                  setSelectedZoneId(
                    selectedZoneId === zone.id ? null : zone.id,
                  )
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Selected-zone detail view ──────────────────────────────────────── */}
      {selectedZone && selectedZoneSnap && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {/* Zone detail header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50">
            <span className="text-base">
              {GROWTH_STAGE_EMOJI[selectedZoneSnap.growth_stage] ?? '🌿'}
            </span>
            <span className="font-semibold text-slate-700 text-sm">
              {selectedZone.name}
            </span>
            <span
              className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold ${healthColorClass(selectedZoneSnap.health_score)}`}
            >
              {selectedZoneSnap.health_score}/10
            </span>
          </div>

          <div className="p-3 flex flex-col gap-3">
            {/* Coverage + moisture mini stats */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 py-2 px-1">
                <div className="text-base font-bold text-slate-700">
                  {selectedZoneSnap.coverage_pct}%
                </div>
                <div className="text-[9px] text-slate-400 uppercase tracking-wide">Coverage</div>
              </div>
              <div className="rounded-lg bg-slate-50 py-2 px-1">
                <div className="text-base font-bold text-slate-700 capitalize">
                  {selectedZoneSnap.soil.moisture}
                </div>
                <div className="text-[9px] text-slate-400 uppercase tracking-wide">Soil</div>
              </div>
              <div className="rounded-lg bg-slate-50 py-2 px-1">
                <div className="text-base font-bold text-slate-700">
                  {selectedZoneSnap.harvest_readiness.ready
                    ? 'Now'
                    : `${selectedZoneSnap.harvest_readiness.days_to_harvest}d`}
                </div>
                <div className="text-[9px] text-slate-400 uppercase tracking-wide">Harvest</div>
              </div>
            </div>

            {/* Health trend sparkline */}
            {trendData.length >= 2 ? (
              <div>
                <p className="text-[10px] text-slate-500 font-medium mb-1 uppercase tracking-wide">
                  Health trend
                </p>
                <div className="overflow-hidden">
                  <HealthSparkline data={trendData} width={260} height={64} />
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-slate-400 italic">
                Upload more snapshots to see the health trend.
              </p>
            )}

            {/* Photo comparison */}
            {selectedZoneSnap.photo_urls.length >= 2 ? (
              <div>
                <p className="text-[10px] text-slate-500 font-medium mb-1 uppercase tracking-wide">
                  Photo comparison
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg overflow-hidden bg-slate-100 aspect-video">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedZoneSnap.photo_urls[selectedZoneSnap.photo_urls.length - 2]}
                      alt="Previous photo"
                      className="w-full h-full object-cover"
                    />
                    <p className="text-[9px] text-slate-400 text-center py-0.5">Previous</p>
                  </div>
                  <div className="rounded-lg overflow-hidden bg-slate-100 aspect-video">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedZoneSnap.photo_urls[selectedZoneSnap.photo_urls.length - 1]}
                      alt="Latest photo"
                      className="w-full h-full object-cover"
                    />
                    <p className="text-[9px] text-slate-400 text-center py-0.5">Latest</p>
                  </div>
                </div>
              </div>
            ) : selectedZoneSnap.thumbnail_url ? (
              <div>
                <p className="text-[10px] text-slate-500 font-medium mb-1 uppercase tracking-wide">
                  Latest photo
                </p>
                <div className="rounded-lg overflow-hidden bg-slate-100 h-24">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedZoneSnap.thumbnail_url}
                    alt="Latest photo"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-slate-400 italic">
                No photos in this snapshot (demo mode).
              </p>
            )}

            {/* Detected crops */}
            {selectedZoneSnap.crops_detected.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-500 font-medium mb-1 uppercase tracking-wide">
                  Detected crops
                </p>
                <div className="flex flex-col gap-1">
                  {selectedZoneSnap.crops_detected.map((crop, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs text-slate-600"
                    >
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{
                          background: healthRingColor(crop.health),
                        }}
                      />
                      <span className="font-medium capitalize">{crop.species}</span>
                      <span className="text-slate-400 text-[10px] ml-auto">
                        {Math.round(crop.confidence * 100)}% · ~{crop.count_estimate} plants
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Action items list ─────────────────────────────────────────────── */}
      {allActionItems.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
            Action items
            <span className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold">
              {allActionItems.filter((a) => a.priority === 'high').length || null}
            </span>
          </h3>
          <div className="flex flex-col gap-1.5">
            {allActionItems.map((action, i) => {
              const zone = garden.zones.find((z) => z.id === action.zone_id);
              return (
                <div
                  key={i}
                  className={`border-l-4 rounded-r-lg px-3 py-2 ${priorityColorClass(action.priority)}`}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${priorityDotClass(action.priority)}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-700 leading-snug">
                        {action.action}
                      </p>
                      {zone && (
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {zone.name}
                        </p>
                      )}
                    </div>
                    <span className="text-[9px] uppercase tracking-wide font-semibold text-slate-400 flex-shrink-0">
                      {action.priority}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!snapshot && !uploading && (
        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-slate-400 text-xs">
          <p className="text-2xl mb-2">📡</p>
          <p className="font-medium text-slate-500 mb-1">Digital twin not active</p>
          <p>Upload a walkthrough video or generate a demo snapshot to see health data.</p>
        </div>
      )}
    </div>
  );
}
