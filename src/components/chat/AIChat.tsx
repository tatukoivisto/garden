'use client';

import React, { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import {
  buildGardenContext,
  streamChatMessage,
  generateGardenPlan,
  parseAIResponse,
} from '@/lib/ai';
import type { ChatMessage, Zone, CropAssignment, AIAction } from '@/types';
import { zoneTemplates } from '@/data/zones';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uuid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------------------------------------------------------------------------
// Markdown-lite renderer
// ---------------------------------------------------------------------------

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
    if (line.trim() === '') { nodes.push(<div key={key++} className="h-1.5" />); i++; continue; }
    nodes.push(<p key={key++} className="leading-relaxed">{renderInline(line)}</p>);
    i++;
  }
  return nodes;
}

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (/^\*\*(.+)\*\*$/.test(part)) return <strong key={i} className="text-white/95">{part.slice(2, -2)}</strong>;
    if (/^_(.+)_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    if (/^`(.+)`$/.test(part)) return <code key={i} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px] text-emerald-300">{part.slice(1, -1)}</code>;
    return <span key={i}>{part}</span>;
  });
}

// ---------------------------------------------------------------------------
// Action executor — maps AI actions to store calls
// ---------------------------------------------------------------------------

/** Match AI-generated zone type strings (e.g. "ingroundbed") to valid types (e.g. "in_ground_bed"). */
function resolveZoneType(raw: string | undefined): string {
  if (!raw) return 'raised_bed';
  if (zoneTemplates.find((t) => t.type === raw)) return raw;
  const normalized = raw.toLowerCase().replace(/[\s_-]/g, '');
  const match = zoneTemplates.find((t) => t.type.replace(/_/g, '') === normalized);
  return match?.type ?? 'custom';
}

function useActionExecutor() {
  const store = useGardenStore();

  return useCallback(
    (actions: AIAction[]): string[] => {
      const labels: string[] = [];
      for (const action of actions) {
        try {
          switch (action.type) {
            case 'add_zone': {
              const p = action.payload as any;
              const resolvedType = resolveZoneType(p.type);
              const template = zoneTemplates.find((t) => t.type === resolvedType) ?? zoneTemplates[0];
              const zone: Zone = {
                id: uuid(),
                type: resolvedType as any,
                category: template.category,
                name: p.name ?? template.label,
                x_m: p.x_m ?? 0, y_m: p.y_m ?? 0,
                width_m: p.width_m ?? template.defaultWidth_m,
                depth_m: p.depth_m ?? template.defaultDepth_m,
                rotation_deg: 0,
                shape: p.shape ?? template.defaultShape,
                color: p.color ?? template.defaultColor,
                locked: false, notes: p.notes ?? '',
                health_history: [], photos: [],
              };
              store.addZone(zone);
              labels.push(`Added ${zone.name}`);
              break;
            }
            case 'remove_zone': {
              const p = action.payload as any;
              if (p.id) { store.removeZone(p.id); labels.push('Removed zone'); }
              break;
            }
            case 'move_zone': {
              const p = action.payload as any;
              if (p.id && p.x_m !== undefined && p.y_m !== undefined) {
                store.moveZone(p.id, p.x_m, p.y_m);
                labels.push('Moved zone');
              }
              break;
            }
            case 'resize_zone': {
              const p = action.payload as any;
              if (p.id) { store.resizeZone(p.id, p.width_m, p.depth_m); labels.push('Resized zone'); }
              break;
            }
            case 'rename_zone': {
              const p = action.payload as any;
              if (p.id && p.name) { store.updateZone(p.id, { name: p.name }); labels.push(`Renamed to ${p.name}`); }
              break;
            }
            case 'rotate_zone': {
              const p = action.payload as any;
              if (p.id) { store.rotateZone(p.id); labels.push('Rotated zone'); }
              break;
            }
            case 'assign_crops': {
              const p = action.payload as any;
              const garden = store.garden;
              if (p.zoneId && p.crops && garden) {
                store.assignCrops(p.zoneId, garden.active_season, p.crops);
                labels.push('Assigned crops');
              }
              break;
            }
            case 'update_climate': {
              const garden = store.garden;
              if (garden) {
                store.setClimate({ ...garden.climate, ...(action.payload as object) });
                labels.push('Updated climate');
              }
              break;
            }
            case 'resize_garden': {
              const p = action.payload as any;
              if (p.width_m !== undefined && p.depth_m !== undefined) {
                store.resizeGarden(p.width_m, p.depth_m);
                labels.push(`Resized garden to ${p.width_m}m × ${p.depth_m}m`);
              }
              break;
            }
          }
        } catch (err) { console.error('[AIChat] Action error:', err); }
      }
      return labels;
    },
    [store],
  );
}

