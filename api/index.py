# backend/server_llm.py
from fastapi import FastAPI, Request
from pydantic import BaseModel
import sqlite3
from datetime import datetime
import os
import openai  # if using OpenAI API

# Initialize FastAPI
app = FastAPI(title="Bible Citation LLM API")

# Paths
DB_PATH = os.path.join(os.path.dirname(__file__), "data", "bible.sqlite")

# Pydantic model for input
class TranscriptRequest(BaseModel):
    transcript: str

# Helper: query SQLite DB for exact verse match
def query_bible_db(transcript: str):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # simple LIKE search; can later replace with embedding/vector search
    c.execute(
        "SELECT book, chapter, verse, text FROM verses WHERE text LIKE ? LIMIT 1",
        (f"%{transcript.strip()}%",)
    )
    row = c.fetchone()
    conn.close()
    if row:
        return {"book": row[0], "chapter": row[1], "verse": row[2], "text": row[3]}
    return None

# Helper: use LLM to infer verse from paraphrased or partial quote
def infer_with_llm(transcript: str):
    prompt = f"""
    Given the following transcript from a sermon: "{transcript}", 
    identify the exact Bible verse (book, chapter, verse) and return it in JSON format:
    {{
        "book": "...",
        "chapter": ...,
        "verse": ...,
        "text": "..."
    }}
    If it is not a Bible quote, return null.
    """
    # Call OpenAI GPT (adjust model as needed)
    response = openai.ChatCompletion.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0
    )
    text = response.choices[0].message["content"]
    try:
        import json
        return json.loads(text)
    except Exception:
        return None

# API endpoint
@app.post("/api")
async def api(transcript_req: TranscriptRequest):
    print("Received transcript:", transcript_req.transcript)
    transcript = transcript_req.transcript.strip()
    timestamp = datetime.utcnow().isoformat()

    # 1️⃣ First try exact DB match
    #verse = query_bible_db(transcript)
    
    # 2️⃣ Fallback: LLM
    #if not verse:
    verse = infer_with_llm(transcript)

    # 3️⃣ If still None, return placeholder
    if not verse:
        verse = {
            "book": "Unknown",
            "chapter": 0,
            "verse": 0,
            "text": "Verse not found.",
        }

    # 4️⃣ Include timestamp for frontend display
    verse["source"] = timestamp
    print("Returning verse:", verse)
    return verse

# Optional: run standalone for dev
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
