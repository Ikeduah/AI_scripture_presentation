import sqlite3
import json
import os

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "../data")
DB_PATH = os.path.join(DATA_DIR, "bible.sqlite")
JSON_PATH = os.path.join(DATA_DIR, "bible.json")

def build_db(db_path=DB_PATH, json_path=JSON_PATH):
    # Ensure data directory exists
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    # Load Bible data from JSON
    with open(json_path, "r", encoding="utf-8") as f:
        bible_data = json.load(f)

    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    # Create table
    c.execute("""
        CREATE TABLE IF NOT EXISTS verses (
            id INTEGER PRIMARY KEY,
            book TEXT,
            chapter INTEGER,
            verse INTEGER,
            text TEXT
            translation TEXT
        )
    """)

    # Insert data
    for item in bible_data:
        c.execute(
            "INSERT INTO verses (book, chapter, verse, text, translation) VALUES (?, ?, ?, ?, ?)",
            (item["book"], item["chapter"], item["verse"], item["text"], item["translation"])
        )

    conn.commit()
    conn.close()
    print(f"✅ Bible DB built successfully at {db_path} ({len(bible_data)} verses)")

# ✅ This ensures the function runs when you execute the script directly
if __name__ == "__main__":
    build_db()
