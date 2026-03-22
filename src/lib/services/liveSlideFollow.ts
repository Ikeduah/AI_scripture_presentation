import type { Slide } from "@/lib/types";

export type LiveSlideFollowSettings = {
  enabled: boolean;
  matchThreshold: number; // 0-1
  endTriggerThreshold: number; // 0-1
  endTriggerTailWords: number;
  enableEndAdvance: boolean;
  minWords: number;
  cooldownMs: number;
  maxLookahead: number;
  transcriptWindowWords: number;
};

export type LiveSlideFollowState = {
  currentSlideId: string | null;
  lastAdvanceAt: number;
  transcriptTokens: string[];
};

export type LiveSlideFollowMatch = {
  slide: Slide;
  score: number;
  reason: "sequential" | "fallback" | "end";
};

const NON_WORD_RE = /[^a-z0-9']+/g;

export function normalizeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(NON_WORD_RE, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function orderedMatchRatio(sourceTokens: string[], targetTokens: string[]): number {
  if (!targetTokens.length) return 0;
  let matchIndex = 0;
  for (const token of sourceTokens) {
    if (token === targetTokens[matchIndex]) {
      matchIndex += 1;
      if (matchIndex >= targetTokens.length) break;
    }
  }
  return matchIndex / targetTokens.length;
}

function overlapRatio(sourceTokens: string[], targetTokens: string[]): number {
  if (!targetTokens.length) return 0;
  const sourceSet = new Set(sourceTokens);
  const targetSet = new Set(targetTokens);
  let overlap = 0;
  targetSet.forEach((token) => {
    if (sourceSet.has(token)) overlap += 1;
  });
  return overlap / targetSet.size;
}

function scoreSlideMatch(chunkTokens: string[], slideTokens: string[]): number {
  if (!slideTokens.length) return 0;
  const overlap = overlapRatio(chunkTokens, slideTokens);
  const ordered = orderedMatchRatio(chunkTokens, slideTokens);
  return overlap * 0.65 + ordered * 0.35;
}

function isEligibleSlide(slide: Slide): boolean {
  return slide.text.trim().length > 0;
}

function getOrderedSlides(slides: Slide[]): Slide[] {
  return [...slides].sort((a, b) => a.order - b.order);
}

function findNextEligibleSlide(
  slides: Slide[],
  startIndex: number
): Slide | null {
  for (let i = startIndex; i < slides.length; i += 1) {
    if (isEligibleSlide(slides[i])) return slides[i];
  }
  return null;
}

function shouldAdvanceAtEnd(
  slideTokens: string[],
  transcriptTokens: string[],
  settings: LiveSlideFollowSettings
): boolean {
  if (!settings.enableEndAdvance) return false;
  if (settings.endTriggerTailWords <= 0) return false;
  const tail = slideTokens.slice(-settings.endTriggerTailWords);
  if (!tail.length) return false;
  const windowSize = Math.max(settings.endTriggerTailWords * 4, tail.length);
  const recentTokens = transcriptTokens.slice(-windowSize);
  const ratio = orderedMatchRatio(recentTokens, tail);
  return ratio >= settings.endTriggerThreshold;
}

export function applyLiveSlideFollow(
  chunkText: string,
  slides: Slide[],
  state: LiveSlideFollowState,
  settings: LiveSlideFollowSettings,
  options?: { allowMatch?: boolean; now?: number }
): { match: LiveSlideFollowMatch | null; nextState: LiveSlideFollowState } {
  const now = options?.now ?? Date.now();
  const chunkTokens = normalizeTokens(chunkText);
  const nextState: LiveSlideFollowState = {
    ...state,
    transcriptTokens: [
      ...state.transcriptTokens,
      ...chunkTokens,
    ].slice(-settings.transcriptWindowWords),
  };

  if (!settings.enabled) {
    return { match: null, nextState };
  }

  if (!options?.allowMatch) {
    return { match: null, nextState };
  }

  if (chunkTokens.length < settings.minWords) {
    return { match: null, nextState };
  }

  if (now - state.lastAdvanceAt < settings.cooldownMs) {
    return { match: null, nextState };
  }

  const orderedSlides = getOrderedSlides(slides);
  if (!orderedSlides.length) {
    return { match: null, nextState };
  }

  const currentIndex = state.currentSlideId
    ? orderedSlides.findIndex((s) => s.id === state.currentSlideId)
    : -1;

  if (currentIndex >= 0) {
    const currentSlide = orderedSlides[currentIndex];
    if (isEligibleSlide(currentSlide)) {
      const currentTokens = normalizeTokens(currentSlide.text);
      if (
        shouldAdvanceAtEnd(
          currentTokens,
          nextState.transcriptTokens,
          settings
        )
      ) {
        const nextSlide = findNextEligibleSlide(orderedSlides, currentIndex + 1);
        if (nextSlide) {
          return {
            match: { slide: nextSlide, score: 1, reason: "end" },
            nextState,
          };
        }
      }
    }

    let bestSequential: LiveSlideFollowMatch | null = null;
    const maxIndex = Math.min(
      orderedSlides.length - 1,
      currentIndex + settings.maxLookahead
    );
    for (let i = currentIndex; i <= maxIndex; i += 1) {
      const slide = orderedSlides[i];
      if (!isEligibleSlide(slide)) continue;
      const score = scoreSlideMatch(chunkTokens, normalizeTokens(slide.text));
      if (!bestSequential || score > bestSequential.score) {
        bestSequential = { slide, score, reason: "sequential" };
      }
    }

    if (
      bestSequential &&
      bestSequential.score >= settings.matchThreshold &&
      bestSequential.slide.id !== state.currentSlideId
    ) {
      return { match: bestSequential, nextState };
    }
  }

  let bestFallback: LiveSlideFollowMatch | null = null;
  for (const slide of orderedSlides) {
    if (!isEligibleSlide(slide)) continue;
    const score = scoreSlideMatch(chunkTokens, normalizeTokens(slide.text));
    if (!bestFallback || score > bestFallback.score) {
      bestFallback = { slide, score, reason: "fallback" };
    }
  }

  if (
    bestFallback &&
    bestFallback.score >= settings.matchThreshold &&
    bestFallback.slide.id !== state.currentSlideId
  ) {
    return { match: bestFallback, nextState };
  }

  return { match: null, nextState };
}
