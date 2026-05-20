/**
 * User Management Service
 * Handles communication with backend user endpoints
 */

import { API_BASE_URL, buildApiUrl } from '../utils/apiUrl';

// Backend API URL - dev fallback only
const API_URL = API_BASE_URL;

function getApiBase() {
  if (!API_URL) {
    throw new Error('API URL no configurada. Configura VITE_API_URL.');
  }
  return API_URL.replace(/\/$/, '');
}

/**
 * Generate a temporary default password
 */
function generateDefaultPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Get authentication token from Supabase session
 */
async function getAuthToken() {
  try {
    const { supabase } = await import('../config/supabase');
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.access_token) {
      return session.access_token;
    }

    if (typeof window !== 'undefined' && window.Cypress) {
      try {
        const rawSession = window.localStorage.getItem('cypress-auth-session');
        if (rawSession) {
          const parsedSession = JSON.parse(rawSession);
          return parsedSession?.access_token || null;
        }
      } catch {
        return null;
      }
    }

    return null;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
}

/**
 * Create a new user (Admin only)
 */
export async function createUser(userData) {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    // Generate default password
    const defaultPassword = generateDefaultPassword();

    const payload = {
      name: userData.name,
      email: userData.email,
      password: defaultPassword,
      role: userData.role,
      active: true,
    };

    const response = await fetch(buildApiUrl(getApiBase(), 'users'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Error creating user');
    }

    const newUser = await response.json();

    // Return user data with the generated default password
    return {
      ...newUser,
      temporaryPassword: defaultPassword, // Include the password we generated locally
    };
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

/**
 * Get all users (Admin only)
 */
export async function getAllUsers() {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(buildApiUrl(getApiBase(), 'users'), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Error fetching users');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
}

/**
 * Delete a user (Admin only)
 */
export async function deleteUser(userId) {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(buildApiUrl(getApiBase(), `users/${userId}`), {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Error deleting user');
    }

    return await response.json();
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
}

/**
 * Update user password
 */
export async function updateUserPassword(userId, currentPassword, newPassword) {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(buildApiUrl(getApiBase(), `users/${userId}/password`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Error updating password');
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating password:', error);
    throw error;
  }
}

/**
 * Get single user
 */
export async function getUser(userId) {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(buildApiUrl(getApiBase(), `users/${userId}`), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Error fetching user');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching user:', error);
    throw error;
  }
}

/**
 * Update a user (name/email/active)
 */
export async function updateUser(userId, userData) {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(buildApiUrl(getApiBase(), `users/${userId}`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Error updating user');
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
}
