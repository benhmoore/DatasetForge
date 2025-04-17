import pytest
import os
import sqlite3
import tempfile
from pathlib import Path

from app.core.config import settings
from app.db import create_db_and_tables
from app.db_migration import migrate_database


def test_migration_adds_new_columns():
    """Test that the migration script adds new columns to existing tables"""
    # Create a temporary database file
    temp_db = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
    temp_db.close()
    
    # Override the DB_PATH setting for this test
    original_db_path = settings.DB_PATH
    settings.DB_PATH = temp_db.name
    
    try:
        # Create a database with the old schema
        conn = sqlite3.connect(temp_db.name)
        cursor = conn.cursor()
        
        # Create tables with the old schema (without the new columns)
        cursor.execute("""
        CREATE TABLE template (
            id INTEGER PRIMARY KEY,
            name TEXT, 
            system_prompt TEXT,
            user_prompt TEXT,
            slots TEXT,
            archived INTEGER
        )
        """)
        
        cursor.execute("""
        CREATE TABLE example (
            id INTEGER PRIMARY KEY,
            dataset_id INTEGER,
            system_prompt TEXT,
            slots TEXT,
            output TEXT,
            timestamp TIMESTAMP
        )
        """)
        
        # Insert test data
        cursor.execute(
            "INSERT INTO template (name, system_prompt, user_prompt, slots, archived) VALUES (?, ?, ?, ?, ?)",
            ("Test Template", "You are a helpful assistant", "Help me with {task}", '["task"]', 0)
        )
        
        cursor.execute(
            "INSERT INTO example (dataset_id, system_prompt, slots, output, timestamp) VALUES (?, ?, ?, ?, ?)",
            (1, "You are a helpful assistant", '{"task":"coding"}', "I'll help you with coding", "2023-01-01 00:00:00")
        )
        
        conn.commit()
        conn.close()
        
        # Run the migration
        migrate_database()
        
        # Verify the columns were added
        conn = sqlite3.connect(temp_db.name)
        cursor = conn.cursor()
        
        # Check template table columns
        cursor.execute("PRAGMA table_info(template)")
        columns = cursor.fetchall()
        column_names = [col[1] for col in columns]
        
        assert "tool_definitions" in column_names
        assert "is_tool_calling_template" in column_names
        
        # Check example table columns
        cursor.execute("PRAGMA table_info(example)")
        columns = cursor.fetchall()
        column_names = [col[1] for col in columns]
        
        assert "tool_calls" in column_names
        
        # Check default values
        cursor.execute("SELECT name, tool_definitions, is_tool_calling_template FROM template")
        template = cursor.fetchone()
        assert template[0] == "Test Template"
        assert template[1] == "[]"
        assert template[2] == 0
        
        cursor.execute("SELECT system_prompt, tool_calls FROM example")
        example = cursor.fetchone()
        assert example[0] == "You are a helpful assistant"
        assert example[1] == "[]"
        
        conn.close()
        
    finally:
        # Restore the original DB_PATH setting
        settings.DB_PATH = original_db_path
        
        # Clean up the temporary database file
        try:
            os.unlink(temp_db.name)
        except:
            pass