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

// Intercept requests to add auth headers
apiClient.interceptors.request.use(
  (config) => {
    const auth = sessionStorage.getItem('auth');
    
    if (auth) {
      config.headers.Authorization = `Basic ${auth}`;
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

// Intercept responses to handle common errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle session expiry (401 errors)
    if (error.response && error.response.status === 401) {
      // Clear auth and redirect to login if not already there
      if (window.location.pathname !== '/login') {
        sessionStorage.removeItem('auth');
        sessionStorage.removeItem('loginAt');
        window.location.href = '/login';
      }
    }
    
    return Promise.reject(error);
  }
);

// API functions
const api = {
  // Auth
  login: (username, password) => {
    const auth = btoa(`${username}:${password}`);
    return apiClient.post('/login', {}, {
      headers: { Authorization: `Basic ${auth}` }
    })
    .then(() => {
      // Store auth and login time
      sessionStorage.setItem('auth', auth);
      sessionStorage.setItem('loginAt', Date.now().toString());
      return true;
    });
  },
  
  logout: () => apiClient.post('/logout')
    .then(() => {
      sessionStorage.removeItem('auth');
      sessionStorage.removeItem('loginAt');
    }),
  
  // User preferences
  getUserPreferences: () => apiClient.get('/user/preferences')
    .then(response => response.data),
  
  updateUserPreferences: (preferences) => apiClient.put('/user/preferences', preferences)
    .then(response => response.data),
  
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
  
  getTemplateHistory: (id) => apiClient.get(`/templates/${id}/history`)
    .then(response => response.data),
  
  // Generation
  generate: async (data, onData, signal) => { // Modify to accept signal
    // Debug log to verify data format
    console.log('Sending generation request:', JSON.stringify(data));
    
    // Use fetch API for streaming
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${sessionStorage.getItem('auth')}`,
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
    .then(response => response.data)
};

export default api;