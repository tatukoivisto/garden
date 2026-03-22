'use client';

/**
 * StartScreen – the AI-first landing screen shown when no garden is loaded.
 *
 * Layout:
 *   • Large headline + tagline
 *   • Textarea for freeform garden description, with a Send button
 *   • Photo upload area (click or drag-and-drop)
 *   • "Browse templates" button
 *   • Scrollable template gallery of cards
 *
 * On submit the component calls a stub `generateGardenFromDescription` that
 * callers should replace with their real AI integration.  The resulting Garden
 * is loaded into the store and the parent switches to canvas view via
 * `onGardenReady`.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { useGardenStore } from '@/store/gardenStore';
import { gardenTemplates } from '@/data/templates';
import type { Garden, GardenTemplate } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StartScreenProps {
  /** Called once the garden data has been loaded into the store. */
  onGardenReady?: () => void;
}

// ---------------------------------------------------------------------------
// AI stub – replace with real implementation
// ---------------------------------------------------------------------------

/**
 * Stub: parse a natural-language garden description and return a Garden
 * skeleton.  In production this calls an LLM endpoint.
 *
 * The stub simply creates a default 8×6 m garden and resolves after a short
 * artificial delay so the loading state is visible.
 */
async function generateGardenFromDescription(description: string): Promise<Partial<Garden>> {
  await new Promise((r) => setTimeout(r, 1400));

  // Very rough heuristic: look for dimensions in the text
  const dimMatch = description.match(/(\d+)\s*[×x]\s*(\d+)/);
  const width_m = dimMatch ? Number(dimMatch[1]) : 8;
  const depth_m = dimMatch ? Number(dimMatch[2]) : 6;

  return {
    name: 'My Garden',
    width_m,
    depth_m,
    south_edge: 'top',
    bed_system: 'metric',
    unit_system: 'metric',
    zones: [],
  };
}

/**
 * Stub: analyse an uploaded photo and return a Garden skeleton.
 */
async function generateGardenFromPhoto(_file: File): Promise<Partial<Garden>> {
  await new Promise((r) => setTimeout(r, 1800));
  return {
    name: 'Garden from photo',
    width_m: 10,
    depth_m: 8,
    south_edge: 'top',
    bed_system: 'metric',
    unit_system: 'metric',
    zones: [],
  };
}

// ---------------------------------------------------------------------------
// Template card
// ---------------------------------------------------------------------------

interface TemplateSvgProps {
  thumbnail?: string;
  name: string;
}

function TemplateThumbnail({ thumbnail, name }: TemplateSvgProps) {
  if (thumbnail) {
    return (
      <img
        src={thumbnail}
        alt={`${name} layout preview`}
        className="w-full h-full object-cover"
        draggable={false}
      />
    );
  }
  // Fallback: simple coloured placeholder
  return (
    <svg
      viewBox="0 0 120 80"
      className="w-full h-full"
      aria-hidden
    >
      <rect width="120" height="80" fill="#F5F0E8" rx="4" />
      <rect x="10" y="10" width="45" height="60" fill="#A5D6A7" rx="3" opacity={0.7} />
      <rect x="65" y="10" width="45" height="60" fill="#C8E6C9" rx="3" opacity={0.7} />
    </svg>
  );
}

interface TemplateCardProps {
  template: GardenTemplate;
  onSelect: (template: GardenTemplate) => void;
  loading: boolean;
}

