# Workflow Management API Documentation

This document describes the REST API endpoints for managing workflows in DatasetForge.

## Base URL
All endpoints are relative to the API base URL: `http://localhost:8000`

## Authentication
All endpoints require HTTP Basic Authentication. Include the following header with all requests:
```
Authorization: Basic <base64-encoded-username:password>
```

## Data Models

### Workflow Object
```json
{
  "id": 123,                  // Integer, database ID
  "name": "Workflow Name",    // String, user-given name (unique per user)
  "description": "Optional description",  // String or null
  "data": {                   // JSON object with workflow definition
    "nodes": {                // Object mapping node IDs to node configurations
      "node1": {
        "id": "node1",
        "type": "input",      // Node type (input, output, model, transform, etc.)
        "name": "Input Node", // Display name for the node
        "position": { "x": 100, "y": 100 }  // Position in the workflow editor
        // Additional type-specific properties
      }
      // More nodes...
    },
    "connections": [          // Array of connections between nodes
      {
        "source_node_id": "node1",      // ID of the source node
        "target_node_id": "node2",      // ID of the target node
        "source_handle": "output",      // Optional, specific output port
        "target_handle": "input"        // Optional, specific input port
      }
      // More connections...
    ]
  },
  "owner_id": 1,                       // User ID who owns the workflow
  "created_at": "2024-04-21T15:30:00Z", // Creation timestamp (ISO format)
  "updated_at": "2024-04-21T15:30:00Z", // Last update timestamp (ISO format)
  "version": 1                          // Version number for optimistic concurrency
}
```

## Endpoints

### List Workflows

**GET /workflows**

Retrieves all workflows for the current user with pagination.

**Query Parameters:**
- `page` (optional, default: 1): Page number
- `size` (optional, default: 50, max: 100): Items per page

**Response:**
```json
{
  "items": [
    // Array of Workflow objects
  ],
  "total": 42  // Total number of workflows (for pagination)
}
```

**Status Codes:**
- 200: Success
- 401: Unauthorized (invalid or missing credentials)

### Get Single Workflow

**GET /workflows/{workflow_id}**

Retrieves a specific workflow by ID.

**Response:**
- Workflow object (as described above)

**Status Codes:**
- 200: Success
- 404: Workflow not found
- 401: Unauthorized
- 403: Forbidden (workflow belongs to another user)

### Create Workflow

**POST /workflows**

Creates a new workflow.

**Request Body:**
```json
{
  "name": "My New Workflow",
  "description": "Optional workflow description",
  "data": {
    "nodes": { /* node definitions */ },
    "connections": [ /* connection definitions */ ]
  }
}
```

**Response:**
- Created Workflow object with assigned ID, timestamps, and version=1

**Status Codes:**
- 201: Created successfully
- 409: Conflict (workflow with same name already exists)
- 400: Bad Request (invalid data format)
- 401: Unauthorized

### Update Workflow

**PUT /workflows/{workflow_id}**

Updates an existing workflow with optimistic concurrency control.

**Request Body:**
```json
{
  "name": "Updated Name",         // Optional
  "description": "Updated desc",  // Optional
  "data": { /* ... */ }           // Optional
}
```
Any fields not included in the request will remain unchanged.

**Response:**
- Updated Workflow object with incremented version number

**Status Codes:**
- 200: Updated successfully
- 404: Workflow not found
- 409: Conflict (version mismatch - workflow modified elsewhere)
- 400: Bad Request (invalid data format)
- 401: Unauthorized
- 403: Forbidden

### Delete Workflow

**DELETE /workflows/{workflow_id}**

Deletes a workflow.

**Response:**
- Empty response body

**Status Codes:**
- 204: Deleted successfully
- 404: Workflow not found
- 401: Unauthorized
- 403: Forbidden

### Duplicate Workflow

**POST /workflows/{workflow_id}/duplicate**

Creates a copy of an existing workflow.

**Response:**
- Newly created Workflow object (copy of the source)
- Header `Location: /workflows/{new_id}` with the path to the new workflow

**Status Codes:**
- 201: Created successfully
- 404: Source workflow not found
- 401: Unauthorized
- 403: Forbidden

## Error Handling

Errors are returned in the following format:
```json
{
  "detail": "Error message describing the problem"
}
```

## Notes

- The `version` field is used for optimistic concurrency control to prevent accidental overwrites when updating workflows
- Workflow names must be unique per user
- The API enforces a size limit on workflow data (10MB) to prevent excessive storage usage