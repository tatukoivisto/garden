'use client';

import { useEffect, useState } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';
import GardenCanvas from '@/components/canvas/GardenCanvas';
import Toolbar from '@/components/ui/Toolbar';
import ZonePalette from '@/components/panels/ZonePalette';
import ZoneInspector from '@/components/panels/ZoneInspector';
import AICommandBar from '@/components/ai/AICommandBar';
import ChatDrawer from '@/components/ai/ChatDrawer';
import AIApprovalBanner from '@/components/ai/AIApprovalBanner';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const garden = useGardenStore((s) => s.garden);
  const canvasVisible = useGardenStore((s) => s.canvasVisible);
  const showPalette = useGardenStore((s) => s.showPalette);
  const showChatDrawer = useGardenStore((s) => s.showChatDrawer);
  const selectedZoneIds = useGardenStore((s) => s.canvas.selectedZoneIds);
  const disclosureLevel = useGardenStore((s) => s.disclosureLevel);
  const pendingActions = useGardenStore((s) => s.pendingActions);

  useKeyboardShortcuts({ enabled: mounted && !!garden });

  // Auto-show canvas if garden has zones (returning user)
  useEffect(() => {
    if (garden && garden.zones.length > 0 && !canvasVisible) {
      useGardenStore.getState().setCanvasVisible(true);
    }
  }, [garden, canvasVisible]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#060a06] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10" />
          <div className="h-4 w-32 rounded bg-white/[0.04]" />
        </div>
      </div>
    );
  }

  // No garden — show onboarding wizard
  if (!garden) {
    return <OnboardingWizard />;
  }

  const hasSelectedZone = selectedZoneIds.length > 0;
  const hasPending = pendingActions.filter((a) => a.status === 'pending').length > 0;
  const showAdvancedPalette = disclosureLevel >= 3 && showPalette;

  return (
    <div className="h-screen w-screen bg-[#0a0f0a] flex flex-col overflow-hidden relative">
      {/* Toolbar */}
      <Toolbar />

      {/* Main content: canvas is full-screen hero */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Zone palette (advanced mode only) */}
        {showAdvancedPalette && (
          <aside className="w-48 bg-[#0d120e] border-r border-white/[0.06] overflow-y-auto flex-shrink-0">
            <ZonePalette />
          </aside>
        )}

        {/* Canvas — full width */}
        <main className="flex-1 min-w-0 min-h-0 relative">
          {canvasVisible ? (
            <GardenCanvas />
          ) : (
            <div className="h-full flex items-center justify-center text-white/10 text-sm">
              Your garden canvas will appear here
            </div>
          )}
        </main>

        {/* Zone inspector (right panel) */}
        {hasSelectedZone && <ZoneInspector />}
      </div>

      {/* Floating AI command bar */}
      <AICommandBar />

      {/* AI approval banner (above command bar when pending) */}
      {hasPending && <AIApprovalBanner />}

      {/* Chat history drawer */}
      {showChatDrawer && <ChatDrawer />}
    </div>
  );
}