function TemplateCard({ template, onSelect, loading }: TemplateCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(template)}
      disabled={loading}
      className="
        group flex-shrink-0 w-44 rounded-xl overflow-hidden border border-gray-200 bg-white
        shadow-sm hover:shadow-md hover:border-garden-leaf
        transition-all duration-200
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garden-leaf
        disabled:opacity-60 disabled:cursor-not-allowed
        text-left
      "
    >
      {/* Thumbnail */}
      <div className="w-full h-24 bg-garden-cream overflow-hidden">
        <TemplateThumbnail thumbnail={template.thumbnail} name={template.name} />
      </div>

      {/* Info */}
      <div className="p-2.5">
        <p className="font-semibold text-sm text-garden-soil group-hover:text-garden-leaf-dark truncate">
          {template.name}
        </p>
        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-snug">
          {template.description}
        </p>
        {/* Tags */}
        <div className="flex flex-wrap gap-1 mt-1.5">
          {template.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 rounded-full bg-garden-cream text-[10px] text-garden-leaf-dark font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Icon helpers
// ---------------------------------------------------------------------------

function IconCamera() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M2 7.5A1.5 1.5 0 0 1 3.5 6h1l1-2h7l1 2h1A1.5 1.5 0 0 1 16 7.5v7A1.5 1.5 0 0 1 14.5 16h-11A1.5 1.5 0 0 1 2 14.5v-7Z" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="9" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M2 6a2 2 0 0 1 2-2h3.5l2 2H16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M14 8 L2 2 L5 8 L2 14 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
      <line x1="5" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconSpinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="animate-spin">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeOpacity={0.25} />
      <path d="M14 8 A6 6 0 0 0 8 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Quick-start template chips (subset shown as pill buttons above the gallery)
// ---------------------------------------------------------------------------

const FEATURED_IDS = ['salo_22x15', 'beginner_4x8', 'sfg_4x4', 'family_6x12', 'market_garden_pro'];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function StartScreen({ onGardenReady }: StartScreenProps) {
  const { createNewGarden, initGarden } = useGardenStore();

  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGallery, setShowGallery] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // ---------------------------------------------------------------------------
  // AI generation from text
  // ---------------------------------------------------------------------------

  async function handleGenerate() {
    const trimmed = description.trim();
    if (!trimmed || isGenerating) return;

    setError(null);
    setIsGenerating(true);

    try {
      const partial = await generateGardenFromDescription(trimmed);
      // Build a proper garden via the store helper (ensures id, seasons, etc.)
      createNewGarden(
        partial.name ?? 'My Garden',
        partial.width_m ?? 8,
        partial.depth_m ?? 6,
      );
      // Merge any extra fields (zones, bed_system, etc.) that came back
      // We do this imperatively after createNewGarden sets initial state.
      // In a real integration you'd pass the full Garden object to initGarden.
      onGardenReady?.();
    } catch (err) {
      setError('Something went wrong generating the garden plan. Please try again.');
      console.error('[StartScreen] generateGardenFromDescription failed:', err);
    } finally {
      setIsGenerating(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl + Enter submits
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  }

  // ---------------------------------------------------------------------------
  // Photo upload
  // ---------------------------------------------------------------------------

  async function processFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, WEBP, HEIC).');
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      const partial = await generateGardenFromPhoto(file);
      createNewGarden(
        partial.name ?? 'Garden from photo',
        partial.width_m ?? 10,
        partial.depth_m ?? 8,
      );
      onGardenReady?.();
    } catch (err) {
      setError('Could not analyse the photo. Please try a different image or describe your garden instead.');
      console.error('[StartScreen] generateGardenFromPhoto failed:', err);
    } finally {
      setIsGenerating(false);
    }
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset so same file can be re-selected
    e.target.value = '';
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  // ---------------------------------------------------------------------------
  // Template selection
  // ---------------------------------------------------------------------------

  function handleTemplateSelect(template: GardenTemplate) {
    const g = template.garden;
    createNewGarden(
      g.name ?? template.name,
      g.width_m ?? 8,
      g.depth_m ?? 6,
    );
    onGardenReady?.();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const featuredTemplates = gardenTemplates.filter((t) => FEATURED_IDS.includes(t.id));
  const allTemplates = gardenTemplates;

  return (
    <main className="
      min-h-screen bg-gradient-to-br from-garden-cream via-white to-green-50
      flex flex-col items-center justify-start
      px-4 py-12 sm:py-16
      animate-fade-in
    ">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="text-center mb-10 animate-slide-up">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-garden-leaf/10 mb-4">
          {/* Seedling emoji rendered as text for universal support */}
          <span className="text-4xl" role="img" aria-label="Seedling">🌱</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-garden-leaf-dark tracking-tight">
          Kitchen Garden Planner
        </h1>
        <p className="mt-2 text-base text-gray-500 max-w-sm mx-auto leading-relaxed">
          Describe your plot and let AI design a personalised planting plan.
        </p>
      </div>

      {/* ── AI input card ───────────────────────────────────────────── */}
      <div className="
        w-full max-w-2xl bg-white rounded-2xl shadow-md border border-gray-200
        p-5 sm:p-6
        animate-slide-up
      "
        style={{ animationDelay: '60ms' }}
      >
        <label htmlFor="garden-description" className="block text-sm font-semibold text-gray-700 mb-2">
          Tell me about your garden
        </label>

        <div className="relative">
          <textarea
            id="garden-description"
            ref={textareaRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              `"I have a 10×8 m plot in Helsinki with partial shade on the north side. I want to grow tomatoes, lettuce, and herbs. The soil is sandy loam."`
            }
            rows={4}
            disabled={isGenerating}
            className="
              w-full resize-none rounded-xl border border-gray-200 bg-gray-50
              px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400
              focus:outline-none focus:ring-2 focus:ring-garden-leaf focus:border-transparent
              disabled:opacity-60
              transition-colors duration-150
              leading-relaxed
            "
          />
        </div>

        {/* Send + helper text row */}
        <div className="flex items-center justify-between mt-3 gap-3">
          <p className="text-xs text-gray-400">
            Press{' '}
            <kbd className="px-1 py-0.5 rounded bg-gray-100 border border-gray-300 font-mono text-[10px]">
              ⌘ Enter
            </kbd>{' '}
            to generate
          </p>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!description.trim() || isGenerating}
            className="
              btn-primary min-w-[108px]
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            {isGenerating ? (
              <>
                <IconSpinner />
                Generating…
              </>
            ) : (
              <>
                <IconSend />
                Generate
              </>
            )}
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Divider ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* ── Upload + browse row ─────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Photo upload drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Upload a photo of your garden"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={[
              'flex-1 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed',
              'py-4 px-3 cursor-pointer transition-colors duration-150 text-center',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garden-leaf',
              isDragging
                ? 'border-garden-leaf bg-garden-leaf/5 text-garden-leaf-dark'
                : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-garden-leaf hover:text-garden-leaf',
            ].join(' ')}
          >
            <IconCamera />
            <div>
              <p className="text-sm font-medium">Upload a photo</p>
              <p className="text-xs text-gray-400 mt-0.5">Drag & drop or click to browse</p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileInput}
            className="sr-only"
            aria-hidden
            tabIndex={-1}
          />

          {/* Browse templates */}
          <button
            type="button"
            onClick={() => setShowGallery((v) => !v)}
            className="
              flex-1 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed
              border-gray-200 bg-gray-50 py-4 px-3 cursor-pointer
              text-gray-500 hover:border-garden-leaf hover:text-garden-leaf
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garden-leaf
              transition-colors duration-150 text-center
            "
          >
            <IconFolder />
            <div>
              <p className="text-sm font-medium">Browse templates</p>
              <p className="text-xs text-gray-400 mt-0.5">{gardenTemplates.length} ready-made layouts</p>
            </div>
          </button>
        </div>
      </div>

      {/* ── Popular template chips ───────────────────────────────────── */}
      <div
        className="w-full max-w-2xl mt-6 animate-slide-up"
        style={{ animationDelay: '120ms' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Popular templates
          </span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <div className="flex flex-wrap gap-2">
          {featuredTemplates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTemplateSelect(t)}
              disabled={isGenerating}
              title={t.description}
              className="
                px-3 py-1.5 rounded-full text-xs font-medium
                bg-white border border-gray-200 text-garden-leaf-dark
                hover:bg-garden-leaf hover:text-white hover:border-garden-leaf
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garden-leaf
                transition-colors duration-150 shadow-sm
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Full template gallery ────────────────────────────────────── */}
      {showGallery && (
        <div
          className="w-full max-w-2xl mt-6 animate-fade-in"
          style={{ animationDelay: '0ms' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              All templates
            </span>
            <div className="flex-1 h-px bg-gray-200" />
            <button
              type="button"
              onClick={() => setShowGallery(false)}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Close
            </button>
          </div>

          {/* Horizontally scrollable row of cards */}
          <div
            className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1"
            role="list"
            aria-label="Garden templates"
          >
            {allTemplates.map((template) => (
              <div key={template.id} role="listitem">
                <TemplateCard
                  template={template}
                  onSelect={handleTemplateSelect}
                  loading={isGenerating}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Footer note ─────────────────────────────────────────────── */}
      <p
        className="mt-10 text-xs text-gray-400 animate-slide-up"
        style={{ animationDelay: '200ms' }}
      >
        All data is stored locally in your browser. Nothing is sent to a server without your consent.
      </p>
    </main>
  );
}
