import type { Slide } from "@/lib/types";
import type { ScheduleItem } from "@/lib/types/propresenter";

/**
 * Extracts the first line from slide text for matching purposes.
 * Trims whitespace and returns lowercase for consistent comparison.
 */
export function getSlideFirstLine(slide: Slide): string {
  const lines = slide.text.split("\n");
  return (lines[0] || "").trim().toLowerCase();
}

/**
 * Normalizes a string for comparison by:
 * - Converting to lowercase
 * - Removing extra whitespace
 * - Removing common punctuation
 */
function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"()-]/g, " ") // Replace punctuation with spaces
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .trim();
}

/**
 * Calculates similarity score between two strings (0-1).
 * Uses a simple word-based matching approach.
 */
function calculateSimilarity(a: string, b: string): number {
  const wordsA = normalizeForComparison(a).split(" ").filter(w => w.length > 0);
  const wordsB = normalizeForComparison(b).split(" ").filter(w => w.length > 0);
  
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  
  // Count matching words
  let matches = 0;
  for (const wordA of wordsA) {
    for (const wordB of wordsB) {
      // Exact match or one contains the other (for partial matches like "prayer" in "prayer 1")
      if (wordA === wordB || wordA.includes(wordB) || wordB.includes(wordA)) {
        matches++;
        break;
      }
    }
  }
  
  // Calculate score based on matched words relative to total unique words
  const totalWords = Math.max(wordsA.length, wordsB.length);
  return matches / totalWords;
}

/**
 * Finds the best matching schedule session for a given slide's first line.
 * Returns the session index if a good match is found, undefined otherwise.
 * 
 * @param slideFirstLine - The first line of the slide text
 * @param schedule - The list of schedule items to match against
 * @param matchThreshold - Minimum similarity score to consider a match (default: 0.5)
 * @returns The index of the best matching session, or undefined if no good match
 */
export function findMatchingSession(
  slideFirstLine: string,
  schedule: ScheduleItem[],
  matchThreshold: number = 0.5
): number | undefined {
  if (!slideFirstLine.trim() || schedule.length === 0) {
    return undefined;
  }

  const normalizedSlide = normalizeForComparison(slideFirstLine);
  
  let bestMatch: { index: number; score: number } | null = null;

  for (let i = 0; i < schedule.length; i++) {
    const session = schedule[i];
    const normalizedSession = normalizeForComparison(session.session);
    
    // Check for exact match first (case-insensitive)
    if (normalizedSlide === normalizedSession) {
      return i;
    }
    
    // Check if one contains the other
    if (normalizedSlide.includes(normalizedSession) || normalizedSession.includes(normalizedSlide)) {
      const score = 0.9; // High score for containment
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { index: i, score };
      }
    } else {
      // Calculate word-based similarity
      const score = calculateSimilarity(slideFirstLine, session.session);
      if (score >= matchThreshold && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { index: i, score };
      }
    }
  }

  return bestMatch?.index;
}

/**
 * Auto-assigns timer sessions to slides based on matching first lines to schedule items.
 * Skips auto-scripture slides.
 * 
 * @param slides - The slides to process
 * @param schedule - The schedule items to match against
 * @returns Object containing updated slides and statistics
 */
export function autoAssignTimersToSlides(
  slides: Slide[],
  schedule: ScheduleItem[]
): {
  updatedSlides: Slide[];
  matchedCount: number;
  skippedCount: number;
  unchangedCount: number;
} {
  let matchedCount = 0;
  let skippedCount = 0;
  let unchangedCount = 0;

  const updatedSlides = slides.map((slide) => {
    // Skip auto-scripture slides
    if (slide.isAutoScripture) {
      skippedCount++;
      return slide;
    }

    const firstLine = getSlideFirstLine(slide);
    const matchedIndex = findMatchingSession(firstLine, schedule);

    if (matchedIndex !== undefined) {
      // Only count as matched if it's a change
      if (slide.timerSessionIndex !== matchedIndex) {
        matchedCount++;
        return { ...slide, timerSessionIndex: matchedIndex };
      } else {
        unchangedCount++;
        return slide;
      }
    } else {
      // No match found, leave unchanged
      unchangedCount++;
      return slide;
    }
  });

  return {
    updatedSlides,
    matchedCount,
    skippedCount,
    unchangedCount,
  };
}
