import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { getCachedVerse, cacheVerse, getCacheKey } from "../../lib/cache";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Try to extract verse reference from transcript using simple pattern matching
 * Returns { book, chapter, verse } if found, null otherwise
 */
function tryExtractVerseReference(transcript: string): { book: string; chapter: number; verse: number } | null {
  // Common patterns: "Book Chapter:Verse", "Book Chapter Verse", "Book Chapter:Verse-Verse"
  const patterns = [
    // Matches: "Genesis 1:1", "John 3:16", "1 Corinthians 13:4"
    /([1-3]?\s*[A-Za-z]+)\s+(\d+):(\d+)/i,
    // Matches: "Genesis 1 1", "John 3 16"
    /([1-3]?\s*[A-Za-z]+)\s+(\d+)\s+(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = transcript.match(pattern);
    if (match) {
      const book = match[1].trim();
      const chapter = parseInt(match[2], 10);
      const verse = parseInt(match[3], 10);
      if (book && chapter && verse) {
        return { book, chapter, verse };
      }
    }
  }

  return null;
}

/**
 * Parse LLM response to extract verse data
 */
function parseLLMResponse(response: string): any {
  try {
    // Remove markdown code blocks if present
    let cleaned = response
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/g, "")
      .trim();

    // Handle null response
    if (cleaned.toLowerCase() === "null" || cleaned === "{}") {
      return null;
    }

    // Try to extract JSON from text that might contain extra words
    // Look for JSON object pattern: { ... }
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }

    // Try parsing
    const parsed = JSON.parse(cleaned);
    return parsed;
  } catch (error) {
    console.error("[API] Error parsing LLM response:", error);
    console.error("[API] Response was:", response.substring(0, 200));
    
    // Try to extract JSON object even if wrapped in text
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (secondTry) {
      // Ignore
    }
    
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { transcript } = req.body;
    if (!transcript) throw new Error("No transcript provided");

    console.log("[API] Processing transcript:", transcript);

    // Step 1: Try to extract verse reference from transcript and check cache
    const verseRef = tryExtractVerseReference(transcript);
    
    if (verseRef) {
      console.log("[API] Extracted verse reference:", verseRef);
      console.log("[API] Checking cache for:", getCacheKey(verseRef.book, verseRef.chapter, verseRef.verse));
      // Check cache first
      const cachedVerse = await getCachedVerse(verseRef.book, verseRef.chapter, verseRef.verse);
      if (cachedVerse) {
        console.log("[API] ✅ Found in cache, returning cached verse");
        return res.status(200).send(JSON.stringify(cachedVerse));
      }
      console.log("[API] ❌ Not in cache, will call LLM");
    } else {
      console.log("[API] Could not extract verse reference from transcript, will call LLM");
    }

    // Step 2: If not in cache, call LLM
    console.log("[API] Calling LLM to extract verse...");
    const prompt = `Extract Bible verse from: "${transcript}". Return ONLY JSON: {"book":"...","chapter":...,"verse":...,"text":"...","translation":"..."} or null if not a Bible quote.`;

    const response = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{"role": "user", "content": prompt}],
      temperature: 0,
    });

    const output = response.choices[0].message.content?.trim() || "Unknown";
    const verseData = parseLLMResponse(output);

    if (!verseData || verseData.book === "Unknown") {
      console.log("[API] LLM did not extract valid verse, returning null JSON");
      // Always return valid JSON, even when no verse is found
      return res.status(200).send(JSON.stringify(null));
    }

    // Step 3: Check cache again with the actual verse reference from LLM
    const cacheKey = getCacheKey(verseData.book, verseData.chapter, verseData.verse);
    console.log("[API] Checking cache again with LLM result:", cacheKey);
    const cachedVerse = await getCachedVerse(verseData.book, verseData.chapter, verseData.verse);
    
    if (cachedVerse) {
      console.log("[API] ✅ Found in cache after LLM, returning cached verse");
      return res.status(200).send(JSON.stringify(cachedVerse));
    }

    // Step 4: Save to cache and return
    console.log("[API] 💾 Caching new verse:", cacheKey);
    await cacheVerse(verseData);
    return res.status(200).send(JSON.stringify(verseData));
  } catch (err: any) {
    console.error("API error:", err);
    return res.status(500).json({ error: err.message });
  }
}
