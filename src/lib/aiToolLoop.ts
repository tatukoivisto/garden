/**
 * aiToolLoop.ts — Multi-turn orchestration loop for AI tool-use.
 *
 * Handles the Gemini function-calling loop:
 * 1. Send user message + tool declarations to Gemini
 * 2. If Gemini returns function calls, execute them locally
 * 3. Send results back to Gemini
 * 4. Repeat until Gemini returns a text response
 * 5. Return accumulated actions + final text
 */

import type { Garden, AIAction, AISuggestion, ChatMessage } from '@/types';
import {
  buildGardenContext,
  buildToolSystemPrompt,
  buildContents,
  callGeminiWithTools,
  type GeminiContent,
  type AIResponse,
} from '@/lib/ai';
import { TOOL_DECLARATIONS } from '@/lib/toolDeclarations';
import { TOOL_REGISTRY } from '@/lib/toolExecutors';

const MAX_ITERATIONS = 8;
const NUDGE_AT_ITERATION = 6;
const PER_CALL_TIMEOUT_MS = 30_000;
const MODEL = 'gemini-3-flash-preview';

export interface ToolLoopCallbacks {
  onThinking: () => void;
  /** Called after each tool-call round with the current step number. */
  onStep?: (step: number) => void;
  onComplete: (response: AIResponse) => void;
}

/**
 * Combine an optional user abort signal with a per-call timeout.
 * Returns a signal that fires on whichever comes first.
 */
function combinedSignal(userSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(PER_CALL_TIMEOUT_MS);
  if (!userSignal) return timeoutSignal;
  return AbortSignal.any([userSignal, timeoutSignal]);
}

/**
 * Run the AI tool-use loop.
 *
 * User sends a message → Gemini calls tools → tools execute → repeat → final text.
 * No user confirmation between steps — smooth UX.
 */
