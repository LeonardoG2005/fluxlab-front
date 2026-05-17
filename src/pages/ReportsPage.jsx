/**
 * Reports Page
 *
 * Export sample results to Excel with filters and a summary sheet.
 */

import { useEffect, useMemo, useState } from 'react';
import { faDownload } from '@fortawesome/free-solid-svg-icons';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import Icon from '../components/Icon';
import { apiService } from '../services/api';
import * as XLSX from 'xlsx';

const INITIAL_FILTERS = {
  search: '',
  projectId: '',
  templateId: '',
  status: '',
  fromDate: '',
  toDate: ''
};

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const firstNonEmptyText = (...values) => {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
};

const parseDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseDateBoundary = (value, isEnd) => {
  const parsed = parseDate(value);
  if (!parsed) return null;
  if (isEnd) {
    parsed.setHours(23, 59, 59, 999);
  } else {
    parsed.setHours(0, 0, 0, 0);
  }
  return parsed;
};

const formatDateTime = (value) => {
  const parsed = parseDate(value);
  if (!parsed) return '-';
  return parsed.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatDateForFile = (date) => {
  const safe = date instanceof Date ? date : new Date();
  const year = safe.getFullYear();
  const month = String(safe.getMonth() + 1).padStart(2, '0');
  const day = String(safe.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const sanitizeSheetName = (name) => {
  if (!name) return 'Hoja';
  // Remove characters not allowed in Excel sheet names and trim to 31 chars
  const forbidden = /[\\/\?\*\[\]:]/g;
  const cleaned = String(name).replace(forbidden, ' ').trim();
  return cleaned.substring(0, 31);
};

const sanitizeFileName = (name) => {
  if (!name) return '';
  // Replace spaces with underscores and remove characters invalid for filenames
  const forbidden = /[\\/:\*?"<>|\[\]]/g;
  const cleaned = String(name).replace(forbidden, '').replace(/\s+/g, '_').trim();
  return cleaned.substring(0, 100);
};

const getSampleDate = (sample) =>
  firstNonEmptyText(sample?.createdAt, sample?.receivedAt, sample?.updatedAt);

const getSampleCode = (sample) =>
  firstNonEmptyText(sample?.code, sample?.sampleId, sample?.id);

const getSampleStatus = (sample) =>
  firstNonEmptyText(sample?.status, 'pending');

const formatValueFromField = (value) => {
  if (!value || typeof value !== 'object') return '';
  if (value.valueText !== null && value.valueText !== undefined && value.valueText !== '') {
    return String(value.valueText);
  }
  if (value.valueNumber !== null && value.valueNumber !== undefined) {
    return String(value.valueNumber);
  }
  if (value.valueDate !== null && value.valueDate !== undefined) {
    return formatDateTime(value.valueDate);
  }
  if (value.valueBoolean !== null && value.valueBoolean !== undefined) {
    return value.valueBoolean ? 'Si' : 'No';
  }
  return '';
};

export default function ReportsPage() {
  const [samples, setSamples] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [projects, setProjects] = useState([]);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportError, setExportError] = useState('');
  const [lastExportAt, setLastExportAt] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError('');

        const [samplesData, templatesData, projectsResponse] = await Promise.all([
          apiService.samples.getAll().catch(() => []),
          apiService.templates.getAll().catch(() => []),
          apiService.projects.getAll().catch(() => [])
        ]);

        setSamples(Array.isArray(samplesData) ? samplesData : []);
        setTemplates(Array.isArray(templatesData) ? templatesData : []);

        const projectsList = projectsResponse?.data && Array.isArray(projectsResponse.data)
          ? projectsResponse.data
          : (Array.isArray(projectsResponse) ? projectsResponse : []);
        setProjects(projectsList);
      } catch (err) {
        setError(err?.message || 'No se pudieron cargar los datos.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const templatesById = useMemo(() => {
    const map = new Map();
    templates.forEach((template) => {
      if (template?.id) {
        map.set(String(template.id), template);
      }
    });
    return map;
  }, [templates]);

  const projectsById = useMemo(() => {
    const map = new Map();
    projects.forEach((project) => {
      if (project?.id) {
        map.set(String(project.id), project);
      }
    });
    return map;
  }, [projects]);

  const templateFieldColumnMap = useMemo(() => {
    const map = new Map();
    templates.forEach((template) => {
      const templateName = firstNonEmptyText(template?.name, 'Plantilla');
      (template?.fields || []).forEach((field) => {
        if (!field?.id || !field?.name) return;
        const columnName = `${templateName} - ${field.name}`;
        map.set(String(field.id), columnName);
      });
    });
    return map;
  }, [templates]);

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters(INITIAL_FILTERS);
    setExportError('');
  };

  const filteredSamples = useMemo(() => {
    return (samples || []).filter((sample) => {
      const sampleCode = getSampleCode(sample);
      const templateId = String(sample?.template?.id || sample?.templateId || '');
      const projectId = String(sample?.project?.id || sample?.projectId || '');
      const status = getSampleStatus(sample);
      const sampleDate = parseDate(getSampleDate(sample));

      if (filters.search && !normalizeText(sampleCode).includes(normalizeText(filters.search))) {
        return false;
      }

      if (filters.projectId && filters.projectId !== projectId) {
        return false;
      }

      if (filters.templateId && filters.templateId !== templateId) {
        return false;
      }

      if (filters.status && filters.status !== status) {
        return false;
      }

      if (filters.fromDate) {
        const fromDate = parseDateBoundary(filters.fromDate, false);
        if (fromDate && sampleDate && sampleDate < fromDate) return false;
        if (fromDate && !sampleDate) return false;
      }

      if (filters.toDate) {
        const toDate = parseDateBoundary(filters.toDate, true);
        if (toDate && sampleDate && sampleDate > toDate) return false;
        if (toDate && !sampleDate) return false;
      }

      return true;
    });
  }, [samples, filters]);

  const fieldColumns = useMemo(() => {
    const columns = [];
    const seen = new Set();

    filteredSamples.forEach((sample) => {
      const templateId = String(sample?.template?.id || sample?.templateId || '');
      const template = templatesById.get(templateId) || sample?.template;
      const templateName = firstNonEmptyText(template?.name, 'Plantilla');

      (template?.fields || []).forEach((field) => {
        if (!field?.name) return;
        const columnName = `${templateName} - ${field.name}`;
        if (!seen.has(columnName)) {
          seen.add(columnName);
          columns.push(columnName);
        }
      });
    });

    return columns;
  }, [filteredSamples, templatesById]);

  const statusSummary = useMemo(() => {
    const summary = {
      total: filteredSamples.length,
      completed: 0,
      pending: 0,
      rejected: 0
    };

    filteredSamples.forEach((sample) => {
      const status = getSampleStatus(sample);
      if (status === 'completed') summary.completed += 1;
      else if (status === 'rejected') summary.rejected += 1;
      else summary.pending += 1;
    });

    return summary;
  }, [filteredSamples]);

  const templateOptions = useMemo(() => {
    // Require project selection: no templates shown until a project is chosen
    if (!filters.projectId) return [];

    const templateIds = new Set(
      samples
        .filter((sample) => String(sample?.project?.id || sample?.projectId || '') === filters.projectId)
        .map((sample) => String(sample?.template?.id || sample?.templateId || ''))
    );

    return templates.filter((template) => templateIds.has(String(template?.id || '')));
  }, [filters.projectId, samples, templates]);

  const buildResultSummary = (values, fieldNameResolver) => {
    if (!Array.isArray(values) || values.length === 0) return '-';

    const parts = values
      .map((value) => {
        const fieldId = String(value?.field?.id || value?.fieldId || '');
        const fieldName = value?.field?.name || fieldNameResolver(fieldId) || 'Campo';
        const resolvedValue = formatValueFromField(value);
        if (!resolvedValue) return null;
        return `${fieldName}: ${resolvedValue}`;
      })
      .filter(Boolean);

    return parts.length > 0 ? parts.join(' | ') : '-';
  };

  const handleExportClick = () => {
    if (!filters.projectId) {
      setExportError('Seleccione un proyecto antes de exportar.');
      return;
    }

    if (!filteredSamples.length) {
      setExportError('No hay muestras para exportar con los filtros actuales.');
      return;
    }

    setExportError('');
    setShowExportModal(true);
  };

  const handleExportConfirm = () => {
    const now = new Date();
    const projectId = filters.projectId;
    const projectName = projectsById.get(String(projectId))?.name || String(projectId || 'proyecto');
    const safeProject = sanitizeFileName(projectName) || 'proyecto';
    const fileName = `resultados__${safeProject}__${formatDateForFile(now)}.xlsx`;
    if (!projectId) {
      setExportError('Seleccione un proyecto antes de exportar.');
      return;
    }

    const projectSamples = filteredSamples.filter((s) => String(s?.project?.id || s?.projectId || '') === String(projectId));
    if (!projectSamples.length) {
      setExportError('No hay muestras para el proyecto seleccionado con los filtros aplicados.');
      return;
    }

    // Group samples by template
    const groups = new Map();
    projectSamples.forEach((sample) => {
      const templateId = String(sample?.template?.id || sample?.templateId || '');
      if (!groups.has(templateId)) {
        groups.set(templateId, { template: templatesById.get(templateId) || sample?.template, samples: [] });
      }
      groups.get(templateId).samples.push(sample);
    });

    const workbook = XLSX.utils.book_new();

    // For each template, create a sheet with columns: base cols + template fields
    for (const [templateId, { template, samples: tplSamples }] of groups.entries()) {
      const templateName = firstNonEmptyText(template?.name, 'Plantilla');

      const fieldList = Array.isArray(template?.fields) ? template.fields : [];
      const baseCols = ['ID Muestra', 'Codigo Muestra', 'Tipo de prueba', 'Estado', 'Fecha'];
      const fieldCols = fieldList.map((f) => (f?.name ? String(f.name) : `Campo ${f?.id || ''}`));
      const columns = [...baseCols, ...fieldCols];

      const rows = tplSamples.map((sample, idx) => {
        const values = sample?.sampleFieldValues || sample?.values || [];
        const row = {
          'ID Muestra': firstNonEmptyText(sample?.id, `row-${idx + 1}`),
          'Codigo Muestra': getSampleCode(sample),
          'Tipo de prueba': firstNonEmptyText(templateName, '-'),
          Estado: getSampleStatus(sample),
          Fecha: formatDateTime(getSampleDate(sample))
        };

        // Initialize field columns
        fieldCols.forEach((col) => {
          row[col] = '';
        });

        // Fill values based on field id mapping
        values.forEach((value) => {
          const fieldId = String(value?.field?.id || value?.fieldId || '');
          const fieldDef = fieldList.find((f) => String(f?.id || '') === fieldId);
          if (!fieldDef) return;
          const colName = fieldDef.name || `campo_${fieldId}`;
          row[colName] = formatValueFromField(value);
        });

        return row;
      });

      const header = columns;
      const sheet = XLSX.utils.json_to_sheet(rows, { header });
      // Generate safe, unique sheet name
      let sheetName = sanitizeSheetName(`Plantilla ${templateName}`);
      let suffix = 1;
      while (workbook.SheetNames && workbook.SheetNames.includes(sheetName)) {
        sheetName = sanitizeSheetName(`Plantilla ${templateName} ${suffix}`);
        suffix += 1;
      }

      XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    }

    XLSX.writeFile(workbook, fileName);

    setShowExportModal(false);
    setLastExportAt(now);
    setExportError('');
  };

  const previewRows = filteredSamples.slice(0, 8);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar />

        <main className="flex-1 overflow-auto">
          <div className="p-6 md:p-8 space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Reportes de resultados</h1>
                <p className="text-gray-600 text-sm">
                  Exporta resultados de pruebas basados en muestras y filtros.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 font-semibold text-sm hover:bg-gray-50 transition"
                >
                  Limpiar filtros
                </button>
                <button
                  type="button"
                  onClick={handleExportClick}
                  disabled={!filters.projectId}
                  className={`px-5 py-2 rounded-lg !border-emerald-600 !bg-emerald-600 !text-white font-bold text-sm shadow-md hover:!bg-emerald-700 transition inline-flex items-center gap-2 ${!filters.projectId ? 'opacity-50 cursor-not-allowed hover:!bg-emerald-600' : ''}`}
                >
                  <Icon icon={faDownload} size={14} color="currentColor" />
                  Exportar Excel
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                {error}
              </div>
            )}

            {exportError && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800">
                {exportError}
              </div>
            )}

            {loading ? (
              <div className="bg-white border border-gray-200 rounded-lg p-6 text-gray-500">
                Cargando resultados...
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-widest">Total</p>
                    <p className="text-2xl font-bold text-gray-900">{statusSummary.total}</p>
                  </div>
                  <div className="bg-white border border-emerald-200 rounded-lg p-4">
                    <p className="text-xs text-emerald-600 font-semibold uppercase tracking-widest">Completadas</p>
                    <p className="text-2xl font-bold text-emerald-700">{statusSummary.completed}</p>
                  </div>
                  <div className="bg-white border border-amber-200 rounded-lg p-4">
                    <p className="text-xs text-amber-600 font-semibold uppercase tracking-widest">Pendientes</p>
                    <p className="text-2xl font-bold text-amber-700">{statusSummary.pending}</p>
                  </div>
                  <div className="bg-white border border-red-200 rounded-lg p-4">
                    <p className="text-xs text-red-600 font-semibold uppercase tracking-widest">Rechazadas</p>
                    <p className="text-2xl font-bold text-red-700">{statusSummary.rejected}</p>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Filtros</h2>
                    <p className="text-xs text-gray-500">Aplica filtros antes de exportar.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <input
                      type="text"
                      placeholder="Buscar por codigo de muestra"
                      value={filters.search}
                      onChange={(event) => updateFilter('search', event.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />

                    <div className="relative">
                      <select
                        value={filters.projectId}
                        onChange={(event) => updateFilter('projectId', event.target.value)}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        aria-required={true}
                      >
                        <option value="" disabled>Selecciona un proyecto</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-red-600 pointer-events-none text-sm">*</span>
                    </div>

                    

                    <select
                      value={filters.templateId}
                      onChange={(event) => updateFilter('templateId', event.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="">Todas las plantillas</option>
                      {templateOptions.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={filters.status}
                      onChange={(event) => updateFilter('status', event.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="">Todos los estados</option>
                      <option value="pending">Pendiente</option>
                      <option value="completed">Completada</option>
                      <option value="rejected">Rechazada</option>
                    </select>

                    <input
                      type="date"
                      value={filters.fromDate}
                      onChange={(event) => updateFilter('fromDate', event.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />

                    <input
                      type="date"
                      value={filters.toDate}
                      onChange={(event) => updateFilter('toDate', event.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-gray-900">Vista previa</h3>
                      <p className="text-xs text-gray-500">
                        Mostrando {previewRows.length} de {statusSummary.total} resultados filtrados.
                      </p>
                    </div>
                    {lastExportAt && (
                      <p className="text-xs text-emerald-600 font-semibold">
                        Ultima exportacion: {formatDateTime(lastExportAt)}
                      </p>
                    )}
                  </div>

                  {previewRows.length === 0 ? (
                    <div className="p-6 text-sm text-gray-500">No hay resultados para mostrar.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Codigo</th>
                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Proyecto</th>
                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Tipo de prueba</th>
                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Estado</th>
                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Fecha</th>
                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Resultado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {previewRows.map((sample) => {
                            const templateId = String(sample?.template?.id || sample?.templateId || '');
                            const projectId = String(sample?.project?.id || sample?.projectId || '');
                            const template = templatesById.get(templateId) || sample?.template;
                            const project = projectsById.get(projectId) || sample?.project;
                            const values = sample?.sampleFieldValues || sample?.values || [];
                            const fieldNameResolver = (fieldId) => templateFieldColumnMap.get(fieldId)?.split(' - ').slice(1).join(' - ');

                            return (
                              <tr key={sample.id || sample.code}>
                                <td className="px-4 py-3 text-xs font-semibold text-teal-700">
                                  {getSampleCode(sample) || '-'}
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-700">
                                  {firstNonEmptyText(project?.name, '-')}
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-700">
                                  {firstNonEmptyText(template?.name, '-')}
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-700 uppercase font-bold">
                                  {getSampleStatus(sample)}
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-600">
                                  {formatDateTime(getSampleDate(sample))}
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-700">
                                  {buildResultSummary(values, fieldNameResolver)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-emerald-600 px-5 py-4 text-white">
              <h3 className="text-lg font-bold">Confirmar exportacion</h3>
              <p className="text-xs text-emerald-100">Se exportarán {filteredSamples.length} muestras.</p>
            </div>
            <div className="p-5 space-y-3 text-sm text-gray-600">
              <p>
                El archivo incluira una hoja de resultados. El archivo contiene la información relevante de los resultados, como identificador de muestra, tipo de prueba, resultado obtenido y fecha.
              </p>
              {exportError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3">
                  {exportError}
                </div>
              )}
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExportConfirm}
                className="flex-1 px-4 py-2 rounded-lg !border-emerald-600 !bg-emerald-600 !text-white font-bold hover:!bg-emerald-700 transition"
              >
                Confirmar y descargar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
