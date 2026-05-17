import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { faArrowLeft, faChevronRight, faDownload } from '@fortawesome/free-solid-svg-icons';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import Icon from '../components/Icon';
import { apiService } from '../services/api';
import * as XLSX from 'xlsx';

function formatDisplayDate(value) {
  if (!value) return '-';

  const rawValue = String(value || '').trim();

  if (!rawValue) return '-';

  const datePartMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (datePartMatch) {
    const year = Number(datePartMatch[1]);
    const month = Number(datePartMatch[2]);
    const day = Number(datePartMatch[3]);

    const utcDate = new Date(Date.UTC(year, month - 1, day));
    return utcDate.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC'
    });
  }

  return rawValue;
}

function getProjectStatusMeta(status) {
  const normalized = String(status || 'active').trim().toLowerCase();

  if (normalized === 'on_hold') {
    return {
      label: 'EN PAUSA',
      classes: 'text-blue-700 bg-blue-50 border border-blue-100'
    };
  }

  if (normalized === 'completed') {
    return {
      label: 'COMPLETADO',
      classes: 'text-emerald-700 bg-emerald-50 border border-emerald-100'
    };
  }

  if (normalized === 'archived') {
    return {
      label: 'ARCHIVADO',
      classes: 'text-gray-600 bg-gray-100 border border-gray-200'
    };
  }

  if (normalized === 'inactive') {
    return {
      label: 'INACTIVO',
      classes: 'text-amber-700 bg-amber-50 border border-amber-100'
    };
  }

  return {
    label: 'ACTIVO',
    classes: 'text-emerald-700 bg-emerald-50 border border-emerald-100'
  };
}

function getSampleStatusMeta(status) {
  const rawStatus = String(status || '').trim();
  const normalized = rawStatus.toLowerCase();
  const translatedLabel =
    normalized === 'pending'
      ? 'Pendiente'
      : normalized === 'completed'
        ? 'Completada'
        : normalized === 'rejected'
          ? 'Rechazada'
          : rawStatus || '-';

  if (['processed', 'completed', 'done'].includes(normalized)) {
    return {
      label: translatedLabel,
      classes: 'text-emerald-700 bg-emerald-50'
    };
  }

  if (['testing', 'in testing', 'in_progress', 'in progress'].includes(normalized)) {
    return {
      label: translatedLabel,
      classes: 'text-amber-700 bg-amber-100'
    };
  }

  if (['pending'].includes(normalized)) {
    return {
      label: translatedLabel,
      classes: 'text-blue-700 bg-blue-100'
    };
  }

  if (normalized === 'rejected') {
    return {
      label: translatedLabel,
      classes: 'text-red-700 bg-red-100'
    };
  }

  return {
    label: translatedLabel,
    classes: 'text-gray-600 bg-gray-200'
  };
}

function normalizeSample(rawSample, index) {
  const sampleId = String(rawSample?.sampleId || rawSample?.code || rawSample?.id || `sample-${index + 1}`);

  // Extraer templateName de forma robusta
  let templateName = '-';
  if (rawSample?.templateName && typeof rawSample.templateName === 'string') {
    templateName = rawSample.templateName;
  } else if (rawSample?.template) {
    if (typeof rawSample.template === 'string') {
      templateName = rawSample.template;
    } else if (rawSample.template?.name && typeof rawSample.template.name === 'string') {
      templateName = rawSample.template.name;
    }
  }

  return {
    id: String(rawSample?.id || sampleId || `sample-row-${index + 1}`),
    sampleId,
    status: String(rawSample?.status || '').trim(),
    template: templateName,
    createdAt: String(rawSample?.createdAt || rawSample?.receivedAt || rawSample?.updatedAt || ''),
    values: rawSample?.values || {}
  };
}

function getReportStatus(samples = []) {
  if (!Array.isArray(samples) || samples.length === 0) return 'SIN DATOS';

  const statuses = samples.map(s => String(s?.status || '').toLowerCase());
  const completed = statuses.filter(s => ['processed', 'completed', 'done'].includes(s)).length;
  const total = statuses.length;

  if (completed === total) return 'COMPLETADO';
  if (completed === 0) return 'PENDIENTE';
  return 'EN PROCESO';
}

