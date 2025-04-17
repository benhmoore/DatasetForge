import sqlite3
import os
import json
import logging
from .core.config import settings

# Get logger from the core logging module
logger = logging.getLogger("datasetforge")

def migrate_database():
    """
    Migrate the database to add tool calling support columns
    """
    # Skip migration for in-memory database (used in tests)
    if settings.DB_PATH == ":memory:":
        logger.info("Skipping migration for in-memory database")
        return
    
    # Ensure DB file exists
    if not os.path.exists(settings.DB_PATH):
        logger.info(f"Database file {settings.DB_PATH} does not exist, no migration needed")
        return
    
    logger.info(f"Starting database migration for {settings.DB_PATH}")
    
    conn = sqlite3.connect(settings.DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if tool_definitions column exists in Template table
        cursor.execute("PRAGMA table_info(template)")
        columns = cursor.fetchall()
        column_names = [col[1] for col in columns]
        
        # Add tool_definitions and is_tool_calling_template columns if they don't exist
        if "tool_definitions" not in column_names:
            logger.info("Adding tool_definitions column to Template table")
            cursor.execute("ALTER TABLE template ADD COLUMN tool_definitions TEXT")
            
        if "is_tool_calling_template" not in column_names:
            logger.info("Adding is_tool_calling_template column to Template table")
            cursor.execute("ALTER TABLE template ADD COLUMN is_tool_calling_template INTEGER DEFAULT 0")
        
        # Check if tool_calls column exists in Example table
        cursor.execute("PRAGMA table_info(example)")
        columns = cursor.fetchall()
        column_names = [col[1] for col in columns]
        
        # Add tool_calls column if it doesn't exist
        if "tool_calls" not in column_names:
            logger.info("Adding tool_calls column to Example table")
            cursor.execute("ALTER TABLE example ADD COLUMN tool_calls TEXT")
        
        # Initialize default values
        cursor.execute("UPDATE template SET tool_definitions = ? WHERE tool_definitions IS NULL", (json.dumps([]),))
        cursor.execute("UPDATE template SET is_tool_calling_template = 0 WHERE is_tool_calling_template IS NULL")
        cursor.execute("UPDATE example SET tool_calls = ? WHERE tool_calls IS NULL", (json.dumps([]),))
        
        conn.commit()
        logger.info("Database migration completed successfully")
        
    except Exception as e:
        conn.rollback()
        logger.error(f"Error during database migration: {e}")
        raise
    finally:
        conn.close()