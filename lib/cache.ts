import { put, list } from "@vercel/blob";
import fs from "fs";
import path from "path";

interface VerseData {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  translation?: string;
}

interface BibleCache {
  [key: string]: VerseData;
}

const BIBLE_CACHE_BLOB_PATH = "bible.json";
const CACHE_FILE = path.join(process.cwd(), "data", "bible.json");

/**
 * Generate a cache key from verse data
 */
export function getCacheKey(book: string, chapter: number, verse: number): string {
  return `${book} ${chapter}:${verse}`;
}

/**
 * Load the Bible cache from Vercel Blob or local filesystem
 */
export async function loadCache(): Promise<BibleCache> {
  // Try Vercel Blob first if configured
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const blobs = await list({ prefix: BIBLE_CACHE_BLOB_PATH });
      const cacheBlob = blobs.blobs.find(b => b.pathname === BIBLE_CACHE_BLOB_PATH);
      
      if (cacheBlob) {
        const response = await fetch(cacheBlob.url);
        if (response.ok) {
          const content = await response.text();
          if (content.trim()) {
            const cache = JSON.parse(content);
            console.log("[cache] Loaded from Vercel Blob");
            return cache;
          }
        }
      }
      // Blob exists but empty or not found, return empty cache
      return {};
    } catch (error: any) {
      const errorMsg = error?.message?.toLowerCase() || "";
      if (!errorMsg.includes("not found") && !errorMsg.includes("404")) {
        console.warn("[cache] Error loading from Blob, falling back to local:", errorMsg);
      }
      // Fall through to local filesystem
    }
  }

  // Fallback to local filesystem for development
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const fileContent = fs.readFileSync(CACHE_FILE, "utf-8");
      if (fileContent.trim()) {
        const cache = JSON.parse(fileContent);
        console.log("[cache] Loaded from local filesystem");
        return cache;
      }
    }
  } catch (error) {
    console.error("[cache] Error loading from local filesystem:", error);
  }

  return {};
}

/**
 * Save the Bible cache to Vercel Blob or local filesystem
 */
export async function saveCache(cache: BibleCache): Promise<void> {
  // Try Vercel Blob first if configured
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const jsonContent = JSON.stringify(cache, null, 2);
      const buffer = Buffer.from(jsonContent, "utf-8");

      await put(BIBLE_CACHE_BLOB_PATH, buffer, {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false, // Overwrite existing file
      });

      console.log("[cache] Saved to Vercel Blob");
      return;
    } catch (error) {
      console.warn("[cache] Error saving to Blob, falling back to local:", error);
      // Fall through to local filesystem
    }
  }

  // Fallback to local filesystem for development
  try {
    const dataDir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
    console.log("[cache] Saved to local filesystem");
  } catch (error) {
    console.error("[cache] Error saving to local filesystem:", error);
  }
}

/**
 * Get a verse from cache
 */
export async function getCachedVerse(
  book: string,
  chapter: number,
  verse: number
): Promise<VerseData | null> {
  const cache = await loadCache();
  const key = getCacheKey(book, chapter, verse);
  return cache[key] || null;
}

/**
 * Store a verse in cache
 */
export async function cacheVerse(verseData: VerseData): Promise<void> {
  if (!verseData.book || verseData.chapter === undefined || verseData.verse === undefined) {
    console.warn("[cache] Invalid verse data, skipping cache:", verseData);
    return;
  }

  const cache = await loadCache();
  const key = getCacheKey(verseData.book, verseData.chapter, verseData.verse);
  
  // Only cache if we have text content
  if (verseData.text && verseData.text !== "Verse not found.") {
    cache[key] = verseData;
    await saveCache(cache);
    console.log("[cache] Cached verse:", key);
  }
}

/**
 * Check if a verse exists in cache by reference
 */
export async function isVerseCached(book: string, chapter: number, verse: number): Promise<boolean> {
  const cache = await loadCache();
  const key = getCacheKey(book, chapter, verse);
  return key in cache && !!cache[key].text && cache[key].text !== "Verse not found.";
}

