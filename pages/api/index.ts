import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

    // LLM call
    const prompt = `
    You are a Bible assistant. Extract the exact verse being referenced from the following transcript: "${transcript}".
    Reply with exact Bible verse (book, chapter, verse) and return it in JSON format:
    {{
        "book": "...",
        "chapter": ...,
        "verse": ...,
        "text": "...",
        "translation": "..."
    }}
    If it is not a Bible quote, return null.`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{"role": "user", "content": prompt}],
    });

    const output = response.choices[0].message.content?.trim() || "Unknown";
    return res.status(200).send(output);
  } catch (err: any) {
    console.error("API error:", err);
    return res.status(500).json({ error: err.message });
  }
}
