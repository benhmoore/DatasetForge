"""
Simple script to verify the Workflow API implementation.
This doesn't run actual tests but inspects the code files.
"""
import os
import sys
import re

def check_file_content(file_path, patterns, all_required=True):
    """
    Check if a file contains all or any of the specified patterns.
    
    Args:
        file_path: Path to the file to check
        patterns: Dictionary of pattern descriptions and regex patterns
        all_required: If True, all patterns must match; if False, at least one must match
    
    Returns:
        A tuple of (success, missing_patterns)
    """
    if not os.path.exists(file_path):
        return False, [f"File not found: {file_path}"]
    
    try:
        with open(file_path, 'r') as f:
            content = f.read()
        
        missing = []
        for desc, pattern in patterns.items():
            if not re.search(pattern, content):
                missing.append(desc)
        
        if all_required and missing:
            return False, missing
        elif not all_required and len(missing) == len(patterns):
            return False, ["No matching patterns found"]
        
        return True, []
    
    except Exception as e:
        return False, [f"Error reading {file_path}: {str(e)}"]

def check_workflow_model():
    """Check if the Workflow model exists and has the required fields"""
    path = os.path.join("backend", "app", "api", "models.py")
    
    patterns = {
        "Workflow class definition": r"class\s+Workflow\s*\(\s*SQLModel\s*,\s*table=True\s*\)\s*:",
        "id field": r"id\s*:\s*Optional\s*\[\s*int\s*\]\s*=\s*Field\s*\(\s*default=None\s*,\s*primary_key=True\s*\)",
        "owner_id field": r"owner_id\s*:\s*int\s*=\s*Field\s*\(\s*.*foreign_key\s*=\s*\"user.id\"",
        "name field": r"name\s*:\s*str",
        "description field": r"description\s*:\s*Optional\s*\[\s*str\s*\]",
        "data field": r"data\s*:\s*Dict\s*\[\s*str\s*,\s*Any\s*\]\s*=\s*Field\s*\(\s*.*JSON",
        "created_at field": r"created_at\s*:\s*datetime",
        "updated_at field": r"updated_at\s*:\s*datetime",
        "version field": r"version\s*:\s*int",
        "unique constraint": r"UniqueConstraint\s*\(\s*[\"\']owner_id[\"\']",
    }
    
    success, missing = check_file_content(path, patterns)
    
    if not success:
        print(f"❌ Workflow model check failed. Missing: {', '.join(missing)}")
        return False
    
    print("✅ Workflow model exists with required fields")
    return True

def check_workflow_schemas():
    """Check if the workflow schemas exist"""
    path = os.path.join("backend", "app", "api", "schemas.py")
    
    patterns = {
        "MAX_WORKFLOW_SIZE_BYTES": r"MAX_WORKFLOW_SIZE_BYTES\s*=",
        "validate_data_size function": r"def\s+validate_data_size\s*\(",
        "WorkflowBase class": r"class\s+WorkflowBase\s*\(\s*BaseModel\s*\)\s*:",
        "WorkflowCreate class": r"class\s+WorkflowCreate\s*\(\s*WorkflowBase\s*\)\s*:",
        "WorkflowRead class": r"class\s+WorkflowRead\s*\(\s*WorkflowBase\s*\)\s*:",
        "WorkflowUpdate class": r"class\s+WorkflowUpdate\s*\(\s*BaseModel\s*\)\s*:",
        "WorkflowPagination class": r"class\s+WorkflowPagination\s*\(\s*BaseModel\s*\)\s*:"
    }
    
    success, missing = check_file_content(path, patterns)
    
    if not success:
        print(f"❌ Workflow schemas check failed. Missing: {', '.join(missing)}")
        return False
    
    print("✅ Workflow schemas exist")
    return True

def check_workflow_endpoints():
    """Check if the workflow API endpoints exist"""
    path = os.path.join("backend", "app", "api", "workflows.py")
    
    patterns = {
        "Router definition": r"router\s*=\s*APIRouter\s*\(\s*\)",
        "get_workflows endpoint": r"@router\.get\s*\(\s*[\"\']\/workflows[\"\'].*\)\s*async\s*def\s+get_workflows",
        "get_workflow endpoint": r"@router\.get\s*\(\s*[\"\']\/workflows\/\{\w+\}[\"\'].*\)\s*async\s*def\s+get_workflow",
        "create_workflow endpoint": r"@router\.post\s*\(\s*[\"\']\/workflows[\"\'].*\)\s*async\s*def\s+create_workflow",
        "update_workflow endpoint": r"@router\.put\s*\(\s*[\"\']\/workflows\/\{\w+\}[\"\'].*\)\s*async\s*def\s+update_workflow",
        "delete_workflow endpoint": r"@router\.delete\s*\(\s*[\"\']\/workflows\/\{\w+\}[\"\'].*\)\s*async\s*def\s+delete_workflow",
        "duplicate_workflow endpoint": r"@router\.post\s*\(\s*[\"\']\/workflows\/\{\w+\}\/duplicate[\"\'].*\)\s*async\s*def\s+duplicate_workflow"
    }
    
    success, missing = check_file_content(path, patterns)
    
    if not success:
        print(f"❌ Workflow endpoints check failed. Missing: {', '.join(missing)}")
        return False
    
    print("✅ Workflow endpoints exist")
    return True

def check_db_migration():
    """Check if database migration for workflow table exists"""
    path = os.path.join("backend", "app", "db_migration.py")
    
    patterns = {
        "Workflow table creation": r"CREATE\s+TABLE\s+workflow",
        "owner_id field": r"owner_id\s+INTEGER\s+NOT\s+NULL",
        "name field": r"name\s+TEXT\s+NOT\s+NULL",
        "description field": r"description\s+TEXT",
        "data field": r"data\s+TEXT\s+NOT\s+NULL",
        "created_at field": r"created_at\s+TIMESTAMP",
        "updated_at field": r"updated_at\s+TIMESTAMP",
        "version field": r"version\s+INTEGER",
        "UniqueIndex": r"CREATE\s+UNIQUE\s+INDEX\s+uq_owner_name"
    }
    
    success, missing = check_file_content(path, patterns)
    
    if not success:
        print(f"❌ Database migration check failed. Missing: {', '.join(missing)}")
        return False
    
    print("✅ Database migration for workflow table exists")
    return True

def main():
    """Run all checks"""
    print("Verifying Workflow API Implementation...")
    
    checks = [
        check_workflow_model(),
        check_workflow_schemas(),
        check_workflow_endpoints(),
        check_db_migration()
    ]
    
    print("\nSummary:")
    print(f"Total checks: {len(checks)}")
    print(f"Passed: {sum(checks)}")
    print(f"Failed: {len(checks) - sum(checks)}")
    
    if all(checks):
        print("\n✅ All checks passed! Workflow API implementation looks good.")
        return 0
    else:
        print("\n❌ Some checks failed. See details above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())