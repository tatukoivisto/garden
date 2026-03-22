'use client';

/**
 * AIChat.tsx — AI chat interface for the Kitchen Garden Planner.
 *
 * Features:
 * - Scrollable message list with user/AI bubble styling
 * - Markdown-lite formatting (bold, bullet lists)
 * - Action badges on AI messages
 * - Auto-grow textarea with Enter-to-send
 * - Photo upload via camera icon
 * - Microphone button (coming soon)
 * - Quick action pill buttons
 * - Typing indicator while AI processes
 * - Executes AI actions against the garden store
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  KeyboardEvent,
  ChangeEvent,
} from 'react';
import { useGardenStore } from '@/store/gardenStore';
import {
  buildGardenContext,
  sendChatMessage,
  analyzeGardenPhoto,
  generateGardenPlan,
  parseAIResponse,
  type AIAction,
  type GeneratedPlan,
} from '@/lib/ai';
import type { ChatMessage, Zone, CropAssignment } from '@/types';
import { zoneTemplates } from '@/data/zones';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uuid(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Convert a File to a base64 data URL string. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Markdown-lite renderer
// Handles: **bold**, *italic*, bullet lists (- / •), numbered lists, line breaks
// ---------------------------------------------------------------------------

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let key = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Bullet list item
    if (/^[-•*]\s/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-•*]\s/.test(lines[i])) {
        items.push(
          <li key={key++} className="ml-4 list-disc">
            {renderInline(lines[i].replace(/^[-•*]\s/, ''))}
          </li>,
        );
        i++;
      }
      nodes.push(
        <ul key={key++} className="my-1 space-y-0.5">
          {items}
        </ul>,
      );
      continue;
    }

    // Numbered list item
    if (/^\d+\.\s/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(
          <li key={key++} className="ml-4 list-decimal">
            {renderInline(lines[i].replace(/^\d+\.\s/, ''))}
          </li>,
        );
        i++;
      }
      nodes.push(
        <ol key={key++} className="my-1 space-y-0.5">
          {items}
        </ol>,
      );
      continue;
    }

    // Empty line → spacer
    if (line.trim() === '') {
      nodes.push(<div key={key++} className="h-2" />);
      i++;
      continue;
    }

    // Normal paragraph line
    nodes.push(
      <p key={key++} className="leading-snug">
        {renderInline(line)}
      </p>,
    );
    i++;
  }

  return nodes;
}

function renderInline(text: string): React.ReactNode[] {
  // Split on **bold**, _italic_, `code`
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (/^\*\*(.+)\*\*$/.test(part)) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (/^_(.+)_$/.test(part)) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (/^`(.+)`$/.test(part)) {
      return (
        <code
          key={i}
          className="rounded bg-black/10 px-1 py-0.5 font-mono text-xs"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// ---------------------------------------------------------------------------
// Action executor — maps AI actions to store calls
// ---------------------------------------------------------------------------

function useActionExecutor() {
  const store = useGardenStore();

  const execute = useCallback(
    (actions: AIAction[]): string[] => {
      const labels: string[] = [];

      for (const action of actions) {
        try {
          switch (action.type) {
            case 'add_zone': {
              const p = action.payload as {
                type?: string;
                name?: string;
                x_m?: number;
                y_m?: number;
                width_m?: number;
                depth_m?: number;
                color?: string;
                notes?: string;
              };
              const template = zoneTemplates.find((t) => t.type === p.type) ?? zoneTemplates[0];
              const zone: Zone = {
                id: uuid(),
                type: (p.type as Zone['type']) ?? 'raised_bed',
                category: template.category,
                name: p.name ?? template.label,
                x_m: p.x_m ?? 0,
                y_m: p.y_m ?? 0,
                width_m: p.width_m ?? template.defaultWidth_m,
                depth_m: p.depth_m ?? template.defaultDepth_m,
                rotation_deg: 0,
                shape: template.defaultShape,
                color: p.color ?? template.defaultColor,
                locked: false,
                notes: p.notes ?? '',
                health_history: [],
                photos: [],
              };
              store.addZone(zone);
              labels.push(`Added ${zone.name}`);
              break;
            }

            case 'move_zone': {
              const p = action.payload as { id?: string; x_m?: number; y_m?: number };
              if (p.id && p.x_m !== undefined && p.y_m !== undefined) {
                store.moveZone(p.id, p.x_m, p.y_m);
                labels.push(`Moved zone`);
              }
              break;
            }

            case 'assign_crops': {
              const p = action.payload as {
                zoneId?: string;
                crops?: CropAssignment[];
              };
              const garden = store.garden;
              if (p.zoneId && p.crops && garden) {
                const seasonId = garden.active_season;
                store.assignCrops(p.zoneId, seasonId, p.crops);
                labels.push(`Assigned crops to zone`);
              }
              break;
            }

            case 'update_climate': {
              const garden = store.garden;
              if (garden) {
                store.setClimate({ ...garden.climate, ...(action.payload as object) });
                labels.push('Updated climate settings');
              }
              break;
            }

            default:
              console.warn('[AIChat] Unknown action type:', action.type);
          }
        } catch (err) {
          console.error('[AIChat] Action execution error:', err);
        }
      }

      return labels;
    },
    [store],
  );

  return execute;
}

// ---------------------------------------------------------------------------
// Apply a generated plan to the store
// ---------------------------------------------------------------------------

function useApplyGeneratedPlan() {
  const store = useGardenStore();

  return useCallback(
    (plan: GeneratedPlan): string[] => {
      const labels: string[] = [];
      const addedZoneIds: Map<string, string> = new Map(); // zoneName → id

      for (const partial of plan.zones) {
        const template =
          zoneTemplates.find((t) => t.type === partial.type) ?? zoneTemplates[0];
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
        store.addZone(zone);
        addedZoneIds.set(zone.name, id);
        labels.push(`Added ${zone.name}`);
      }

      if (plan.climate && store.garden) {
        store.setClimate({ ...store.garden.climate, ...plan.climate });
        labels.push('Updated climate');
      }

      const garden = store.garden;
      if (garden) {
        for (const assignment of plan.cropAssignments) {
          // Match by name (from generateGardenPlan) or by id
          const zoneId =
            addedZoneIds.get(assignment.zoneId) ??
            garden.zones.find((z) => z.name === assignment.zoneId)?.id ??
            assignment.zoneId;

          if (zoneId) {
            store.assignCrops(zoneId, garden.active_season, assignment.crops);
            labels.push(`Assigned crops to zone`);
          }
        }
      }

      return labels;
    },
    [store],
  );
}

// ---------------------------------------------------------------------------
// Quick action buttons
// ---------------------------------------------------------------------------

const QUICK_ACTIONS = [
  { label: 'Suggest crops', message: 'What crops should I plant in my garden right now?' },
  { label: 'Check companions', message: 'Check my current crops for companion planting issues and suggest improvements.' },
  { label: 'Rotation plan', message: 'Create a crop rotation plan for my zones based on the current season.' },
  { label: 'What to plant now?', message: 'What should I be sowing or planting this month given my climate?' },
  { label: 'Generate plan', message: 'Generate a complete garden plan with zones and crops for my space and climate.' },
];

// ---------------------------------------------------------------------------
// Typing indicator component
// ---------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2 px-4 py-2">
      {/* Avatar */}
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-garden-leaf text-xs text-white">
        🌱
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-white/90 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 animate-bounce rounded-full bg-garden-leaf [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-garden-leaf [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-garden-leaf" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message bubble component
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  message: ChatMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex items-start gap-2 px-4 py-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
          isUser
            ? 'bg-garden-sprout text-garden-leaf-dark'
            : 'bg-garden-leaf text-white'
        }`}
      >
        {isUser ? '👤' : '🌱'}
      </div>

      <div className={`flex max-w-[80%] flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Bubble */}
        <div
          className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
            isUser
              ? 'rounded-tr-sm bg-garden-leaf text-white'
              : 'rounded-tl-sm bg-white/90 text-garden-soil'
          }`}
        >
          {message.source === 'voice' && (
            <span className="mb-1 flex items-center gap-1 text-xs opacity-60">
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                  clipRule="evenodd"
                />
              </svg>
              Voice
            </span>
          )}
          <div className="space-y-1">{renderMarkdown(message.content)}</div>
        </div>

        {/* Action badges */}
        {message.actions_taken && message.actions_taken.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {message.actions_taken.map((label, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-garden-sprout/20 px-2 py-0.5 text-xs font-medium text-garden-leaf-dark"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {label}
              </span>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <span className="text-xs text-garden-stone/60">
          {message.timestamp instanceof Date
            ? message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main AIChat component
// ---------------------------------------------------------------------------

export default function AIChat() {
  const garden = useGardenStore((s) => s.garden);
  const addChatMessage = useGardenStore((s) => s.addChatMessage);
  const chatHistory = useGardenStore((s) => s.garden?.chat_history ?? []);

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const executeActions = useActionExecutor();
  const applyGeneratedPlan = useApplyGeneratedPlan();

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isLoading]);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [inputValue]);

  // ---------------------------------------------------------------------------
  // Send message
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading || !garden) return;

      setInputValue('');
      setError(null);

      // Add user message
      const userMsg: ChatMessage = {
        id: uuid(),
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
        source: 'text',
      };
      addChatMessage(userMsg);

      setIsLoading(true);

      try {
        const ctx = buildGardenContext(garden);

        // Special-case: "Generate plan" triggers full plan generation
        const isGeneratePlan =
          /generate.*plan|create.*garden|design.*garden/i.test(trimmed) ||
          trimmed.toLowerCase().includes('generate plan');

        let aiText: string;
        let actionLabels: string[] = [];

        if (isGeneratePlan) {
          const plan = await generateGardenPlan(trimmed, garden.climate);
          actionLabels = applyGeneratedPlan(plan);
          aiText =
            `I've generated a garden plan for you! Here's what was added:\n\n` +
            plan.zones
              .map(
                (z) =>
                  `- **${z.name}** (${z.type?.replace(/_/g, ' ')}) — ` +
                  `${z.width_m}m × ${z.depth_m}m`,
              )
              .join('\n') +
            (plan.cropAssignments.length > 0
              ? `\n\nCrops have been assigned to the zones. Check the planting panel for details.`
              : '') +
            `\n\nFeel free to ask me to adjust the layout, swap crops, or explain any planting choices.`;
        } else {
          const response = await sendChatMessage(trimmed, ctx);
          aiText = response.text;
          // Execute any embedded actions
          if (response.actions.length > 0) {
            actionLabels = executeActions(response.actions);
          }
        }

        const aiMsg: ChatMessage = {
          id: uuid(),
          role: 'ai',
          content: aiText,
          timestamp: new Date(),
          actions_taken: actionLabels.length > 0 ? actionLabels : undefined,
        };
        addChatMessage(aiMsg);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred.';
        setError(message);

        const errMsg: ChatMessage = {
          id: uuid(),
          role: 'ai',
          content: `Sorry, I ran into a problem: ${message}\n\nPlease try again or check your API key configuration.`,
          timestamp: new Date(),
        };
        addChatMessage(errMsg);
      } finally {
        setIsLoading(false);
      }
    },
    [garden, isLoading, addChatMessage, executeActions, applyGeneratedPlan],
  );

  // ---------------------------------------------------------------------------
  // Photo upload
  // ---------------------------------------------------------------------------

  const handlePhotoUpload = useCallback(
    async (file: File) => {
      if (!garden) return;
      setError(null);
      setIsLoading(true);

      // User message with photo indicator
      const userMsg: ChatMessage = {
        id: uuid(),
        role: 'user',
        content: `📷 Uploaded photo: ${file.name}`,
        timestamp: new Date(),
        source: 'text',
      };
      addChatMessage(userMsg);

      try {
        const base64 = await fileToBase64(file);
        const ctx = buildGardenContext(garden);
        const response = await analyzeGardenPhoto(base64, ctx);

        const actionLabels =
          response.actions.length > 0 ? executeActions(response.actions) : [];

        const aiMsg: ChatMessage = {
          id: uuid(),
          role: 'ai',
          content: response.text,
          timestamp: new Date(),
          actions_taken: actionLabels.length > 0 ? actionLabels : undefined,
        };
        addChatMessage(aiMsg);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Photo analysis failed.';
        setError(message);
        addChatMessage({
          id: uuid(),
          role: 'ai',
          content: `Sorry, the photo analysis failed: ${message}`,
          timestamp: new Date(),
        });
      } finally {
        setIsLoading(false);
      }
    },
    [garden, addChatMessage, executeActions],
  );

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handlePhotoUpload(file);
      }
      // Reset so the same file can be re-uploaded
      e.target.value = '';
    },
    [handlePhotoUpload],
  );

  // ---------------------------------------------------------------------------
  // Keyboard handler
  // ---------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(inputValue);
      }
    },
    [inputValue, sendMessage],
  );

  // ---------------------------------------------------------------------------
  // Guard: no garden loaded
  // ---------------------------------------------------------------------------

  if (!garden) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-4xl">🌱</div>
        <p className="text-sm text-garden-stone">
          Create or load a garden to start chatting with GardenAI.
        </p>
      </div>
    );
  }

  const canSend = inputValue.trim().length > 0 && !isLoading;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col bg-garden-cream/50">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-garden-cream-dark bg-white/70 px-4 py-3 backdrop-blur-sm">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-garden-leaf text-sm text-white">
          🌱
        </div>
        <div>
          <p className="text-sm font-semibold text-garden-soil">GardenAI</p>
          <p className="text-xs text-garden-stone">
            {isLoading ? (
              <span className="animate-pulse text-garden-leaf">Thinking…</span>
            ) : (
              'Ask anything about your garden'
            )}
          </p>
        </div>
      </div>

      {/* ── Message list ──────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto py-3">
        {chatHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <div className="text-5xl">🥕</div>
            <div className="px-6">
              <p className="font-medium text-garden-soil">Welcome to GardenAI</p>
              <p className="mt-1 text-sm text-garden-stone">
                I know your garden inside and out. Ask me anything — from companion
                planting to what to sow this week.
              </p>
            </div>
            <div className="text-xs text-garden-stone/60">
              Your garden: <span className="font-medium text-garden-soil">{garden.name}</span>
              {' · '}
              {garden.zones.length} zone{garden.zones.length !== 1 ? 's' : ''}
            </div>
          </div>
        ) : (
          <>
            {chatHistory.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </>
        )}

        {/* Typing indicator */}
        {isLoading && <TypingIndicator />}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Error banner ──────────────────────────────────── */}
      {error && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-auto shrink-0 text-red-400 hover:text-red-600"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Quick actions ─────────────────────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto px-4 pb-2 pt-1 scrollbar-none">
        {QUICK_ACTIONS.map((qa) => (
          <button
            key={qa.label}
            onClick={() => sendMessage(qa.message)}
            disabled={isLoading}
            className="shrink-0 rounded-full border border-garden-leaf/30 bg-white/80 px-3 py-1 text-xs font-medium text-garden-leaf transition-all hover:border-garden-leaf hover:bg-garden-leaf hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {qa.label}
          </button>
        ))}
      </div>

      {/* ── Input area ────────────────────────────────────── */}
      <div className="border-t border-garden-cream-dark bg-white/70 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-end gap-2">
          {/* Photo upload button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            title="Upload a garden photo for analysis"
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-garden-cream-dark bg-white text-garden-stone transition-all hover:border-garden-leaf hover:text-garden-leaf disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Upload photo"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="Ask about your garden…"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-garden-cream-dark bg-white/90 px-3 py-2 text-sm text-garden-soil placeholder-garden-stone/50 outline-none transition-all focus:border-garden-leaf focus:ring-1 focus:ring-garden-leaf disabled:opacity-60"
            style={{ minHeight: '38px', maxHeight: '160px' }}
          />

          {/* Microphone button (coming soon) */}
          <div className="group relative mb-0.5">
            <button
              type="button"
              disabled
              title="Voice input — coming soon"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-garden-cream-dark bg-white text-garden-stone/40 cursor-not-allowed"
              aria-label="Voice input (coming soon)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 4a3 3 0 013 3v4a3 3 0 01-6 0V7a3 3 0 013-3z"
                />
              </svg>
            </button>
            <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-garden-soil px-2 py-1 text-xs text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100">
              Coming soon
            </div>
          </div>

          {/* Send button */}
          <button
            type="button"
            onClick={() => sendMessage(inputValue)}
            disabled={!canSend}
            aria-label="Send message"
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-garden-leaf text-white shadow-sm transition-all hover:bg-garden-leaf-dark hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {isLoading ? (
              <svg
                className="h-4 w-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            )}
          </button>
        </div>

        <p className="mt-1.5 text-center text-[10px] text-garden-stone/40">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
