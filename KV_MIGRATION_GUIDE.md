# Redis/KV Migration Guide

This guide explains how to migrate from Vercel Blob storage to Vercel KV (Redis) for the Bible verse cache.

## Overview

We're implementing a **dual-write strategy** that:
1. ✅ Writes to both Blob and Redis (during migration)
2. ✅ Reads from Redis first, falls back to Blob if not found
3. ✅ Automatically migrates verses from Blob to Redis when accessed
4. ✅ Provides a background migration script for bulk migration

## Setup

### 1. Create Vercel KV Store

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Navigate to **Storage** tab
4. Click **Create Database**
5. Select **KV** (Redis)
6. Give it a name (e.g., `bible-cache-kv`)
7. Select a region (same as your deployment for best performance)
8. Click **Create**

### 2. Link KV to Your Project

After creating the KV store, Vercel will automatically:
- Link it to your project
- Add environment variables:
  - `KV_REST_API_URL`
  - `KV_REST_API_TOKEN`
  - `KV_REST_API_READ_ONLY_TOKEN` (optional)

These will be available in your next deployment.

### 3. Verify Environment Variables

Check that these are set in your Vercel project:
- `KV_REST_API_URL` ✅
- `KV_REST_API_TOKEN` ✅
- `BLOB_READ_WRITE_TOKEN` ✅ (still needed during migration)

## Migration Process

### Phase 1: Dual-Write (Current)

The code is now configured to:
- **Write**: Both Redis and Blob
- **Read**: Redis first, then Blob fallback

This ensures:
- No data loss during migration
- Automatic migration of accessed verses
- Safe rollback if needed

### Phase 2: Background Migration

Run the migration script to move all existing verses:

```bash
# Install tsx if not already installed
npm install -D tsx

# Run migration script
npx tsx scripts/migrate-blob-to-kv.ts
```

The script will:
- Load all verses from Blob
- Migrate them to Redis in batches of 50
- Skip verses already in Redis (idempotent)
- Track progress
- Show summary statistics

### Phase 3: Verify Migration

Check migration status:

```bash
# Via API endpoint
curl https://your-app.vercel.app/api/migration-status

# Response:
{
  "migrated": 150,
  "total": 150,
  "percentage": 100
}
```

Or check in your Vercel dashboard:
- Go to Storage → Your KV store
- Check the number of keys

### Phase 4: Monitor

Monitor the system for a few days:
- Check logs for any Blob fallbacks
- Verify all verses are accessible
- Ensure performance is improved

### Phase 5: Remove Blob Writes (Optional)

Once you're confident everything works:

1. Update `lib/cache.ts`:
   - Remove Blob write code from `cacheVerse()`
   - Keep Blob read as fallback (optional, for safety)

2. Or set an environment variable to disable Blob writes:
   ```typescript
   const DISABLE_BLOB_WRITES = process.env.DISABLE_BLOB_WRITES === "true";
   ```

## How It Works

### Read Flow

```
1. Check Redis (primary) → Found? Return ✅
2. Check Blob (fallback) → Found? 
   - Return verse ✅
   - Migrate to Redis in background 🔄
3. Check local filesystem (dev only)
4. Not found ❌
```

### Write Flow

```
1. Write to Redis (primary) ✅
2. Write to Blob (dual-write during migration) ✅
3. Write to local filesystem (dev only) ✅
```

### Automatic Migration

When a verse is found in Blob but not Redis:
- Verse is returned immediately
- Migration to Redis happens in background (non-blocking)
- Next time, it will be found in Redis (faster)

## Performance Benefits

| Operation | Blob (Before) | Redis (After) | Improvement |
|-----------|--------------|---------------|-------------|
| Read 1 verse | ~100-500ms | ~1-5ms | **20-100x faster** |
| Write 1 verse | ~200-800ms | ~5-20ms | **10-40x faster** |
| Concurrent reads | Limited | Excellent | ✅ |
| Concurrent writes | Race conditions | Safe | ✅ |

## Troubleshooting

### Migration script fails

**Error: KV_REST_API_URL not set**
- Make sure KV store is created and linked to project
- Redeploy to get environment variables

**Error: BLOB_READ_WRITE_TOKEN not set**
- Blob store must still be configured during migration
- Check Vercel dashboard → Storage → Blob

### Verses not found after migration

1. Check Redis keys:
   ```bash
   # Keys should be prefixed with "bible:verse:"
   # Example: "bible:verse:John 3:16"
   ```

2. Verify migration completed:
   ```bash
   curl https://your-app.vercel.app/api/migration-status
   ```

3. Check logs for errors during migration

### Performance not improved

- Verify Redis is in same region as deployment
- Check that verses are actually in Redis (not falling back to Blob)
- Monitor logs for "Found verse in Redis" vs "Found verse in Blob"

## Rollback Plan

If you need to rollback:

1. The code still reads from Blob as fallback
2. All data remains in Blob during migration
3. Simply don't run the migration script
4. Or remove KV environment variables to disable Redis

## Next Steps

1. ✅ Create KV store in Vercel
2. ✅ Deploy updated code (dual-write enabled)
3. ✅ Run migration script
4. ✅ Monitor for a few days
5. ✅ Remove Blob writes (optional)

## Support

If you encounter issues:
- Check Vercel function logs
- Verify environment variables are set
- Check KV store in Vercel dashboard
- Review migration script output

