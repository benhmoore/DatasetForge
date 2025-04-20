# DatasetForge Workflow Refactor

## Updated Workflow Architecture

### Key Changes

1. **Template-First Approach**: Workflows now process the *output* of templates rather than seed data directly.
2. **Removed Template Node**: The Template node has been removed as templates are now selected in the Generate interface.
3. **Refactored Input Node**: The Input node now receives template generation output instead of seed data.
4. **Simplified Flow**: All workflows now start with the template output and apply transformations to it.

### Node Types

#### Input Node
- New role: Receives template generation output
- Replaced "Seed Input" label with "Template Output"
- Acts as the entry point for the workflow

#### Model Node 
- Allows application of additional model transformations on template output
- Configure model name, system instruction, and model parameters
- Used for follow-up processing, not primary generation

#### Transform Node
- Apply text transformations (regex or direct replacement)
- Configure which field to transform
- Preserve original data while adding transformed output

#### Output Node
- Final node in the workflow chain
- Designates which data is included in the final result
- Output fed back to Generate component for display

### API Changes

1. **Workflow Execution Endpoint**:
   - Now accepts `template_output` parameter containing the template generation result
   - Supports optional `input_data` with additional context (slots, template info)

2. **Input Data Format**:
   - Template output is the primary input to the workflow
   - Additional context like original slots and template info provided as supplementary data

### Frontend Integration

1. **Generate Component Updates**:
   - Generates template output first
   - Passes template output to workflow for processing
   - Displays workflow-processed results

2. **WorkflowEditor Updates**:
   - Removed Template node type and configuration
   - Updated Input node to reflect new template output role
   - Simplified workflow configuration

## Usage Flow

1. User selects a template in the Generate interface
2. User enables workflow processing option
3. Upon generation:
   - Template generation runs first with selected template
   - Generated output is passed to the workflow for processing
   - Workflow applies transformations starting with the template output
   - Final workflow output is displayed in the Generate interface

## Implementation Benefits

1. **Clearer Responsibility**: Templates handle generation, workflows handle post-processing
2. **Simplified Architecture**: Removed redundant template selection in workflows
3. **More Intuitive Flow**: Natural progression from template output to post-processing
4. **Improved Flexibility**: Can apply multiple transformations to the same template output