'use client';

import React from 'react';
import { useGardenStore } from '@/store/gardenStore';
import { cropMap } from '@/data/crops';
import { recommendCropsForZone } from '@/lib/ruleEngine';

export default function ZoneInspector() {
  const garden = useGardenStore((s) => s.garden);
  const selectedZoneIds = useGardenStore((s) => s.canvas.selectedZoneIds);
  const setShowZoneInspector = useGardenStore((s) => s.setShowZoneInspector);
  const removeZone = useGardenStore((s) => s.removeZone);
  const rotateZone = useGardenStore((s) => s.rotateZone);
  const duplicateZone = useGardenStore((s) => s.duplicateZone);
  const lockZone = useGardenStore((s) => s.lockZone);
  const unlockZone = useGardenStore((s) => s.unlockZone);
  const deselectAll = useGardenStore((s) => s.deselectAll);

  if (!garden || selectedZoneIds.length === 0) return null;

  const zone = garden.zones.find((z) => z.id === selectedZoneIds[0]);
  if (!zone) return null;

  // Get crop assignments for this zone
  const activeSeason = garden.seasons.find((s) => s.id === garden.active_season);
  const assignment = activeSeason?.crop_assignments.find((a) => a.zone_id === zone.id);
  const assignedCrops = assignment?.crops ?? [];
  const assignedCropIds = assignedCrops.map((c) => c.crop_id);

  // Get recommendations
  const recommendations = zone.category === 'growing'
    ? recommendCropsForZone(zone, garden.climate, assignedCropIds, 5)
    : [];

  const handleClose = () => {
    setShowZoneInspector(false);
    deselectAll();
  };

  return (
    <div className="fixed top-11 right-0 bottom-0 z-30 w-72 inspector-slide-in">
      <div className="h-full bg-[#0a0f0a]/95 backdrop-blur-xl border-l border-white/[0.06] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-3.5 h-3.5 rounded flex-shrink-0 ring-1 ring-white/10"
              style={{ backgroundColor: zone.color }}
            />
            <h3 className="text-sm font-semibold text-white/80 truncate">{zone.name}</h3>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-white/25 hover:text-white/50 hover:bg-white/[0.06] transition-colors flex-shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Zone details */}
          <div className="px-4 py-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <DetailItem label="Type" value={zone.type.replace(/_/g, ' ')} />
              <DetailItem label="Size" value={`${zone.width_m} x ${zone.depth_m}m`} />
              <DetailItem label="Position" value={`${zone.x_m.toFixed(1)}, ${zone.y_m.toFixed(1)}`} />
              <DetailItem label="Area" value={`${(zone.width_m * zone.depth_m).toFixed(1)} m\u00B2`} />
            </div>

            {zone.notes && (
              <div className="text-[11px] text-white/30 bg-white/[0.02] rounded-lg px-3 py-2 italic">
                {zone.notes}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="px-4 py-2 border-t border-white/[0.04]">
            <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-2">Actions</p>
            <div className="flex flex-wrap gap-1.5">
              <QuickAction label="Rotate" onClick={() => rotateZone(zone.id)} />
              <QuickAction label="Duplicate" onClick={() => duplicateZone(zone.id)} />
              <QuickAction label={zone.locked ? 'Unlock' : 'Lock'} onClick={() => zone.locked ? unlockZone(zone.id) : lockZone(zone.id)} />
              <QuickAction label="Delete" onClick={() => { removeZone(zone.id); handleClose(); }} danger />
            </div>
          </div>

          {/* Assigned crops */}
          {assignedCrops.length > 0 && (
            <div className="px-4 py-3 border-t border-white/[0.04]">
              <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-2">Assigned Crops</p>
              <div className="space-y-1.5">
                {assignedCrops.map((ca) => {
                  const crop = cropMap[ca.crop_id];
                  return (
                    <div key={ca.crop_id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.02]">
                      <span className="text-sm">{crop?.emoji || '🌱'}</span>
                      <span className="text-[12px] text-white/60 flex-1">{crop?.name_en || ca.crop_id}</span>
                      <span className="text-[10px] text-white/25">&times;{ca.qty}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div className="px-4 py-3 border-t border-white/[0.04]">
              <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-2">Recommended Crops</p>
              <div className="space-y-1.5">
                {recommendations.map((rec) => (
                  <div key={rec.crop.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors">
                    <span className="text-sm">{rec.crop.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-[12px] text-white/60 block">{rec.crop.name_en}</span>
                      <span className="text-[10px] text-white/20 block truncate">{rec.reasons[0]}</span>
                    </div>
                    <div className="flex-shrink-0">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
                        style={{
                          backgroundColor: `rgba(52, 211, 153, ${rec.score / 100 * 0.2})`,
                          color: `rgba(52, 211, 153, ${Math.max(0.4, rec.score / 100)})`,
                        }}
                      >
                        {rec.score}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/[0.02] rounded-lg px-2.5 py-2">
      <span className="text-[9px] text-white/20 uppercase tracking-wider block">{label}</span>
      <span className="text-[12px] text-white/60 capitalize">{value}</span>
    </div>
  );
}

function QuickAction({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={[
        'px-2.5 py-1 rounded-lg text-[11px] border transition-colors',
        danger
          ? 'text-red-400/50 border-red-500/10 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20'
          : 'text-white/35 border-white/[0.06] hover:bg-white/[0.04] hover:text-white/60',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