function formatDateForReport(dateString) {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '-';
  }
}

function downloadTemplateReport(template, project) {
  if (!Array.isArray(template.samples) || template.samples.length === 0) {
    alert('No hay muestras para generar el reporte');
    return;
  }

  const fileName = `Reporte_${template.name}_${new Date().toISOString().split('T')[0]}.xlsx`;

  const rows = template.samples.map((sample, index) => ({
    '#': index + 1,
    'Código de Muestra': sample?.code || sample?.sampleId || '-',
    'Plantilla': template.name,
    'Estado': String(sample?.status || 'Pendiente'),
    'Fecha Creación': formatDateForReport(sample?.createdAt || sample?.receivedAt),
    'Proyecto': project.name
  }));

  const summaryRows = [
    ['REPORTE DE RESULTADOS'],
    ['Proyecto', project.name],
    ['Plantilla', template.name],
    ['Fecha de Exportación', formatDateForReport(new Date().toISOString())],
    [],
    ['RESUMEN'],
    ['Total de Muestras', template.samples.length],
    ['Completadas', template.samples.filter(s => ['processed', 'completed', 'done'].includes(String(s?.status || '').toLowerCase())).length],
    ['Pendientes', template.samples.filter(s => String(s?.status || '').toLowerCase() === 'pending').length],
    ['Rechazadas', template.samples.filter(s => String(s?.status || '').toLowerCase() === 'rejected').length]
  ];

  const workbook = XLSX.utils.book_new();
  const resultsSheet = XLSX.utils.json_to_sheet(rows);
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);

  XLSX.utils.book_append_sheet(workbook, resultsSheet, 'Resultados');
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');
  XLSX.writeFile(workbook, fileName);
}

