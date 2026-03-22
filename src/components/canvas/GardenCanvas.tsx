'use client';

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import { Zone, ZoneType, PendingAction } from '@/types';
import { getZoneTemplate, zoneTemplates } from '@/data/zones';
import { cropMap } from '@/data/crops';
import { getBedSystemConfig, getZoneCompanionConflicts } from '@/lib/ruleEngine';
import { v4 as uuidv4 } from 'uuid';

const PIXELS_PER_METER = 50;

function getSouthEdgeLabel(edge: string) {
  switch (edge) {
    case 'top': return { top: 'S', bottom: 'N', left: 'E', right: 'W' };
    case 'bottom': return { top: 'N', bottom: 'S', left: 'W', right: 'E' };
    case 'left': return { top: 'E', bottom: 'W', left: 'S', right: 'N' };
    case 'right': return { top: 'W', bottom: 'E', left: 'N', right: 'S' };
    default: return { top: 'S', bottom: 'N', left: 'E', right: 'W' };
  }
}

// ---------------------------------------------------------------------------
// Zone rectangle component
// ---------------------------------------------------------------------------

interface ZoneRectProps {
  zone: Zone;
  ppm: number;
  isSelected: boolean;
  isHighlighted: boolean;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onClick: (e: React.MouseEvent, id: string) => void;
  onResizeStart: (e: React.MouseEvent, id: string, handle: 'nw' | 'ne' | 'sw' | 'se') => void;
  cropEmojis: string[];
  animationDelay?: number;
  isOutsideBoundary: boolean;
}

