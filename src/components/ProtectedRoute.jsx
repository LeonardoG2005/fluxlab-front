/**
 * Protected Route Component
 * 
 * Wraps routes that require authentication.
 * Redirects unauthenticated users to login page.
 */

import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function requiresPasswordChange(user) {
  if (!user) {
    return false;
  }

  const isAdmin = user?.app_metadata?.role === 'admin' || user?.role === 'admin';
  return !isAdmin && user?.passwordChanged === false;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mb-4"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children }) {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (requiresPasswordChange(user)) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export function PublicOnlyRoute({ children }) {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (isAuthenticated() && !requiresPasswordChange(user)) {
    return <Navigate to="/projects" replace />;
  }

  return children;
}

export default ProtectedRoute;
