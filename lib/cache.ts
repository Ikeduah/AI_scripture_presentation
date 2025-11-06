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
 * Normalize book name for consistent cache keys
 */
function normalizeBookName(book: string): string {
  // Remove extra spaces and normalize to title case
  return book
    .trim()
    .replace(/\s+/g, " ") // Replace multiple spaces with single space
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
 * Load the Bible cache from Vercel Blob or local filesystem
 */
export async function loadCache(): Promise<BibleCache> {
  // Try Vercel Blob first if configured
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      console.log("[cache] Loading cache from Vercel Blob");
      const blobs = await list({ prefix: BIBLE_CACHE_BLOB_PATH });
      console.log("[cache] Blobs found:", blobs.blobs.length);
      const cacheBlob = blobs.blobs.find(b => b.pathname === BIBLE_CACHE_BLOB_PATH);
      
      if (cacheBlob) {
        const response = await fetch(cacheBlob.url);
        if (response.ok) {
          const content = await response.text();
          if (content.trim()) {
            try {
              const cache = JSON.parse(content);
              const entryCount = Object.keys(cache).length;
              console.log("[cache] ✅ Loaded from Vercel Blob,", entryCount, "entries");
              return cache;
            } catch (parseError) {
              console.error("[cache] Error parsing Blob content:", parseError);
              return {};
            }
          } else {
            console.log("[cache] Blob file is empty");
          }
        } else {
          console.log("[cache] Failed to fetch Blob, status:", response.status);
        }
      } else {
        console.log("[cache] Blob file not found");
      }
      // Blob exists but empty or not found, return empty cache
      console.log("[cache] Blob exists but empty or not found, returning empty cache");
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
  const entryCount = Object.keys(cache).length;
  console.log("[cache] Saving cache with", entryCount, "entries");
  
  // Try Vercel Blob first if configured
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      console.log("[cache] Saving cache to Vercel Blob");
      const jsonContent = JSON.stringify(cache, null, 2);
      const buffer = Buffer.from(jsonContent, "utf-8");
      console.log("[cache] Cache size:", buffer.length, "bytes");

      await put(BIBLE_CACHE_BLOB_PATH, buffer, {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false, // Overwrite existing file
        allowOverwrite: true, // Required to allow overwriting existing files
      });

      console.log("[cache] ✅ Saved to Vercel Blob,", entryCount, "entries");
      return;
    } catch (error) {
      console.error("[cache] ❌ Error saving to Blob:", error);
      // Fall through to local filesystem
    }
  }

  // Fallback to local filesystem for development
  try {
    console.log("[cache] Saving cache to local filesystem");
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
  const key = getCacheKey(book, chapter, verse);
  console.log("[cache] Getting verse from cache, key:", key);
  const cache = await loadCache();
  console.log("[cache] Cache contains", Object.keys(cache).length, "entries");
  console.log("[cache] Cache keys:", Object.keys(cache).slice(0, 5));
  const result = cache[key] || null;
  if (result) {
    console.log("[cache] ✅ Found verse in cache");
  } else {
    console.log("[cache] ❌ Verse not found in cache");
  }
  return result;
}

/**
 * Store a verse in cache
 */
export async function cacheVerse(verseData: VerseData): Promise<void> {
  if (!verseData.book || verseData.chapter === undefined || verseData.verse === undefined) {
    console.warn("[cache] Invalid verse data, skipping cache:", verseData);
    return;
  }

  const key = getCacheKey(verseData.book, verseData.chapter, verseData.verse);
  console.log("[cache] Caching verse, key:", key);
  
  // Only cache if we have text content
  if (!verseData.text || verseData.text === "Verse not found.") {
    console.warn("[cache] Skipping cache - no valid text content");
    return;
  }

  const cache = await loadCache();
  console.log("[cache] Loaded cache with", Object.keys(cache).length, "existing entries");
  
  // Update the verse data with normalized book name for consistency
  const normalizedVerseData = {
    ...verseData,
    book: normalizeBookName(verseData.book)
  };
  
  cache[key] = normalizedVerseData;
  console.log("[cache] Adding verse to cache. New total:", Object.keys(cache).length);
  
  await saveCache(cache);
  console.log("[cache] ✅ Saved verse to cache:", key);
}

/**
 * Check if a verse exists in cache by reference
 */
export async function isVerseCached(book: string, chapter: number, verse: number): Promise<boolean> {
  console.log("[cache] Checking if verse is cached:", getCacheKey(book, chapter, verse));
  const cache = await loadCache();
  const key = getCacheKey(book, chapter, verse);
  console.log("[cache] Verse is cached:", key in cache && !!cache[key].text && cache[key].text !== "Verse not found.");
  return key in cache && !!cache[key].text && cache[key].text !== "Verse not found.";
}