function ZoneRect({ zone, ppm, isSelected, isHighlighted, onMouseDown, onClick, onResizeStart, cropEmojis, animationDelay = 0, isOutsideBoundary }: ZoneRectProps) {
  const x = zone.x_m * ppm;
  const y = zone.y_m * ppm;
  const w = (zone.rotation_deg === 90 ? zone.depth_m : zone.width_m) * ppm;
  const h = (zone.rotation_deg === 90 ? zone.width_m : zone.depth_m) * ppm;

  const fontSize = Math.min(13, Math.max(7, Math.min(w, h) / 8));
  const maxChars = Math.floor(w / (fontSize * 0.55));
  const truncName = zone.name.length > maxChars ? zone.name.slice(0, maxChars - 1) + '…' : zone.name;

  // Dimension label
  const dimText = `${zone.width_m}×${zone.depth_m}m`;

  return (
    <g
      onMouseDown={(e) => onMouseDown(e, zone.id)}
      onClick={(e) => onClick(e, zone.id)}
      style={{
        cursor: zone.locked ? 'default' : 'move',
        animationDelay: `${animationDelay}ms`,
      }}
      className="zone-enter"
    >
      {/* Shadow */}
      {zone.shape === 'ellipse' ? (
        <ellipse cx={x + w / 2 + 2} cy={y + h / 2 + 2} rx={w / 2} ry={h / 2} fill="rgba(0,0,0,0.15)" />
      ) : (
        <rect x={x + 2} y={y + 2} width={w} height={h} rx={6} fill="rgba(0,0,0,0.15)" />
      )}

      {/* Main shape */}
      {zone.shape === 'ellipse' ? (
        <ellipse
          cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2}
          fill={zone.color} fillOpacity={isOutsideBoundary ? 0.55 : 0.75}
          stroke={isSelected ? '#34d399' : isOutsideBoundary ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.2)'}
          strokeWidth={isSelected ? 2.5 : 1}
          strokeDasharray={isOutsideBoundary ? '4 3' : 'none'}
        />
      ) : (
        <rect
          x={x} y={y} width={w} height={h} rx={6}
          fill={zone.color} fillOpacity={isOutsideBoundary ? 0.55 : 0.75}
          stroke={isSelected ? '#34d399' : isOutsideBoundary ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.2)'}
          strokeWidth={isSelected ? 2.5 : 1}
          strokeDasharray={isOutsideBoundary ? '4 3' : 'none'}
        />
      )}

      {/* Selected glow */}
      {isSelected && zone.shape !== 'ellipse' && (
        <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} rx={8}
          fill="none" stroke="#34d399" strokeWidth={1} strokeOpacity={0.3} />
      )}

      {/* AI highlight pulse */}
      {isHighlighted && !isSelected && zone.shape !== 'ellipse' && (
        <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx={9}
          fill="none" stroke="#34d399" strokeWidth={2} className="zone-highlight-pulse" />
      )}
      {isHighlighted && !isSelected && zone.shape === 'ellipse' && (
        <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2 + 3} ry={h / 2 + 3}
          fill="none" stroke="#34d399" strokeWidth={2} className="zone-highlight-pulse" />
      )}

      {/* Name */}
      <text
        x={x + w / 2} y={y + h / 2 - (cropEmojis.length > 0 ? 7 : 0)}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={fontSize} fontWeight="700" fill="#1a1a1a" pointerEvents="none"
        style={{ textShadow: '0 1px 2px rgba(255,255,255,0.5)' }}
      >
        {truncName}
      </text>

      {/* Crop emojis */}
      {cropEmojis.length > 0 && (
        <text
          x={x + w / 2} y={y + h / 2 + fontSize + 1}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={Math.max(9, fontSize - 2)} pointerEvents="none"
        >
          {cropEmojis.slice(0, 4).join(' ')}
        </text>
      )}

      {/* Dimension label (bottom right, small) */}
      {(w > 40 && h > 30) && (
        <text
          x={x + w - 4} y={y + h - 4}
          textAnchor="end" fontSize={8} fill="rgba(0,0,0,0.35)" pointerEvents="none"
        >
          {dimText}
        </text>
      )}

      {/* Lock icon */}
      {zone.locked && (
        <text x={x + 6} y={y + 12} fontSize={10} pointerEvents="none">🔒</text>
      )}

      {/* Resize handles */}
      {isSelected && !zone.locked && (
        <>
          {([
            { cx: x, cy: y, cursor: 'nw-resize', handle: 'nw' as const },
            { cx: x + w, cy: y, cursor: 'ne-resize', handle: 'ne' as const },
            { cx: x, cy: y + h, cursor: 'sw-resize', handle: 'sw' as const },
            { cx: x + w, cy: y + h, cursor: 'se-resize', handle: 'se' as const },
          ]).map((h, i) => (
            <circle
              key={i} cx={h.cx} cy={h.cy} r={5}
              fill="#34d399" stroke="#0a0f0a" strokeWidth={2}
              style={{ cursor: h.cursor }}
              onMouseDown={(e) => {
                e.stopPropagation();
                onResizeStart(e, zone.id, h.handle);
              }}
            />
          ))}
        </>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Ghost zone for pending add_zone actions
// ---------------------------------------------------------------------------

function GhostZoneRect({ action, ppm }: { action: PendingAction; ppm: number }) {
  const p = action.action.payload as any;
  const template = zoneTemplates.find((t) => t.type === p.type) ?? zoneTemplates[0];
  const x = (p.x_m ?? 0) * ppm;
  const y = (p.y_m ?? 0) * ppm;
  const w = (p.width_m ?? template.defaultWidth_m) * ppm;
  const h = (p.depth_m ?? template.defaultDepth_m) * ppm;
  const name = p.name ?? template.label;
  const color = p.color ?? template.defaultColor;
  const shape = p.shape ?? template.defaultShape;

  const fontSize = Math.min(12, Math.max(7, Math.min(w, h) / 8));

  return (
    <g className="ghost-zone-pulse">
      {shape === 'ellipse' ? (
        <ellipse
          cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2}
          fill={color} fillOpacity={0.15}
          stroke="#34d399" strokeWidth={1.5} strokeDasharray="6 4" strokeOpacity={0.5}
        />
      ) : (
        <rect
          x={x} y={y} width={w} height={h} rx={6}
          fill={color} fillOpacity={0.15}
          stroke="#34d399" strokeWidth={1.5} strokeDasharray="6 4" strokeOpacity={0.5}
        />
      )}
      <text
        x={x + w / 2} y={y + h / 2}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={fontSize} fontWeight="600" fill="#34d399" fillOpacity={0.6} pointerEvents="none"
      >
        {name}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Garden boundary resize handle
// ---------------------------------------------------------------------------

type BoundaryEdge = 'right' | 'bottom' | 'corner';

function BoundaryResizeHandle(
  { edge, gardenW, gardenH, onMouseDown }: {
    edge: BoundaryEdge;
    gardenW: number;
    gardenH: number;
    onMouseDown: (e: React.MouseEvent, edge: BoundaryEdge) => void;
  },
) {
  const handleSize = 8;
  const hitSize = 16; // bigger invisible hit area

  if (edge === 'right') {
    return (
      <g onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, 'right'); }} style={{ cursor: 'ew-resize' }}>
        {/* Invisible hit area */}
        <rect x={gardenW - hitSize / 2} y={0} width={hitSize} height={gardenH} fill="transparent" />
        {/* Visual handle */}
        <rect
          x={gardenW - 2} y={gardenH / 2 - 20}
          width={4} height={40} rx={2}
          fill="rgba(255,255,255,0.15)" className="hover:fill-emerald-400/40 transition-colors"
        />
      </g>
    );
  }

  if (edge === 'bottom') {
    return (
      <g onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, 'bottom'); }} style={{ cursor: 'ns-resize' }}>
        <rect x={0} y={gardenH - hitSize / 2} width={gardenW} height={hitSize} fill="transparent" />
        <rect
          x={gardenW / 2 - 20} y={gardenH - 2}
          width={40} height={4} rx={2}
          fill="rgba(255,255,255,0.15)" className="hover:fill-emerald-400/40 transition-colors"
        />
      </g>
    );
  }

  // Corner
  return (
    <g onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, 'corner'); }} style={{ cursor: 'nwse-resize' }}>
      <rect x={gardenW - hitSize} y={gardenH - hitSize} width={hitSize * 2} height={hitSize * 2} fill="transparent" />
      <circle
        cx={gardenW} cy={gardenH} r={handleSize / 2}
        fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.1)" strokeWidth={1}
        className="hover:fill-emerald-400/50"
      />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Helper: check if zone is outside garden boundary
