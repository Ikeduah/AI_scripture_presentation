/**
 * Migration script to move verses from Blob to Redis/KV
 * 
 * Usage:
 *   npx tsx scripts/migrate-blob-to-kv.ts
 * 
 * This script:
 * 1. Loads all verses from Blob
 * 2. Migrates them to Redis in batches
 * 3. Tracks migration progress
 * 4. Can be run multiple times safely (idempotent)
 */

import { kv } from "@vercel/kv";
import { list } from "@vercel/blob";
import { setMigrationStatus, getCacheKey } from "../lib/cache";

const BIBLE_CACHE_BLOB_PATH = "bible.json";
const CACHE_PREFIX = "bible:verse:";
const BATCH_SIZE = 50; // Process 50 verses at a time

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

async function migrateBlobToKV() {
  console.log("🚀 Starting migration from Blob to Redis/KV...\n");

  // Check if KV is configured
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    console.error("❌ KV_REST_API_URL and KV_REST_API_TOKEN must be set");
    process.exit(1);
  }

  // Check if Blob is configured
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("❌ BLOB_READ_WRITE_TOKEN must be set");
    process.exit(1);
  }

  try {
    // Step 1: Load all verses from Blob
    console.log("📥 Loading verses from Blob...");
    const blobs = await list({ prefix: BIBLE_CACHE_BLOB_PATH });
    const cacheBlob = blobs.blobs.find(b => b.pathname === BIBLE_CACHE_BLOB_PATH);
    
    if (!cacheBlob) {
      console.log("✅ No Blob file found. Migration complete.");
      return;
    }

    const response = await fetch(cacheBlob.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch Blob: ${response.status}`);
    }

    const content = await response.text();
    if (!content.trim()) {
      console.log("✅ Blob file is empty. Migration complete.");
      return;
    }

    const blobCache: BibleCache = JSON.parse(content);
    const entries = Object.entries(blobCache);
    const total = entries.length;

    if (total === 0) {
      console.log("✅ No verses found in Blob. Migration complete.");
      return;
    }

    console.log(`📊 Found ${total} verses to migrate\n`);

    // Step 2: Migrate in batches
    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      console.log(`🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(total / BATCH_SIZE)} (${batch.length} verses)...`);

      const promises = batch.map(async ([key, verseData]) => {
        try {
          const redisKey = `${CACHE_PREFIX}${key}`;
          
          // Check if already exists in Redis
          const existing = await kv.get<VerseData>(redisKey);
          if (existing) {
            skipped++;
            return { key, status: "skipped" };
          }

          // Migrate to Redis
          await kv.set(redisKey, verseData);
          migrated++;
          return { key, status: "migrated" };
        } catch (error: any) {
          errors++;
          console.error(`  ❌ Error migrating ${key}:`, error?.message);
          return { key, status: "error", error: error?.message };
        }
      });

      await Promise.all(promises);

      // Update migration status
      await setMigrationStatus(migrated, total);

      const percentage = Math.round((migrated / total) * 100);
      console.log(`  ✅ Progress: ${migrated}/${total} (${percentage}%) - Migrated: ${migrated}, Skipped: ${skipped}, Errors: ${errors}\n`);
    }

    // Step 3: Summary
    console.log("=".repeat(60));
    console.log("📊 Migration Summary:");
    console.log(`  Total verses: ${total}`);
    console.log(`  ✅ Migrated: ${migrated}`);
    console.log(`  ⏭️  Skipped (already in Redis): ${skipped}`);
    console.log(`  ❌ Errors: ${errors}`);
    console.log(`  📈 Success rate: ${Math.round(((migrated + skipped) / total) * 100)}%`);
    console.log("=".repeat(60));

    if (errors === 0 && migrated + skipped === total) {
      console.log("\n✅ Migration completed successfully!");
      console.log("💡 You can now disable Blob writes in cache.ts once you've verified everything works.");
    } else if (errors > 0) {
      console.log("\n⚠️  Migration completed with errors. Review the errors above.");
    }

  } catch (error: any) {
    console.error("\n❌ Migration failed:", error?.message);
    console.error(error);
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  migrateBlobToKV()
    .then(() => {
      console.log("\n✨ Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Fatal error:", error);
      process.exit(1);
    });
}

export { migrateBlobToKV };

