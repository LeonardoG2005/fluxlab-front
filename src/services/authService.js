/**
 * Authentication Service - SUPABASE ONLY
 * 
 * NO MOCKS - Only real Supabase authentication with JWT tokens
 * Manages all authentication operations using Supabase Auth
 */

import { supabase } from '../config/supabase';
import { API_BASE_URL, buildApiUrl } from '../utils/apiUrl';

export const authService = {
  /**
   * Sign in with email and password
   * Uses Supabase Auth - Returns JWT token
   */
  async signIn(email, password) {
    try {
      if (!email || !password) {
        throw new Error('Email and password are required');
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      // Get passwordChanged status from backend
      let passwordChanged = false;
      let backendData = {};
      const token = data.session?.access_token;
      
      if (token) {
        try {
          const backendUrl = buildApiUrl(API_BASE_URL, 'users/me');
          if (!backendUrl) {
            console.warn('API URL no configurada o no disponible; se omite la consulta al backend.');
          } else {
            console.log('Fetching user data from backend...');
            const response = await fetch(backendUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });

            console.log('Backend response status:', response.status);

            if (response.ok) {
              backendData = await response.json();
              console.log('Backend user data:', backendData);
              passwordChanged = backendData.passwordChanged === true;
            } else {
              console.error('Backend error:', response.statusText);
            }
          }
        } catch (err) {
          console.error('Error fetching user data from backend:', err);
        }
      }

      console.log('Final passwordChanged value:', passwordChanged);

      const mergedUser = {
        ...data.user,
        ...backendData,
        passwordChanged,
      };

      return {
        user: mergedUser,
        session: data.session,
        error: null,
      };
    } catch (error) {
      console.error('Supabase sign in error:', error);
      return {
        user: null,
        session: null,
        error: error.message || 'Error al iniciar sesión'
      };
    }
  },

  /**
   * Sign out current user
   */
  async signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('Supabase sign out error:', error);
      return { error: error.message || 'Error al cerrar sesión' };
    }
  },

  /**
   * Get current session with JWT token
   */
  async getCurrentSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      return session;
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  },

  /**
   * Get current authenticated user
   */
  async getCurrentUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      return user;
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  },

  /**
   * Check if user is authenticated
   */
  async isAuthenticated() {
    try {
      const session = await this.getCurrentSession();
      return session !== null;
    } catch (error) {
      return false;
    }
  },

  /**
   * Get JWT access token
   */
  async getAccessToken() {
    try {
      const session = await this.getCurrentSession();
      return session?.access_token || null;
    } catch (error) {
      console.error('Error getting access token:', error);
      return null;
    }
  },

  /**
   * Refresh JWT token
   */
  async refreshSession() {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      return { session: data.session, error: null };
    } catch (error) {
      console.error('Error refreshing session:', error);
      return { session: null, error: error.message };
    }
  },

  /**
   * Change user password
   * Updates password in Supabase and marks passwordChanged as true in backend
   */
  async changePassword(newPassword) {
    try {
      const token = await this.getAccessToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      const backendUrl = buildApiUrl('users/change-password');
      if (!backendUrl) {
        throw new Error('API URL no configurada.');
      }

      const response = await fetch(backendUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: newPassword }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to change password');
      }

      const result = await response.json();
      console.log('Password changed successfully:', result);
      
      return { 
        error: null,
        data: result,
      };
    } catch (error) {
      console.error('Error changing password:', error);
      return { 
        error: error.message || 'Failed to change password',
        data: null,
      };
    }
  },
};

export default authService;
