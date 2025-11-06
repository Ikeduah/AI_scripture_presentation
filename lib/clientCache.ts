interface VerseData {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  translation?: string;
}

interface ClientCache {
  [key: string]: VerseData;
}

const CACHE_KEY = "bible_verse_cache";
const MAX_CACHE_SIZE = 1000; // Maximum number of verses to cache

/**
 * Normalize book name for consistent cache keys
 */
function normalizeBookName(book: string): string {
  return book
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Generate a cache key from verse data
 */
export function getCacheKey(book: string, chapter: number, verse: number): string {
  const normalizedBook = normalizeBookName(book);
  return `${normalizedBook} ${chapter}:${verse}`;
}

/**
 * Load cache from localStorage
 */
function loadCache(): ClientCache {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.warn("[clientCache] Error loading cache:", error);
  }
  return {};
}

/**
 * Save cache to localStorage
 */
function saveCache(cache: ClientCache): void {
  try {
    // Limit cache size to prevent localStorage from getting too large
    const entries = Object.entries(cache);
    if (entries.length > MAX_CACHE_SIZE) {
      // Remove oldest entries (keep most recent)
      const sorted = entries.slice(-MAX_CACHE_SIZE);
      const limitedCache: ClientCache = {};
      sorted.forEach(([key, value]) => {
        limitedCache[key] = value;
      });
      localStorage.setItem(CACHE_KEY, JSON.stringify(limitedCache));
    } else {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    }
  } catch (error) {
    console.warn("[clientCache] Error saving cache:", error);
    // If quota exceeded, try to clear some space
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      console.warn("[clientCache] Storage quota exceeded, clearing oldest entries");
      const cache = loadCache();
      const entries = Object.entries(cache);
      const reduced = entries.slice(-Math.floor(MAX_CACHE_SIZE / 2));
      const reducedCache: ClientCache = {};
      reduced.forEach(([key, value]) => {
        reducedCache[key] = value;
      });
      localStorage.setItem(CACHE_KEY, JSON.stringify(reducedCache));
    }
  }
}

/**
 * Get a verse from client cache
 */
export function getCachedVerse(
  book: string,
  chapter: number,
  verse: number
): VerseData | null {
  const cache = loadCache();
  const key = getCacheKey(book, chapter, verse);
  const result = cache[key] || null;
  if (result) {
    console.log("[clientCache] ✅ Found in client cache:", key);
  }
  return result;
}

/**
 * Store a verse in client cache
 */
export function cacheVerse(verseData: VerseData): void {
  if (!verseData.book || verseData.chapter === undefined || verseData.verse === undefined) {
    return;
  }

  const cache = loadCache();
  const key = getCacheKey(verseData.book, verseData.chapter, verseData.verse);
  
  // Normalize book name for consistency
  const normalizedVerse = {
    ...verseData,
    book: normalizeBookName(verseData.book)
  };
  
  cache[key] = normalizedVerse;
  saveCache(cache);
  console.log("[clientCache] 💾 Cached verse:", key);
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; keys: string[] } {
  const cache = loadCache();
  return {
    size: Object.keys(cache).length,
    keys: Object.keys(cache)
  };
}

/**
 * Clear the client cache
 */
export function clearCache(): void {
  localStorage.removeItem(CACHE_KEY);
  console.log("[clientCache] Cache cleared");
}

