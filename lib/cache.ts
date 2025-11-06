import { kv } from "@vercel/kv";
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

const CACHE_PREFIX = "bible:verse:";
const BIBLE_CACHE_BLOB_PATH = "bible.json";
const CACHE_FILE = path.join(process.cwd(), "data", "bible.json");
const MIGRATION_STATUS_KEY = "bible:cache:migration:status";

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
 * Get the full Redis key with prefix
 */
function getRedisKey(book: string, chapter: number, verse: number): string {
  const key = getCacheKey(book, chapter, verse);
  return `${CACHE_PREFIX}${key}`;
}

/**
 * Check if Redis/KV is configured
 */
function isKVConfigured(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/**
 * Check if Blob is configured
 */
function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/**
 * Load verse from Blob (for fallback/migration)
 */
async function loadFromBlob(): Promise<BibleCache> {
  if (!isBlobConfigured()) {
    return {};
  }

  try {
    console.log("[cache] Loading from Vercel Blob");
    const blobs = await list({ prefix: BIBLE_CACHE_BLOB_PATH });
    const cacheBlob = blobs.blobs.find(b => b.pathname === BIBLE_CACHE_BLOB_PATH);
    
    if (cacheBlob) {
      const response = await fetch(cacheBlob.url);
      if (response.ok) {
        const content = await response.text();
        if (content.trim()) {
          const cache = JSON.parse(content);
          const entryCount = Object.keys(cache).length;
          console.log("[cache] ✅ Loaded from Blob,", entryCount, "entries");
          return cache;
        }
      }
    }
  } catch (error: any) {
    console.warn("[cache] Error loading from Blob:", error?.message);
  }

  return {};
}

/**
 * Save verse to Blob (dual-write)
 */
async function saveToBlob(cache: BibleCache): Promise<void> {
  if (!isBlobConfigured()) {
    return;
  }

  try {
    const jsonContent = JSON.stringify(cache, null, 2);
    const buffer = Buffer.from(jsonContent, "utf-8");

    await put(BIBLE_CACHE_BLOB_PATH, buffer, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    console.log("[cache] ✅ Saved to Blob");
  } catch (error) {
    console.warn("[cache] Error saving to Blob:", error);
  }
}

/**
 * Get a verse from cache (Redis first, Blob fallback)
 */
export async function getCachedVerse(
  book: string,
  chapter: number,
  verse: number
): Promise<VerseData | null> {
  const key = getCacheKey(book, chapter, verse);
  const redisKey = getRedisKey(book, chapter, verse);
  
  console.log("[cache] Getting verse from cache, key:", key);
  
  // Step 1: Try Redis/KV first (primary)
  if (isKVConfigured()) {
    try {
      const cached = await kv.get<VerseData>(redisKey);
      if (cached) {
        console.log("[cache] ✅ Found verse in Redis");
        return cached;
      }
    } catch (error: any) {
      console.warn("[cache] Error reading from Redis:", error?.message);
    }
  }

  // Step 2: Fallback to Blob if not in Redis
  if (isBlobConfigured()) {
    try {
      const blobCache = await loadFromBlob();
      const result = blobCache[key] || null;
      if (result) {
        console.log("[cache] ✅ Found verse in Blob (fallback)");
        // Migrate to Redis in background (don't await)
        if (isKVConfigured()) {
          migrateVerseToRedis(key, result).catch(err => 
            console.warn("[cache] Background migration failed:", err)
          );
        }
        return result;
      }
    } catch (error: any) {
      console.warn("[cache] Error reading from Blob:", error?.message);
    }
  }

  // Step 3: Fallback to local filesystem for development
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const fileContent = fs.readFileSync(CACHE_FILE, "utf-8");
      if (fileContent.trim()) {
        const cache = JSON.parse(fileContent);
        const result = cache[key] || null;
        if (result) {
          console.log("[cache] ✅ Found verse in local filesystem");
          return result;
        }
      }
    }
  } catch (error) {
    console.error("[cache] Error loading from local filesystem:", error);
  }

  console.log("[cache] ❌ Verse not found in any cache");
  return null;
}

/**
 * Migrate a single verse from Blob to Redis (background operation)
 */
async function migrateVerseToRedis(key: string, verseData: VerseData): Promise<void> {
  if (!isKVConfigured()) {
    return;
  }

  try {
    const redisKey = getRedisKey(verseData.book, verseData.chapter, verseData.verse);
    await kv.set(redisKey, verseData);
    console.log("[cache] 🔄 Migrated verse to Redis:", key);
  } catch (error) {
    console.warn("[cache] Error migrating verse to Redis:", error);
  }
}

/**
 * Store a verse in cache (dual-write to both Redis and Blob)
 */
