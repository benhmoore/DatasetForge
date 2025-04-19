# ✅ Workflows Feature Implementation TODO

## Phase 1: Core Infrastructure
- [x] Define JSON schema for workflows
- [x] Create `WorkflowManager` UI component
  - [x] Implement toggle visibility
  - [x] Add import/export functionality
- [x] Add backend `WorkflowExecutor` for linear workflows
- [x] Modify `Generate` component to:
  - [x] Add toggle for workflow mode
  - [x] Pass results to workflow processor
  - [x] Render `WorkflowManager`

## Phase 2: Basic Nodes
- [ ] Create `ModelNode` component
  - [x] Implement backend `ModelNodeExecutor`
  - [ ] Add UI for configuring model, instruction, fields
- [ ] Create `TransformNode` component
  - [x] Implement backend `TransformNodeExecutor`
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
- [x] `POST /api/workflow/execute_step`
- [x] `POST /api/workflow/execute`
- [ ] Streaming response support with error fallback
- [x] Centralized `NodeExecutorFactory`

## Integration Tasks
- [x] Update `Generate` component
  - [x] Handle workflow errors gracefully
  - [x] Render results post-processing
- [x] Update `VariationCard` component
  - [x] Add visual indicators for processed steps
  - [x] Show processing history if available
- [x] Extend API client
  - [x] Add methods to call workflow endpoints
  - [ ] Support streaming and error reporting

## Technical Considerations
- [x] Use consistent data format across nodes
- [x] Preserve `original` vs `output` in node flow
- [x] Track processing history with timestamps and status
- [x] Support graceful error recovery and skip-on-error options
- [ ] Implement cancellation for long-running workflows
- [ ] Visual progress for each node during execution

## UX Considerations
- [x] Keep editor simple (linear-first, no clutter)
- [x] Show clear error messages and validation warnings
- [x] Allow user to view, edit, and rerun workflows easily
- [ ] Responsive and keyboard-navigable UI

## Done When
- [x] A complete linear workflow can be configured, run, and modified from UI
- [x] Backend handles multiple node types and errors gracefully
- [x] UI is clean, fast, and doesn't intrude on the base generation flow
- [x] Clear path exists to add more nodes and complexity later