'use client';

import React, { useState, useCallback } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import { generateGardenPlan } from '@/lib/ai';
import { zoneTemplates } from '@/data/zones';
import type { Zone, ChatMessage } from '@/types';

function uuid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------------------------------------------------------------------------
// Size presets
// ---------------------------------------------------------------------------

const SIZE_PRESETS = [
  { label: 'Balcony', desc: 'Containers & pots', width: 2, depth: 1, icon: '🪴' },
  { label: 'Small', desc: 'Backyard patch', width: 4, depth: 3, icon: '🌿' },
  { label: 'Medium', desc: 'Family garden', width: 8, depth: 6, icon: '🏡' },
  { label: 'Large', desc: 'Allotment plot', width: 15, depth: 10, icon: '🌾' },
];

const GOAL_OPTIONS = [
  { id: 'vegetables', label: 'Vegetables', icon: '🥬', desc: 'Tomatoes, carrots, beans...' },
  { id: 'herbs', label: 'Herbs', icon: '🌿', desc: 'Basil, thyme, rosemary...' },
  { id: 'berries', label: 'Berries', icon: '🍓', desc: 'Strawberries, raspberries...' },
  { id: 'flowers', label: 'Flowers', icon: '🌻', desc: 'Pollinator-friendly blooms' },
  { id: 'everything', label: 'Everything', icon: '🌈', desc: 'A bit of it all' },
];

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={[
            'h-1.5 rounded-full transition-all duration-500',
            i === current ? 'w-8 bg-emerald-400' : i < current ? 'w-4 bg-emerald-400/40' : 'w-4 bg-white/10',
          ].join(' ')}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

