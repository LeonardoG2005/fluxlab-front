/**
 * Authentication Context
 * 
 * Provides global authentication state management throughout the application.
 * Wraps the entire app to provide user data, auth state, and auth methods.
 */

import { createContext, useContext, useEffect, useState } from 'react';
import { authService } from '../services/authService';
import { supabase } from '../config/supabase';

// Create the auth context
const AuthContext = createContext(null);

function readJsonStorageValue(key) {
  if (typeof window === 'undefined') {
    return null;
  }

  const value = window.localStorage.getItem(key);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getCypressAuthBootstrap() {
  if (typeof window === 'undefined' || !window.Cypress) {
    return null;
  }

  const storedUser = readJsonStorageValue('cypress-auth-user');
  const storedSession = readJsonStorageValue('cypress-auth-session');

  if (!storedUser || !storedSession) {
    return null;
  }

  return {
    user: storedUser,
    session: storedSession
  };
}

function mergeSessionUser(sessionUser, currentUser) {
  if (!sessionUser) {
    return currentUser || null;
  }

  if (!currentUser) {
    return sessionUser;
  }

  return {
    ...sessionUser,
    ...currentUser,
  };
}

/**
 * Auth Provider Component
 * Wrap your App with this to enable authentication throughout the app
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize auth state and listen for changes
  useEffect(() => {
    const cypressAuth = getCypressAuthBootstrap();

    if (cypressAuth) {
      setUser(cypressAuth.user);
      setSession(cypressAuth.session);
      setLoading(false);
      return;
    }

    // Initialize auth state
    const initializeAuth = async () => {
      try {
        const currentSession = await authService.getCurrentSession();
        if (currentSession) {
          setSession(currentSession);

          // Try to fetch backend user data to enrich session.user (passwordChanged, role, etc.)
          try {
            const response = await fetch('http://localhost:3000/api/users/me', {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${currentSession.access_token}`,
                'Content-Type': 'application/json',
              },
            });

            if (response.ok) {
              const userData = await response.json();
              setUser({ ...currentSession.user, ...userData });
            } else {
              setUser((current) => mergeSessionUser(currentSession.user, current));
            }
          } catch (err) {
            console.error('Error fetching backend user in initializeAuth:', err);
            setUser((current) => mergeSessionUser(currentSession.user, current));
          }
        }
      } catch (err) {
        console.error('Initialize auth error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    const isCypressRuntime = typeof window !== 'undefined' && Boolean(window.Cypress);

    if (isCypressRuntime) {
      return;
    }

    // Listen for auth state changes
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (_event, session) => {
          setSession(session);

          if (!session?.user) {
            setUser(null);
            return;
          }

          // Fetch backend user info and merge (so we have passwordChanged and DB role)
          try {
            const response = await fetch('http://localhost:3000/api/users/me', {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
            });

            if (response.ok) {
              const userData = await response.json();
              setUser({ ...session.user, ...userData });
            } else {
              setUser((current) => mergeSessionUser(session.user, current));
            }
          } catch (err) {
            console.error('Error fetching backend user on auth change:', err);
            setUser((current) => mergeSessionUser(session.user, current));
          }
        }
      );

      return () => {
        subscription?.unsubscribe();
      };
    }
  }, []);

  /**
   * Handle user login
   */
  const login = async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const result = await authService.signIn(email, password);
      
      if (result.error) {
        setError(result.error);
        return { success: false, error: result.error };
      }

      setSession(result.session);
      setUser(result.user);
      return { 
        success: true, 
        user: result.user,
        session: result.session 
      };
    } catch (err) {
      const message = err.message || 'Login failed';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle user logout
   */
  const logout = async () => {
    setLoading(true);
    setError(null);
    try {
      if (typeof window !== 'undefined' && window.Cypress) {
        window.localStorage.removeItem('cypress-auth-user');
        window.localStorage.removeItem('cypress-auth-session');
      }

      // Clear context state immediately
      setSession(null);
      setUser(null);
      
      // Then call Supabase logout
      const result = await authService.signOut();
      
      if (result.error) {
        console.error('Logout error:', result.error);
      }
      
      return { success: true };
    } catch (err) {
      const message = err.message || 'Logout failed';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle user registration (if needed)
   */
  const signup = async (email, password, name = '') => {
    setLoading(true);
    setError(null);
    try {
      const result = await authService.signUp(email, password, name);
      
      if (result.error) {
        setError(result.error);
        return { success: false, error: result.error };
      }

      return { success: true, user: result.user };
    } catch (err) {
      const message = err.message || 'Signup failed';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Update user after password change
   */
  const updateUserPasswordChanged = (updatedUser) => {
    setUser(updatedUser);
  };

  const updateUserProfile = (updates) => {
    setUser((currentUser) => {
      if (!currentUser) {
        return updates;
      }

      return {
        ...currentUser,
        ...updates,
      };
    });
  };

  /**
   * Get user role
   * For admins: returns 'admin' (from app_metadata.role)
   * For normal users: returns 'authenticated' (from base role field)
   * app_metadata.role is ONLY used for admin identification
   */
  const getUserRole = () => {
    // Check if user is admin (only admins have app_metadata.role)
    if (user?.app_metadata?.role === 'admin') {
      return 'admin';
    }
    // Normal users just have the base role
    return user?.role || null;
  };

  /**
   * Check if user has specific role
   * Special handling: only checks app_metadata.role for 'admin'
   */
  const hasRole = (role) => {
    if (role === 'admin') {
      // Only admins have app_metadata.role === 'admin'
      return user?.app_metadata?.role === 'admin';
    }
    // For other roles, check the base role field
    return user?.role === role;
  };

  /**
   * Check if user is admin
   * Convenience method - checks only app_metadata.role for admin
   */
  const isAdmin = () => {
    return user?.app_metadata?.role === 'admin';
  };

  /**
   * Check if user is authenticated
   */
  const isAuthenticated = () => {
    return session !== null && user !== null;
  };

  const value = {
    // State
    user,
    session,
    loading,
    error,
    
    // Methods
    login,
    logout,
    signup,
    updateUserPasswordChanged,
    updateUserProfile,
    
    // Utilities
    isAuthenticated,
    getUserRole,
    hasRole,
    isAdmin
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Custom hook to use auth context
 * Usage: const { user, loading, login, logout } = useAuth();
 */
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
