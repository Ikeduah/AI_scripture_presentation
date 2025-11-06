# Vercel Blob Setup Guide

This guide will help you set up Vercel Blob for persistent storage of feedback data in your AI Scripture Presenter application.

## Prerequisites

- A Vercel account
- Your project deployed on Vercel (or linked to a Vercel project)

## Step-by-Step Setup

### Step 1: Create a Blob Store

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project (`ai_scripture_presenter`)
3. Navigate to the **Storage** tab (in the left sidebar)
4. Click **Create Database** or **Connect Database**
5. Select **Blob** from the list of storage options
6. Give your blob store a name (e.g., `ai-scripture-blob`)
7. Select a region (choose the one closest to your users for better performance)
8. Click **Create**

### Step 2: Link the Blob Store to Your Project

After creating the blob store, Vercel will automatically:
- Link it to your project
- Add the required environment variable (`BLOB_READ_WRITE_TOKEN`)
- Make this variable available to your serverless functions

**Note:** If you're using the free tier, you may need to manually link the store:
1. In your Blob store settings, click **Connect** or **Settings**
2. Select your project
3. The environment variable will be added automatically

### Step 3: Redeploy Your Application

After creating and linking the Blob store:

1. Go to your project's **Deployments** tab
2. Click the **⋯** (three dots) menu on your latest deployment
3. Select **Redeploy** (or push a new commit to trigger a redeploy)

The environment variable will be available in your next deployment.

### Step 4: Verify the Setup

1. Test your feedback endpoint by clicking "Correct" or "Wrong" on a verse
2. Check the response in the browser console - it should show `storage: "blob"` instead of `storage: "log-only"`
3. Check your Vercel function logs to confirm: `[feedback] Saved to Vercel Blob: ...`
4. Verify in your Vercel dashboard:
   - Go to **Storage** → Your Blob store
   - You should see a file named `feedback.json` with your feedback data

## Local Development Setup (Optional)

For local development, you can create a `.env.local` file with your Blob token:

1. Go to your Blob store in Vercel Dashboard
2. Click on **Settings** → **Environment Variables** or **Access**
3. Copy the `BLOB_READ_WRITE_TOKEN` value

4. Create a `.env.local` file in your project root:
   ```env
   BLOB_READ_WRITE_TOKEN=your_blob_token_here
   ```

5. Restart your development server:
   ```bash
   npm run dev
   ```

**Important:** Make sure `.env.local` is in your `.gitignore` file (it should be by default) to avoid committing sensitive tokens.

## Troubleshooting

### Issue: Still getting "log-only" storage

**Solution:**
- Make sure you've redeployed after creating the Blob store
- Check that `BLOB_READ_WRITE_TOKEN` is set in your Vercel project settings (Settings → Environment Variables)
- Verify the Blob store is linked to your project in the Storage tab

### Issue: Connection errors in production

**Solution:**
- Ensure your Blob store is in the same region as your Vercel deployment (recommended)
- Check that you're using the correct environment variable name
- Verify your Vercel plan includes Blob access (free tier has limits)

### Issue: Local development not working

**Solution:**
- Make sure `.env.local` exists and contains the correct `BLOB_READ_WRITE_TOKEN` value
- Restart your dev server after adding environment variables
- Check that `.env.local` is in your `.gitignore` (it should be by default)
- Verify the token has read/write permissions

### Issue: Blob file not updating

**Solution:**
- The `put` function with `addRandomSuffix: false` should overwrite the existing file
- Check Vercel function logs for any errors
- Verify the blob path is correct (`feedback.json`)

## Viewing Stored Feedback

You can view your stored feedback data:

1. **Via Vercel Dashboard:**
   - Go to **Storage** → Your Blob store
   - Click on `feedback.json` to view or download

2. **Via API (optional):**
   - You can create a read-only endpoint to retrieve feedback data
   - The blob URL will be returned when you upload, but it's not exposed in the current implementation

## Cost Information

- **Free tier:** 1 GB storage, 100 GB bandwidth/month
- **Pro tier:** Starts at $0.15/GB storage, $0.15/GB bandwidth
- Check [Vercel's pricing page](https://vercel.com/pricing) for current rates

## Security Notes

- The feedback file is stored as "public" access, but the blob URL is not exposed to clients
- The file is only accessible via the Vercel Blob API with proper authentication
- Consider adding authentication to any endpoints that retrieve feedback data
- For sensitive data, consider encryption before storing

## Next Steps

Once Blob is set up, your feedback data will be:
- ✅ Persisted across deployments
- ✅ Accessible from all serverless function instances
- ✅ Available for future analysis or export
- ✅ Stored as a single JSON file (`feedback.json`)

You can extend this by:
- Creating an admin endpoint to view/download feedback
- Adding pagination if feedback grows large
- Implementing data export functionality
- Adding data analysis/visualization