export default function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [location, setLocation] = useState('Helsinki, Finland');
  const [width, setWidth] = useState(8);
  const [depth, setDepth] = useState(6);
  const [customSize, setCustomSize] = useState(false);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activePreset, setActivePreset] = useState(2); // Medium

  const createNewGarden = useGardenStore((s) => s.createNewGarden);
  const addZone = useGardenStore((s) => s.addZone);
  const assignCrops = useGardenStore((s) => s.assignCrops);
  const setClimate = useGardenStore((s) => s.setClimate);
  const setCanvasVisible = useGardenStore((s) => s.setCanvasVisible);
  const setDisclosureLevel = useGardenStore((s) => s.setDisclosureLevel);
  const addChatMessage = useGardenStore((s) => s.addChatMessage);

  const toggleGoal = (id: string) => {
    setSelectedGoals((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );
  };

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);

    // Create garden
    createNewGarden(location.split(',')[0]?.trim() + ' Garden' || 'My Garden', width, depth);

    const garden = useGardenStore.getState().garden!;
    const goalText = selectedGoals.length > 0
      ? selectedGoals.join(', ')
      : 'vegetables, herbs';

    const description = `${width}x${depth}m garden in ${location}. I want to grow: ${goalText}. Layout with raised beds, paths, and appropriate structures.`;

    try {
      const plan = await generateGardenPlan(description, garden.climate);

      const zoneNameToId = new Map<string, string>();
      for (const partial of plan.zones) {
        const template = zoneTemplates.find((t) => t.type === partial.type) ?? zoneTemplates[0];
        const id = uuid();
        const zone: Zone = {
          id,
          type: partial.type ?? 'raised_bed',
          category: template.category,
          name: partial.name ?? template.label,
          x_m: partial.x_m ?? 0,
          y_m: partial.y_m ?? 0,
          width_m: partial.width_m ?? template.defaultWidth_m,
          depth_m: partial.depth_m ?? template.defaultDepth_m,
          rotation_deg: partial.rotation_deg ?? 0,
          shape: partial.shape ?? template.defaultShape,
          color: partial.color ?? template.defaultColor,
          locked: false,
          notes: partial.notes ?? '',
          health_history: [],
          photos: [],
        };
        addZone(zone);
        zoneNameToId.set(zone.name, id);
      }

      // Apply crop assignments
      const updatedGarden = useGardenStore.getState().garden!;
      for (const assignment of plan.cropAssignments) {
        const zoneId = zoneNameToId.get(assignment.zoneId) ?? assignment.zoneId;
        if (zoneId) {
          assignCrops(zoneId, updatedGarden.active_season, assignment.crops);
        }
      }

      if (plan.climate) {
        setClimate({ ...updatedGarden.climate, ...plan.climate });
      }

      // Add welcome message
      const aiMsg: ChatMessage = {
        id: uuid(),
        role: 'ai',
        content: `Welcome to your garden! I've set up **${plan.zones.length} zones** based on your ${width}x${depth}m space. You can ask me to adjust anything — move beds, swap crops, add structures, or check companion planting.`,
        timestamp: new Date(),
        actions_taken: plan.zones.map((z) => `Added ${z.name}`),
      };
      addChatMessage(aiMsg);
    } catch (err) {
      console.error('[Onboarding] Plan generation failed:', err);
    }

    setCanvasVisible(true);
    setDisclosureLevel(1);
    setIsGenerating(false);
  }, [location, width, depth, selectedGoals, createNewGarden, addZone, assignCrops, setClimate, setCanvasVisible, setDisclosureLevel, addChatMessage]);

  return (
    <div className="fixed inset-0 bg-[#060a06] flex items-center justify-center overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-emerald-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 -right-32 w-80 h-80 bg-emerald-800/15 rounded-full blur-[100px]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
      </div>

      <div className="relative z-10 w-full max-w-lg px-6">
        {/* Header */}
        <div className="text-center mb-10 wizard-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-5">
            <span className="text-3xl">🌱</span>
          </div>
          <h1 className="text-2xl font-semibold text-white/90 tracking-tight">
            Kitchen Garden Planner
          </h1>
          <p className="mt-2 text-sm text-white/35">
            {step === 0 && 'Where is your garden?'}
            {step === 1 && 'How big is your space?'}
            {step === 2 && 'What do you want to grow?'}
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex justify-center mb-8">
          <StepIndicator current={step} total={3} />
        </div>

        {/* Step content */}
        <div className="wizard-step-enter" key={step}>
          {step === 0 && (
            <div className="space-y-4">
              <div className="relative">
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City, Country"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3.5 text-sm text-white/80 placeholder-white/25 outline-none focus:border-emerald-500/40 transition-colors"
                />
                <button
                  onClick={() => {
                    if (navigator.geolocation) {
                      navigator.geolocation.getCurrentPosition(
                        (pos) => setLocation(`${pos.coords.latitude.toFixed(2)}°N, ${pos.coords.longitude.toFixed(2)}°E`),
                        () => {},
                      );
                    }
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-colors"
                  title="Detect location"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
                  </svg>
                </button>
              </div>
              <p className="text-center text-xs text-white/20">
                Used for climate data, frost dates & seasonal recommendations
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                {SIZE_PRESETS.map((preset, i) => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      setActivePreset(i);
                      setWidth(preset.width);
                      setDepth(preset.depth);
                      setCustomSize(false);
                    }}
                    className={[
                      'relative flex flex-col items-center gap-1.5 p-4 rounded-xl border transition-all',
                      activePreset === i && !customSize
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-white/90'
                        : 'bg-white/[0.02] border-white/[0.06] text-white/50 hover:bg-white/[0.04] hover:border-white/[0.1]',
                    ].join(' ')}
                  >
                    <span className="text-xl">{preset.icon}</span>
                    <span className="text-xs font-medium">{preset.label}</span>
                    <span className="text-[10px] text-white/30">{preset.width}x{preset.depth}m</span>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCustomSize(!customSize)}
                className="w-full text-center text-xs text-white/30 hover:text-white/50 transition-colors"
              >
                {customSize ? 'Use presets' : 'Custom size'}
              </button>

              {customSize && (
                <div className="flex gap-3 items-center justify-center">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-white/30">W</label>
                    <input
                      type="number"
                      value={width}
                      onChange={(e) => setWidth(Number(e.target.value) || 1)}
                      min={1}
                      max={100}
                      className="w-16 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-2 text-sm text-white/80 text-center outline-none focus:border-emerald-500/40"
                    />
                  </div>
                  <span className="text-white/20 text-sm">&times;</span>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-white/30">D</label>
                    <input
                      type="number"
                      value={depth}
                      onChange={(e) => setDepth(Number(e.target.value) || 1)}
                      min={1}
                      max={100}
                      className="w-16 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-2 text-sm text-white/80 text-center outline-none focus:border-emerald-500/40"
                    />
                  </div>
                  <span className="text-xs text-white/25">metres</span>
                </div>
              )}

              {/* Proportional preview */}
              <div className="flex justify-center pt-2">
                <div className="relative">
                  <div
                    className="border border-emerald-500/20 bg-emerald-500/[0.04] rounded"
                    style={{
                      width: `${Math.min(200, Math.max(40, width * 12))}px`,
                      height: `${Math.min(160, Math.max(30, depth * 12))}px`,
                    }}
                  />
                  <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-white/20">
                    {width} &times; {depth} m
                  </span>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {GOAL_OPTIONS.map((goal) => (
                  <button
                    key={goal.id}
                    onClick={() => toggleGoal(goal.id)}
                    className={[
                      'flex flex-col items-center gap-1.5 p-4 rounded-xl border transition-all',
                      selectedGoals.includes(goal.id)
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-white/90'
                        : 'bg-white/[0.02] border-white/[0.06] text-white/50 hover:bg-white/[0.04]',
                    ].join(' ')}
                  >
                    <span className="text-xl">{goal.icon}</span>
                    <span className="text-xs font-medium">{goal.label}</span>
                    <span className="text-[10px] text-white/30">{goal.desc}</span>
                  </button>
                ))}
              </div>
              <p className="text-center text-xs text-white/20">
                Select one or more — AI will create a plan tailored to your choices
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-10">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className={[
              'text-sm text-white/40 hover:text-white/70 transition-colors',
              step === 0 ? 'invisible' : '',
            ].join(' ')}
          >
            Back
          </button>

          {step < 2 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="px-6 py-2.5 rounded-xl bg-emerald-500 text-sm font-medium text-white hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-6 py-2.5 rounded-xl bg-emerald-500 text-sm font-medium text-white hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isGenerating ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                    <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Generating...
                </>
              ) : (
                'Create my garden'
              )}
            </button>
          )}
        </div>

        {/* Skip option */}
        <div className="text-center mt-6">
          <button
            onClick={() => {
              createNewGarden('My Garden', width, depth);
              setCanvasVisible(true);
              setDisclosureLevel(1);
            }}
            className="text-xs text-white/15 hover:text-white/35 transition-colors"
          >
            Skip — start with empty canvas
          </button>
        </div>
      </div>
    </div>
  );
}
