import type { NextApiRequest, NextApiResponse } from "next";
import { put, list } from "@vercel/blob";

const FEEDBACK_BLOB_PATH = "feedback.json";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Handle both nested (training) and flat formats
    const { transcript, output, score, correct, training } = req.body;
    
    // Extract from nested format if present
    const verseOutput = output || training?.output;
    const isCorrect = correct !== undefined ? correct : training?.correct;
    const verseScore = score !== undefined ? score : training?.score;

    // Validate required fields
    if (!transcript || !verseOutput || isCorrect === undefined) {
      return res.status(400).json({ 
        error: "Missing required fields: transcript, output (or training.output), and correct (or training.correct)" 
      });
    }

    const feedbackEntry = {
      id: Date.now(), // Use timestamp as ID for uniqueness
      timestamp: new Date().toISOString(),
      transcript,
      output: verseOutput,
      score: verseScore || null,
      correct: isCorrect,
    };

    // Try to use Vercel Blob if available
    try {
      // Check if Blob is configured by looking for environment variables
      const blobConfigured = process.env.BLOB_READ_WRITE_TOKEN;
      
      if (!blobConfigured) {
        throw new Error("Blob not configured - missing BLOB_READ_WRITE_TOKEN");
      }

      // Get existing feedback from Blob
      let existing: any[] = [];
      try {
        // Check if the blob exists
        const blobs = await list({ prefix: FEEDBACK_BLOB_PATH });
        const feedbackBlob = blobs.blobs.find(b => b.pathname === FEEDBACK_BLOB_PATH);
        
        if (feedbackBlob) {
          // Fetch the existing file
          const response = await fetch(feedbackBlob.url);
          if (response.ok) {
            const content = await response.text();
            if (content.trim()) {
              existing = JSON.parse(content);
            }
          }
        }
      } catch (blobError: any) {
        // If blob doesn't exist or can't be read, start with empty array
        const errorMsg = blobError?.message?.toLowerCase() || "";
        if (!errorMsg.includes("not found") && !errorMsg.includes("404")) {
          console.warn("[feedback] Error reading existing blob:", errorMsg);
        }
        existing = [];
      }

      // Ensure existing is an array
      if (!Array.isArray(existing)) {
        existing = [];
      }

      // Add new entry
      existing.push(feedbackEntry);

      // Convert to JSON string
      const jsonContent = JSON.stringify(existing, null, 2);
      
      // Create a Buffer from the JSON string (Node.js compatible)
      const buffer = Buffer.from(jsonContent, "utf-8");

      // Upload/update the feedback file in Blob storage
      await put(FEEDBACK_BLOB_PATH, buffer, {
        access: "public", // Public access (URLs are not exposed unless needed)
        contentType: "application/json",
        addRandomSuffix: false, // Overwrite existing file
      });

      console.log("[feedback] Saved to Vercel Blob:", feedbackEntry);
      return res.status(200).json({ ok: true, storage: "blob" });
    } catch (blobError: any) {
      // If Blob is not configured, log the feedback and return success
      // This prevents the endpoint from crashing in development or if Blob isn't set up
      const errorMsg = blobError?.message || "Unknown error";
      console.warn("[feedback] Vercel Blob not available, logging feedback only:", errorMsg);
      console.log("[feedback] Feedback entry (not persisted):", JSON.stringify(feedbackEntry, null, 2));
      
      // Check if this is a configuration issue
      const isConfigError = errorMsg.includes("not configured") || 
                           errorMsg.includes("environment variables") ||
                           errorMsg.includes("BLOB_READ_WRITE_TOKEN");
      
      return res.status(200).json({ 
        ok: true, 
        storage: "log-only",
        warning: isConfigError 
          ? "Vercel Blob not configured. See VERCEL_BLOB_SETUP.md for setup instructions."
          : `Feedback logged but not persisted: ${errorMsg}`
      });
    }
  } catch (err: any) {
    console.error("Feedback save error:", err);
    return res.status(500).json({ error: err.message });
  }
}
