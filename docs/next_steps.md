# 🚀 Next Steps – AI Scripture Presenter Training Data Integration

This document outlines the next development phase for integrating **real-time data collection** and **LLM training workflows** into the **AI Scripture Presenter** project.

---

## 🧩 1. Extend FastAPI Backend

Add a new endpoint:  
`POST /api/log_transcript`

This will capture the pastor’s spoken text and detected Scripture reference, then store the data as `.jsonl` logs for training.

📁 **Storage Location:**  
`backend/data/transcripts/`

**Example Payload**
```json
{
  "speaker": "Pastor Isaac",
  "recognized_text": "Let's open to John 3:16",
  "detected_reference": "John 3:16"
}
Example Response

json
Copy code
{
  "status": "ok",
  "logged_to": "backend/data/transcripts/transcript_2025-11-05.jsonl"
}
💻 2. Frontend Integration (Next.js + TypeScript)
Update your React component (client-side marked with "use client") to log every verse detection event.

Example Implementation

tsx
Copy code
const logTranscript = async (recognizedText: string, detectedReference: string) => {
  try {
    await fetch("http://localhost:8000/api/log_transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        speaker: "Pastor Isaac",
        recognized_text: recognizedText,
        detected_reference: detectedReference,
      }),
    });
  } catch (err) {
    console.error("❌ Failed to log transcript:", err);
  }
};
Call logTranscript() whenever a verse is recognized or displayed in real-time.

🧠 3. Generate Fine-Tuning Dataset
Add a Python script named prepare_training_data.py in backend/scripts/.

This script will:

Parse all transcript logs (.jsonl files)

Convert them into prompt → completion pairs ready for fine-tuning an LLM

Output Format Example

json
Copy code
{"prompt": "Let's open to John 3:16", "completion": "Reference: John 3:16"}
{"prompt": "He said in Psalms 23:1, The Lord is my shepherd", "completion": "Reference: Psalms 23:1"}
Run Command

bash
Copy code
python backend/scripts/prepare_training_data.py
✅ Output file:
backend/data/training/fine_tune_dataset_YYYYMMDD_HHMMSS.jsonl

🎯 4. Confidence Scoring (Optional)
Enhance your verse detection logic to include a confidence score (e.g., 0.94).
This enables filtering of low-quality samples before adding them to the training dataset, improving fine-tuning accuracy.

🗂️ 5. Recommended Folder Structure
kotlin
Copy code
backend/
├── data/
│   ├── bible.sqlite
│   ├── transcripts/
│   │   ├── transcript_2025-11-05.jsonl
│   └── training/
│       ├── fine_tune_dataset_20251105_120122.jsonl
├── scripts/
│   ├── build_bible_db.py
│   ├── prepare_training_data.py
├── server_llm.py
🧬 6. Fine-Tuning Workflow
Once you’ve gathered enough transcripts:

🧹 Run prepare_training_data.py to generate the training dataset.

☁️ Upload the generated .jsonl file to your LLM provider (e.g., OpenAI or Hugging Face).

🔧 Fine-tune the model with your dataset.

🔁 Replace the model endpoint in server_llm.py with your fine-tuned model ID.

🚀 Redeploy your backend — now using your own custom “Scripture Listener” model.

🌱 7. Outcome
By implementing this data-gathering + fine-tuning pipeline:

Every sermon or test session automatically enriches your training data.

The AI model continuously learns from real preaching styles.

Scripture recognition becomes faster, more accurate, and context-aware over time.

✅ Next Action Items
Step	Description
🧠	Implement /api/log_transcript endpoint in FastAPI
💻	Update frontend to send transcript logs
🗃️	Start collecting real sermon data
⚙️	Run prepare_training_data.py to create fine-tuning datasets
🚀	Begin fine-tuning pipeline setup with OpenAI or another provider

Author: Project Plan drafted by ChatGPT (GPT-5)
Contributor: Isaac Duah-Acheampong
Date: November 2025
