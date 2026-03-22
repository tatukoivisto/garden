'use client';

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import { Zone, ZoneType } from '@/types';
import { getZoneTemplate } from '@/data/zones';
import { v4 as uuidv4 } from 'uuid';

const PIXELS_PER_METER = 50;

function getSouthEdgeLabel(edge: string): { top: string; bottom: string; left: string; right: string } {
  switch (edge) {
    case 'top': return { top: 'S', bottom: 'N', left: 'E', right: 'W' };
    case 'bottom': return { top: 'N', bottom: 'S', left: 'W', right: 'E' };
    case 'left': return { top: 'E', bottom: 'W', left: 'S', right: 'N' };
    case 'right': return { top: 'W', bottom: 'E', left: 'N', right: 'S' };
    default: return { top: 'S', bottom: 'N', left: 'E', right: 'W' };
  }
}

function darkenColor(hex: string, amount: number = 40): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0x00FF) - amount);
  const b = Math.max(0, (num & 0x0000FF) - amount);
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}

interface ZoneRectProps {
  zone: Zone;
  ppm: number;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent, zoneId: string) => void;
  onClick: (e: React.MouseEvent, zoneId: string) => void;
  cropEmojis: string[];
}

function ZoneRect({ zone, ppm, isSelected, onMouseDown, onClick, cropEmojis }: ZoneRectProps) {
  const x = zone.x_m * ppm;
  const y = zone.y_m * ppm;
  const w = (zone.rotation_deg === 90 ? zone.depth_m : zone.width_m) * ppm;
  const h = (zone.rotation_deg === 90 ? zone.width_m : zone.depth_m) * ppm;

  const fontSize = Math.min(14, Math.max(8, w / 10));
  const truncatedName = zone.name.length > Math.floor(w / (fontSize * 0.6))
    ? zone.name.slice(0, Math.floor(w / (fontSize * 0.6)) - 1) + '…'
    : zone.name;

  return (
    <g
      onMouseDown={(e) => onMouseDown(e, zone.id)}
      onClick={(e) => onClick(e, zone.id)}
      style={{ cursor: zone.locked ? 'default' : 'move' }}
    >
      {zone.shape === 'ellipse' ? (
        <ellipse
          cx={x + w / 2}
          cy={y + h / 2}
          rx={w / 2}
          ry={h / 2}
          fill={zone.color}
          fillOpacity={0.6}
          stroke={isSelected ? '#2563eb' : darkenColor(zone.color)}
          strokeWidth={isSelected ? 2.5 : 1.5}
          strokeDasharray={isSelected ? '6 3' : 'none'}
        />
      ) : (
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={4}
          fill={zone.color}
          fillOpacity={0.6}
          stroke={isSelected ? '#2563eb' : darkenColor(zone.color)}
          strokeWidth={isSelected ? 2.5 : 1.5}
          strokeDasharray={isSelected ? '6 3' : 'none'}
        />
      )}
      <text
        x={x + w / 2}
        y={y + h / 2 - (cropEmojis.length > 0 ? 6 : 0)}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fontWeight="600"
        fill="#333"
        pointerEvents="none"
      >
        {truncatedName}
      </text>
      {cropEmojis.length > 0 && (
        <text
          x={x + w / 2}
          y={y + h / 2 + fontSize}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={Math.max(10, fontSize - 2)}
          pointerEvents="none"
        >
          {cropEmojis.slice(0, 5).join(' ')}
        </text>
      )}
      {zone.locked && (
        <text
          x={x + 8}
          y={y + 14}
          fontSize={12}
          pointerEvents="none"
        >
          🔒
        </text>
      )}
      {zone.latest_snapshot && (
        <>
          <circle
            cx={x + w - 14}
            cy={y + 14}
            r={10}
            fill={
              zone.latest_snapshot.health_score >= 8 ? '#22c55e' :
              zone.latest_snapshot.health_score >= 5 ? '#eab308' :
              zone.latest_snapshot.health_score >= 3 ? '#f97316' : '#ef4444'
            }
            stroke="white"
            strokeWidth={1.5}
          />
          <text
            x={x + w - 14}
            y={y + 14}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={9}
            fontWeight="bold"
            fill="white"
            pointerEvents="none"
          >
            {zone.latest_snapshot.health_score}
          </text>
        </>
      )}
      {/* Resize handles for selected zone */}
      {isSelected && !zone.locked && (
        <>
          {[
            { cx: x, cy: y },
            { cx: x + w, cy: y },
            { cx: x, cy: y + h },
            { cx: x + w, cy: y + h },
            { cx: x + w / 2, cy: y },
            { cx: x + w / 2, cy: y + h },
            { cx: x, cy: y + h / 2 },
            { cx: x + w, cy: y + h / 2 },
          ].map((handle, i) => (
            <rect
              key={i}
              x={handle.cx - 4}
              y={handle.cy - 4}
              width={8}
              height={8}
              fill="white"
              stroke="#2563eb"
              strokeWidth={1.5}
              style={{ cursor: 'nwse-resize' }}
              data-handle={i}
            />
          ))}
        </>
      )}
    </g>
  );
}

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

  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [dragZoneId, setDragZoneId] = useState<string | null>(null);

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
    const { cropMap } = require('@/data/crops');
    return assignment.crops.map((c) => cropMap[c.crop_id]?.emoji || '🌱').slice(0, 5);
  }, [activeSeason]);

  // Grid lines
  const gridLines = useMemo(() => {
    if (!showGrid) return { h: [], v: [] };
    const { getBedSystemConfig } = require('@/lib/ruleEngine');
    const config = getBedSystemConfig(garden.bed_system);
    const snap = config.gridSnap_cm / 100;
    const h: number[] = [];
    const v: number[] = [];
    for (let x = snap; x < garden.width_m; x += snap) {
      v.push(x * ppm);
    }
    for (let y = snap; y < garden.depth_m; y += snap) {
      h.push(y * ppm);
    }
    return { h, v };
  }, [showGrid, garden.bed_system, garden.width_m, garden.depth_m, ppm]);

  // Mouse handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.2, Math.min(5, zoom * delta));
    setZoom(newZoom);
  }, [zoom, setZoom]);

  const handleBackgroundMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as Element).classList.contains('garden-bg')) {
      deselectAll();
      setIsPanning(true);
      setPanStart({ x: e.clientX - panX, y: e.clientY - panY });
    }
  }, [deselectAll, panX, panY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan(e.clientX - panStart.x, e.clientY - panStart.y);
    }
    if (isDragging && dragZoneId) {
      const svgRect = svgRef.current?.getBoundingClientRect();
      if (!svgRect) return;
      const svgX = (e.clientX - svgRect.left - panX) / zoom;
      const svgY = (e.clientY - svgRect.top - panY) / zoom;
      let newX = (svgX - dragOffset.x) / ppm;
      let newY = (svgY - dragOffset.y) / ppm;

      if (snapToGrid && !e.shiftKey) {
        const { getBedSystemConfig } = require('@/lib/ruleEngine');
        const config = getBedSystemConfig(garden.bed_system);
        const snap = config.gridSnap_cm / 100;
        newX = Math.round(newX / snap) * snap;
        newY = Math.round(newY / snap) * snap;
      }

      newX = Math.max(0, Math.min(garden.width_m - 0.5, newX));
      newY = Math.max(0, Math.min(garden.depth_m - 0.5, newY));
      moveZone(dragZoneId, Math.round(newX * 100) / 100, Math.round(newY * 100) / 100);
    }
  }, [isPanning, isDragging, dragZoneId, panStart, panX, panY, zoom, ppm, dragOffset, snapToGrid, garden, moveZone, setPan]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setIsDragging(false);
    setDragZoneId(null);
  }, []);

  const handleZoneMouseDown = useCallback((e: React.MouseEvent, zoneId: string) => {
    e.stopPropagation();
    const zone = garden.zones.find((z) => z.id === zoneId);
    if (!zone || zone.locked) return;

    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    const svgX = (e.clientX - svgRect.left - panX) / zoom;
    const svgY = (e.clientY - svgRect.top - panY) / zoom;

    setDragOffset({
      x: svgX - zone.x_m * ppm,
      y: svgY - zone.y_m * ppm,
    });
    setDragZoneId(zoneId);
    setIsDragging(true);
  }, [garden.zones, panX, panY, zoom, ppm]);

  const handleZoneClick = useCallback((e: React.MouseEvent, zoneId: string) => {
    e.stopPropagation();
    if (e.shiftKey) {
      toggleZoneSelection(zoneId);
    } else {
      selectZone(zoneId);
    }
  }, [selectZone, toggleZoneSelection]);

  // Drop handler for palette zones
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const zoneType = e.dataTransfer.getData('zone-type') as ZoneType;
    if (!zoneType) return;

    const template = getZoneTemplate(zoneType);
    if (!template) return;

    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;

    let x = ((e.clientX - svgRect.left - panX) / zoom) / ppm;
    let y = ((e.clientY - svgRect.top - panY) / zoom) / ppm;

    x = Math.max(0, x - template.defaultWidth_m / 2);
    y = Math.max(0, y - template.defaultDepth_m / 2);

    if (snapToGrid) {
      const { getBedSystemConfig } = require('@/lib/ruleEngine');
      const config = getBedSystemConfig(garden.bed_system);
      const snap = config.gridSnap_cm / 100;
      x = Math.round(x / snap) * snap;
      y = Math.round(y / snap) * snap;
    }

    const newZone: Zone = {
      id: uuidv4(),
      type: template.type,
      category: template.category,
      name: template.label,
      x_m: Math.round(x * 100) / 100,
      y_m: Math.round(y * 100) / 100,
      width_m: template.defaultWidth_m,
      depth_m: template.defaultDepth_m,
      rotation_deg: 0,
      shape: template.defaultShape,
      color: template.defaultColor,
      locked: false,
      notes: '',
      health_history: [],
      photos: [],
    };

    addZone(newZone);
    selectZone(newZone.id);
  }, [panX, panY, zoom, ppm, snapToGrid, garden.bed_system, addZone, selectZone]);

  // Companion lines
  const companionLines = useMemo(() => {
    if (!showCompanions || !activeSeason) return [];
    try {
      const { getZoneCompanionConflicts } = require('@/lib/ruleEngine');
      return getZoneCompanionConflicts(garden.zones, garden.seasons, garden.active_season);
    } catch {
      return [];
    }
  }, [showCompanions, garden.zones, garden.seasons, garden.active_season, activeSeason]);

  // Sun bar position
  const sunBarProps = useMemo(() => {
    switch (garden.south_edge) {
      case 'top': return { x: 0, y: -8, width: gardenW, height: 6 };
      case 'bottom': return { x: 0, y: gardenH + 2, width: gardenW, height: 6 };
      case 'left': return { x: -8, y: 0, width: 6, height: gardenH };
      case 'right': return { x: gardenW + 2, y: 0, width: 6, height: gardenH };
      default: return { x: 0, y: -8, width: gardenW, height: 6 };
    }
  }, [garden.south_edge, gardenW, gardenH]);

  const padding = 60;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-stone-100"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <svg
        ref={svgRef}
        className="w-full h-full"
        onWheel={handleWheel}
        onMouseDown={handleBackgroundMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <g transform={`translate(${panX + padding}, ${panY + padding}) scale(${zoom})`}>
          {/* Garden boundary */}
          <rect
            className="garden-bg"
            x={0}
            y={0}
            width={gardenW}
            height={gardenH}
            fill="#f5f0e8"
            stroke="#8B7355"
            strokeWidth={2}
            rx={2}
          />

          {/* Grid lines */}
          {showGrid && (
            <g opacity={0.25}>
              {gridLines.v.map((x, i) => (
                <line key={`v${i}`} x1={x} y1={0} x2={x} y2={gardenH} stroke="#999" strokeWidth={0.5} />
              ))}
              {gridLines.h.map((y, i) => (
                <line key={`h${i}`} x1={0} y1={y} x2={gardenW} y2={y} stroke="#999" strokeWidth={0.5} />
              ))}
            </g>
          )}

          {/* Sun bar */}
          <rect
            {...sunBarProps}
            fill="#FCD34D"
            rx={3}
            opacity={0.8}
          />
          <text
            x={sunBarProps.x + sunBarProps.width / 2}
            y={sunBarProps.y + sunBarProps.height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={10}
            fill="#92400E"
            fontWeight="bold"
          >
            ☀️
          </text>

          {/* Companion lines */}
          {showCompanions && companionLines.map((line: any, i: number) => {
            const zA = garden.zones.find((z) => z.id === line.zoneA);
            const zB = garden.zones.find((z) => z.id === line.zoneB);
            if (!zA || !zB) return null;
            const ax = (zA.x_m + zA.width_m / 2) * ppm;
            const ay = (zA.y_m + zA.depth_m / 2) * ppm;
            const bx = (zB.x_m + zB.width_m / 2) * ppm;
            const by = (zB.y_m + zB.depth_m / 2) * ppm;
            return (
              <line
                key={`comp-${i}`}
                x1={ax} y1={ay} x2={bx} y2={by}
                stroke={line.type === 'companion' ? '#22c55e' : '#ef4444'}
                strokeWidth={1.5}
                strokeDasharray={line.type === 'antagonist' ? '6 4' : 'none'}
                opacity={0.6}
              />
            );
          })}

          {/* Zones */}
          {garden.zones.map((zone) => (
            <ZoneRect
              key={zone.id}
              zone={zone}
              ppm={ppm}
              isSelected={selectedZoneIds.includes(zone.id)}
              onMouseDown={handleZoneMouseDown}
              onClick={handleZoneClick}
              cropEmojis={getCropEmojis(zone.id)}
            />
          ))}

          {/* Compass labels */}
          <text x={gardenW / 2} y={-20} textAnchor="middle" fontSize={14} fontWeight="bold" fill="#666">
            {compass.top}
          </text>
          <text x={gardenW / 2} y={gardenH + 24} textAnchor="middle" fontSize={14} fontWeight="bold" fill="#666">
            {compass.bottom}
          </text>
          <text x={-16} y={gardenH / 2} textAnchor="middle" fontSize={14} fontWeight="bold" fill="#666" transform={`rotate(-90, -16, ${gardenH / 2})`}>
            {compass.left}
          </text>
          <text x={gardenW + 16} y={gardenH / 2} textAnchor="middle" fontSize={14} fontWeight="bold" fill="#666" transform={`rotate(90, ${gardenW + 16}, ${gardenH / 2})`}>
            {compass.right}
          </text>

          {/* Dimension labels */}
          <text x={gardenW / 2} y={gardenH + 40} textAnchor="middle" fontSize={11} fill="#888">
            {garden.width_m}m
          </text>
          <text x={-30} y={gardenH / 2} textAnchor="middle" fontSize={11} fill="#888" transform={`rotate(-90, -30, ${gardenH / 2})`}>
            {garden.depth_m}m
          </text>

          {/* Scale bar */}
          <g transform={`translate(${gardenW - 80}, ${gardenH + 35})`}>
            <line x1={0} y1={0} x2={ppm} y2={0} stroke="#666" strokeWidth={2} />
            <line x1={0} y1={-3} x2={0} y2={3} stroke="#666" strokeWidth={2} />
            <line x1={ppm} y1={-3} x2={ppm} y2={3} stroke="#666" strokeWidth={2} />
            <text x={ppm / 2} y={14} textAnchor="middle" fontSize={10} fill="#666">1m</text>
          </g>
        </g>
      </svg>

      {/* Zoom indicator */}
      <div className="absolute bottom-4 left-4 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full text-sm text-gray-600 shadow-sm">
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}
