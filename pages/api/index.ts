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

    return JSON.parse(cleaned);
  } catch (error) {
    console.error("[API] Error parsing LLM response:", error);
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

    // Step 1: Try to extract verse reference from transcript
    const verseRef = tryExtractVerseReference(transcript);
    
    if (verseRef) {
      console.log("[API] Extracted verse reference:", verseRef);
      // Check cache first
      const cachedVerse = await getCachedVerse(verseRef.book, verseRef.chapter, verseRef.verse);
      if (cachedVerse) {
        console.log("[API] Found in cache:", getCacheKey(verseRef.book, verseRef.chapter, verseRef.verse));
        return res.status(200).send(JSON.stringify(cachedVerse));
      }
    }

    // Step 2: If not in cache, call LLM
    console.log("[API] Verse not in cache, calling LLM...");
    const prompt = `
    You are a Bible assistant. Extract the exact verse being referenced from the following transcript: "${transcript}".
    Reply with exact Bible verse (book, chapter, verse) and return it in JSON format:
    {
        "book": "...",
        "chapter": ...,
        "verse": ...,
        "text": "...",
        "translation": "..."
    }
    If it is not a Bible quote, return null.`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{"role": "user", "content": prompt}],
    });

    const output = response.choices[0].message.content?.trim() || "Unknown";
    const verseData = parseLLMResponse(output);

    if (!verseData || verseData.book === "Unknown") {
      console.log("[API] LLM did not extract valid verse");
      // Return the raw output as-is for backward compatibility
      return res.status(200).send(output);
    }

    // Step 3: Check cache again with the actual verse reference from LLM
    const cacheKey = getCacheKey(verseData.book, verseData.chapter, verseData.verse);
    const cachedVerse = await getCachedVerse(verseData.book, verseData.chapter, verseData.verse);
    
    if (cachedVerse) {
      console.log("[API] Found in cache after LLM:", cacheKey);
      return res.status(200).send(JSON.stringify(cachedVerse));
    }

    // Step 4: Save to cache and return
    console.log("[API] Caching new verse:", cacheKey);
    await cacheVerse(verseData);
    return res.status(200).send(JSON.stringify(verseData));
  } catch (err: any) {
    console.error("API error:", err);
    return res.status(500).json({ error: err.message });
  }
}