export async function cacheVerse(verseData: VerseData): Promise<void> {
  if (!verseData.book || verseData.chapter === undefined || verseData.verse === undefined) {
    console.warn("[cache] Invalid verse data, skipping cache:", verseData);
    return;
  }

  const key = getCacheKey(verseData.book, verseData.chapter, verseData.verse);
  const redisKey = getRedisKey(verseData.book, verseData.chapter, verseData.verse);
  
  console.log("[cache] Caching verse, key:", key);
  
  // Only cache if we have text content
  if (!verseData.text || verseData.text === "Verse not found.") {
    console.warn("[cache] Skipping cache - no valid text content");
    return;
  }

  // Normalize the verse data
  const normalizedVerseData: VerseData = {
    ...verseData,
    book: normalizeBookName(verseData.book)
  };

  // Step 1: Write to Redis (primary)
  if (isKVConfigured()) {
    try {
      await kv.set(redisKey, normalizedVerseData);
      console.log("[cache] ✅ Saved to Redis");
    } catch (error) {
      console.error("[cache] ❌ Error saving to Redis:", error);
    }
  }

  // Step 2: Dual-write to Blob (for migration period)
  if (isBlobConfigured()) {
    try {
      // Load existing Blob cache
      const blobCache = await loadFromBlob();
      blobCache[key] = normalizedVerseData;
      await saveToBlob(blobCache);
      console.log("[cache] ✅ Saved to Blob (dual-write)");
    } catch (error) {
      console.warn("[cache] Error saving to Blob:", error);
    }
  }

  // Step 3: Also save to local filesystem for development
  try {
    const cache: BibleCache = fs.existsSync(CACHE_FILE)
      ? JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"))
      : {};
    
    cache[key] = normalizedVerseData;
    const dataDir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  } catch (error) {
    // Ignore local filesystem errors
  }
}

/**
 * Check if a verse exists in cache
 */
export async function isVerseCached(book: string, chapter: number, verse: number): Promise<boolean> {
  const redisKey = getRedisKey(book, chapter, verse);
  
  // Check Redis first
  if (isKVConfigured()) {
    try {
      const cached = await kv.get<VerseData>(redisKey);
      if (cached && cached.text && cached.text !== "Verse not found.") {
        return true;
      }
    } catch (error) {
      // Fall through to Blob
    }
  }

  // Check Blob fallback
  if (isBlobConfigured()) {
    try {
      const blobCache = await loadFromBlob();
      const key = getCacheKey(book, chapter, verse);
      const verseData = blobCache[key];
      if (verseData && verseData.text && verseData.text !== "Verse not found.") {
        return true;
      }
    } catch (error) {
      // Ignore
    }
  }

  return false;
}

/**
 * Load entire cache (for migration purposes)
 */
export async function loadCache(): Promise<BibleCache> {
  // Try Blob first (for migration)
  if (isBlobConfigured()) {
    const blobCache = await loadFromBlob();
    if (Object.keys(blobCache).length > 0) {
      return blobCache;
    }
  }

  // Fallback to local filesystem
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const fileContent = fs.readFileSync(CACHE_FILE, "utf-8");
      if (fileContent.trim()) {
        return JSON.parse(fileContent);
      }
    }
  } catch (error) {
    console.error("[cache] Error loading from local filesystem:", error);
  }

  return {};
}

/**
 * Save entire cache (for migration purposes)
 */
export async function saveCache(cache: BibleCache): Promise<void> {
  // Save to Blob
  if (isBlobConfigured()) {
    await saveToBlob(cache);
  }

  // Also save to local filesystem
  try {
    const dataDir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  } catch (error) {
    console.error("[cache] Error saving to local filesystem:", error);
  }
}

/**
 * Migration utilities
 */
export async function getMigrationStatus(): Promise<{ migrated: number; total: number; percentage: number }> {
  if (!isKVConfigured()) {
    return { migrated: 0, total: 0, percentage: 0 };
  }

  try {
    const status = await kv.get<{ migrated: number; total: number }>(MIGRATION_STATUS_KEY);
    if (status) {
      return {
        ...status,
        percentage: status.total > 0 ? Math.round((status.migrated / status.total) * 100) : 0
      };
    }
  } catch (error) {
    console.error("[cache] Error getting migration status:", error);
  }

  return { migrated: 0, total: 0, percentage: 0 };
}

export async function setMigrationStatus(migrated: number, total: number): Promise<void> {
  if (!isKVConfigured()) {
    return;
  }

  try {
    await kv.set(MIGRATION_STATUS_KEY, { migrated, total });
  } catch (error) {
    console.error("[cache] Error setting migration status:", error);
  }
}
