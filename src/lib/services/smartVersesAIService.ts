import type { AppSettings, AIProviderType } from "@/lib/types";
import { getAIMessageFromError } from "@/lib/utils/aiError";
import type { ParaphrasedVerse, TranscriptAnalysisResult, DetectedBibleReference } from "@/lib/types/smartVerses";
import { lookupVerse, parseVerseReference } from "./smartVersesBibleService";
import { analyzeTranscriptChunkWrapper, searchBibleWithAIWrapper } from "../api/ai";

const GROQ_RATE_LIMIT_EVENT = "ai-rate-limit";
let groqRateLimitUntil = 0;
let groqRateLimitMessage = "";
let groqRateLimitDetail = "";

function extractRetryAfterMs(message: string): number | null {
  const match = message.match(/try again in (?:(\d+)m)?(\d+(?:\.\d+)?)s/i);
  if (!match) return null;
  const minutes = match[1] ? Number(match[1]) : 0;
  const seconds = match[2] ? Number(match[2]) : 0;
  if (Number.isNaN(minutes) || Number.isNaN(seconds)) return null;
  return (minutes * 60 + seconds) * 1000;
}

function emitGroqRateLimitStatus() {
  if (typeof window === "undefined") return;
  if (groqRateLimitUntil <= Date.now()) return;
  window.dispatchEvent(
    new CustomEvent(GROQ_RATE_LIMIT_EVENT, {
      detail: {
        provider: "groq",
        until: groqRateLimitUntil,
        message: groqRateLimitMessage,
        detail: groqRateLimitDetail,
      },
    })
  );
}

function markGroqRateLimit(untilMs: number, detail: string) {
  groqRateLimitUntil = untilMs;
  groqRateLimitMessage = "Groq limit — paraphrase & keywords paused";
  groqRateLimitDetail = detail;
  emitGroqRateLimitStatus();
}

export async function analyzeTranscriptChunk(
  transcriptChunk: string,
  appSettings: AppSettings,
  detectParaphrases: boolean = true,
  extractKeyPoints: boolean = false,
  options?: {
    keyPointInstructions?: string;
    overrideProvider?: AIProviderType;
    overrideModel?: string;
    minParaphraseConfidence?: number;
    maxParaphraseResults?: number;
    minWords?: number;
    previousChunks?: string[];
    paraphraseStrictMode?: boolean;
  }
): Promise<TranscriptAnalysisResult> {
  const provider =
    (options?.overrideProvider ?? appSettings.defaultAIProvider) as string;

  if (provider === "groq" && Date.now() < groqRateLimitUntil) {
    emitGroqRateLimitStatus();
    return { error: "RATE_LIMITED", paraphrasedVerses: [], keyPoints: [] } as any;
  }

  try {
    const minWords = Math.max(1, Math.floor(options?.minWords ?? 6));
    const wordCount = transcriptChunk.trim().split(/\s+/).length;
    if (wordCount < minWords) {
      return { paraphrasedVerses: [], keyPoints: [] };
    }

    const result = await analyzeTranscriptChunkWrapper(
      transcriptChunk,
      appSettings,
      detectParaphrases,
      extractKeyPoints,
      options as any
    );
    return result;
  } catch (error: any) {
    if (provider === "groq" && error.message?.includes("429")) {
      const retryMs = extractRetryAfterMs(error.message) || 10000;
      markGroqRateLimit(Date.now() + retryMs, error.message);
      return { error: "RATE_LIMITED", paraphrasedVerses: [], keyPoints: [] } as any;
    }
    console.error(`[AI Service] Error analyzing chunk:`, error);
    return {
      error: error instanceof Error ? error.message : "Error",
      paraphrasedVerses: [],
      keyPoints: [],
    } as any;
  }
}

export async function searchBibleWithAI(
  query: string,
  appSettings: AppSettings,
  overrideProvider?: 'openrouter' | 'groq',
  overrideModel?: string,
  translationId?: string
): Promise<DetectedBibleReference[]> {
  const provider = overrideProvider || appSettings.defaultAIProvider || "groq";

  if (provider === "groq" && Date.now() < groqRateLimitUntil) {
    emitGroqRateLimitStatus();
    throw new Error("Groq API rate limit exceeded. Please try again shortly.");
  }

  try {
    const results = await searchBibleWithAIWrapper(
      query,
      appSettings,
      overrideProvider,
      overrideModel,
      translationId
    );

    const finalResults: DetectedBibleReference[] = [];
    for (const item of results) {
      if (item.reference) {
        const parsedRef = parseVerseReference(item.reference, translationId);
        if (parsedRef && parsedRef.length > 0) {
          const verseText = await lookupVerse(parsedRef[0], translationId);
          if (verseText) {
            finalResults.push({
              id: `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              reference: parsedRef[0].displayRef,
              displayRef: parsedRef[0].displayRef,
              verseText,
              source: 'direct',
              timestamp: Date.now(),
              translationId,
              book: parsedRef[0].book,
              chapter: parsedRef[0].chapter,
              verse: parsedRef[0].startVerse,
              highlight: item.highlight,
            });
          }
        }
      }
    }
    return finalResults;
  } catch (error: any) {
    if (provider === "groq" && error.message?.includes("429")) {
      const retryMs = extractRetryAfterMs(error.message) || 10000;
      markGroqRateLimit(Date.now() + retryMs, error.message);
      throw new Error(`Groq rate limit. Retry in ${Math.ceil(retryMs / 1000)}s.`);
    }
    throw error;
  }
}

export async function resolveParaphrasedVerses(
  paraphrasedVerses: ParaphrasedVerse[],
  translationId?: string
): Promise<DetectedBibleReference[]> {
  const results: DetectedBibleReference[] = [];

  for (const verse of paraphrasedVerses) {
    const parsedRef = parseVerseReference(
      verse.reference,
      translationId
    );
    if (parsedRef && parsedRef.length > 0) {
      const verseText = await lookupVerse(parsedRef[0], translationId);

      if (verseText) {
        results.push({
          id: `paraphrase-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          reference: parsedRef[0].displayRef,
          displayRef: parsedRef[0].displayRef,
          verseText,
          source: 'paraphrase',
          confidence: verse.confidence,
          matchedPhrase: (verse as any).matchedText || verse.matchedPhrase,
          timestamp: Date.now(),
          translationId,
          book: parsedRef[0].book,
          chapter: parsedRef[0].chapter,
          verse: parsedRef[0].startVerse,
        });
      }
    }
  }

  return results;
}

// Export the mock getApiKey and getLLM so other parts of the app don't break if they import it
export function getApiKey() { return undefined; }
export function getLLM() { throw new Error("getLLM is legacy and should not be used on the client"); }
