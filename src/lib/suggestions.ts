/**
 * Context-aware suggestion engine for the AI command bar.
 *
 * Evaluates garden state and returns ranked suggestions that change
 * dynamically based on what the user has built and the current season.
 */

import type { Garden, Suggestion } from '@/types';

function getCurrentSeason(lat: number): string {
  const month = new Date().getMonth() + 1;
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

const ALL_SUGGESTIONS: Array<Omit<Suggestion, 'id'> & { condition: (g: Garden) => boolean }> = [
  {
    label: 'Add your first bed',
    prompt: 'Add a raised bed to my garden in a good position.',
    icon: '🌱',
    priority: 100,
    category: 'layout',
    condition: (g) => g.zones.length === 0,
  },
  {
    label: 'Assign crops to empty beds',
    prompt: 'Which crops should I plant in my empty beds?',
    icon: '🥬',
    priority: 90,
    category: 'crops',
    condition: (g) => {
      if (g.zones.length === 0) return false;
      const season = g.seasons.find((s) => s.id === g.active_season);
      if (!season) return true;
      const assignedZoneIds = new Set(season.crop_assignments.map((a) => a.zone_id));
      return g.zones.some((z) => z.category === 'growing' && !assignedZoneIds.has(z.id));
    },
  },
  {
    label: 'Check companion conflicts',
    prompt: 'Check my crops for companion planting issues and suggest improvements.',
    icon: '🤝',
    priority: 80,
    category: 'analysis',
    condition: (g) => {
      const season = g.seasons.find((s) => s.id === g.active_season);
      return !!season && season.crop_assignments.length >= 2;
    },
  },
  {
    label: `What to sow now`,
    prompt: `What should I be sowing this ${getMonthName()} in my climate zone?`,
    icon: '📅',
    priority: 70,
    category: 'crops',
    condition: () => true,
  },
  {
    label: 'Optimize layout spacing',
    prompt: 'Review my garden layout and suggest better spacing and positioning.',
    icon: '📐',
    priority: 60,
    category: 'layout',
    condition: (g) => g.zones.length >= 3,
  },
  {
    label: 'Add compost area',
    prompt: 'Add a compost station to my garden in the best location.',
    icon: '♻️',
    priority: 50,
    category: 'layout',
    condition: (g) => g.zones.length > 0 && !g.zones.some((z) => z.type === 'compost_station'),
  },
  {
    label: 'Generate shopping list',
    prompt: 'Generate a shopping list for everything I need for my garden this season.',
    icon: '🛒',
    priority: 45,
    category: 'maintenance',
    condition: (g) => {
      const season = g.seasons.find((s) => s.id === g.active_season);
      return !!season && season.crop_assignments.length > 0;
    },
  },
  {
    label: 'Add frost protection',
    prompt: 'I need protection from frost. Add a greenhouse or cold frame to my garden.',
    icon: '🧊',
    priority: 55,
    category: 'layout',
    condition: (g) => {
      const zoneNum = parseInt(g.climate.usda_zone?.replace(/[ab]/i, '') ?? '6', 10);
      const hasProtection = g.zones.some((z) =>
        ['greenhouse', 'polytunnel', 'cold_frame'].includes(z.type),
      );
      return zoneNum <= 5 && !hasProtection && g.zones.length > 0;
    },
  },
  {
    label: 'Plan crop rotation',
    prompt: 'Help me plan crop rotation for next season to maintain soil health.',
    icon: '🔄',
    priority: 40,
    category: 'crops',
    condition: (g) => {
      const season = g.seasons.find((s) => s.id === g.active_season);
      return !!season && season.crop_assignments.length > 0;
    },
  },
  {
    label: 'Add herb spiral',
    prompt: 'Add a herb spiral near the kitchen entrance with common culinary herbs.',
    icon: '🌿',
    priority: 35,
    category: 'layout',
    condition: (g) => g.zones.length > 0 && !g.zones.some((z) => z.type === 'herb_spiral'),
  },
];

/**
 * Generate context-aware suggestions based on the current garden state.
 * Returns up to `limit` suggestions, sorted by priority.
 */
export function generateSuggestions(garden: Garden, limit = 6): Suggestion[] {
  return ALL_SUGGESTIONS
    .filter((s) => s.condition(garden))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit)
    .map((s, i) => ({
      id: `suggestion-${i}`,
      label: s.label,
      prompt: s.prompt,
      icon: s.icon,
      priority: s.priority,
      category: s.category,
    }));
}