// ---------------------------------------------------------------------------

function isZoneOutsideBoundary(zone: Zone, gardenW_m: number, gardenH_m: number): boolean {
  const zoneRight = zone.x_m + (zone.rotation_deg === 90 ? zone.depth_m : zone.width_m);
  const zoneBottom = zone.y_m + (zone.rotation_deg === 90 ? zone.width_m : zone.depth_m);
  return zone.x_m < 0 || zone.y_m < 0 || zoneRight > gardenW_m || zoneBottom > gardenH_m;
}

// ---------------------------------------------------------------------------
// Main canvas
// ---------------------------------------------------------------------------

export default function GardenCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const garden = useGardenStore((s) => s.garden);
  const canvas = useGardenStore((s) => s.canvas);
  const addZone = useGardenStore((s) => s.addZone);
  const moveZone = useGardenStore((s) => s.moveZone);
  const selectZone = useGardenStore((s) => s.selectZone);
  const deselectAll = useGardenStore((s) => s.deselectAll);
  const setZoom = useGardenStore((s) => s.setZoom);
  const setPan = useGardenStore((s) => s.setPan);
  const toggleZoneSelection = useGardenStore((s) => s.toggleZoneSelection);
  const pendingActions = useGardenStore((s) => s.pendingActions);
  const highlightedZoneIds = useGardenStore((s) => s.highlightedZoneIds);
  const resizeZone = useGardenStore((s) => s.resizeZone);
  const resizeGarden = useGardenStore((s) => s.resizeGarden);

  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isResizingBoundary, setIsResizingBoundary] = useState(false);
  const [boundaryEdge, setBoundaryEdge] = useState<BoundaryEdge | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [dragZoneId, setDragZoneId] = useState<string | null>(null);
  const [resizeInfo, setResizeInfo] = useState<{
    zoneId: string;
    handle: 'nw' | 'ne' | 'sw' | 'se';
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  // Auto-fit on mount
  useEffect(() => {
    if (!garden || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const gardenW = garden.width_m * PIXELS_PER_METER;
    const gardenH = garden.depth_m * PIXELS_PER_METER;
    const padding = 80;
    const scaleX = (rect.width - padding * 2) / gardenW;
    const scaleY = (rect.height - padding * 2) / gardenH;
    const fitZoom = Math.min(scaleX, scaleY, 2);
    const centeredX = (rect.width - gardenW * fitZoom) / 2;
    const centeredY = (rect.height - gardenH * fitZoom) / 2;
    setZoom(fitZoom);
    setPan(centeredX, centeredY);
  }, [garden?.width_m, garden?.depth_m]);

  if (!garden) return null;

  const { zoom, panX, panY, showGrid, showCompanions, snapToGrid, selectedZoneIds } = canvas;
  const ppm = PIXELS_PER_METER;
  const gardenW = garden.width_m * ppm;
  const gardenH = garden.depth_m * ppm;
  const compass = getSouthEdgeLabel(garden.south_edge);

  const activeSeason = garden.seasons.find((s) => s.id === garden.active_season);
  const getCropEmojis = useCallback((zoneId: string): string[] => {
    if (!activeSeason) return [];
    const assignment = activeSeason.crop_assignments.find((a) => a.zone_id === zoneId);
    if (!assignment) return [];
    return assignment.crops.map((c) => cropMap[c.crop_id]?.emoji || '🌱').slice(0, 4);
  }, [activeSeason]);

  const gridLines = useMemo(() => {
    if (!showGrid) return { h: [] as number[], v: [] as number[] };
    const config = getBedSystemConfig(garden.bed_system);
    const snap = config.gridSnap_cm / 100;
    const h: number[] = [], v: number[] = [];
    for (let x = snap; x < garden.width_m; x += snap) v.push(x * ppm);
    for (let y = snap; y < garden.depth_m; y += snap) h.push(y * ppm);
    return { h, v };
  }, [showGrid, garden.bed_system, garden.width_m, garden.depth_m, ppm]);

  // Wheel handler — non-passive for preventDefault
  const wheelHandler = useCallback((e: WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey) {
      const delta = e.deltaY > 0 ? 0.92 : 1.08;
      const newZoom = Math.max(0.15, Math.min(5, zoom * delta));
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect) {
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const newPanX = mx - (mx - panX) * (newZoom / zoom);
        const newPanY = my - (my - panY) * (newZoom / zoom);
        setPan(newPanX, newPanY);
      }
      setZoom(newZoom);
    } else {
      setPan(panX - e.deltaX, panY - e.deltaY);
    }
  }, [zoom, panX, panY, setZoom, setPan]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener('wheel', wheelHandler, { passive: false });
    return () => el.removeEventListener('wheel', wheelHandler);
  }, [wheelHandler]);

  const handleBackgroundMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as Element).classList.contains('garden-bg') || (e.target as Element).classList.contains('canvas-bg')) {
      deselectAll();
      setIsPanning(true);
      setPanStart({ x: e.clientX - panX, y: e.clientY - panY });
    }
  }, [deselectAll, panX, panY]);

  // Boundary resize start
  const handleBoundaryResizeStart = useCallback((e: React.MouseEvent, edge: BoundaryEdge) => {
    setIsResizingBoundary(true);
    setBoundaryEdge(edge);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) { setPan(e.clientX - panStart.x, e.clientY - panStart.y); }

    // Garden boundary resizing
    if (isResizingBoundary && boundaryEdge) {
      const svgRect = svgRef.current?.getBoundingClientRect();
      if (!svgRect) return;
      const cursorX = ((e.clientX - svgRect.left - panX) / zoom) / ppm;
      const cursorY = ((e.clientY - svgRect.top - panY) / zoom) / ppm;

      const snap = snapToGrid ? getBedSystemConfig(garden.bed_system).gridSnap_cm / 100 : 0.1;
      let newW = garden.width_m;
      let newH = garden.depth_m;

      if (boundaryEdge === 'right' || boundaryEdge === 'corner') {
        newW = Math.max(2, Math.round(cursorX / snap) * snap);
      }
      if (boundaryEdge === 'bottom' || boundaryEdge === 'corner') {
        newH = Math.max(2, Math.round(cursorY / snap) * snap);
      }
      newW = Math.round(newW * 100) / 100;
      newH = Math.round(newH * 100) / 100;
      resizeGarden(newW, newH);
    }

    // Zone resizing
    if (isResizing && resizeInfo) {
      const svgRect = svgRef.current?.getBoundingClientRect();
      if (!svgRect) return;
      const cursorX = ((e.clientX - svgRect.left - panX) / zoom) / ppm;
      const cursorY = ((e.clientY - svgRect.top - panY) / zoom) / ppm;
      const { handle, origX, origY, origW, origH } = resizeInfo;
      let newX = origX, newY = origY, newW = origW, newH = origH;

      if (handle === 'se') {
        newW = Math.max(0.3, cursorX - origX);
        newH = Math.max(0.3, cursorY - origY);
      } else if (handle === 'sw') {
        newW = Math.max(0.3, (origX + origW) - cursorX);
        newX = Math.min(cursorX, origX + origW - 0.3);
        newH = Math.max(0.3, cursorY - origY);
      } else if (handle === 'ne') {
        newW = Math.max(0.3, cursorX - origX);
        newH = Math.max(0.3, (origY + origH) - cursorY);
        newY = Math.min(cursorY, origY + origH - 0.3);
      } else if (handle === 'nw') {
        newW = Math.max(0.3, (origX + origW) - cursorX);
        newX = Math.min(cursorX, origX + origW - 0.3);
        newH = Math.max(0.3, (origY + origH) - cursorY);
        newY = Math.min(cursorY, origY + origH - 0.3);
      }

      if (snapToGrid && !e.shiftKey) {
        const snap = getBedSystemConfig(garden.bed_system).gridSnap_cm / 100;
        newX = Math.round(newX / snap) * snap;
        newY = Math.round(newY / snap) * snap;
        newW = Math.max(snap, Math.round(newW / snap) * snap);
        newH = Math.max(snap, Math.round(newH / snap) * snap);
      }

      newW = Math.round(newW * 100) / 100;
      newH = Math.round(newH * 100) / 100;

      moveZone(resizeInfo.zoneId, Math.round(newX * 100) / 100, Math.round(newY * 100) / 100);
      resizeZone(resizeInfo.zoneId, newW, newH);
    }

    // Zone dragging — NO boundary clamping, zones can go anywhere
    if (isDragging && dragZoneId) {
      const svgRect = svgRef.current?.getBoundingClientRect();
      if (!svgRect) return;
      let newX = ((e.clientX - svgRect.left - panX) / zoom - dragOffset.x) / ppm;
      let newY = ((e.clientY - svgRect.top - panY) / zoom - dragOffset.y) / ppm;
      if (snapToGrid && !e.shiftKey) {
        const snap = getBedSystemConfig(garden.bed_system).gridSnap_cm / 100;
        newX = Math.round(newX / snap) * snap;
        newY = Math.round(newY / snap) * snap;
      }
      moveZone(dragZoneId, Math.round(newX * 100) / 100, Math.round(newY * 100) / 100);
    }
  }, [isPanning, isDragging, isResizing, isResizingBoundary, boundaryEdge, resizeInfo, dragZoneId, panStart, panX, panY, zoom, ppm, dragOffset, snapToGrid, garden, moveZone, resizeZone, resizeGarden, setPan]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setIsDragging(false);
    setDragZoneId(null);
    setIsResizing(false);
    setResizeInfo(null);
    setIsResizingBoundary(false);
    setBoundaryEdge(null);
  }, []);

  const handleZoneMouseDown = useCallback((e: React.MouseEvent, zoneId: string) => {
    e.stopPropagation();
    const zone = garden.zones.find((z) => z.id === zoneId);
    if (!zone || zone.locked) return;
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    setDragOffset({
      x: (e.clientX - svgRect.left - panX) / zoom - zone.x_m * ppm,
      y: (e.clientY - svgRect.top - panY) / zoom - zone.y_m * ppm,
    });
    setDragZoneId(zoneId);
    setIsDragging(true);
  }, [garden.zones, panX, panY, zoom, ppm]);

  const handleZoneClick = useCallback((e: React.MouseEvent, zoneId: string) => {
    e.stopPropagation();
    if (e.shiftKey) toggleZoneSelection(zoneId);
    else selectZone(zoneId);
  }, [selectZone, toggleZoneSelection]);

  const handleResizeStart = useCallback((e: React.MouseEvent, zoneId: string, handle: 'nw' | 'ne' | 'sw' | 'se') => {
    e.stopPropagation();
    const zone = garden.zones.find((z) => z.id === zoneId);
    if (!zone || zone.locked) return;
    setIsResizing(true);
    setResizeInfo({
      zoneId,
      handle,
      origX: zone.x_m,
      origY: zone.y_m,
      origW: zone.width_m,
      origH: zone.depth_m,
    });
  }, [garden.zones]);

  // Drop handler — zones can be dropped anywhere on the canvas
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const zoneType = e.dataTransfer.getData('zone-type') as ZoneType;
    if (!zoneType) return;
    const template = getZoneTemplate(zoneType);
    if (!template) return;
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    let x = ((e.clientX - svgRect.left - panX) / zoom) / ppm - template.defaultWidth_m / 2;
    let y = ((e.clientY - svgRect.top - panY) / zoom) / ppm - template.defaultDepth_m / 2;
    if (snapToGrid) {
      const snap = getBedSystemConfig(garden.bed_system).gridSnap_cm / 100;
      x = Math.round(x / snap) * snap; y = Math.round(y / snap) * snap;
    }
    const newZone: Zone = {
      id: uuidv4(), type: template.type, category: template.category,
      name: template.label, x_m: Math.round(x * 100) / 100, y_m: Math.round(y * 100) / 100,
      width_m: template.defaultWidth_m, depth_m: template.defaultDepth_m,
      rotation_deg: 0, shape: template.defaultShape, color: template.defaultColor,
      locked: false, notes: '', health_history: [], photos: [],
    };
    addZone(newZone); selectZone(newZone.id);
  }, [panX, panY, zoom, ppm, snapToGrid, garden.bed_system, addZone, selectZone]);

  // Companion lines
  const companionLines = useMemo(() => {
    if (!showCompanions || !activeSeason) return [];
    return getZoneCompanionConflicts(garden.zones, garden.seasons, garden.active_season);
  }, [showCompanions, garden.zones, garden.seasons, garden.active_season, activeSeason]);

  const sunBarProps = useMemo(() => {
    switch (garden.south_edge) {
      case 'top': return { x: 0, y: -10, width: gardenW, height: 6 };
      case 'bottom': return { x: 0, y: gardenH + 4, width: gardenW, height: 6 };
      case 'left': return { x: -10, y: 0, width: 6, height: gardenH };
      case 'right': return { x: gardenW + 4, y: 0, width: 6, height: gardenH };
      default: return { x: 0, y: -10, width: gardenW, height: 6 };
    }
  }, [garden.south_edge, gardenW, gardenH]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-[#131916]"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Subtle dot pattern background */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }} />

      <svg
        ref={svgRef}
        className="w-full h-full relative"
        onMouseDown={handleBackgroundMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <defs>
          <filter id="garden-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#000" floodOpacity="0.3" />
          </filter>
        </defs>

        <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
          {/* Infinite canvas background — clickable for panning */}
          <rect className="canvas-bg" x={-5000} y={-5000} width={10000} height={10000} fill="transparent" />

          {/* Garden boundary */}
          <rect
            className="garden-bg"
            x={0} y={0} width={gardenW} height={gardenH}
            fill="#2a3530" rx={8}
            stroke="rgba(255,255,255,0.08)" strokeWidth={1}
            filter="url(#garden-shadow)"
          />

          {/* Inner soil texture */}
          <rect x={0} y={0} width={gardenW} height={gardenH} rx={8}
            fill="url(#soil-pattern)" fillOpacity={0.05} pointerEvents="none" />

          {/* Grid */}
          {showGrid && (
            <g opacity={0.08}>
              {gridLines.v.map((x, i) => (
                <line key={`v${i}`} x1={x} y1={0} x2={x} y2={gardenH} stroke="white" strokeWidth={0.5} />
              ))}
              {gridLines.h.map((y, i) => (
                <line key={`h${i}`} x1={0} y1={y} x2={gardenW} y2={y} stroke="white" strokeWidth={0.5} />
              ))}
            </g>
          )}

          {/* Sun bar */}
          <rect {...sunBarProps} fill="#fbbf24" rx={3} opacity={0.6} />

          {/* Companion lines */}
          {showCompanions && companionLines.map((line: any, i: number) => {
            const zA = garden.zones.find((z) => z.id === line.zoneA);
            const zB = garden.zones.find((z) => z.id === line.zoneB);
            if (!zA || !zB) return null;
            return (
              <line key={`comp-${i}`}
                x1={(zA.x_m + zA.width_m / 2) * ppm} y1={(zA.y_m + zA.depth_m / 2) * ppm}
                x2={(zB.x_m + zB.width_m / 2) * ppm} y2={(zB.y_m + zB.depth_m / 2) * ppm}
                stroke={line.type === 'companion' ? '#34d399' : '#f87171'}
                strokeWidth={1.5} strokeDasharray={line.type === 'antagonist' ? '6 4' : 'none'}
                opacity={0.5}
              />
            );
          })}

          {/* Ghost zones (pending add_zone actions) */}
          {pendingActions
            .filter((pa) => pa.status === 'pending' && pa.action.type === 'add_zone')
            .map((pa) => (
              <GhostZoneRect key={pa.id} action={pa} ppm={ppm} />
            ))
          }

          {/* Zones */}
          {garden.zones.map((zone, i) => (
            <ZoneRect
              key={zone.id} zone={zone} ppm={ppm}
              isSelected={selectedZoneIds.includes(zone.id)}
              isHighlighted={highlightedZoneIds.includes(zone.id)}
              onMouseDown={handleZoneMouseDown}
              onClick={handleZoneClick}
              onResizeStart={handleResizeStart}
              cropEmojis={getCropEmojis(zone.id)}
              animationDelay={i * 100}
              isOutsideBoundary={isZoneOutsideBoundary(zone, garden.width_m, garden.depth_m)}
            />
          ))}

          {/* Garden boundary resize handles */}
          <BoundaryResizeHandle edge="right" gardenW={gardenW} gardenH={gardenH} onMouseDown={handleBoundaryResizeStart} />
          <BoundaryResizeHandle edge="bottom" gardenW={gardenW} gardenH={gardenH} onMouseDown={handleBoundaryResizeStart} />
          <BoundaryResizeHandle edge="corner" gardenW={gardenW} gardenH={gardenH} onMouseDown={handleBoundaryResizeStart} />

          {/* Compass labels */}
          {[
            { x: gardenW / 2, y: -22, label: compass.top },
            { x: gardenW / 2, y: gardenH + 28, label: compass.bottom },
          ].map(({ x, y, label }) => (
            <text key={label + y} x={x} y={y} textAnchor="middle" fontSize={11}
              fontWeight="600" fill="rgba(255,255,255,0.25)" letterSpacing="1">
              {label}
            </text>
          ))}

          {/* Dimensions */}
          <text x={gardenW / 2} y={gardenH + 42} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.15)">
            {garden.width_m} × {garden.depth_m} m
          </text>
        </g>
      </svg>

      {/* Zoom indicator */}
      <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur px-2.5 py-1 rounded-lg text-[10px] text-white/40 font-mono">
        {Math.round(zoom * 100)}%
      </div>

      {/* Zone count */}
      <div className="absolute top-3 right-3 bg-black/50 backdrop-blur px-2.5 py-1 rounded-lg text-[10px] text-white/40">
        {garden.zones.length} zone{garden.zones.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
