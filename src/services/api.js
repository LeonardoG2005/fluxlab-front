/**
 * API Service
 * 
 * Centralized service for all API calls to the NestJS backend.
 * Uses JWT tokens from Supabase for authentication.
 * NO MOCKS - Ready for real backend integration.
 */

import { authService } from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const CLIENTS_API_URL = import.meta.env.VITE_CLIENTS_API_URL || 'http://localhost:3000/api/clients';

function buildApiUrl(baseUrl, endpoint = '') {
  if (!endpoint) return baseUrl;

  if (endpoint.startsWith('?')) {
    return `${baseUrl}${endpoint}`;
  }

  const normalizedBase = baseUrl.replace(/\/$/, '');
  const normalizedEndpoint = endpoint.replace(/^\//, '');
  return `${normalizedBase}/${normalizedEndpoint}`;
}

async function parseResponseBody(response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  const responseText = await response.text();

  if (!responseText) {
    return null;
  }

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(responseText);
    } catch {
      return null;
    }
  }

  return responseText;
}

/**
 * Make authenticated API requests with JWT token
 */
async function apiRequest(endpoint, options = {}, baseUrl = API_URL) {
  try {
    // Get JWT token from Supabase
    const token = await authService.getAccessToken();
    
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    // Add JWT to Authorization header
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(buildApiUrl(baseUrl, endpoint), {
      ...options,
      headers
    });

    const responseBody = await parseResponseBody(response);

    if (!response.ok) {
      const message =
        responseBody?.message ||
        responseBody?.error ||
        `API Error: ${response.status} ${response.statusText}`;

      throw new Error(message);
    }

    return responseBody;
  } catch (error) {
    console.error('API Request failed:', error);
    throw error;
  }
}

// ============================================================================
// API SERVICE - READY FOR BACKEND INTEGRATION
// ============================================================================

