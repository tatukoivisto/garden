'use client';

import { zoneTemplates } from '@/data/zones';
import type { ZoneTemplate } from '@/types';

function PaletteItem({ template }: { template: ZoneTemplate }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('zone-type', template.type);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-grab active:cursor-grabbing hover:bg-white/[0.04] transition-colors group"
    >
      <div
        className="w-3.5 h-3.5 rounded flex-shrink-0 ring-1 ring-white/10"
        style={{ backgroundColor: template.defaultColor }}
      />
      <span className="text-[11px] font-medium text-white/50 group-hover:text-white/80 transition-colors truncate">
        {template.label}
      </span>
    </div>
  );
}

export default function ZonePalette() {
  const growing = zoneTemplates.filter((t) => t.category === 'growing');
  const structures = zoneTemplates.filter((t) => t.category === 'structure');

  return (
    <div className="p-2 space-y-4">
      <div>
        <p className="px-3 py-2 text-[10px] font-semibold text-white/25 uppercase tracking-widest">
          Growing areas
        </p>
        {growing.map((t) => (
          <PaletteItem key={t.type} template={t} />
        ))}
      </div>
      <div className="border-t border-white/[0.06] pt-2">
        <p className="px-3 py-2 text-[10px] font-semibold text-white/25 uppercase tracking-widest">
          Structures
        </p>
        {structures.map((t) => (
          <PaletteItem key={t.type} template={t} />
        ))}
      </div>
    </div>
  );
}
