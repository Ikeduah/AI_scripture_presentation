/**
 * SmartVerses Helper Utilities
 * 
 * Storage helpers and pure utility functions extracted from page.tsx
 */

import type {
  SmartVersesChatMessage,
  DetectedBibleReference,
  TranscriptionSegment,
} from "@/lib/types/smartVerses";
import type { AppSettings } from "@/lib/types";
import { parseVerseReference, lookupVerse } from "@/lib/services/smartVersesBibleService";
import type { BibleTranslationSummary } from "@/lib/types/bible";
import React from "react";

// Storage keys
export const SMART_VERSES_CHAT_HISTORY_KEY = "proassist-smartverses-chat-history";
export const SMART_VERSES_STARRED_KEY = "proassist-smartverses-starred-refs";
export const REPORT_ISSUE_SEEN_KEY = "proassist-report-issue-seen";
export const SMART_VERSES_TRANSCRIPT_DISPLAY_KEY = "proassist-smartverses-transcript-display";

// =============================================================================
// STORAGE HELPERS
// =============================================================================

export function loadAppSettings(): AppSettings {
  try {
    const stored = localStorage.getItem("proassist_app_settings");
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    console.error("Failed to load app settings:", err);
  }
  return { theme: "dark" };
}

export function loadChatHistory(): SmartVersesChatMessage[] {
  try {
    const stored = localStorage.getItem(SMART_VERSES_CHAT_HISTORY_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    console.error("Failed to load chat history:", err);
  }
  return [];
}

export function saveChatHistory(history: SmartVersesChatMessage[]): void {
  try {
    const trimmed = history.slice(-100);
    localStorage.setItem(SMART_VERSES_CHAT_HISTORY_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.error("Failed to save chat history:", err);
  }
}

export function loadStarredRefs(): Set<string> {
  try {
    const stored = localStorage.getItem(SMART_VERSES_STARRED_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((value) => typeof value === "string"));
      }
    }
  } catch (err) {
    console.error("Failed to load starred references:", err);
  }
  return new Set();
}

export function saveStarredRefs(refs: Set<string>): void {
  try {
    localStorage.setItem(SMART_VERSES_STARRED_KEY, JSON.stringify(Array.from(refs)));
  } catch (err) {
    console.error("Failed to save starred references:", err);
  }
}

// =============================================================================
// TRANSCRIPT DISPLAY OPTIONS
// =============================================================================

export type TranscriptDisplayOptions = {
  showTranscript: boolean;
  showScriptureRefs: boolean;
  showKeyPoints: boolean;
};

export const DEFAULT_TRANSCRIPT_DISPLAY_OPTIONS: TranscriptDisplayOptions = {
  showTranscript: true,
  showScriptureRefs: true,
  showKeyPoints: false,
};

export function loadTranscriptDisplayOptions(): TranscriptDisplayOptions {
  try {
    const stored = localStorage.getItem(SMART_VERSES_TRANSCRIPT_DISPLAY_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<TranscriptDisplayOptions>;
      return {
        showTranscript:
          typeof parsed.showTranscript === "boolean"
            ? parsed.showTranscript
            : DEFAULT_TRANSCRIPT_DISPLAY_OPTIONS.showTranscript,
        showScriptureRefs:
          typeof parsed.showScriptureRefs === "boolean"
            ? parsed.showScriptureRefs
            : DEFAULT_TRANSCRIPT_DISPLAY_OPTIONS.showScriptureRefs,
        showKeyPoints:
          typeof parsed.showKeyPoints === "boolean"
            ? parsed.showKeyPoints
            : DEFAULT_TRANSCRIPT_DISPLAY_OPTIONS.showKeyPoints,
      };
    }
  } catch (err) {
    console.error("Failed to load transcript display options:", err);
  }
  return DEFAULT_TRANSCRIPT_DISPLAY_OPTIONS;
}

export function saveTranscriptDisplayOptions(options: TranscriptDisplayOptions): void {
  try {
    localStorage.setItem(
      SMART_VERSES_TRANSCRIPT_DISPLAY_KEY,
      JSON.stringify(options)
    );
  } catch (err) {
    console.error("Failed to save transcript display options:", err);
  }
}

// =============================================================================
// PURE UTILITY FUNCTIONS
// =============================================================================

export function filterTranslationsByQuery(
  query: string,
  options: BibleTranslationSummary[]
): BibleTranslationSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((translation) => {
    const haystack = [
      translation.id,
      translation.shortName,
      translation.fullName,
      ...(translation.aliases || []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export const normalizeTranscriptMarker = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/^[[\(]+/, "")
    .replace(/[\])\]]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

export const normalizeReferenceMarker = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const buildTranscriptReferenceKey = (
  transcriptText: string,
  reference: string
): string =>
  `${normalizeTranscriptMarker(transcriptText || "")}::${normalizeReferenceMarker(
    reference || ""
  )}`;

export async function resolveReferencesFromList(
  references: string[],
  transcriptText: string,
  translationId: string
): Promise<DetectedBibleReference[]> {
  const results: DetectedBibleReference[] = [];
  const now = Date.now();

  for (const reference of references) {
    const parsed = parseVerseReference(reference, translationId);
    if (!parsed || parsed.length === 0) continue;
    const verseText = await lookupVerse(parsed[0], translationId);
    if (!verseText) continue;

    results.push({
      id: `ref-${now}-${Math.random().toString(36).slice(2, 10)}`,
      reference: parsed[0].displayRef,
      displayRef: parsed[0].displayRef,
      verseText,
      source: "direct",
      transcriptText,
      timestamp: now,
      translationId,
      book: parsed[0].book,
      chapter: parsed[0].chapter,
      verse: parsed[0].startVerse,
    });
  }

  return results;
}

/**
 * Renders verse text with highlighted words in bold light yellow
 */
export function renderHighlightedVerseText(
  verseText: string,
  highlightWords?: string[]
): React.ReactNode {
  if (!highlightWords || highlightWords.length === 0) {
    return verseText;
  }

  const wordsPattern = highlightWords
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
    .map((word) => `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    .join('|');

  if (!wordsPattern) {
    return verseText;
  }

  const regex = new RegExp(`(${wordsPattern})`, 'gi');
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  regex.lastIndex = 0;

  while ((match = regex.exec(verseText)) !== null) {
    if (match.index > lastIndex) {
      parts.push(verseText.substring(lastIndex, match.index));
    }

    parts.push(
      React.createElement('span', {
        key: `highlight-${match.index}`,
        style: {
          fontWeight: 'bold',
          color: '#fef08a',
        },
      }, match[0])
    );

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < verseText.length) {
    parts.push(verseText.substring(lastIndex));
  }

  return parts.length > 0 ? React.createElement(React.Fragment, null, ...parts) : verseText;
}