export const apiService = {
  /**
   * USER ENDPOINTS
   * GET /api/auth/profile
   * PATCH /api/auth/profile
   */
  user: {
    async getProfile() {
      return apiRequest('/auth/profile');
    },

    async updateProfile(profileData) {
      return apiRequest('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(profileData)
      });
    }
  },

  /**
   * DASHBOARD ENDPOINTS
   * GET /api/dashboard/summary
   * GET /api/dashboard/workflow-status
   */
  dashboard: {
    async getSummary() {
      return apiRequest('/dashboard/summary');
    },

    async getWorkflowStatus() {
      return apiRequest('/dashboard/workflow-status');
    }
  },

  /**
   * CLIENTS ENDPOINTS
   * GET /api/clients
   * GET /api/clients/:id
   * POST /api/clients
   */
  clients: {
    async getAll(params = {}) {
      const searchParams = new URLSearchParams();

      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.append(key, String(value));
        }
      });

      const query = searchParams.toString();
      const endpoint = query ? `?${query}` : '';

      return apiRequest(endpoint, {}, CLIENTS_API_URL);
    },

    async searchByName(name) {
      const searchParams = new URLSearchParams();

      if (name && String(name).trim()) {
        searchParams.append('name', String(name).trim());
      }

      const query = searchParams.toString();
      const endpoint = query ? `/search?${query}` : '/search';

      return apiRequest(endpoint, {}, CLIENTS_API_URL);
    },

    async filterByClient(clientId, projectStatus) {
      const searchParams = new URLSearchParams();

      if (projectStatus && String(projectStatus).trim()) {
        searchParams.append('projectStatus', String(projectStatus).trim());
      }

      const query = searchParams.toString();
      const endpoint = query
        ? `/${clientId}/filter?${query}`
        : `/${clientId}/filter`;

      return apiRequest(endpoint, {}, CLIENTS_API_URL);
    },

    async getById(id) {
      return apiRequest(`/${id}`, {}, CLIENTS_API_URL);
    },

    async create(clientData) {
      return apiRequest('', {
        method: 'POST',
        body: JSON.stringify(clientData)
      }, CLIENTS_API_URL);
    },

    async update(id, clientData) {
      return apiRequest(`/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(clientData)
      }, CLIENTS_API_URL);
    },

    async remove(id, confirm = true) {
      const endpoint = `/${id}?confirm=${confirm ? 'true' : 'false'}`;

      return apiRequest(endpoint, {
        method: 'DELETE'
      }, CLIENTS_API_URL);
    }
  },

  /**
   * PROJECTS ENDPOINTS
   * GET /api/projects
   * GET /api/projects/:id
   * POST /api/projects
   */
  projects: {
    async getAll(params = {}) {
      const searchParams = new URLSearchParams();

      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.append(key, String(value));
        }
      });

      const query = searchParams.toString();
      const endpoint = query ? `/projects?${query}` : '/projects';

      return apiRequest(endpoint);
    },

    async getById(id) {
      return apiRequest(`/projects/${id}`);
    },

    async create(projectData) {
      return apiRequest('/projects', {
        method: 'POST',
        body: JSON.stringify(projectData)
      });
    },

    async update(id, projectData) {
      return apiRequest(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(projectData)
      });
    },

    async remove(id) {
      return apiRequest(`/projects/${id}`, {
        method: 'DELETE'
      });
    },

    async associateClient(clientId, projectIds = []) {
      return apiRequest('/projects/associate-client', {
        method: 'POST',
        body: JSON.stringify({ clientId, projectIds })
      });
    },

    async searchByName(name, clientId) {
      const searchParams = new URLSearchParams();

      if (name && String(name).trim()) {
        searchParams.append('name', String(name).trim());
      }

      if (clientId && String(clientId).trim()) {
        searchParams.append('clientId', String(clientId).trim());
      }

      const query = searchParams.toString();
      const endpoint = query ? `/projects/search?${query}` : '/projects/search';

      return apiRequest(endpoint);
    },

    async filterByStatus(status, clientId) {
      const searchParams = new URLSearchParams();

      if (status && String(status).trim()) {
        searchParams.append('value', String(status).trim());
      }

      if (clientId && String(clientId).trim()) {
        searchParams.append('clientId', String(clientId).trim());
      }

      const query = searchParams.toString();
      const endpoint = query ? `/projects/status?${query}` : '/projects/status';

      return apiRequest(endpoint);
    },

    async filterByDateRange(fromDate, toDate, clientId) {
      const searchParams = new URLSearchParams();

      if (fromDate && String(fromDate).trim()) {
        searchParams.append('fromDate', String(fromDate).trim());
      }

      if (toDate && String(toDate).trim()) {
        searchParams.append('toDate', String(toDate).trim());
      }

      if (clientId && String(clientId).trim()) {
        searchParams.append('clientId', String(clientId).trim());
      }

      const query = searchParams.toString();
      const endpoint = query ? `/projects/date-range?${query}` : '/projects/date-range';

      return apiRequest(endpoint);
    },

    async getAvailableStatuses(clientId) {
      const searchParams = new URLSearchParams();

      if (clientId && String(clientId).trim()) {
        searchParams.append('clientId', String(clientId).trim());
      }

      const query = searchParams.toString();
      const endpoint = query
        ? `/projects/status/available?${query}`
        : '/projects/status/available';

      return apiRequest(endpoint);
    },

    async getByClient(clientId) {
      return apiRequest(`/projects/client/${clientId}`);
    },

    async updateStatus(id, status, clientId) {
      const payload = { status };

      if (clientId && String(clientId).trim()) {
        payload.clientId = String(clientId).trim();
      }

      return apiRequest(`/projects/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
    }
  },

  /**
   * SAMPLES ENDPOINTS
   * GET /api/samples
   * GET /api/samples/:id
   * POST /api/samples
   * PATCH /api/samples/:id
   * DELETE /api/samples/:id
   */
  samples: {
    async getRepository() {
      return apiRequest('/samples/repository');
    },

    async getAll(projectId = null) {
      let endpoint = '/samples';
      if (projectId) {
        endpoint += `?projectId=${projectId}`;
      }
      return apiRequest(endpoint);
    },

    async getById(id) {
      return apiRequest(`/samples/${id}`);
    },

    async searchByCode(code) {
      const searchParams = new URLSearchParams();
      if (code && String(code).trim()) {
        searchParams.append('code', String(code).trim());
      }
      const query = searchParams.toString();
      const endpoint = query ? `/samples/search/by-code?${query}` : '/samples';
      return apiRequest(endpoint);
    },

    async create(sampleData) {
      return apiRequest('/samples', {
        method: 'POST',
        body: JSON.stringify(sampleData)
      });
    },

    async createWithValues(sampleData) {
      return apiRequest('/samples/with-values', {
        method: 'POST',
        body: JSON.stringify(sampleData)
      });
    },

    async createManyWithValues(payload) {
      return apiRequest('/samples/bulk-with-values', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },

    async update(id, sampleData) {
      return apiRequest(`/samples/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(sampleData)
      });
    },

    async updateWithValues(id, sampleData) {
      return apiRequest(`/samples/${id}/with-values`, {
        method: 'PATCH',
        body: JSON.stringify(sampleData)
      });
    },

    async remove(id) {
      return apiRequest(`/samples/${id}`, {
        method: 'DELETE'
      });
    }
  },

  /**
   * TEMPLATES ENDPOINTS
   * GET /api/templates
   * GET /api/templates/:id
   * POST /api/templates
   * POST /api/templates/with-fields
   * PATCH /api/templates/:id
   * DELETE /api/templates/:id
   */
  templates: {
    async getAll() {
      return apiRequest('/templates');
    },

    async searchByName(name) {
      const searchParams = new URLSearchParams();

      if (name && String(name).trim()) {
        searchParams.append('name', String(name).trim());
      }

      const query = searchParams.toString();
      const endpoint = query ? `/templates/search/by-name?${query}` : '/templates/search/by-name';

      return apiRequest(endpoint);
    },

    async getById(id) {
      return apiRequest(`/templates/${id}`);
    },

    async create(templateData) {
      return apiRequest('/templates', {
        method: 'POST',
        body: JSON.stringify(templateData)
      });
    },

    async createWithFields(templateWithFieldsData) {
      return apiRequest('/templates/with-fields', {
        method: 'POST',
        body: JSON.stringify(templateWithFieldsData)
      });
    },

    async update(id, templateData) {
      return apiRequest(`/templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(templateData)
      });
    },

    async remove(id) {
      return apiRequest(`/templates/${id}`, {
        method: 'DELETE'
      });
    }
  }
};

export default apiService;
