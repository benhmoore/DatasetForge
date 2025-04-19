# ✅ Workflows Feature Implementation TODO

## Phase 1: Core Infrastructure
- [ ] Define JSON schema for workflows
- [ ] Create `WorkflowManager` UI component
  - [ ] Implement toggle visibility
  - [ ] Add import/export functionality
- [ ] Add backend `WorkflowExecutor` for linear workflows
- [ ] Modify `Generate` component to:
  - [ ] Add toggle for workflow mode
  - [ ] Pass results to workflow processor
  - [ ] Render `WorkflowManager`

## Phase 2: Basic Nodes
- [ ] Create `ModelNode` component
  - [ ] Implement backend `ModelNodeExecutor`
  - [ ] Add UI for configuring model, instruction, fields
- [ ] Create `TransformNode` component
  - [ ] Implement backend `TransformNodeExecutor`
  - [ ] Add regex config UI
- [ ] Add streaming progress indicators in `WorkflowRunner`
- [ ] Basic validation for node configuration

## Phase 3: Visual Editor
- [ ] Implement `WorkflowEditor` using `react-flow-renderer`
  - [ ] Add support for node dragging and positioning
  - [ ] Enable connections between nodes
- [ ] Add configuration panels per node type
- [ ] Validate workflow structure in editor
- [ ] Store node positions and edge connections in workflow JSON

## Phase 4: Advanced Features
- [ ] Add new node types
  - [ ] Filter nodes
  - [ ] Fork/merge logic
- [ ] Implement `CustomFunctionNode` executor
- [ ] Create workflow templates/presets
- [ ] Add workflow sharing (JSON copy/share UI)

## Backend API
- [ ] `POST /api/workflow/execute_step`
- [ ] `POST /api/workflow/execute`
- [ ] Streaming response support with error fallback
- [ ] Centralized `NodeExecutorFactory`

## Integration Tasks
- [ ] Update `Generate` component
  - [ ] Handle workflow errors gracefully
  - [ ] Render results post-processing
- [ ] Update `VariationCard` component
  - [ ] Add visual indicators for processed steps
  - [ ] Show processing history if available
- [ ] Extend API client
  - [ ] Add methods to call workflow endpoints
  - [ ] Support streaming and error reporting

## Technical Considerations
- [ ] Use consistent data format across nodes
- [ ] Preserve `original` vs `output` in node flow
- [ ] Track processing history with timestamps and status
- [ ] Support graceful error recovery and skip-on-error options
- [ ] Implement cancellation for long-running workflows
- [ ] Visual progress for each node during execution

## UX Considerations
- [ ] Keep editor simple (linear-first, no clutter)
- [ ] Show clear error messages and validation warnings
- [ ] Allow user to view, edit, and rerun workflows easily
- [ ] Responsive and keyboard-navigable UI

## Done When
- [ ] A complete linear workflow can be configured, run, and modified from UI
- [ ] Backend handles multiple node types and errors gracefully
- [ ] UI is clean, fast, and doesn’t intrude on the base generation flow
- [ ] Clear path exists to add more nodes and complexity later