// ---------------------------------------------------------------------------
// Quick actions
// ---------------------------------------------------------------------------

const WELCOME_SUGGESTIONS = [
  '10×8m plot in Helsinki, clay soil, full sun',
  'Small balcony garden with 4 containers',
  'Family allotment 6×4m, beginner friendly',
  '20×15m market garden, raised beds',
];

const GARDEN_SUGGESTIONS: { label: string; prompt: string }[] = [
  { label: 'Suggest crops', prompt: 'What crops should I plant in my garden right now?' },
  { label: 'Add a greenhouse', prompt: 'Add a greenhouse to my garden in the best position.' },
  { label: 'Check companions', prompt: 'Check my crops for companion planting issues.' },
  { label: 'What to plant now?', prompt: 'What should I be sowing this month?' },
];

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-start gap-2.5 px-5 py-1.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
        isUser ? 'bg-white/10 text-white/50' : 'bg-emerald-500/20 text-emerald-400'
      }`}>
        {isUser ? 'Y' : 'AI'}
      </div>
      <div className={`flex max-w-[85%] flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
          isUser ? 'rounded-tr-sm bg-white/[0.08] text-white/80' : 'rounded-tl-sm bg-white/[0.04] text-white/70'
        }`}>
          <div className="space-y-1">{renderMarkdown(message.content)}</div>
        </div>
        {message.actions_taken && message.actions_taken.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {message.actions_taken.map((label, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
}

// ---------------------------------------------------------------------------
// Streaming / thinking indicators
// ---------------------------------------------------------------------------

function ThinkingBubble() {
  return (
    <div className="flex items-start gap-2.5 px-5 py-1.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-400">
        AI
      </div>
      <div className="flex max-w-[85%] flex-col gap-1 items-start">
        <div className="rounded-2xl rounded-tl-sm bg-white/[0.04] px-4 py-3 text-[13px] leading-relaxed text-white/50">
          <div className="flex items-center gap-1.5">
            <span className="thinking-dot" />
            <span className="thinking-dot [animation-delay:150ms]" />
            <span className="thinking-dot [animation-delay:300ms]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StreamingBubble({ text }: { text: string }) {
  // Don't render raw JSON — show thinking indicator instead.
  // Gemini often outputs text + ```json block, or just a raw JSON object.
  const trimmed = text.trimStart();
  const containsJson = trimmed.startsWith('{') || trimmed.startsWith('```') || trimmed.includes('```json') || trimmed.includes('"message"');
  if (!text || containsJson) return <ThinkingBubble />;

  return (
    <div className="flex items-start gap-2.5 px-5 py-1.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-400">
        AI
      </div>
      <div className="flex max-w-[85%] flex-col gap-1 items-start">
        <div className="rounded-2xl rounded-tl-sm bg-white/[0.04] px-4 py-2.5 text-[13px] leading-relaxed text-white/70">
          <div className="space-y-1">
            {renderMarkdown(text)}
            <span className="streaming-cursor" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main AIChat component
// ---------------------------------------------------------------------------

export default function AIChat({ fullScreen }: { fullScreen?: boolean }) {
  const garden = useGardenStore((s) => s.garden);
  const addChatMessage = useGardenStore((s) => s.addChatMessage);
  const chatHistory = useGardenStore((s) => s.garden?.chat_history ?? []);
  const selectedZoneIds = useGardenStore((s) => s.canvas.selectedZoneIds);
  const createNewGarden = useGardenStore((s) => s.createNewGarden);
  const addZone = useGardenStore((s) => s.addZone);
  const assignCrops = useGardenStore((s) => s.assignCrops);
  const setClimate = useGardenStore((s) => s.setClimate);
  const setCanvasVisible = useGardenStore((s) => s.setCanvasVisible);

  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dynamicSuggestions, setDynamicSuggestions] = useState<{ label: string; prompt: string }[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const executeActions = useActionExecutor();

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory, streamText]);
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [inputValue]);

  // ---------------------------------------------------------------------------
  // Generate garden plan (first interaction — creates garden + zones)
  // ---------------------------------------------------------------------------

  const handleFirstMessage = useCallback(async (text: string) => {
    setIsStreaming(true);
    setStreamText('');
    setError(null);

    // Parse dimensions
    const dimMatch = text.match(/(\d+)\s*[×x]\s*(\d+)/);
    const width_m = dimMatch ? Number(dimMatch[1]) : 10;
    const depth_m = dimMatch ? Number(dimMatch[2]) : 8;

    createNewGarden('My Garden', width_m, depth_m);

    // Add user message
    const userMsg: ChatMessage = { id: uuid(), role: 'user', content: text, timestamp: new Date(), source: 'text' };
    addChatMessage(userMsg);

    try {
      const g = useGardenStore.getState().garden!;
      const plan = await generateGardenPlan(text, g.climate);

      // Add zones with staggered timing for animation
      const zoneNameToId = new Map<string, string>();
      let description = "Here's your garden plan:\n\n";

      for (let i = 0; i < plan.zones.length; i++) {
        const partial = plan.zones[i];
        const template = zoneTemplates.find((t) => t.type === partial.type) ?? zoneTemplates[0];
        const id = uuid();
        const zone: Zone = {
          id,
          type: partial.type ?? 'raised_bed',
          category: template.category,
          name: partial.name ?? template.label,
          x_m: partial.x_m ?? 0, y_m: partial.y_m ?? 0,
          width_m: partial.width_m ?? template.defaultWidth_m,
          depth_m: partial.depth_m ?? template.defaultDepth_m,
          rotation_deg: partial.rotation_deg ?? 0,
          shape: partial.shape ?? template.defaultShape,
          color: partial.color ?? template.defaultColor,
          locked: false, notes: partial.notes ?? '',
          health_history: [], photos: [],
        };

        // Stagger zone additions for animation
        await new Promise((r) => setTimeout(r, 200));
        addZone(zone);
        zoneNameToId.set(zone.name, id);

        const line = `- **${zone.name}** (${(zone.type as string).replace(/_/g, ' ')}) — ${zone.width_m}m × ${zone.depth_m}m\n`;
        description += line;
        setStreamText(description);
      }

      // Show canvas after first zone is placed
      setCanvasVisible(true);

      // Apply crops
      const updatedGarden = useGardenStore.getState().garden!;
      const actionLabels: string[] = [];
      for (const assignment of plan.cropAssignments) {
        const zoneId = zoneNameToId.get(assignment.zoneId) ?? assignment.zoneId;
        if (zoneId) {
          assignCrops(zoneId, updatedGarden.active_season, assignment.crops);
          actionLabels.push(`Crops → ${assignment.zoneId}`);
        }
      }
      if (plan.climate) {
        setClimate({ ...updatedGarden.climate, ...plan.climate });
      }

      description += '\nCrops have been assigned. Ask me to adjust anything — move zones, swap crops, add structures.';

      const aiMsg: ChatMessage = {
        id: uuid(), role: 'ai', content: description, timestamp: new Date(),
        actions_taken: [...plan.zones.map((z) => `Added ${z.name}`), ...actionLabels],
      };
      addChatMessage(aiMsg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      setError(msg);
      addChatMessage({ id: uuid(), role: 'ai', content: `Sorry, something went wrong: ${msg}`, timestamp: new Date() });
    } finally {
      setIsStreaming(false);
      setStreamText('');
    }
  }, [createNewGarden, addChatMessage, addZone, assignCrops, setClimate, setCanvasVisible]);

  // ---------------------------------------------------------------------------
  // Send chat message (ongoing conversation with streaming)
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    // If no garden exists, this is the first message
    if (!garden) {
      setInputValue('');
      return handleFirstMessage(trimmed);
    }

    setInputValue('');
    setError(null);
    setIsStreaming(true);
    setStreamText('');

    const userMsg: ChatMessage = { id: uuid(), role: 'user', content: trimmed, timestamp: new Date(), source: 'text' };
    addChatMessage(userMsg);

    try {
      const ctx = buildGardenContext(garden, selectedZoneIds);
      let accumulated = '';

      const response = await streamChatMessage(
        trimmed,
        ctx,
        (chunk) => {
          accumulated += chunk;
          setStreamText(accumulated);
        },
        () => {},
        chatHistory,
      );

      const { text: finalText, actions, suggestions } = response;
      const actionLabels = actions.length > 0 ? executeActions(actions) : [];

      // If actions added zones, show canvas
      if (actions.some((a) => a.type === 'add_zone') && !useGardenStore.getState().canvasVisible) {
        setCanvasVisible(true);
      }

      // Update dynamic suggestions from AI response
      if (suggestions.length > 0) {
        setDynamicSuggestions(suggestions);
      }

      const aiMsg: ChatMessage = {
        id: uuid(), role: 'ai', content: finalText, timestamp: new Date(),
        actions_taken: actionLabels.length > 0 ? actionLabels : undefined,
      };
      addChatMessage(aiMsg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An error occurred';
      setError(msg);
      addChatMessage({ id: uuid(), role: 'ai', content: `Sorry: ${msg}`, timestamp: new Date() });
    } finally {
      setIsStreaming(false);
      setStreamText('');
    }
  }, [garden, isStreaming, addChatMessage, executeActions, setCanvasVisible, handleFirstMessage]);

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(inputValue); }
  }, [inputValue, sendMessage]);

  const canSend = inputValue.trim().length > 0 && !isStreaming;
  const isWelcome = !garden;
  const suggestions = isWelcome ? WELCOME_SUGGESTIONS : GARDEN_SUGGESTIONS;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={`flex flex-col bg-[#0a0f0a] ${fullScreen ? 'h-full' : 'h-full'}`}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {isWelcome || chatHistory.length === 0 ? (
          <div className={`flex flex-col items-center justify-center gap-5 text-center px-6 ${fullScreen ? 'pt-[20vh]' : 'py-10'}`}>
            {/* Branding */}
            <div className="relative">
              <div className="absolute -inset-8 rounded-full bg-emerald-500/5 blur-2xl" />
              <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center border border-emerald-500/10">
                <span className="text-2xl">🌱</span>
              </div>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white/90">Kitchen Garden Planner</h1>
              <p className="mt-1.5 text-sm text-white/30 max-w-xs leading-relaxed">
                Describe your garden and I'll create a complete planting plan with zones, crops, and companion planting.
              </p>
            </div>
          </div>
        ) : (
          <div className="py-4">
            {chatHistory.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}

        {/* Streaming indicator */}
        {isStreaming && <StreamingBubble text={streamText} />}

        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mb-2 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400 flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-400/50 hover:text-red-400 ml-2">✕</button>
        </div>
      )}

      {/* Suggestions */}
      <div className="flex gap-1.5 overflow-x-auto px-5 pb-2 scrollbar-none">
        {isWelcome ? (
          WELCOME_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => { setInputValue(s); }}
              disabled={isStreaming}
              className="shrink-0 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-[11px] text-white/35 hover:bg-white/[0.06] hover:text-white/60 hover:border-white/[0.1] transition-all disabled:opacity-30 text-left max-w-[200px]"
            >
              <span className="text-emerald-400/60 mr-1">→</span> {s}
            </button>
          ))
        ) : (
          (dynamicSuggestions.length > 0 ? dynamicSuggestions : GARDEN_SUGGESTIONS).map((s) => (
            <button
              key={s.label}
              onClick={() => { setDynamicSuggestions([]); sendMessage(s.prompt); }}
              disabled={isStreaming}
              className="shrink-0 rounded-lg bg-white/[0.03] border border-white/[0.06] px-2.5 py-1.5 text-[11px] text-white/35 hover:bg-emerald-500/10 hover:border-emerald-500/20 hover:text-emerald-400 transition-all disabled:opacity-30"
            >
              {s.label}
            </button>
          ))
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-white/[0.04]">
        <div className={`flex items-end gap-2 rounded-xl border p-1 transition-colors ${
          isStreaming
            ? 'bg-white/[0.02] border-emerald-500/20'
            : 'bg-white/[0.04] border-white/[0.06] focus-within:border-emerald-500/30'
        }`}>
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder={isStreaming ? 'Waiting for response...' : isWelcome ? 'Describe your garden...' : 'Ask AI anything about your garden...'}
            rows={1}
            className="flex-1 resize-none bg-transparent px-3 py-2 text-[13px] text-white/80 placeholder-white/20 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: '36px', maxHeight: '120px' }}
          />
          {isStreaming ? (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center mb-0.5 mr-0.5">
              <svg className="h-4 w-4 animate-spin text-emerald-400" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.2" />
                <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => sendMessage(inputValue)}
              disabled={!canSend}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white transition-all hover:bg-emerald-400 disabled:opacity-30 disabled:bg-white/[0.06] disabled:text-white/30 mb-0.5 mr-0.5"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          )}
        </div>
        <p className="mt-1.5 text-center text-[10px] text-white/15">
          Enter to send · Shift+Enter for new line · ⌘Z to undo
        </p>
      </div>
    </div>
  );
}
