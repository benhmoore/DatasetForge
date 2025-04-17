import sqlite3
import os
import json
import logging
from .core.config import settings

# Get logger from the core logging module
logger = logging.getLogger("datasetforge")


# Define default export templates that will be used in multiple places
def get_default_templates():
    """Return default export templates with their configurations"""
    # MLX Chat format template
    mlx_chat_template = {
        "name": "MLX Chat",
        "description": "Format for MLX Chat fine-tuning",
        "format_name": "mlx-chat",
        "template": """{"messages": [{"role": "system", "content": {{ system_prompt|tojson }}}, {% for key, value in slots.items() %}{"role": "user", "content": {{ value|tojson }}},{% endfor %}{"role": "assistant", "content": {{ output|tojson }}}]}""",
        "is_default": 1,
        "created_at": "datetime('now')",
        "archived": 0,
    }

    # MLX Instruct format template
    mlx_instruct_template = {
        "name": "MLX Instruct",
        "description": "Format for MLX Instruct fine-tuning",
        "format_name": "mlx-instruct",
        "template": """{"instruction": {{ system_prompt|tojson }}, "input": {% if slots.input %}{{ slots.input|tojson }}{% else %}""{% endif %}, "output": {{ output|tojson }}}""",
        "is_default": 1,
        "created_at": "datetime('now')",
        "archived": 0,
    }

    # Tool Calling format template
    tool_calling_template = {
        "name": "Tool Calling",
        "description": "Format for function/tool calling fine-tuning",
        "format_name": "tool-calling",
        "template": """{"messages": [{"role": "system", "content": {{ system_prompt|tojson }}}, {% for key, value in slots.items() %}{"role": "user", "content": {{ value|tojson }}},{% endfor %}{"role": "assistant", "content": {{ output|tojson }}, "tool_calls": {{ tool_calls|tojson if tool_calls else "[]" }}}]}""",
        "is_default": 1,
        "created_at": "datetime('now')",
        "archived": 0,
    }

    # Raw format template
    raw_template = {
        "name": "Raw Format",
        "description": "Default raw format with all fields",
        "format_name": "raw",
        "template": """{{ {"system_prompt": system_prompt, "slots": slots, "output": output, "tool_calls": tool_calls if tool_calls else None, "timestamp": timestamp}|tojson }}""",
        "is_default": 1,
        "created_at": "datetime('now')",
        "archived": 0,
    }

    # OpenAI ChatML format template
    openai_chatml_template = {
        "name": "OpenAI ChatML",
        "description": "Format for OpenAI chat fine-tuning (ChatGPT, GPT-4)",
        "format_name": "openai-chatml",
        "template": """{"messages": [{"role": "system", "content": {{ system_prompt|tojson }}}, {% for key, value in slots.items() %}{"role": "user", "content": {{ value|tojson }}},{% endfor %}{"role": "assistant", "content": {{ output|tojson }}}]}""",
        "is_default": 1,
        "created_at": "datetime('now')",
        "archived": 0,
    }

    # Llama format template
    llama_template = {
        "name": "Llama Format",
        "description": "Format for Llama, Mistral and similar models",
        "format_name": "llama",
        "template": """<s>[INST] {{ system_prompt }}\\n\\n{% for key, value in slots.items() %}{{ value }}{% endfor %} [/INST] {{ output }}</s>""",
        "is_default": 1,
        "created_at": "datetime('now')",
        "archived": 0,
    }

    return {
        "mlx_chat": mlx_chat_template,
        "mlx_instruct": mlx_instruct_template,
        "tool_calling": tool_calling_template,
        "raw": raw_template,
        "openai_chatml": openai_chatml_template,
        "llama": llama_template,
    }


