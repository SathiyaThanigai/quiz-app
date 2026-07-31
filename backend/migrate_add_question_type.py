"""
Migration script to add question_type column and widen correct_answer/selected_answer columns.

Since SQLite doesn't support ALTER COLUMN to change column width, we handle this via:
1. Adding the new question_type column (if it doesn't exist)
2. SQLite stores String columns as TEXT regardless of declared length, so widening
   correct_answer and selected_answer doesn't require schema changes for SQLite.

For PostgreSQL, you'd need ALTER COLUMN ... TYPE VARCHAR(500).

Run this script once: python migrate_add_question_type.py
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "quiz.db")


def migrate():
    if not os.path.exists(DB_PATH):
        print("No quiz.db found. Tables will be created fresh on next server start.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Check if question_type column already exists in questions table
    cursor.execute("PRAGMA table_info(questions)")
    columns = [col[1] for col in cursor.fetchall()]

    if "question_type" not in columns:
        print("Adding 'question_type' column to 'questions' table...")
        cursor.execute(
            "ALTER TABLE questions ADD COLUMN question_type VARCHAR(20) DEFAULT 'mcq' NOT NULL"
        )
        print("Done. All existing questions set to 'mcq' type.")
    else:
        print("'question_type' column already exists. Skipping.")

    conn.commit()
    conn.close()
    print("Migration complete!")


if __name__ == "__main__":
    migrate()
