'use client';

import React, { useEffect, useRef } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import type { ChatMessage } from '@/types';

// ---------------------------------------------------------------------------
// Inline markdown renderer
// ---------------------------------------------------------------------------

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (/^\*\*(.+)\*\*$/.test(part)) return <strong key={i} className="text-white/90">{part.slice(2, -2)}</strong>;
    if (/^_(.+)_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    if (/^`(.+)`$/.test(part)) return <code key={i} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px] text-emerald-300">{part.slice(1, -1)}</code>;
    return <span key={i}>{part}</span>;
  });
}

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let key = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^[-•*]\s/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-•*]\s/.test(lines[i])) {
        items.push(<li key={key++} className="ml-4 list-disc">{renderInline(lines[i].replace(/^[-•*]\s/, ''))}</li>);
        i++;
      }
      nodes.push(<ul key={key++} className="my-1 space-y-0.5">{items}</ul>);
      continue;
    }
    if (line.trim() === '') { nodes.push(<div key={key++} className="h-1.5" />); i++; continue; }
    nodes.push(<p key={key++} className="leading-relaxed">{renderInline(line)}</p>);
    i++;
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
        isUser ? 'bg-white/10 text-white/40' : 'bg-emerald-500/20 text-emerald-400'
      }`}>
        {isUser ? 'Y' : 'AI'}
      </div>
      <div className={`flex max-w-[80%] flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
          isUser
            ? 'rounded-tr-sm bg-white/[0.06] text-white/70'
            : 'rounded-tl-sm bg-white/[0.03] text-white/65'
        }`}>
          <div className="space-y-1">{renderMarkdown(message.content)}</div>
        </div>
        {message.actions_taken && message.actions_taken.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {message.actions_taken.map((label, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                <svg className="h-2 w-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {label}
              </span>
            ))}
          </div>
        )}
        <span className="text-[9px] text-white/15 px-1">{time}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main drawer
// ---------------------------------------------------------------------------

export default function ChatDrawer() {
  const chatHistory = useGardenStore((s) => s.garden?.chat_history ?? []);
  const setShowChatDrawer = useGardenStore((s) => s.setShowChatDrawer);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setShowChatDrawer(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setShowChatDrawer]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm drawer-backdrop-enter"
        onClick={() => setShowChatDrawer(false)}
      />

      {/* Drawer */}
      <div className="fixed inset-x-0 bottom-0 z-50 drawer-slide-up">
        <div className="mx-auto max-w-3xl bg-[#0a0f0a]/95 backdrop-blur-xl border border-white/[0.08] border-b-0 rounded-t-2xl shadow-2xl shadow-black/60 max-h-[70vh] flex flex-col">
          {/* Handle bar + header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-1 rounded-full bg-white/10 mx-auto" />
            </div>
            <span className="text-xs font-medium text-white/40">
              Chat History ({chatHistory.length} messages)
            </span>
            <button
              onClick={() => setShowChatDrawer(false)}
              className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {chatHistory.length === 0 ? (
              <div className="text-center py-12 text-sm text-white/20">
                No messages yet. Use the command bar to start chatting.
              </div>
            ) : (
              chatHistory.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))
            )}
            <div ref={bottomRef} />
          </div>
        </div>
      </div>
    </>
  );
}