export default function ProjectDetailPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedTemplateId, setExpandedTemplateId] = useState(null);
  const [showReportsModal, setShowReportsModal] = useState(false);

  useEffect(() => {
    const loadProjectDetail = async () => {
      try {
        setLoading(true);
        setError('');

        const projectResponse = await apiService.projects.getById(projectId);
        const projectData = projectResponse?.data || projectResponse;

        // Cargar muestras por separado con manejo de errores
        let samplesData = [];
        try {
          const samplesResponse = await apiService.samples.getAll(projectId);
          samplesData = Array.isArray(samplesResponse) ? samplesResponse : (samplesResponse?.data || []);
          
          // Filtrar solo las muestras del proyecto actual
          samplesData = samplesData.filter(sample => {
            const sampleProjectId = sample?.project?.id || sample?.projectId;
            return String(sampleProjectId) === String(projectId);
          });
        } catch (samplesErr) {
          console.warn('Error cargando muestras:', samplesErr);
          samplesData = [];
        }

        console.log('Samples cargadas:', samplesData);

        // Agrupar muestras por plantilla
        const templateMap = {};
        if (Array.isArray(samplesData)) {
          samplesData.forEach((sample) => {
            // Extraer templateName de forma robusta
            let templateName = 'Sin plantilla';
            if (sample?.templateName && typeof sample.templateName === 'string') {
              templateName = sample.templateName;
            } else if (sample?.template) {
              // Si template es un objeto, intenta extraer el name
              if (typeof sample.template === 'string') {
                templateName = sample.template;
              } else if (sample.template?.name && typeof sample.template.name === 'string') {
                templateName = sample.template.name;
              }
            }

            if (!templateMap[templateName]) {
              templateMap[templateName] = {
                id: `template-${Object.keys(templateMap).length + 1}`,
                name: templateName,
                samples: []
              };
            }
            templateMap[templateName].samples.push(sample);
          });
        }

        const templates = Object.values(templateMap);
        console.log('Templates agrupadas:', templates);

        setProject({
          id: projectData?.id || projectData?._id || projectId,
          name: projectData?.name || projectData?.title || 'Proyecto sin nombre',
          status: projectData?.status || 'active',
          description: projectData?.description || '',
          createdAt: projectData?.createdAt || projectData?.created_at || '',
          endDate: projectData?.endDate || projectData?.dueDate || '',
          clientName: projectData?.client?.name || projectData?.clientName || '-',
          clientId: projectData?.client?.id || projectData?.clientId || '',
          clientPhone: projectData?.client?.phone || projectData?.client?.phoneNumber || '-',
          clientEmail: projectData?.client?.email || projectData?.client?.contactEmail || '-',
          clientAddress: projectData?.client?.address || projectData?.client?.direccion || '-',
          clientStatus: projectData?.client?.status || 'ACTIVO',
          templates: templates
        });
      } catch (err) {
        console.error('Error en loadProjectDetail:', err);
        setError(String(err?.message || 'No se pudo cargar el detalle del proyecto.'));
      } finally {
        setLoading(false);
      }
    };

    if (projectId) {
      loadProjectDetail();
    }
  }, [projectId]);

  const handleGoBack = () => {
    navigate('/projects');
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Navbar />
          <main className="flex-1 overflow-auto flex items-center justify-center">
            <div className="text-center">
              <p className="text-gray-500">Cargando detalles del proyecto...</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Navbar />
          <main className="flex-1 overflow-auto">
            <div className="p-6 md:p-8">
              <button
                type="button"
                onClick={handleGoBack}
                className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-semibold mb-4"
              >
                <Icon icon={faArrowLeft} size={16} color="currentColor" />
                Proyectos
              </button>

              <div className="mt-5 p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
                {error || 'No se encontró el proyecto.'}
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const statusMeta = getProjectStatusMeta(project.status);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar />

        <main className="flex-1 overflow-auto">
          <div className="p-6 md:p-8">
            <button
              type="button"
              onClick={handleGoBack}
              className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-semibold mb-4"
            >
              <Icon icon={faArrowLeft} size={16} color="currentColor" />
              Proyectos
            </button>

            {/* Encabezado del proyecto */}
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
              <div>
                <h1 className="text-4xl font-bold text-gray-900">{project.name}</h1>
                <p className="text-sm text-gray-500 mt-2">ID: {project.id}</p>
              </div>
              <span className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold tracking-wide ${statusMeta.classes}`}>
                {statusMeta.label}
              </span>
            </div>

            {/* Sección Resumen */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
              <div className="px-6 py-5 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">Resumen</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 px-6 py-6">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Estado</p>
                  <p className="text-sm font-semibold text-gray-900">{statusMeta.label}</p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Fecha de Creación</p>
                  <p className="text-sm font-semibold text-gray-900">{formatDisplayDate(project.createdAt)}</p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Fecha Límite</p>
                  <p className="text-sm font-semibold text-gray-900">{formatDisplayDate(project.endDate)}</p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Descripción</p>
                  <p className="text-sm font-semibold text-gray-900">{project.description || '-'}</p>
                </div>
              </div>
            </div>

            {/* Sección Cliente */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">Cliente</h2>
              </div>

              <div className="px-6 py-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Información del cliente - Izquierda */}
                  <div className="space-y-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Nombre</p>
                      <p className="text-sm font-semibold text-gray-900">{project.clientName}</p>
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Email</p>
                      <p className="text-sm font-semibold text-gray-900">{project.clientEmail}</p>
                    </div>
                  </div>

                  {/* Información del cliente - Derecha */}
                  <div className="space-y-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Teléfono</p>
                      <p className="text-sm font-semibold text-gray-900">{project.clientPhone}</p>
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Estado</p>
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                        {project.clientStatus}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Dirección */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Dirección</p>
                  <p className="text-sm font-semibold text-gray-900">{project.clientAddress}</p>
                </div>
              </div>
            </div>

            {/* Sección Plantillas */}
            {project.templates && project.templates.length > 0 && (
              <div className="mt-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Plantillas</h2>
                <div className="space-y-4">
                  {project.templates.map((template) => {
                    const isExpanded = template.id === expandedTemplateId;
                    const templateSamples = (template.samples || []).map((sample, idx) => normalizeSample(sample, idx));

                    return (
                      <div key={template.id}>
                        {/* Template Card */}
                        <article
                          className="bg-white border border-gray-200 rounded-lg shadow-sm px-5 md:px-6 py-4 flex items-center justify-between gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                        >
                          <div className="flex items-center gap-4 min-w-0 flex-1">
                            <div className="w-12 h-12 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center text-lg font-semibold">
                              {String(template.name || 'T').charAt(0)}
                            </div>

                            <div className="min-w-0">
                              <h4 className="text-lg font-semibold text-gray-900 truncate">{template.name}</h4>
                              <p className="text-sm text-gray-500 mt-1">{templateSamples.length} muestra{templateSamples.length !== 1 ? 's' : ''}</p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setExpandedTemplateId(isExpanded ? null : template.id)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-transparent! border-0! p-0! text-gray-400 hover:text-gray-600 transition-colors"
                            aria-label={isExpanded ? 'Contraer muestras' : 'Expandir muestras'}
                          >
                            <span className={`text-xl leading-none transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                              ›
                            </span>
                          </button>
                        </article>

                        {/* Samples Table */}
                        {isExpanded && (
                          <section className="mt-4 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                  <tr>
                                    <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Código de Muestra</th>
                                    <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Estado</th>
                                    <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Fecha de Creación</th>
                                    <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Valores Clave</th>
                                  </tr>
                                </thead>

                                <tbody>
                                  {templateSamples.length === 0 ? (
                                    <tr>
                                      <td colSpan="4" className="px-6 py-8 text-center text-sm text-gray-500">
                                        No hay muestras para esta plantilla.
                                      </td>
                                    </tr>
                                  ) : (
                                    templateSamples.map((sample) => {
                                      const sampleStatusMeta = getSampleStatusMeta(sample.status);
                                      const sampleCode = sample.code || sample.sampleId || '-';
                                      const createdAtDate = sample.createdAt || sample.creationDate || '';

                                      return (
                                        <tr
                                          key={sample.id}
                                          className="border-b border-gray-100 hover:bg-gray-50 transition-colors duration-200"
                                        >
                                          <td className="px-6 py-4 text-sm font-semibold text-gray-900">{sampleCode}</td>
                                          <td className="px-6 py-4 text-sm">
                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold uppercase ${sampleStatusMeta.classes}`}>
                                              {sampleStatusMeta.label}
                                            </span>
                                          </td>
                                          <td className="px-6 py-4 text-sm text-gray-600">{formatDisplayDate(createdAtDate)}</td>
                                          <td className="px-6 py-4 text-sm text-gray-600">
                                            {sample.template || '-'}
                                          </td>
                                        </tr>
                                      );
                                    })
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </section>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sección Reportes */}
            {project.templates && project.templates.length > 0 && (
              <div className="mt-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Reportes</h2>
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Reporte</th>
                          <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Estado</th>
                          <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Muestras</th>
                          <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Fecha</th>
                          <th className="px-6 py-4 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-500">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {project.templates.map((template) => {
                          const reportStatus = getReportStatus(template.samples);
                          const statusMeta = 
                            reportStatus === 'COMPLETADO' 
                              ? { classes: 'text-emerald-700 bg-emerald-50' }
                              : reportStatus === 'EN PROCESO'
                                ? { classes: 'text-amber-700 bg-amber-50' }
                                : { classes: 'text-blue-700 bg-blue-50' };
                          
                          const latestDate = template.samples.length > 0
                            ? new Date(
                                Math.max(
                                  ...template.samples
                                    .map(s => new Date(s?.createdAt || s?.receivedAt || new Date()).getTime())
                                    .filter(t => !Number.isNaN(t))
                                )
                              ).toISOString()
                            : '';

                          return (
                            <tr key={template.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                                Reporte {template.name}
                              </td>
                              <td className="px-6 py-4 text-sm">
                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusMeta.classes}`}>
                                  {reportStatus}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                {template.samples.length} muestra{template.samples.length !== 1 ? 's' : ''}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                {formatDateForReport(latestDate)}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => downloadTemplateReport(template, project)}
                                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
                                >
                                  <Icon icon={faDownload} size={12} color="currentColor" />
                                  Descargar
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}</div>
        </main>
      </div>
    </div>
  );
}
