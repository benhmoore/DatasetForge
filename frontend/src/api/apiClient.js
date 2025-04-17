import axios from 'axios';

// Create a configured axios instance
const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000, // 30 seconds
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
  generate: (data) => {
    // Debug log to verify data format
    console.log('Sending generation request:', JSON.stringify(data));
    
    return apiClient.post('/generate', data)
      .then(response => {
        console.log('Generation response received:', response.status);
        console.log('Generation response data:', JSON.stringify(response.data));
        
        // Check if there are tool calls in the response
        if (response.data && Array.isArray(response.data)) {
          response.data.forEach((item, index) => {
            if (item.tool_calls && Array.isArray(item.tool_calls)) {
              console.log(`Variation ${index} has ${item.tool_calls.length} tool calls:`, item.tool_calls);
            }
          });
        }
        
        return response.data;
      });
  },
  
  paraphrase: (data) => apiClient.post('/paraphrase', data)
    .then(response => response.data),
  
  // Datasets
  getDatasets: (page = 1, size = 10) => apiClient.get('/datasets', {
    params: { page, size }
  }).then(response => response.data),
  
  createDataset: (name) => apiClient.post('/datasets', { name })
    .then(response => response.data),
  
  archiveDataset: (id) => apiClient.put(`/datasets/${id}/archive`)
    .then(response => response.data),
  
  // Examples
  getExamples: (datasetId, page = 1, size = 20, search = null) => apiClient.get(`/datasets/${datasetId}/examples`, {
    params: { page, size, ...(search ? { search } : {}) }
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
  }
};

export default api;