def migrate_database():
    """
    Migrate the database to add tool calling support columns
    and create export_template table if needed
    """
    # Skip migration for in-memory database (used in tests)
    if settings.DB_PATH == ":memory:":
        logger.info(
            "In-memory database: skipping schema migrations but seeding defaults still"
        )
        # Do not return, ensure default export templates are seeded below

    # Ensure DB file exists for file-based DBs; skip check for in-memory
    if settings.DB_PATH != ":memory:" and not os.path.exists(settings.DB_PATH):
        logger.info(
            f"Database file {settings.DB_PATH} does not exist, no migration needed"
        )
        return

    logger.info(f"Starting database migration for {settings.DB_PATH}")

    conn = sqlite3.connect(settings.DB_PATH)
    cursor = conn.cursor()

    try:
        # Get default templates for use throughout the function
        templates = get_default_templates()

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
            cursor.execute(
                "ALTER TABLE template ADD COLUMN is_tool_calling_template INTEGER DEFAULT 0"
            )

        # Check if tool_calls column exists in Example table
        cursor.execute("PRAGMA table_info(example)")
        columns = cursor.fetchall()
        column_names = [col[1] for col in columns]

        # Add tool_calls column if it doesn't exist
        if "tool_calls" not in column_names:
            logger.info("Adding tool_calls column to Example table")
            cursor.execute("ALTER TABLE example ADD COLUMN tool_calls TEXT")

        # Check if export_template table exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='exporttemplate'"
        )
        if not cursor.fetchone():
            logger.info("Creating exporttemplate table")
            cursor.execute(
                """
            CREATE TABLE exporttemplate (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                format_name TEXT NOT NULL,
                template TEXT NOT NULL,
                is_default INTEGER NOT NULL DEFAULT 0,
                owner_id INTEGER,
                created_at TIMESTAMP NOT NULL,
                archived INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(owner_id) REFERENCES user(id)
            )
            """
            )

            # Create index on format_name for faster lookups
            cursor.execute(
                "CREATE INDEX idx_exporttemplate_format_name ON exporttemplate(format_name)"
            )

            # Add default export templates
            logger.info("Adding default export templates")

            # Insert default templates
            for template_key, template_data in templates.items():
                cursor.execute(
                    """
                INSERT INTO exporttemplate (name, description, format_name, template, is_default, created_at, archived)
                VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
                """,
                    (
                        template_data["name"],
                        template_data["description"],
                        template_data["format_name"],
                        template_data["template"],
                        template_data["is_default"],
                        template_data["archived"],
                    ),
                )

        # Initialize default values for existing tables
        cursor.execute(
            "UPDATE template SET tool_definitions = ? WHERE tool_definitions IS NULL",
            (json.dumps([]),),
        )
        cursor.execute(
            "UPDATE template SET is_tool_calling_template = 0 WHERE is_tool_calling_template IS NULL"
        )
        cursor.execute(
            "UPDATE example SET tool_calls = ? WHERE tool_calls IS NULL",
            (json.dumps([]),),
        )

        # Ensure default export templates exist even if table existed previously
        cursor.execute("SELECT COUNT(*) FROM exporttemplate")
        if cursor.fetchone()[0] == 0:
            logger.info("Adding default export templates for empty table")
            # Use templates from get_default_templates
            for template_key, template_data in templates.items():
                cursor.execute(
                    """
                INSERT INTO exporttemplate (name, description, format_name, template, is_default, created_at, archived)
                VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
                """,
                    (
                        template_data["name"],
                        template_data["description"],
                        template_data["format_name"],
                        template_data["template"],
                        template_data["is_default"],
                        template_data["archived"],
                    ),
                )

        # Idempotently ensure default export templates exist (owner_id NULL)
        default_specs = [
            {
                "name": "MLX Chat",
                "description": "Format for MLX Chat fine-tuning",
                "format_name": "mlx-chat",
                "template": templates["mlx_chat"]["template"],
                "is_default": 1,
                "archived": 0,
            },
            {
                "name": "MLX Instruct",
                "description": "Format for MLX Instruct fine-tuning",
                "format_name": "mlx-instruct",
                "template": templates["mlx_instruct"]["template"],
                "is_default": 1,
                "archived": 0,
            },
            {
                "name": "Tool Calling",
                "description": "Format for function/tool calling fine-tuning",
                "format_name": "tool-calling",
                "template": templates["tool_calling"]["template"],
                "is_default": 1,
                "archived": 0,
            },
            {
                "name": "Raw Format",
                "description": "Default raw format with all fields",
                "format_name": "raw",
                "template": templates["raw"]["template"],
                "is_default": 1,
                "archived": 0,
            },
            {
                "name": "OpenAI ChatML",
                "description": "Format for OpenAI chat fine-tuning (ChatGPT, GPT-4)",
                "format_name": "openai-chatml",
                "template": templates["openai_chatml"]["template"],
                "is_default": 1,
                "archived": 0,
            },
            {
                "name": "Llama Format",
                "description": "Format for Llama, Mistral and similar models",
                "format_name": "llama",
                "template": templates["llama"]["template"],
                "is_default": 1,
                "archived": 0,
            },
        ]
        for spec in default_specs:
            cursor.execute(
                "SELECT COUNT(*) FROM exporttemplate WHERE format_name=? AND owner_id IS NULL",
                (spec["format_name"],),
            )
            if cursor.fetchone()[0] == 0:
                cursor.execute(
                    "INSERT INTO exporttemplate (name, description, format_name, template, is_default, owner_id, created_at, archived) VALUES (?, ?, ?, ?, ?, NULL, datetime('now'), ?)",
                    (
                        spec["name"],
                        spec["description"],
                        spec["format_name"],
                        spec["template"],
                        spec["is_default"],
                        spec["archived"],
                    ),
                )
        conn.commit()
        logger.info("Database migration completed successfully")

    except Exception as e:
        conn.rollback()
        logger.error(f"Error during database migration: {e}")
        raise
    finally:
        conn.close()
