import axios from 'axios';

// Create a configured axios instance
const apiClient = axios.create({
  baseURL: '/api',
  // Use environment variable for timeout, default to 120s (120000ms)
  timeout: parseInt(import.meta.env.VITE_API_TIMEOUT_MS || '120000'), 
  headers: {
    'Content-Type': 'application/json'
  }
});

// Intercept responses to handle common errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error);
  }
);

// API functions
const api = {
  // App settings
  getAppSettings: () => Promise.resolve({
    default_gen_model: import.meta.env.DEFAULT_GEN_MODEL || "gemma3:latest",
    default_para_model: import.meta.env.DEFAULT_PARA_MODEL || "gemma3:latest",
    gen_model_context_size: parseInt(import.meta.env.GEN_MODEL_CONTEXT_SIZE || "8192"),
    para_model_context_size: parseInt(import.meta.env.PARA_MODEL_CONTEXT_SIZE || "4096"),
  }),
  
  // Models
  getModels: () => apiClient.get('/models')
    .then(response => response.data),
  
  // Templates
  getTemplates: () => apiClient.get('/templates')
    .then(response => response.data),
  
  createTemplate: (template) => apiClient.post('/templates', template)
    .then(response => response.data),
  
  updateTemplate: (id, template) => apiClient.put(`/templates/${id}`, template)
    .then(response => response.data),
  
  archiveTemplate: (id) => apiClient.put(`/templates/${id}/archive`)
    .then(response => response.data),
    
  // Generation
  generate: async (data, onData, signal) => { // Modify to accept signal
    // Debug log to verify data format
    console.log('Sending generation request:', JSON.stringify(data));
    
    // Use fetch API for streaming
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data),
      signal: signal // Pass the signal to fetch
    });

    if (!response.ok) {
      // Handle non-2xx responses including AbortError
      if (signal?.aborted) {
        console.log('Generation request aborted.');
        throw new DOMException('Aborted', 'AbortError'); 
      }
      const errorText = await response.text();
      console.error('Generation request failed:', response.status, errorText);
      throw new Error(`Generation failed: ${response.status} ${errorText || response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    // Process the stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      // Check if aborted before reading
      if (signal?.aborted) {
        console.log('Generation stream aborted during processing.');
        reader.cancel('Aborted by user'); // Cancel the reader
        throw new DOMException('Aborted', 'AbortError');
      }
      
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      
      // Check if aborted after reading
      if (signal?.aborted) {
        console.log('Generation stream aborted after read.');
        reader.cancel('Aborted by user');
        throw new DOMException('Aborted', 'AbortError');
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last partial line in the buffer

      for (const line of lines) {
        if (line.trim()) {
          try {
            const jsonData = JSON.parse(line);
            if (onData) {
              onData(jsonData); // Call the callback with the parsed JSON object
            }
          } catch (e) {
            console.error('Failed to parse JSON line:', line, e);
            if (onData) {
              onData({ error: `Failed to parse stream data: ${line}` });
            }
          }
        }
      }
    }
    // Process any remaining data in the buffer (though NDJSON usually ends with \n)
    if (buffer.trim()) {
      try {
        const jsonData = JSON.parse(buffer);
        if (onData) {
          onData(jsonData);
        }
      } catch (e) {
        console.error('Failed to parse final JSON buffer:', buffer, e);
        if (onData) {
          onData({ error: `Failed to parse final stream data: ${buffer}` });
        }
      }
    }
  },
  
  // Generate with simple endpoint for CustomTextInput
  generateSimple: async (prompt, name = "input", onData, signal, systemPrompt = null) => {
    console.log('Sending simple generation request:', { prompt, name, hasSystemPrompt: !!systemPrompt });
    
    const requestBody = {
      prompt,
      name
    };
    
    // Add system_prompt to request only if provided
    if (systemPrompt) {
      requestBody.system_prompt = systemPrompt;
    }
    
    // Use fetch API for streaming
    const response = await fetch('/api/generate/simple', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: signal // Pass the signal to fetch for cancellation
    });

    if (!response.ok) {
      // Handle non-2xx responses including AbortError
      if (signal?.aborted) {
        console.log('Simple generation request aborted.');
        throw new DOMException('Aborted', 'AbortError'); 
      }
      const errorText = await response.text();
      console.error('Simple generation request failed:', response.status, errorText);
      throw new Error(`Simple generation failed: ${response.status} ${errorText || response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    // Process the stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      // Check if aborted before reading
      if (signal?.aborted) {
        console.log('Simple generation stream aborted during processing.');
        reader.cancel('Aborted by user'); // Cancel the reader
        throw new DOMException('Aborted', 'AbortError');
      }
      
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      
      // Check if aborted after reading
      if (signal?.aborted) {
        console.log('Simple generation stream aborted after read.');
        reader.cancel('Aborted by user');
        throw new DOMException('Aborted', 'AbortError');
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last partial line in the buffer

      for (const line of lines) {
        if (line.trim()) {
          try {
            const jsonData = JSON.parse(line);
            if (onData) {
              onData(jsonData); // Call the callback with the parsed JSON object
            }
          } catch (e) {
            console.error('Failed to parse JSON line:', line, e);
            if (onData) {
              onData({ error: `Failed to parse stream data: ${line}` });
            }
          }
        }
      }
    }
    // Process any remaining data in the buffer (though NDJSON usually ends with \n)
    if (buffer.trim()) {
      try {
        const jsonData = JSON.parse(buffer);
        if (onData) {
          onData(jsonData);
        }
      } catch (e) {
        console.error('Failed to parse final JSON buffer:', buffer, e);
        if (onData) {
          onData({ error: `Failed to parse final stream data: ${buffer}` });
        }
      }
    }
  },
  
  paraphraseSeeds: (data) => apiClient.post('/paraphrase', data)
    .then(response => response.data),
    
  paraphraseText: (data) => apiClient.post('/paraphrase_text', data)
    .then(response => response.data),
  
  // Datasets
  getDatasets: (page = 1, size = 10, includeArchived = false) => apiClient.get('/datasets', {
    params: { page, size, include_archived: includeArchived } // Pass include_archived param
  }).then(response => response.data),
  
  getDatasetById: (datasetId) => apiClient.get(`/datasets/${datasetId}`)
    .then(response => response.data),
  
  createDataset: (name) => apiClient.post('/datasets', { name })
    .then(response => response.data),
  
  archiveDataset: (id) => apiClient.put(`/datasets/${id}/archive`)
    .then(response => response.data),
  
  // Examples
  getExamples: (datasetId, page = 1, size = 20, search = null, sortField = null, sortDirection = 'asc') => apiClient.get(`/datasets/${datasetId}/examples`, {
    params: { 
      page, 
      size, 
      ...(search ? { search } : {}),
      ...(sortField ? { 
        // Handle special case for slot sorting
        sort_by: sortField.startsWith('slot:') ? 'slot' : sortField,
        // If sorting by slot, include the slot name as an additional parameter
        ...(sortField.startsWith('slot:') ? { slot_name: sortField.split(':')[1] } : {}),
        sort_direction: sortDirection 
      } : {}) 
    }
  }).then(response => response.data),
  
  saveExamples: (datasetId, examples) => apiClient.post(`/datasets/${datasetId}/examples`, examples)
    .then(response => response.data),
    
  updateExample: (datasetId, exampleId, data) => apiClient.put(`/datasets/${datasetId}/examples/${exampleId}`, data)
    .then(response => response.data),
    
  deleteExamples: (datasetId, exampleIds) => apiClient.delete(`/datasets/${datasetId}/examples`, {
    data: { example_ids: exampleIds }
  }).then(response => response.data),
  
  // Export templates
  getExportTemplates: (page = 1, size = 10, formatName = null) => {
    const params = { page, size };
    if (formatName) params.format_name = formatName;
    
    return apiClient.get('/export_templates', { params })
      .then(response => response.data);
  },
  
  createExportTemplate: (template) => apiClient.post('/export_templates', template)
    .then(response => response.data),
    
  updateExportTemplate: (id, template) => apiClient.put(`/export_templates/${id}`, template)
    .then(response => response.data),
    
  archiveExportTemplate: (id) => apiClient.put(`/export_templates/${id}/archive`)
    .then(response => response.data),
  
  exportDataset: (datasetId, templateId = null) => {
    const params = templateId ? { template_id: templateId } : {};
    
    return apiClient.get(`/datasets/${datasetId}/export`, {
      responseType: 'blob',
      params
    }).then(response => response.data);
  },
  
  // Seed Banks
  getSeedBanks: (templateId = null) => {
    const params = templateId ? { template_id: templateId } : {};
    return apiClient.get('/seed_banks', { params })
      .then(response => response.data);
  },
  
  getSeedBankById: (seedBankId) => apiClient.get(`/seed_banks/${seedBankId}`)
    .then(response => response.data),
  
  createSeedBank: (seedBank) => apiClient.post('/seed_banks', seedBank)
    .then(response => response.data),
  
  updateSeedBank: (seedBankId, seedBank) => apiClient.put(`/seed_banks/${seedBankId}`, seedBank)
    .then(response => response.data),
  
  deleteSeedBank: (seedBankId) => apiClient.delete(`/seed_banks/${seedBankId}`)
    .then(response => response.data),
  
  // Workflow Management API endpoints
  getWorkflows: (page = 1, size = 50) => 
    apiClient
      .get("/workflows", { params: { page, size } })
      .then((response) => response.data)
      .catch((error) => {
        console.error(
          "API Error fetching workflows:",
          error.response?.data || error.message
        );
        throw error;
      }),

  getWorkflowById: (id) =>
    apiClient
      .get(`/workflows/${id}`)
      .then((response) => response.data)
      .catch((error) => {
        console.error(
          `API Error fetching workflow ${id}:`,
          error.response?.data || error.message
        );
        throw error;
      }),

  createWorkflow: (workflow) =>
    apiClient
      .post("/workflows", workflow)
      .then((response) => response.data)
      .catch((error) => {
        console.error(
          "API Error creating workflow:",
          error.response?.data || error.message
        );
        throw error;
      }),

  updateWorkflow: (id, workflow) =>
    apiClient
      .put(`/workflows/${id}`, workflow)
      .then((response) => response.data)
      .catch((error) => {
        // Log specific conflict errors, but primary handling is in the component
        if (error.response?.status === 409) {
          console.warn(
            `API Conflict updating workflow ${id}:`,
            error.response.data
          );
        } else {
          console.error(
            `API Error updating workflow ${id}:`,
            error.response?.data || error.message
          );
        }
        throw error;
      }),

  deleteWorkflow: (id) =>
    apiClient
      .delete(`/workflows/${id}`)
      .then((response) => response.data)
      .catch((error) => {
        console.error(
          `API Error deleting workflow ${id}:`,
          error.response?.data || error.message
        );
        throw error;
      }),

  duplicateWorkflow: (id) =>
    apiClient
      .post(`/workflows/${id}/duplicate`)
      .then((response) => response.data)
      .catch((error) => {
        console.error(
          `API Error duplicating workflow ${id}:`,
          error.response?.data || error.message
        );
        throw error;
      }),
  
  // Workflow Execution API endpoints
  executeWorkflow: (workflow, templateOutput, inputData = {}, debugMode = false) => {
    // Log what we're sending to help debugging
    console.log('Workflow execution input:', {
      templateOutputType: typeof templateOutput,
      isString: typeof templateOutput === 'string',
      hasOutput: typeof templateOutput === 'object' && templateOutput && 'output' in templateOutput
    });
    
    return apiClient.post('/workflow/execute', {
      workflow,
      template_output: templateOutput,
      input_data: inputData,
      debug_mode: debugMode
    }).then(response => response.data);
  },
  
  executeWorkflowStep: (nodeConfig, inputs) => apiClient.post('/workflow/execute_step', {
    node_config: nodeConfig,
    inputs
  }).then(response => response.data),
  
  // Streaming workflow execution
  executeWorkflowWithStream: async (workflow, templateOutput, inputData = {}, onData, signal, debugMode = false) => {
    // Normalize workflow structure to handle both direct and nested nodes/connections
    const nodes = workflow.data?.nodes || workflow.nodes;
    const connections = workflow.data?.connections || workflow.connections;

    console.log('Sending workflow execution request:', {
      workflow: workflow.id || 'unnamed-workflow',
      nodes: nodes ? Object.keys(nodes).length : 0,
      connections: connections ? (connections.length || 0) : 0,
    });

    // Create a properly structured workflow object for execution
    const normalizedWorkflow = {
      id: workflow.id,
      name: workflow.name,
      nodes: nodes || {},
      connections: connections || []
    };

    // Use fetch API for streaming
    const response = await fetch('/api/workflow/execute/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        workflow: normalizedWorkflow, // Send normalized workflow structure
        template_output: templateOutput,
        input_data: inputData,
        debug_mode: debugMode
      }),
      // Log key info about what we're sending
      ...(() => {
        console.log('Streaming workflow execution input:', {
          templateOutputType: typeof templateOutput,
          templateOutputLength: typeof templateOutput === 'string' ? templateOutput.length : 'not-string',
          inputDataKeys: Object.keys(inputData || {})
        });
        return {}; // Return empty object to spread (no effect)
      })(),
      signal: signal // Pass the signal to fetch
    });

    if (!response.ok) {
      // Handle non-2xx responses including AbortError
      if (signal?.aborted) {
        console.log('Workflow execution request aborted.');
        throw new DOMException('Aborted', 'AbortError'); 
      }
      const errorText = await response.text();
      console.error('Workflow execution request failed:', response.status, errorText);
      throw new Error(`Workflow execution failed: ${response.status} ${errorText || response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    // Process the stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult = null;

    try {
      while (true) {
        // Check if aborted before reading
        if (signal?.aborted) {
          console.log('Workflow execution stream aborted during processing.');
          reader.cancel('Aborted by user'); // Cancel the reader
          throw new DOMException('Aborted', 'AbortError');
        }
        
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        
        // Check if aborted after reading
        if (signal?.aborted) {
          console.log('Workflow execution stream aborted after read.');
          reader.cancel('Aborted by user');
          throw new DOMException('Aborted', 'AbortError');
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the last partial line in the buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const jsonData = JSON.parse(line);
              
              // Store final result if we get a complete message
              if (jsonData.type === 'complete') {
                finalResult = jsonData.result;
              }
              
              if (onData) {
                onData(jsonData); // Call the callback with the parsed JSON object
              }
            } catch (e) {
              console.error('Failed to parse JSON line:', line, e);
              if (onData) {
                onData({ type: 'error', error: `Failed to parse stream data: ${line}` });
              }
            }
          }
        }
      }
      
      // Process any remaining data in the buffer
      if (buffer.trim()) {
        try {
          const jsonData = JSON.parse(buffer);
          if (jsonData.type === 'complete') {
            finalResult = jsonData.result;
          }
          if (onData) {
            onData(jsonData);
          }
        } catch (e) {
          console.error('Failed to parse final JSON buffer:', buffer, e);
          if (onData) {
            onData({ type: 'error', error: `Failed to parse final stream data: ${buffer}` });
          }
        }
      }
      
      return finalResult;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Workflow execution fetch aborted successfully.');
        throw error; // Rethrow AbortError
      }
      console.error('Workflow execution stream failed:', error);
      throw new Error(`Workflow execution stream failed: ${error.message}`);
    }
  },
  
  // Filter API methods
  previewFilterRules: (text, rules, combinationMode = 'AND') => apiClient.post('/filter/preview', {
    text,
    rules,
    combination_mode: combinationMode
  }).then(response => response.data),
};

export default api;