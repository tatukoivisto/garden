'use client';

import React, { useState } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import { useActionExecutor } from '@/hooks/useActionExecutor';

export default function AIApprovalBanner() {
  const pendingActions = useGardenStore((s) => s.pendingActions);
  const approveAllPending = useGardenStore((s) => s.approveAllPending);
  const rejectAllPending = useGardenStore((s) => s.rejectAllPending);
  const clearPending = useGardenStore((s) => s.clearPending);
  const approveAction = useGardenStore((s) => s.approveAction);
  const rejectAction = useGardenStore((s) => s.rejectAction);
  const { executeApproved } = useActionExecutor();

  const [expanded, setExpanded] = useState(false);

  const pending = pendingActions.filter((a) => a.status === 'pending');
  if (pending.length === 0) return null;

  const handleApplyAll = () => {
    approveAllPending();
    // Need to wait for state update, then execute
    setTimeout(() => {
      executeApproved();
    }, 0);
  };

  const handleDismiss = () => {
    rejectAllPending();
    clearPending();
  };

  const handleApproveOne = (id: string) => {
    approveAction(id);
    // Check if all are now resolved
    const remaining = useGardenStore.getState().pendingActions.filter((a) => a.status === 'pending');
    if (remaining.length <= 1) {
      setTimeout(() => executeApproved(), 0);
    }
  };

  const handleRejectOne = (id: string) => {
    rejectAction(id);
    const remaining = useGardenStore.getState().pendingActions.filter((a) => a.status === 'pending');
    if (remaining.length <= 1) {
      setTimeout(() => {
        executeApproved();
      }, 0);
    }
  };

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4 approval-banner-enter">
      <div className="bg-[#0d120e]/95 backdrop-blur-xl border border-emerald-500/20 rounded-2xl shadow-2xl shadow-emerald-500/10 overflow-hidden">
        {/* Compact bar */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/60">
              AI wants to make <strong className="text-emerald-400">{pending.length}</strong> change{pending.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="px-2.5 py-1.5 rounded-lg text-[11px] text-white/40 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
            >
              {expanded ? 'Hide' : 'Review'}
            </button>
            <button
              onClick={handleDismiss}
              className="px-2.5 py-1.5 rounded-lg text-[11px] text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Dismiss
            </button>
            <button
              onClick={handleApplyAll}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 text-[11px] font-medium text-white hover:bg-emerald-400 transition-colors"
            >
              Apply all
            </button>
          </div>
        </div>

        {/* Expanded action list */}
        {expanded && (
          <div className="border-t border-white/[0.06] px-4 py-2 space-y-1.5 max-h-48 overflow-y-auto">
            {pending.map((pa) => (
              <div
                key={pa.id}
                className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-white/[0.02] group transition-colors"
              >
                <div className="flex-shrink-0 w-5 h-5 rounded bg-emerald-500/10 flex items-center justify-center">
                  <span className="text-[10px]">
                    {pa.action.type === 'add_zone' && '➕'}
                    {pa.action.type === 'remove_zone' && '🗑️'}
                    {pa.action.type === 'move_zone' && '↗️'}
                    {pa.action.type === 'assign_crops' && '🌱'}
                    {pa.action.type === 'resize_zone' && '📐'}
                    {pa.action.type === 'rename_zone' && '✏️'}
                    {pa.action.type === 'update_climate' && '🌤️'}
                    {!['add_zone', 'remove_zone', 'move_zone', 'assign_crops', 'resize_zone', 'rename_zone', 'update_climate'].includes(pa.action.type) && '⚡'}
                  </span>
                </div>

                <span className="flex-1 text-[12px] text-white/50">{pa.action.description}</span>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleRejectOne(pa.id)}
                    className="p-1 rounded text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleApproveOne(pa.id)}
                    className="p-1 rounded text-white/20 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
