'use client';

/**
 * page.tsx — Main entry point for the Kitchen Garden Planner.
 *
 * Routing logic:
 *   - On the first client render, check if a garden exists in the Zustand store
 *     (the persist middleware rehydrates from localStorage automatically).
 *   - Before hydration is confirmed (mounted === false), render a neutral
 *     skeleton to prevent a hydration mismatch between the server-rendered HTML
 *     (which has no localStorage) and the first client paint.
 *   - Once mounted, show <StartScreen> if no garden is loaded, or
 *     <GardenLayout> if a garden with at least one zone is loaded.
 *
 * The zustand `persist` middleware handles the actual localStorage
 * read/write; this component just gates the UI on the hydration cycle.
 */

import { useEffect, useState } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import StartScreen from '@/components/ui/StartScreen';
import GardenLayout from '@/components/layout/GardenLayout';

// ---------------------------------------------------------------------------
// Skeleton shown during SSR / pre-hydration to avoid layout flash
// ---------------------------------------------------------------------------

function HydrationSkeleton() {
  return (
    <div
      className="
        min-h-screen bg-gradient-to-br from-garden-cream via-white to-green-50
        flex items-center justify-center
      "
      aria-hidden="true"
    >
      <div className="flex flex-col items-center gap-4 animate-pulse-soft">
        {/* Logo placeholder */}
        <div className="w-16 h-16 rounded-2xl bg-garden-leaf/20" />
        {/* Title placeholder */}
        <div className="h-8 w-64 rounded-lg bg-garden-leaf/10" />
        {/* Subtitle placeholder */}
        <div className="h-4 w-48 rounded bg-garden-leaf/10" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function Home() {
  // `mounted` guards against hydration mismatch: the server has no
  // localStorage, so we defer any store-dependent rendering until the client
  // has completed its first mount and the persist middleware has rehydrated.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Read garden state — zustand's persist middleware will have already
  // populated this on the client by the time `mounted` becomes true.
  const garden = useGardenStore((state) => state.garden);

  // A garden is considered "loaded" when it exists and has at least one
  // zone. A freshly created garden with zero zones still shows the canvas
  // so the user can start placing zones.
  const hasGarden = garden !== null && garden !== undefined;

  // ── Pre-hydration: neutral skeleton ──────────────────────────────────
  if (!mounted) {
    return <HydrationSkeleton />;
  }

  // ── Post-hydration: route to the correct view ────────────────────────
  if (!hasGarden) {
    return <StartScreen />;
  }

  return <GardenLayout />;
}
