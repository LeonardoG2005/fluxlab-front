/**
 * Navbar Component
 * 
 * Reusable navigation bar for authenticated pages (Dashboard, etc.)
 * Displays user profile information and search functionality
 * Ready for dynamic user data from backend
 */

import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { faGear, faRightFromBracket } from '@fortawesome/free-solid-svg-icons';
import Icon from './Icon';

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const getRoleDisplayLabel = (role) => {
    switch (role) {
      case 'technician':
        return 'Técnico';
      case 'researcher':
        return 'Investigador';
      default:
        return role || 'User';
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      // Navigate to login after logout
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Get user initials for avatar placeholder
  const getInitials = () => {
    if (user?.avatar) return user.avatar;
    if (user?.name) {
      return user.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase();
    }
    return user?.email?.[0]?.toUpperCase() || 'U';
  };

  return (
    <div className="w-full bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 h-16">
        {/* Center - Search Bar (Extended) */}
        <div className="flex-1 flex items-center">
          {/* <div className="relative w-full max-w-2xl">
            <input
              type="text"
              placeholder="Buscar muestras, proyectos o datos..."
              className="w-full px-4 py-2 pl-10 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
            />
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
              ICONO_BUSCAR
            </div>
          </div> */}
        </div>

        {/* Right - User Menu */}
        <div className="flex items-center gap-4">
          {/* Notification Bell (Placeholder) - commented for now
          <button className="relative p-2 text-gray-600 hover:text-gray-900 transition hover:bg-gray-100 rounded-lg">
            ICONO_NOTIFICACION
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          */}

          {/* User Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition"
            >
              {/* User Avatar */}
              <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                {getInitials()}
              </div>
              
              {/* User Info - Hidden on mobile */}
              <div className="hidden sm:block text-left">
                <p className="text-sm font-semibold text-gray-900">
                  {user?.name || user?.email?.split('@')[0] || 'User'}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {getRoleDisplayLabel(user?.app_metadata?.role || user?.role)}
                </p>
              </div>

              {/* Chevron */}
              <span className="text-gray-400 ml-1">▼</span>
            </button>

            {/* Dropdown Menu */}
            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                {/* User Info Section */}
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900">
                    {user?.name || user?.email?.split('@')[0] || 'User'}
                  </p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                </div>

                {/* Account Settings */}
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    navigate('/account-settings');
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition font-medium"
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon icon={faGear} size={14} color="currentColor" />
                    Configuración
                  </span>
                </button>

                {/* Divider */}
                <div className="border-t border-gray-100 my-1"></div>

                {/* Logout */}
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition font-medium"
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon icon={faRightFromBracket} size={14} color="currentColor" />
                    Cerrar sesión
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Navbar;
