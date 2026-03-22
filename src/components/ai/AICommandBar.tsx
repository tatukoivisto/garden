'use client';

import React, { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import {
  buildGardenContext,
  streamChatMessage,
  type AIResponse,
} from '@/lib/ai';
import { generateSuggestions } from '@/lib/suggestions';
import { useActionExecutor } from '@/hooks/useActionExecutor';
import type { ChatMessage, Suggestion } from '@/types';

function uuid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------------------------------------------------------------------------
// Inline markdown renderer (lightweight)
// ---------------------------------------------------------------------------

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (/^\*\*(.+)\*\*$/.test(part)) return <strong key={i} className="text-white/90 font-semibold">{part.slice(2, -2)}</strong>;
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
    if (/^\d+\.\s/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(<li key={key++} className="ml-4 list-decimal">{renderInline(lines[i].replace(/^\d+\.\s/, ''))}</li>);
        i++;
      }
      nodes.push(<ol key={key++} className="my-1 space-y-0.5">{items}</ol>);
      continue;
    }
    if (line.trim() === '') { nodes.push(<div key={key++} className="h-1" />); i++; continue; }
    nodes.push(<p key={key++} className="leading-relaxed">{renderInline(line)}</p>);
    i++;
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// Thinking dots indicator
// ---------------------------------------------------------------------------

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <span className="thinking-dot" />
      <span className="thinking-dot [animation-delay:150ms]" />
      <span className="thinking-dot [animation-delay:300ms]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AICommandBar() {
  const garden = useGardenStore((s) => s.garden);
  const selectedZoneIds = useGardenStore((s) => s.canvas.selectedZoneIds);
  const addChatMessage = useGardenStore((s) => s.addChatMessage);
  const setCanvasVisible = useGardenStore((s) => s.setCanvasVisible);
  const chatHistory = useGardenStore((s) => s.garden?.chat_history ?? []);
  const setAISuggestions = useGardenStore((s) => s.setAISuggestions);

  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastResponse, setLastResponse] = useState<AIResponse | null>(null);
  const [showResponse, setShowResponse] = useState(false);
  const [sentMessage, setSentMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const { executeActions } = useActionExecutor();

  // Compute suggestions from garden state
  const suggestions: Suggestion[] = garden ? generateSuggestions(garden) : [];

  // Get selected zone name for placeholder
  const selectedZone = selectedZoneIds.length === 1
    ? garden?.zones.find((z) => z.id === selectedZoneIds[0])
    : null;

  const placeholder = selectedZone
    ? `Ask about ${selectedZone.name}...`
    : 'Ask AI anything about your garden...';

  // Listen for / key to focus
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming || !garden) return;

    setInputValue('');
    setError(null);
    setIsStreaming(true);
    setShowResponse(true);
    setLastResponse(null);
    setSentMessage(trimmed);

    const userMsg: ChatMessage = {
      id: uuid(), role: 'user', content: trimmed, timestamp: new Date(), source: 'text',
    };
    addChatMessage(userMsg);

    try {
      const ctx = buildGardenContext(garden, selectedZoneIds);

      const response = await streamChatMessage(
        trimmed,
        ctx,
        () => {}, // Don't show raw streaming text — show thinking dots instead
        (finalResponse) => {
          setLastResponse(finalResponse);

          // Auto-apply actions immediately
          if (finalResponse.actions.length > 0) {
            executeActions(finalResponse.actions);

            // Show canvas if zones were added
            if (finalResponse.actions.some((a) => a.type === 'add_zone') && !useGardenStore.getState().canvasVisible) {
              setCanvasVisible(true);
            }
          }

          // Update AI suggestions
          if (finalResponse.suggestions.length > 0) {
            setAISuggestions(finalResponse.suggestions);
          }
        },
        chatHistory,
      );

      const actionLabels = response.actions.length > 0
        ? response.actions.map((a) => a.description)
        : undefined;

      const aiMsg: ChatMessage = {
        id: uuid(), role: 'ai', content: response.text, timestamp: new Date(),
        actions_taken: actionLabels,
      };
      addChatMessage(aiMsg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An error occurred';
      setError(msg);
      addChatMessage({
        id: uuid(), role: 'ai', content: `Sorry: ${msg}`, timestamp: new Date(),
      });
    } finally {
      setIsStreaming(false);
    }
  }, [garden, isStreaming, selectedZoneIds, addChatMessage, executeActions, setAISuggestions, setCanvasVisible]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage(inputValue);
    }
    if (e.key === 'Escape') {
      setShowResponse(false);
      setIsFocused(false);
      inputRef.current?.blur();
    }
  }, [inputValue, sendMessage]);

  const canSend = inputValue.trim().length > 0 && !isStreaming;

  // Merge garden suggestions with AI-returned suggestions
  const aiSuggestions = useGardenStore((s) => s.aiSuggestions);
  const displaySuggestions = aiSuggestions.length > 0
    ? aiSuggestions.map((s, i) => ({ id: `ai-${i}`, label: s.label, prompt: s.prompt, icon: '💡', priority: 100, category: 'crops' as const }))
    : suggestions;

  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom when new messages arrive or streaming starts
  useEffect(() => {
    if (showResponse) {
      chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [chatHistory, isStreaming, showResponse]);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex flex-col items-center pointer-events-none pb-4 px-4">
      {/* Chat panel — scrollable history + current response */}
      {showResponse && (
        <div className="pointer-events-auto w-full max-w-2xl mb-3 command-bar-response-enter">
          <div className="relative bg-[#0d120e]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/40 overflow-hidden flex flex-col" style={{ maxHeight: 'min(420px, 50vh)' }}>
            {/* Close button */}
            <button
              onClick={() => setShowResponse(false)}
              className="absolute top-2.5 right-2.5 p-1.5 rounded-lg text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-colors z-10"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            {/* Scrollable message area */}
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {/* Chat history */}
              {chatHistory.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={msg.id} className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold mt-0.5 ${
                      isUser ? 'bg-white/10 text-white/50' : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {isUser ? 'Y' : 'AI'}
                    </div>
                    <div className={`flex flex-col gap-1 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                      <div className={`rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                        isUser
                          ? 'rounded-tr-sm bg-white/[0.06] text-white/60'
                          : 'rounded-tl-sm bg-white/[0.03] text-white/70'
                      }`}>
                        <div className="space-y-1">{renderMarkdown(msg.content)}</div>
                      </div>
                      {msg.actions_taken && msg.actions_taken.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {msg.actions_taken.map((label, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-[10px] text-emerald-400 font-medium">
                              <svg className="h-2 w-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Streaming thinking indicator */}
              {isStreaming && (
                <div className="flex items-start gap-2">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[9px] font-bold text-emerald-400 mt-0.5">
                    AI
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-white/[0.03] px-3.5 py-2.5">
                    <ThinkingDots />
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400 flex items-center justify-between">
                  <span>{error}</span>
                  <button
                    onClick={() => { setError(null); sendMessage(sentMessage); }}
                    className="ml-2 px-2 py-0.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors text-[11px] font-medium"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Suggestion chips */}
      {(isFocused || showResponse) && displaySuggestions.length > 0 && !isStreaming && (
        <div className="pointer-events-auto flex gap-2 mb-2.5 overflow-x-auto scrollbar-none max-w-2xl w-full px-1 command-bar-suggestions-enter">
          {displaySuggestions.slice(0, 5).map((s) => (
            <button
              key={s.id}
              onClick={() => sendMessage(s.prompt)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] text-white/40 hover:bg-emerald-500/10 hover:border-emerald-500/20 hover:text-emerald-400 transition-all"
            >
              <span>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Command bar input */}
      <div className="pointer-events-auto w-full max-w-2xl">
        <div className={[
          'flex items-center gap-2 bg-[#0d120e]/90 backdrop-blur-xl rounded-2xl border transition-all duration-300 shadow-xl shadow-black/30',
          isFocused ? 'border-emerald-500/30 shadow-emerald-500/5' : 'border-white/[0.08]',
        ].join(' ')}>
          {/* AI icon */}
          <div className="pl-4 flex-shrink-0">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold bg-emerald-500/15 text-emerald-400/70">
              AI
            </div>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            disabled={isStreaming}
            placeholder={placeholder}
            className="flex-1 bg-transparent py-3.5 text-[13px] text-white/80 placeholder-white/25 outline-none disabled:opacity-40"
          />

          {/* Right side actions */}
          <div className="flex items-center gap-1.5 pr-2">
            {/* History toggle */}
            {chatHistory.length > 0 && !isStreaming && (
              <button
                onClick={() => setShowResponse((v) => !v)}
                className={`p-2 rounded-lg transition-colors ${showResponse ? 'text-emerald-400/60 bg-emerald-500/10' : 'text-white/25 hover:text-white/50 hover:bg-white/[0.06]'}`}
                title="Chat history"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </button>
            )}

            {/* Send button — hidden during streaming since dots are in bubble */}
            {!isStreaming && (
              <button
                type="button"
                onClick={() => sendMessage(inputValue)}
                disabled={!canSend}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white transition-all hover:bg-emerald-400 disabled:opacity-30 disabled:bg-white/[0.06] disabled:text-white/30"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Keyboard hint */}
        {!isStreaming && (
          <div className="flex items-center justify-center gap-3 mt-2">
            <span className="text-[10px] text-white/12">
              Press <kbd className="px-1 py-0.5 rounded bg-white/[0.06] text-white/25 font-mono text-[9px]">/</kbd> to focus
            </span>
            <span className="text-[10px] text-white/12">
              <kbd className="px-1 py-0.5 rounded bg-white/[0.06] text-white/25 font-mono text-[9px]">Enter</kbd> to send
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
