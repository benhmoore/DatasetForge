# DatasetForge Workflow Features

## Node Types

### Input Node
- Provides seed data to the workflow
- Automatically included at the start of the workflow
- Contains input slots from the seed bank

### Model Node
- Calls the Ollama API directly
- Configure model name, system instruction, and model parameters
- Creates generation output

### Template Node
- Uses existing templates from DatasetForge
- Templates already define models, system prompts, and parameters
- Full integration with template system

### Transform Node
- Apply text transformations (regex or direct replacement)
- Configure which field to transform
- Preserve original data while adding transformed output

### Output Node
- Final node in the workflow chain
- Designates which data is included in the final result
- Automatically included at the end of the workflow

## Workflow Editor Features

### Node Management
- Drag and drop nodes to reposition
- Delete nodes with Delete/Backspace key
- Select multiple nodes with box selection (shift+drag)
- Configure nodes with the properties panel

### Connection Management
- Create connections by dragging between node handles
- Delete connections by clicking on them
- Automatically validates valid connections

### Keyboard Shortcuts
- Delete/Backspace: Delete selected node(s) or edge
- Shift+Drag: Box selection for multiple nodes

### Workflow Operations
- Initialize new workflow with a standard template
- Export workflow as JSON
- Import workflow from JSON

## Project Structure

### Backend Components
- `workflow_executor.py`: Core execution engine for workflows
- `api/workflows.py`: API endpoints for workflow operations
- `api/schemas.py`: Data models for workflow nodes and structure

### Frontend Components
- `WorkflowEditor.jsx`: Visual workflow editor
- `WorkflowManager.jsx`: Workflow management controls
- Node components: ModelNode.jsx, TemplateNode.jsx, TransformNode.jsx
- Integration with ReactFlow for visual editing