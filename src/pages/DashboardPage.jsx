/**
 * Dashboard Page
 *
 * Main dashboard for authenticated users.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  faChartLine,
  faClipboardList,
  faFileLines,
  faFlask,
  faFolderOpen,
  faUsers,
  faUserGear
} from '@fortawesome/free-solid-svg-icons';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import Icon from '../components/Icon';
import { apiService } from '../services/api';

const STAT_CARDS = [
  { key: 'clients', label: 'Clientes', icon: faUsers, accent: 'bg-emerald-500' },
  { key: 'projects', label: 'Proyectos', icon: faFolderOpen, accent: 'bg-slate-900' },
  { key: 'samples', label: 'Muestras', icon: faFlask, accent: 'bg-teal-600' },
  { key: 'templates', label: 'Plantillas', icon: faClipboardList, accent: 'bg-blue-600' },
  { key: 'users', label: 'Usuarios', icon: faUserGear, accent: 'bg-amber-500' },
  { key: 'reports', label: 'Reportes', icon: faFileLines, accent: 'bg-violet-600' },
];

const SAMPLE_STATUS_CONFIG = [
  { key: 'pending', label: 'Pendiente', color: 'bg-amber-400' },
  { key: 'completed', label: 'Completada', color: 'bg-emerald-500' },
  { key: 'rejected', label: 'Rechazada', color: 'bg-rose-500' },
];

function StatCard({ label, value, icon, accent, subtext }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm relative overflow-hidden">
      <div className={`absolute right-0 top-0 h-16 w-16 rounded-bl-3xl opacity-10 ${accent}`} />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">{label}</p>
          <p className="mt-2 text-3xl font-black text-gray-900">{value}</p>
          {subtext && <p className="mt-1 text-xs font-semibold text-gray-500">{subtext}</p>}
        </div>
        <div className={`h-12 w-12 rounded-2xl ${accent} text-white flex items-center justify-center`}
          aria-hidden="true"
        >
          <Icon icon={icon} size={18} color="currentColor" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadSummary = async () => {
      try {
        setLoading(true);
        const data = await apiService.dashboard.getSummary();
        setSummary(data || null);
        setError(null);
      } catch (err) {
        setError(err.message || 'No se pudo cargar el dashboard');
      } finally {
        setLoading(false);
      }
    };

    loadSummary();
  }, []);

  const totals = summary?.totals || {};
  const samplesByStatus = summary?.samplesByStatus || {};
  const projectsByStatus = summary?.projectsByStatus || {};
  const clientsByStatus = summary?.clientsByStatus || {};
  const usersByStatus = summary?.usersByStatus || {};
  const recentSamples = summary?.recentSamples || [];
  const recentProjects = summary?.recentProjects || [];
  const recentClients = summary?.recentClients || [];
  const recentUsers = summary?.recentUsers || [];
  const topTemplates = summary?.topTemplates || [];

  const totalSampleStatusCount = useMemo(() => {
    return Object.values(samplesByStatus).reduce((sum, count) => sum + Number(count || 0), 0);
  }, [samplesByStatus]);

  const formatDate = (value) => {
    if (!value) return 'N/A';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'N/A';
    return parsed.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar />

        <main className="flex-1 overflow-auto bg-gradient-to-br from-slate-50 via-white to-emerald-50">
          <div className="p-6 md:p-8 space-y-6 relative">
            <div className="absolute -top-16 -right-16 w-72 h-72 bg-emerald-200/40 blur-3xl rounded-full" />
            <div className="relative">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.3em] text-emerald-500">Panel general</p>
                  <h1 className="text-3xl font-black text-slate-900 mt-2 flex items-center gap-3">
                    Dashboard
                    <span className="text-xs font-black uppercase tracking-[0.2em] bg-emerald-500 text-white px-3 py-1 rounded-full">
                      FluxLab
                    </span>
                  </h1>
                </div>
                <div className="flex items-center gap-3 text-xs font-semibold text-gray-500">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Actualizado en tiempo real
                  </span>
                </div>
              </div>

              {error && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 font-semibold">
                  {error}
                </div>
              )}

              {loading ? (
                <div className="mt-6 text-gray-500">Cargando dashboard...</div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
                    {STAT_CARDS.map((card) => {
                      const value = totals[card.key] ?? 0;
                      const subtext =
                        card.key === 'clients'
                          ? `${summary?.activeClients ?? 0} activos`
                          : card.key === 'users'
                            ? `${usersByStatus.active || 0} activos`
                            : card.key === 'samples'
                              ? `${totalSampleStatusCount} totales`
                              : null;
                      return (
                        <StatCard
                          key={card.key}
                          label={card.label}
                          value={value}
                          icon={card.icon}
                          accent={card.accent}
                          subtext={subtext}
                        />
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-gray-500">
                          Estado de muestras
                        </h2>
                        <Icon icon={faFlask} size={14} color="#0f766e" />
                      </div>
                      <div className="mt-4 space-y-3">
                        {SAMPLE_STATUS_CONFIG.map((item) => {
                          const count = Number(samplesByStatus[item.key] || 0);
                          const pct = totalSampleStatusCount
                            ? Math.round((count / totalSampleStatusCount) * 100)
                            : 0;
                          return (
                            <div key={item.key} className="space-y-2">
                              <div className="flex items-center justify-between text-xs font-bold text-gray-600">
                                <span>{item.label}</span>
                                <span>{count} ({pct}%)</span>
                              </div>
                              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                                <div
                                  className={`h-full ${item.color}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-gray-500">
                          Estado de proyectos
                        </h2>
                        <Icon icon={faFolderOpen} size={14} color="#0f172a" />
                      </div>
                      <div className="mt-4 space-y-3">
                        {Object.keys(projectsByStatus).length === 0 && (
                          <p className="text-sm text-gray-400">Sin datos de proyectos.</p>
                        )}
                        {Object.entries(projectsByStatus).map(([status, count]) => (
                          <div key={status} className="flex items-center justify-between text-xs font-bold text-gray-600">
                            <span className="uppercase tracking-widest">{status}</span>
                            <span>{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-gray-500">
                          Plantillas mas usadas
                        </h2>
                        <Icon icon={faClipboardList} size={14} color="#2563eb" />
                      </div>
                      <div className="mt-4 space-y-3">
                        {topTemplates.length === 0 && (
                          <p className="text-sm text-gray-400">Sin plantillas registradas.</p>
                        )}
                        {topTemplates.map((template) => (
                          <div key={template.id} className="flex items-center justify-between text-sm font-semibold text-gray-700">
                            <span className="truncate">{template.name}</span>
                            <span className="text-xs font-black text-emerald-600">
                              {template.sampleCount} muestras
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-gray-500">
                          Actividad reciente (muestras)
                        </h2>
                        <Icon icon={faChartLine} size={14} color="#059669" />
                      </div>
                      <div className="mt-4 space-y-3">
                        {recentSamples.length === 0 && (
                          <p className="text-sm text-gray-400">Sin muestras recientes.</p>
                        )}
                        {recentSamples.map((sample) => (
                          <div key={sample.id} className="flex items-center justify-between text-sm font-semibold text-gray-700">
                            <div className="flex flex-col">
                              <span className="font-black text-slate-900">{sample.code}</span>
                              <span className="text-xs text-gray-500">
                                {sample.project?.name || 'Proyecto sin nombre'} · {sample.template?.name || 'Plantilla'}
                              </span>
                            </div>
                            <span className="text-xs font-black text-emerald-600">{formatDate(sample.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-gray-500">
                          Actividad reciente (proyectos)
                        </h2>
                        <Icon icon={faFolderOpen} size={14} color="#0f172a" />
                      </div>
                      <div className="mt-4 space-y-3">
                        {recentProjects.length === 0 && (
                          <p className="text-sm text-gray-400">Sin proyectos recientes.</p>
                        )}
                        {recentProjects.map((project) => (
                          <div key={project.id} className="flex items-center justify-between text-sm font-semibold text-gray-700">
                            <div className="flex flex-col">
                              <span className="font-black text-slate-900">{project.name}</span>
                              <span className="text-xs text-gray-500">
                                {project.client?.name || 'Sin cliente'} · {project.sampleCount} muestras
                              </span>
                            </div>
                            <span className="text-xs font-black text-slate-600">{formatDate(project.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-gray-500">
                          Clientes recientes
                        </h2>
                        <Icon icon={faUsers} size={14} color="#059669" />
                      </div>
                      <div className="mt-4 space-y-3">
                        {recentClients.length === 0 && (
                          <p className="text-sm text-gray-400">Sin clientes recientes.</p>
                        )}
                        {recentClients.map((client) => (
                          <div key={client.id} className="flex items-center justify-between text-sm font-semibold text-gray-700">
                            <span className="font-black text-slate-900">{client.name}</span>
                            <span className="text-xs font-black text-emerald-600 uppercase tracking-widest">
                              {client.status || 'activo'}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 text-xs font-semibold text-gray-500">
                        Activos: {clientsByStatus.active || 0}
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-gray-500">
                          Usuarios recientes
                        </h2>
                        <Icon icon={faUserGear} size={14} color="#f59e0b" />
                      </div>
                      <div className="mt-4 space-y-3">
                        {recentUsers.length === 0 && (
                          <p className="text-sm text-gray-400">Sin usuarios recientes.</p>
                        )}
                        {recentUsers.map((user) => (
                          <div key={user.id} className="flex items-center justify-between text-sm font-semibold text-gray-700">
                            <div className="flex flex-col">
                              <span className="font-black text-slate-900">{user.name}</span>
                              <span className="text-xs text-gray-500">{user.role}</span>
                            </div>
                            <span className={`text-xs font-black uppercase tracking-widest ${user.active ? 'text-emerald-600' : 'text-rose-500'}`}>
                              {user.active ? 'activo' : 'inactivo'}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 text-xs font-semibold text-gray-500">
                        Activos: {usersByStatus.active || 0}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
