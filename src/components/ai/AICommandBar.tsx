'use client';

import React, { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useGardenStore } from '@/store/gardenStore';
import { type AIResponse } from '@/lib/ai';
import { runToolLoop } from '@/lib/aiToolLoop';
import { generateSuggestions } from '@/lib/suggestions';
import { useActionExecutor } from '@/hooks/useActionExecutor';
import type { ChatMessage, Suggestion } from '@/types';

// Web Speech API types (not in default TS lib)
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    onresult: ((event: any) => void) | null;
    onend: (() => void) | null;
    onerror: ((event: any) => void) | null;
  }
}

function uuid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------------------------------------------------------------------------
// Inline markdown renderer (lightweight)
// ---------------------------------------------------------------------------

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (/^\*\*(.+)\*\*$/.test(part)) return <strong key={i} className="text-white/85 font-semibold">{part.slice(2, -2)}</strong>;
    if (/^_(.+)_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    if (/^`(.+)`$/.test(part)) return <code key={i} className="rounded-md bg-white/[0.06] px-1 py-0.5 font-mono text-[10px] text-emerald-300/80">{part.slice(1, -1)}</code>;
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
// Thinking indicator with elapsed time
// ---------------------------------------------------------------------------

function ThinkingIndicator({ step }: { step: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex items-center gap-1">
        <span className="thinking-dot" />
        <span className="thinking-dot [animation-delay:200ms]" />
        <span className="thinking-dot [animation-delay:400ms]" />
      </div>
      <span className="text-[10px] text-white/20 tabular-nums">
        {step > 0 && `Step ${step} · `}{elapsed}s
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VISIBLE_MESSAGES = 20;
const LOAD_MORE_COUNT = 20;

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
  const [toolStep, setToolStep] = useState(0);
  const [lastResponse, setLastResponse] = useState<AIResponse | null>(null);
  const [showResponse, setShowResponse] = useState(false);
  const [sentMessage, setSentMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(VISIBLE_MESSAGES);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingMediaName, setPendingMediaName] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const queuedMessageRef = useRef<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { executeActions } = useActionExecutor();

  // Compute suggestions from garden state
  const suggestions: Suggestion[] = garden ? generateSuggestions(garden) : [];

  // Get selected zone name for placeholder
  const selectedZone = selectedZoneIds.length === 1
    ? garden?.zones.find((z) => z.id === selectedZoneIds[0])
    : null;

  const placeholder = isListening
    ? 'Listening...'
    : isStreaming
      ? 'Type next message...'
      : selectedZone
        ? `Ask about ${selectedZone.name}...`
        : 'Ask AI anything about your garden...';

  // Reset visible count when chat grows (new messages always visible)
  useEffect(() => {
    setVisibleCount((prev) => Math.max(prev, VISIBLE_MESSAGES));
  }, [chatHistory.length]);

  // Messages to render — slice from end for newest-first loading
  const visibleMessages = chatHistory.length <= visibleCount
    ? chatHistory
    : chatHistory.slice(-visibleCount);
  const hasOlderMessages = chatHistory.length > visibleCount;

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

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResponse(false);
        setIsFocused(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ---------------------------------------------------------------------------
  // Media handling (images + videos via drag-and-drop or file picker)
  // ---------------------------------------------------------------------------

  /** Read an image file as base64 data URL. */
  const readImageFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setPendingImage(reader.result as string);
      setPendingMediaName(file.name);
      inputRef.current?.focus();
      if (!inputRef.current?.value) {
        setInputValue('Analyze this garden photo');
      }
    };
    reader.readAsDataURL(file);
  }, []);

  /** Extract the first frame from a video as a JPEG base64. */
  const extractVideoFrame = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadeddata = () => {
      // Seek to 1 second (or 0 if shorter)
      video.currentTime = Math.min(1, video.duration * 0.1);
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(video.videoWidth, 1280);
      canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 0.85);
        setPendingImage(base64);
        setPendingMediaName(file.name);
        inputRef.current?.focus();
        if (!inputRef.current?.value) {
          setInputValue('Analyze this garden video frame');
        }
      }
      URL.revokeObjectURL(url);
      video.remove();
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      video.remove();
    };

    video.src = url;
  }, []);

  /** Process a dropped or selected file. */
  const handleMediaFile = useCallback((file: File) => {
    if (file.type.startsWith('image/')) {
      readImageFile(file);
    } else if (file.type.startsWith('video/')) {
      extractVideoFrame(file);
    }
  }, [readImageFile, extractVideoFrame]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleMediaFile(file);
    e.target.value = '';
  }, [handleMediaFile]);

  const clearPendingImage = useCallback(() => {
    setPendingImage(null);
    setPendingMediaName(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Drag and drop
  // ---------------------------------------------------------------------------

  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const file = e.dataTransfer.files?.[0];
    if (file && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
      handleMediaFile(file);
    }
  }, [handleMediaFile]);

  // ---------------------------------------------------------------------------
  // Voice handling (Web Speech API)
  // ---------------------------------------------------------------------------

  const hasSpeechAPI = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const toggleVoice = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'fi-FI'; // Finnish default, falls back gracefully

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join('');
      setInputValue(transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  // ---------------------------------------------------------------------------
  // Message sending
  // ---------------------------------------------------------------------------

  const processMessage = useCallback(async (text: string, imageBase64?: string | null) => {
    if (!garden) return;

    setError(null);
    setIsStreaming(true);
    setToolStep(0);
    setShowResponse(true);
    setLastResponse(null);
    setSentMessage(text);

    const userMsg: ChatMessage = {
      id: uuid(), role: 'user',
      content: imageBase64 ? `📷 ${text}` : text,
      timestamp: new Date(), source: 'text',
    };
    addChatMessage(userMsg);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await runToolLoop(
        imageBase64 ? `[User attached a garden photo] ${text}` : text,
        garden,
        selectedZoneIds,
        chatHistory,
        {
          onThinking: () => {},
          onStep: (step) => setToolStep(step),
          onComplete: (finalResponse) => {
            setLastResponse(finalResponse);

            if (finalResponse.actions.length > 0) {
              executeActions(finalResponse.actions);
              if (finalResponse.actions.some((a) => a.type === 'add_zone') && !useGardenStore.getState().canvasVisible) {
                setCanvasVisible(true);
              }
            }

            if (finalResponse.suggestions.length > 0) {
              setAISuggestions(finalResponse.suggestions);
            }
          },
        },
        controller.signal,
        imageBase64 ?? undefined,
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
      if (msg !== 'Request cancelled') {
        setError(msg);
        addChatMessage({
          id: uuid(), role: 'ai', content: `Sorry: ${msg}`, timestamp: new Date(),
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;

      // Process queued message if any
      const queued = queuedMessageRef.current;
      if (queued) {
        queuedMessageRef.current = null;
        setTimeout(() => processMessage(queued), 100);
      }
    }
  }, [garden, selectedZoneIds, chatHistory, addChatMessage, executeActions, setAISuggestions, setCanvasVisible]);

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !garden) return;

    // Stop voice if listening
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    const image = pendingImage;
    setInputValue('');
    setPendingImage(null);

    if (isStreaming) {
      queuedMessageRef.current = trimmed;
      addChatMessage({
        id: uuid(), role: 'user', content: trimmed, timestamp: new Date(), source: 'text',
      });
      return;
    }

    processMessage(trimmed, image);
  }, [garden, isStreaming, isListening, pendingImage, processMessage, addChatMessage]);

  const cancelRequest = useCallback(() => {
    abortRef.current?.abort();
    queuedMessageRef.current = null;
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage(inputValue);
    }
    if (e.key === 'Escape') {
      if (isStreaming) {
        cancelRequest();
      } else {
        setShowResponse(false);
        setIsFocused(false);
        inputRef.current?.blur();
      }
    }
  }, [inputValue, sendMessage, isStreaming, cancelRequest]);

  const canSend = inputValue.trim().length > 0 || pendingImage !== null;

  // Merge garden suggestions with AI-returned suggestions
  const aiSuggestions = useGardenStore((s) => s.aiSuggestions);
  const displaySuggestions = aiSuggestions.length > 0
    ? aiSuggestions.map((s, i) => ({ id: `ai-${i}`, label: s.label, prompt: s.prompt, icon: '💡', priority: 100, category: 'crops' as const }))
    : suggestions;

  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages — instant jump
  useEffect(() => {
    if (showResponse && chatScrollRef.current) {
      requestAnimationFrame(() => {
        chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight });
      });
    }
  }, [chatHistory.length, showResponse]);

  // Smooth scroll only for streaming indicator changes
  useEffect(() => {
    if (isStreaming && showResponse && chatScrollRef.current) {
      chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [isStreaming, showResponse]);

  // Load older messages when scrolling to top
  const handleChatScroll = useCallback(() => {
    const el = chatScrollRef.current;
    if (!el || !hasOlderMessages) return;
    if (el.scrollTop < 40) {
      const prevHeight = el.scrollHeight;
      setVisibleCount((c) => c + LOAD_MORE_COUNT);
      // Preserve scroll position after loading older messages
      requestAnimationFrame(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight - prevHeight;
        }
      });
    }
  }, [hasOlderMessages]);

  return (
    <div
      ref={containerRef}
      className="fixed bottom-0 left-0 right-0 z-40 flex flex-col items-center pointer-events-none pb-4 px-4"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop zone overlay */}
      {isDragging && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center pb-20">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-2xl mx-4 rounded-2xl border-2 border-dashed border-emerald-400/40 bg-emerald-500/[0.06] px-8 py-12 text-center">
            <svg className="mx-auto mb-3 h-8 w-8 text-emerald-400/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <p className="text-sm font-medium text-emerald-400/60">Drop image or video</p>
            <p className="mt-1 text-[11px] text-white/25">Photos are analyzed directly. Videos extract a frame for analysis.</p>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Chat panel — scrollable history + current response */}
      {showResponse && (
        <div className="pointer-events-auto w-full max-w-2xl mb-3 command-bar-response-enter">
          <div className="relative bg-[#0e1411]/95 backdrop-blur-2xl border border-white/[0.07] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col" style={{ maxHeight: 'min(420px, 50vh)' }}>
            {/* Close button */}
            <button
              onClick={() => setShowResponse(false)}
              className="absolute top-2.5 right-2.5 p-1 rounded-md text-white/15 hover:text-white/40 hover:bg-white/[0.05] transition-colors duration-100 z-10"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            {/* Scrollable message area */}
            <div ref={chatScrollRef} onScroll={handleChatScroll} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {/* Loading indicator for older messages */}
              {hasOlderMessages && (
                <div className="text-center py-1">
                  <span className="text-[9px] text-white/15">Scroll up for older messages</span>
                </div>
              )}

              {visibleMessages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={msg.id} className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[8px] font-bold mt-0.5 ${
                      isUser ? 'bg-white/[0.06] text-white/35' : 'bg-emerald-500/15 text-emerald-400/80'
                    }`}>
                      {isUser ? 'Y' : 'AI'}
                    </div>
                    <div className={`flex flex-col gap-1 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                      <div className={`rounded-2xl px-3.5 py-2 text-[12px] leading-relaxed ${
                        isUser
                          ? 'rounded-tr-md bg-white/[0.05] text-white/55'
                          : 'rounded-tl-md bg-white/[0.025] text-white/60'
                      }`}>
                        <div className="space-y-1">{renderMarkdown(msg.content)}</div>
                      </div>
                      {msg.actions_taken && msg.actions_taken.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {msg.actions_taken.map((label, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/8 text-[9px] text-emerald-400/70 font-semibold">
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

              {/* Thinking indicator */}
              {isStreaming && (
                <div className="flex items-start gap-2.5">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-[8px] font-bold text-emerald-400/80 mt-0.5">
                    AI
                  </div>
                  <div className="rounded-2xl rounded-tl-md bg-white/[0.025] px-3.5 py-2.5">
                    <ThinkingIndicator step={toolStep} />
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-red-500/8 border border-red-500/15 px-3 py-2 text-[11px] text-red-400/70 flex items-center justify-between">
                  <span>{error}</span>
                  <button
                    onClick={() => { setError(null); processMessage(sentMessage); }}
                    className="ml-2 px-2 py-0.5 rounded-md bg-red-500/15 text-red-300/70 hover:bg-red-500/25 transition-colors duration-100 text-[10px] font-semibold"
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
        <div className="pointer-events-auto flex gap-1.5 mb-2.5 overflow-x-auto scrollbar-none max-w-2xl w-full px-1 command-bar-suggestions-enter">
          {displaySuggestions.slice(0, 5).map((s) => (
            <button
              key={s.id}
              onClick={() => sendMessage(s.prompt)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[10px] text-white/35 font-medium hover:bg-emerald-500/8 hover:border-emerald-500/15 hover:text-emerald-400/70 transition-all duration-150"
            >
              <span className="text-[11px]">{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Pending image preview */}
      {pendingImage && (
        <div className="pointer-events-auto w-full max-w-2xl mb-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
            <img src={pendingImage} alt="Attached" className="h-8 w-8 rounded object-cover" />
            <span className="text-[10px] text-white/40">{pendingMediaName ?? 'Photo attached'}</span>
            <button
              onClick={clearPendingImage}
              className="p-0.5 rounded text-white/20 hover:text-white/50 transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Command bar input */}
      <div className="pointer-events-auto w-full max-w-2xl">
        <div className={[
          'flex items-center gap-2 bg-[#0e1411]/90 backdrop-blur-2xl rounded-2xl border transition-all duration-150',
          isListening
            ? 'border-red-500/30 shadow-xl shadow-red-500/[0.05]'
            : isFocused
              ? 'border-emerald-500/20 shadow-xl shadow-emerald-500/[0.03]'
              : 'border-white/[0.07] shadow-xl shadow-black/30',
        ].join(' ')}>
          {/* AI icon — pulses while streaming */}
          <div className="pl-4 flex-shrink-0">
            <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[8px] font-bold transition-colors duration-300 ${
              isStreaming
                ? 'bg-emerald-500/25 text-emerald-400/90 animate-pulse'
                : 'bg-emerald-500/12 text-emerald-400/60'
            }`}>
              AI
            </div>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              setIsFocused(true);
              if (chatHistory.length > 0) setShowResponse(true);
            }}
            placeholder={placeholder}
            className="flex-1 bg-transparent py-3 text-[13px] text-white/75 placeholder-white/20 outline-none"
          />

          {/* Right side actions */}
          <div className="flex items-center gap-0.5 pr-2">
            {/* Photo button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-lg text-white/15 hover:text-white/40 hover:bg-white/[0.04] transition-colors duration-100"
              title="Attach image or video"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </button>

            {/* Voice button */}
            {hasSpeechAPI && (
              <button
                onClick={toggleVoice}
                className={`p-1.5 rounded-lg transition-colors duration-100 ${
                  isListening
                    ? 'text-red-400/80 bg-red-500/15 animate-pulse'
                    : 'text-white/15 hover:text-white/40 hover:bg-white/[0.04]'
                }`}
                title={isListening ? 'Stop listening' : 'Voice input'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>
            )}

            {/* History toggle */}
            {chatHistory.length > 0 && (
              <button
                onClick={() => setShowResponse((v) => !v)}
                className={`p-1.5 rounded-lg transition-colors duration-100 ${showResponse ? 'text-emerald-400/50 bg-emerald-500/8' : 'text-white/20 hover:text-white/40 hover:bg-white/[0.04]'}`}
                title="Chat history"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </button>
            )}

            {/* Stop button (while streaming) or Send button */}
            {isStreaming ? (
              <button
                type="button"
                onClick={cancelRequest}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-white/50 transition-all duration-150 hover:bg-red-500/20 hover:text-red-400/80 active:scale-95"
                title="Stop (Esc)"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => sendMessage(inputValue)}
                disabled={!canSend}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white transition-all duration-150 hover:bg-emerald-400 active:scale-95 disabled:opacity-20 disabled:bg-white/[0.04] disabled:text-white/25 disabled:active:scale-100"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Keyboard hint */}
        <div className="flex items-center justify-center gap-3 mt-1.5">
          <span className="text-[9px] text-white/[0.08]">
            Press <kbd className="px-1 py-0.5 rounded bg-white/[0.04] text-white/15 font-mono text-[8px]">/</kbd> to focus
          </span>
          <span className="text-[9px] text-white/[0.08]">
            {isStreaming ? (
              <><kbd className="px-1 py-0.5 rounded bg-white/[0.04] text-white/15 font-mono text-[8px]">Esc</kbd> to stop</>
            ) : (
              <><kbd className="px-1 py-0.5 rounded bg-white/[0.04] text-white/15 font-mono text-[8px]">Enter</kbd> to send</>
            )}
          </span>
          {isStreaming && inputValue.trim() && (
            <span className="text-[9px] text-emerald-400/20">
              <kbd className="px-1 py-0.5 rounded bg-emerald-500/[0.06] text-emerald-400/25 font-mono text-[8px]">Enter</kbd> to queue
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