export async function runToolLoop(
  userMessage: string,
  garden: Garden,
  selectedZoneIds: string[],
  chatHistory: ChatMessage[],
  callbacks: ToolLoopCallbacks,
  signal?: AbortSignal,
  /** Optional base64 image to include with the user message. */
  imageBase64?: string,
): Promise<AIResponse> {
  callbacks.onThinking();

  // Build context and system prompt
  const ctx = buildGardenContext(garden, selectedZoneIds);
  const systemPrompt = buildToolSystemPrompt(ctx);

  // Build conversation contents from chat history
  const contents: GeminiContent[] = buildContents(chatHistory, userMessage);

  // If an image was provided, add it to the last user message parts
  if (imageBase64) {
    const lastMsg = contents[contents.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      lastMsg.parts.unshift({
        inlineData: { mimeType: 'image/jpeg', data: base64Data },
      });
    }
  }

  // Deep-clone garden as working copy for mutation tools
  const workingGarden: Garden = JSON.parse(JSON.stringify(garden));

  // Accumulate actions across all tool calls
  const allActions: AIAction[] = [];

  // Tool-calling loop
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // Check if cancelled
    if (signal?.aborted) {
      throw new DOMException('Request was cancelled', 'AbortError');
    }

    // Nudge the AI to wrap up if running long
    if (iteration === NUDGE_AT_ITERATION) {
      contents.push({
        role: 'user',
        parts: [{
          text: 'You have used many tool calls. Please provide your final response now summarizing what you did.',
        }],
      });
    }

    let response;
    try {
      response = await callGeminiWithTools(
        MODEL,
        contents,
        systemPrompt,
        TOOL_DECLARATIONS,
        combinedSignal(signal),
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (signal?.aborted) {
          throw new Error('Request cancelled');
        }
        throw new Error('Request timed out — try again');
      }
      throw err;
    }

    // If text response (no function calls) — we're done
    if (response.functionCalls === null) {
      const { text, suggestions } = parseTextResponse(response.text ?? '');
      const finalResponse: AIResponse = {
        text,
        actions: allActions,
        suggestions,
      };
      callbacks.onComplete(finalResponse);
      return finalResponse;
    }

    // Pass back the model's raw parts verbatim — preserves thoughtSignature
    // fields that Gemini 3 requires for function calling to work.
    contents.push({ role: 'model', parts: response.rawModelParts });

    const responseParts: GeminiContent['parts'] = [];

    for (const fc of response.functionCalls) {
      const executor = TOOL_REGISTRY[fc.name];
      if (!executor) {
        responseParts.push({
          functionResponse: {
            name: fc.name,
            response: { error: `Unknown tool: ${fc.name}` },
          },
        });
        continue;
      }

      try {
        const { result, actions } = executor(fc.args, workingGarden, selectedZoneIds);
        allActions.push(...actions);
        responseParts.push({
          functionResponse: { name: fc.name, response: result },
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Tool execution failed';
        responseParts.push({
          functionResponse: {
            name: fc.name,
            response: { error: errorMsg },
          },
        });
      }
    }

    contents.push({ role: 'user', parts: responseParts });
    callbacks.onStep?.(iteration + 1);
  }

  // Max iterations reached — return what we have
  const fallbackResponse: AIResponse = {
    text: 'I completed the requested changes. Here is a summary of the actions taken.',
    actions: allActions,
    suggestions: [],
  };
  callbacks.onComplete(fallbackResponse);
  return fallbackResponse;
}

/**
 * Parse the AI's final text response to extract suggestions and clean up.
 *
 * Handles multiple Gemini output formats:
 * - SUGGESTIONS: / **SUGGESTIONS:** / ### Suggestions
 * - Bullet styles: -, •, *, numbered
 * - Label formats: [text]: prompt  and  **text**: prompt
 */
function parseTextResponse(text: string): { text: string; suggestions: AISuggestion[] } {
  const suggestions: AISuggestion[] = [];

  // Match various suggestion header formats, then grab bullet lines after
  const suggestionsRegex = /\n?(?:#{1,3}\s*)?(?:\*{0,2})(?:SUGGESTIONS|Suggestions|Ehdotukset)(?:\*{0,2})\s*:?\s*\n((?:[\s]*[-•*\d.]+\s*.+\n?)+)/i;
  const suggestionsMatch = text.match(suggestionsRegex);

  if (suggestionsMatch) {
    const lines = suggestionsMatch[1].trim().split('\n');
    for (const line of lines) {
      const trimLine = line.trim();

      // Format: - [label]: prompt
      let match = trimLine.match(/^[-•*]\s*\[(.+?)\]\s*:\s*(.+)$/);
      if (match) {
        suggestions.push({ label: match[1], prompt: match[2].trim() });
        continue;
      }

      // Format: - **label**: prompt
      match = trimLine.match(/^[-•*]\s*\*\*(.+?)\*\*\s*:\s*(.+)$/);
      if (match) {
        suggestions.push({ label: match[1], prompt: match[2].trim() });
        continue;
      }

      // Format: 1. [label]: prompt  or  1. **label**: prompt
      match = trimLine.match(/^\d+\.\s*(?:\[(.+?)\]|\*\*(.+?)\*\*)\s*:\s*(.+)$/);
      if (match) {
        suggestions.push({ label: match[1] ?? match[2], prompt: match[3].trim() });
        continue;
      }

      // Fallback: just use the bullet text as both label and prompt
      match = trimLine.match(/^[-•*\d.]+\s*(.+)$/);
      if (match && match[1].length > 3 && match[1].length < 80) {
        suggestions.push({ label: match[1].trim(), prompt: match[1].trim() });
      }
    }
  }

  // Always strip suggestions section from displayed text, even if parsing got nothing
  const cleanText = text
    .replace(/\n?(?:#{1,3}\s*)?(?:\*{0,2})(?:SUGGESTIONS|Suggestions|Ehdotukset)(?:\*{0,2})\s*:?\s*\n(?:[\s]*[-•*\d.]+\s*.+\n?)+/i, '')
    .trim();

  return { text: cleanText, suggestions };
}
