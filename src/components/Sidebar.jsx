/**
 * Sidebar Component
 * 
 * Left navigation sidebar for dashboard pages
 * Contains menu items for different sections of the application
 */

import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import {
  faFlask,
  faFileLines,
  faFolderOpen,
  faUsers,
  faUserGear
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logoConFondo.jpeg';
import Icon from './Icon';

const menuItems = [
  // {
  //   id: 'dashboard',
  //   label: 'Dashboard',
  //   icon: 'dashboard-icon',
  //   path: '/dashboard',
  //   roles: ['authenticated', 'admin', 'user']
  // },
  {
    id: 'clients',
    label: 'Clientes',
    icon: faUsers,
    path: '/clients',
    roles: ['authenticated', 'admin', 'user']
  },
  {
    id: 'users',
    label: 'Gestión de Usuarios',
    icon: faUserGear,
    path: '/users',
    roles: ['admin']
  },
  {
    id: 'projects',
    label: 'Proyectos',
    icon: faFolderOpen,
    path: '/projects',
    roles: ['authenticated', 'admin', 'user']
  },
  {
    id: 'samples',
    label: 'Muestras',
    icon: faFlask,
    path: '/samples',
    roles: ['authenticated', 'admin', 'user']
  },
  {
    id: 'reports',
    label: 'Reportes',
    icon: faFileLines,
    path: '/reports',
    roles: ['authenticated', 'admin', 'user']
  },
  // {
  //   id: 'tests',
  //   label: 'Pruebas',
  //   icon: 'tests-icon',
  //   path: '/tests',
  //   roles: ['authenticated', 'admin', 'user']
  // },
  // {
  //   id: 'documents',
  //   label: 'Documentos',
  //   icon: 'documents-icon',
  //   path: '/documents',
  //   roles: ['authenticated', 'admin', 'user']
  // }
];

const bottomMenuItems = [
  
  // {
  //   id: 'support',
  //   label: 'Support',
  //   icon: faQuestionCircle,
  //   path: '/support',
  //   roles: ['authenticated', 'admin', 'user']
  // },
  // {
  //   id: 'settings',
  //   label: 'Settings',
  //   icon: faSliders,
  //   path: '/settings',
  //   roles: ['authenticated', 'admin', 'user']
  // }
];

export function Sidebar() {
  const location = useLocation();
  const { user, getUserRole } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  
  const userRole = getUserRole();

  const getRoleDisplayLabel = (role) => {
    switch (role) {
      case 'technician':
        return 'Técnico';
      case 'researcher':
        return 'Investigador';
      default:
        return role || 'user';
    }
  };

  /**
   * Check if menu item should be visible based on user role
   */
  const isMenuItemVisible = (item) => {
    return item.roles.includes(userRole) || item.roles.includes('authenticated');
  };

  /**
   * Check if current route is active
   */
  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <aside
      className={`${
        collapsed ? 'w-20' : 'w-64'
      } h-full bg-white border-r border-gray-200 transition-all duration-300 flex flex-col sticky top-0`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded flex items-center justify-center">
              <img src={logo} alt="FluxLab Logo" className="w-8 h-13 rounded-full object-cover"/>
            </div>
            <span className="font-bold text-lg text-gray-900">FluxLab</span>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 bg-black rounded flex items-center justify-center">
            <img src={logo} alt="FluxLab Logo" className="w-8 h-13 rounded-full object-cover"/>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 rounded-lg transition"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '→' : '←'}
        </button>
      </div>

      {/* Main Menu Items */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-2">
        {menuItems.map((item) => {
          if (!isMenuItemVisible(item)) return null;

          const active = isActive(item.path);
          
          return (
            <Link
              key={item.id}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                active
                  ? 'bg-emerald-50 text-emerald-600 border-l-4 border-emerald-500'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              title={collapsed ? item.label : ''}
            >
              <span className="text-xl flex-shrink-0">
                <Icon icon={item.icon} size={18} color="currentColor" />
              </span>
              {!collapsed && <span className="font-medium text-sm">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Menu Items */}
      <div className="border-t border-gray-200 p-4 space-y-2">
        {bottomMenuItems.map((item) => {
          if (!isMenuItemVisible(item)) return null;

          const active = isActive(item.path);
          
          return (
            <Link
              key={item.id}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                active
                  ? 'bg-emerald-50 text-emerald-600 border-l-4 border-emerald-500'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              title={collapsed ? item.label : ''}
            >
              <span className="text-xl flex-shrink-0">
                <Icon icon={item.icon} size={18} color="currentColor" />
              </span>
              {!collapsed && <span className="font-medium text-sm">{item.label}</span>}
            </Link>
          );
        })}
      </div>

      {/* User Info */}
      {!collapsed && (
        <div className="border-t border-gray-200 p-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-500 mb-1">Iniciaste sesión como</p>
            <p className="text-sm font-semibold text-gray-900 truncate">
              {user?.name || user?.email?.split('@')[0] || 'User'}
            </p>
            <p className="text-xs text-gray-500 capitalize truncate">
              {getRoleDisplayLabel(userRole)}
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}

export default Sidebar;
