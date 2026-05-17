import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { faTriangleExclamation, faMagnifyingGlass, faFile } from '@fortawesome/free-solid-svg-icons';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import Icon from '../components/Icon';
import { apiService } from '../services/api';

const INITIAL_PROJECT_FORM = {
  name: '',
  clientId: '',
  endDate: '',
  description: '',
  status: 'active'
};

const INITIAL_FILTERS = {
  name: '',
  clientId: '',
  status: '',
  fromDate: '',
  toDate: '',
};

const FLUXLAB_CLIENT_NORMALIZED_NAME = 'fluxlab';

function normalizeClientNameForMatch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function getDefaultProjectClientId(clients = []) {
  if (!Array.isArray(clients) || clients.length === 0) {
    return '';
  }

  const fluxLabClient = clients.find(
    (client) =>
      normalizeClientNameForMatch(client?.name) === FLUXLAB_CLIENT_NORMALIZED_NAME,
  );

  return String(fluxLabClient?.id || clients[0]?.id || '').trim();
}

function normalizeProjectFilters(filters) {
  return {
    name: String(filters?.name || '').trim(),
    clientId: String(filters?.clientId || '').trim(),
    status: String(filters?.status || '').trim(),
    fromDate: String(filters?.fromDate || '').trim(),
    toDate: String(filters?.toDate || '').trim(),
  };
}

function hasActiveProjectFilters(filters) {
  const normalizedFilters = normalizeProjectFilters(filters);

  return (
    Boolean(normalizedFilters.name) ||
    Boolean(normalizedFilters.clientId) ||
    Boolean(normalizedFilters.status) ||
    Boolean(normalizedFilters.fromDate) ||
    Boolean(normalizedFilters.toDate)
  );
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toSafeText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
}

function firstNonEmptyText(...values) {
  for (const value of values) {
    const text = toSafeText(value);

    if (text) {
      return text;
    }
  }

  return '';
}

function parseCollection(payload, keys = []) {
  if (Array.isArray(payload)) {
    return payload;
  }

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) {
      return payload[key];
    }
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.data?.items)) {
    return payload.data.items;
  }

  return [];
}

function normalizeProjectStatus(value) {
  const normalized = String(value || 'active').trim().toLowerCase();

  if (['on hold', 'on-hold', 'on_hold', 'paused'].includes(normalized)) {
    return 'on_hold';
  }

  if (['completed', 'done', 'finished', 'closed'].includes(normalized)) {
    return 'completed';
  }

  if (['archived', 'archive'].includes(normalized)) {
    return 'archived';
  }

  if (['inactive', 'disabled'].includes(normalized)) {
    return 'inactive';
  }

  return 'active';
}

function normalizeEditableProjectStatus(value) {
  return normalizeProjectStatus(value) === 'inactive' ? 'inactive' : 'active';
}

function getProjectStatusMeta(status) {
  if (status === 'on_hold') {
    return {
      label: 'EN PAUSA',
      classes: 'text-blue-700 bg-blue-50 border border-blue-100'
    };
  }

  if (status === 'completed') {
    return {
      label: 'COMPLETADO',
      classes: 'text-emerald-700 bg-emerald-50 border border-emerald-100'
    };
  }

  if (status === 'archived') {
    return {
      label: 'ARCHIVADO',
      classes: 'text-gray-600 bg-gray-100 border border-gray-200'
    };
  }

  if (status === 'inactive') {
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

function translateStatus(status) {
  const lowerStatus = toSafeText(status).toLowerCase();
  switch (lowerStatus) {
    case 'active':
      return 'Activo';
    case 'inactive':
      return 'Inactivo';
    case 'on_hold':
      return 'En Pausa';
    case 'completed':
      return 'Completado';
    case 'archived':
      return 'Archivado';
    default:
      return toSafeText(status);
  }
}

function normalizeSampleStatus(value) {
  return toSafeText(value);
}

function getSampleStatusMeta(status) {
  const rawStatus = toSafeText(status);
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

function parseDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDisplayDate(value) {
  const rawValue = toSafeText(value);

  if (!rawValue) {
    return '-';
  }

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

  const parsed = parseDate(rawValue);

  if (!parsed) {
    return '-';
  }

  return parsed.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function formatInputDate(value) {
  const rawValue = toSafeText(value);

  if (!rawValue) {
    return '';
  }

  const datePartMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (datePartMatch) {
    return `${datePartMatch[1]}-${datePartMatch[2]}-${datePartMatch[3]}`;
  }

  const parsed = parseDate(rawValue);

  if (!parsed) {
    return '';
  }

  const year = String(parsed.getUTCFullYear());
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatApiDate(value) {
  const rawValue = toSafeText(value);

  if (!rawValue) {
    return undefined;
  }

  const datePartMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!datePartMatch) {
    return undefined;
  }

  // Midday UTC avoids day-shift when backend converts through Date in local timezone.
  return `${datePartMatch[1]}-${datePartMatch[2]}-${datePartMatch[3]}T12:00:00.000Z`;
}

function formatLocalDateForInput(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getCreateEndDateBounds() {
  const today = new Date();
  const maxDate = new Date(today);
  maxDate.setFullYear(maxDate.getFullYear() + 5);

  return {
    min: formatLocalDateForInput(today),
    max: formatLocalDateForInput(maxDate)
  };
}

function normalizeProject(rawProject, index) {
  const resolvedId = firstNonEmptyText(
    rawProject?.id,
    rawProject?._id,
    rawProject?.uuid,
    rawProject?.projectId,
    `project-${index + 1}`
  );

  const status = normalizeProjectStatus(rawProject?.status);
  const templates = Array.isArray(rawProject?.templates) ? rawProject.templates : [];

  const samplesFromTemplates = templates.flatMap((template) => {
    const templateName = firstNonEmptyText(template?.name, '-');
    const templateId = firstNonEmptyText(template?.id);
    const templateSamples = Array.isArray(template?.samples) ? template.samples : [];

    return templateSamples.map((sample) => ({
      ...sample,
      templateName: firstNonEmptyText(sample?.templateName, templateName),
      templateId: firstNonEmptyText(sample?.templateId, templateId),
      projectId: firstNonEmptyText(
        sample?.projectId,
        rawProject?.id,
        rawProject?._id,
        rawProject?.uuid,
        rawProject?.projectId
      )
    }));
  });

  const directSamples = Array.isArray(rawProject?.samples) ? rawProject.samples : [];
  const allProjectSamples = [...samplesFromTemplates, ...directSamples];

  const recentSamplesSorted = [...allProjectSamples].sort((leftSample, rightSample) => {
    const leftTime =
      parseDate(
        firstNonEmptyText(
          leftSample?.createdAt,
          leftSample?.receivedAt,
          leftSample?.updatedAt
        )
      )?.getTime() || 0;

    const rightTime =
      parseDate(
        firstNonEmptyText(
          rightSample?.createdAt,
          rightSample?.receivedAt,
          rightSample?.updatedAt
        )
      )?.getTime() || 0;

    return rightTime - leftTime;
  });

  return {
    id: resolvedId,
    name: firstNonEmptyText(rawProject?.name, rawProject?.title, `Proyecto ${index + 1}`),
    status,
    description: firstNonEmptyText(rawProject?.description),
    createdAt: firstNonEmptyText(rawProject?.createdAt, rawProject?.created_at),
    clientName: firstNonEmptyText(
      rawProject?.client?.name,
      rawProject?.clientName,
      rawProject?.client?.companyName,
      rawProject?.client?.organization,
      '-'
    ),
    clientId: firstNonEmptyText(rawProject?.clientId, rawProject?.client?.id),
    associatedSamplesCount: toNumber(
      rawProject?.associatedSamplesCount ??
        rawProject?.associatedSamples ??
        rawProject?.samplesCount ??
        rawProject?.sampleCount ??
        rawProject?.totalSamples ??
        allProjectSamples.length,
      0
    ),
    dueDate: firstNonEmptyText(rawProject?.endDate, rawProject?.dueDate, rawProject?.targetDate),
    startDate: firstNonEmptyText(rawProject?.startDate),
    endDate: firstNonEmptyText(rawProject?.endDate),
    recentSamplesRaw: recentSamplesSorted,
    templatesCount: templates.length
  };
}

function normalizeSample(rawSample, index) {
  const sampleId = firstNonEmptyText(
    rawSample?.sampleId,
    rawSample?.code,
    rawSample?.id,
    `sample-${index + 1}`
  );

  const projectId = firstNonEmptyText(
    rawSample?.projectId,
    rawSample?.project?.id,
    rawSample?.project?._id,
    rawSample?.project?.uuid,
    rawSample?.project?.projectId,
    rawSample?.project?.code
  );

  const sampleInternalId = firstNonEmptyText(rawSample?.id, sampleId, `sample-row-${index + 1}`);

  return {
    id: sampleInternalId,
    sampleId,
    projectId,
    status: normalizeSampleStatus(rawSample?.status),
    template: firstNonEmptyText(
      rawSample?.template,
      rawSample?.templateName,
      rawSample?.assayTemplate,
      rawSample?.name,
      '-'
    ),
    createdAt: firstNonEmptyText(rawSample?.createdAt, rawSample?.receivedAt, rawSample?.updatedAt)
  };
}

function parseProjectsResponse(payload) {
  const projects = parseCollection(payload, ['projects', 'items', 'results']);
  return projects.map((item, index) => normalizeProject(item, index));
}

function parseClientsResponse(payload) {
  const clients = parseCollection(payload, ['clients', 'items', 'results']);

  return clients.map((rawClient, index) => ({
    id:
      rawClient?.id ||
      rawClient?._id ||
      rawClient?.uuid ||
      `client-${index + 1}`,
    name:
      rawClient?.name ||
      rawClient?.clientName ||
      rawClient?.companyName ||
      rawClient?.organization ||
      `Cliente ${index + 1}`
  }));
}

function mergeProjectsWithRepository(baseProjects, repositoryProjects, includeRepositoryOnly = false) {
  if (!baseProjects.length && !repositoryProjects.length) {
    return [];
  }

  const repositoryById = new Map(
    repositoryProjects.map((project) => [String(project.id), project])
  );

  const mergedProjects = baseProjects.map((project) => {
    const repositoryProject = repositoryById.get(String(project.id));

    if (!repositoryProject) {
      return project;
    }

    return {
      ...project,
      recentSamplesRaw: repositoryProject.recentSamplesRaw,
      templatesCount: repositoryProject.templatesCount,
      associatedSamplesCount:
        repositoryProject.associatedSamplesCount > 0
          ? repositoryProject.associatedSamplesCount
          : project.associatedSamplesCount
    };
  });

  if (!includeRepositoryOnly) {
    return mergedProjects;
  }

  const mergedIds = new Set(mergedProjects.map((project) => String(project.id)));
  const repositoryOnlyProjects = repositoryProjects.filter(
    (project) => !mergedIds.has(String(project.id)),
  );

  return [...mergedProjects, ...repositoryOnlyProjects];
}

function isSameId(left, right) {
  return String(left || '').trim() === String(right || '').trim();
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const createEndDateBounds = useMemo(() => getCreateEndDateBounds(), []);

  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [repositoryProjects, setRepositoryProjects] = useState([]);
  const [availableStatuses, setAvailableStatuses] = useState([]);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestsVersionRef = useRef(0);
  const hasInitializedFiltersRef = useRef(false);

  const [expandedProjectId, setExpandedProjectId] = useState(null);

  const [showProjectModal, setShowProjectModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [projectForm, setProjectForm] = useState(INITIAL_PROJECT_FORM);
  const [projectFormError, setProjectFormError] = useState('');
  const [submittingProject, setSubmittingProject] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState(null);

  const loadPageData = async () => {
    const requestVersion = requestsVersionRef.current + 1;
    requestsVersionRef.current = requestVersion;

    setLoading(true);
    setError('');

    try {
      const [projectsResult, repositoryResult, clientsResult, statusesResult] =
        await Promise.allSettled([
          apiService.projects.getAll(),
          apiService.samples.getRepository(),
          apiService.clients.getAll(),
          apiService.projects.getAvailableStatuses(),
        ]);

      if (requestVersion !== requestsVersionRef.current) {
        return;
      }

      const errors = [];
      let baseProjects = [];
      let fetchedRepositoryProjects = [];

      if (projectsResult.status === 'fulfilled') {
        baseProjects = parseProjectsResponse(projectsResult.value);
      } else {
        errors.push(String(projectsResult.reason?.message || 'No se pudieron cargar los proyectos desde el backend.'));
      }

      if (repositoryResult.status === 'fulfilled') {
        fetchedRepositoryProjects = parseProjectsResponse(repositoryResult.value);
      } else {
        errors.push(String(repositoryResult.reason?.message || 'No se pudo cargar el repositorio de muestras desde el backend.'));
      }

      setRepositoryProjects(fetchedRepositoryProjects);

      setProjects(
        mergeProjectsWithRepository(baseProjects, fetchedRepositoryProjects, true)
      );

      if (clientsResult.status === 'fulfilled') {
        setClients(parseClientsResponse(clientsResult.value));
      } else {
        setClients([]);
        errors.push(String(clientsResult.reason?.message || 'No se pudieron cargar los clientes desde el backend.'));
      }

      if (statusesResult.status === 'fulfilled') {
        setAvailableStatuses(statusesResult.value || []);
      } else {
        setAvailableStatuses([]);
        errors.push(
          String(
            statusesResult.reason?.message ||
              'No se pudieron cargar los estados de los proyectos.',
          ),
        );
      }

      setError(errors.join(' '));
    } finally {
      if (requestVersion === requestsVersionRef.current) {
        setLoading(false);
      }
    }
  };

  const applyFilters = async (nextFilters = filters) => {
    const normalizedFilters = normalizeProjectFilters(nextFilters);

    if (!hasActiveProjectFilters(normalizedFilters)) {
      await loadPageData();
      return;
    }

    if (
      normalizedFilters.fromDate &&
      normalizedFilters.toDate &&
      normalizedFilters.fromDate > normalizedFilters.toDate
    ) {
      requestsVersionRef.current += 1;
      setLoading(false);
      setError('La fecha "Desde" no puede ser mayor que la fecha "Hasta".');
      return;
    }

    const requestVersion = requestsVersionRef.current + 1;
    requestsVersionRef.current = requestVersion;

    setLoading(true);
    setError('');

    try {
      const response = await apiService.projects.getAll(normalizedFilters);

      if (requestVersion !== requestsVersionRef.current) {
        return;
      }

      const parsedProjects = parseProjectsResponse(response);
      setProjects(mergeProjectsWithRepository(parsedProjects, repositoryProjects));
    } catch (err) {
      if (requestVersion !== requestsVersionRef.current) {
        return;
      }

      const errorMessage =
        err.response?.data?.message || err.message || 'Fallo al aplicar los cambios';
      setError(errorMessage);
      setProjects([]);
    } finally {
      if (requestVersion === requestsVersionRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadPageData();
  }, []);

  useEffect(() => {
    if (!hasInitializedFiltersRef.current) {
      hasInitializedFiltersRef.current = true;
      return undefined;
    }

    const delayDebounceFn = setTimeout(() => {
      applyFilters(filters);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [filters]);

  useEffect(() => {
    if (!expandedProjectId) {
      return;
    }

    const exists = projects.some((project) => isSameId(project.id, expandedProjectId));

    if (!exists) {
      setExpandedProjectId(null);
    }
  }, [projects, expandedProjectId]);

  const projectRows = useMemo(() => {
    return projects.map((project) => ({
      ...project,
      collapsedSubtitle: `${project.id} - ${project.clientName}`
    }));
  }, [projects]);

  const expandedProject = useMemo(() => {
    if (!expandedProjectId) {
      return null;
    }

    return projectRows.find((project) => isSameId(project.id, expandedProjectId)) || null;
  }, [projectRows, expandedProjectId]);

  const editingProject = useMemo(() => {
    if (!editingProjectId) {
      return null;
    }

    return projects.find((project) => isSameId(project.id, editingProjectId)) || null;
  }, [projects, editingProjectId]);

  const editEndDateMin = useMemo(() => {
    if (!editingProject) {
      return '';
    }

    return formatInputDate(editingProject.createdAt);
  }, [editingProject]);

  const expandedProjectSamples = useMemo(() => {
    if (!expandedProject) {
      return [];
    }
    return expandedProject.recentSamplesRaw.map((sample, index) => normalizeSample(sample, index));
  }, [expandedProject]);

  const associatedSamplesCount = useMemo(() => {
    if (!expandedProject) {
      return 0;
    }

    if (expandedProject.associatedSamplesCount > 0) {
      return expandedProject.associatedSamplesCount;
    }

    return expandedProjectSamples.length;
  }, [expandedProject, expandedProjectSamples]);

  useEffect(() => {
    if (!showProjectModal || projectForm.clientId) {
      return;
    }

    const fallbackClientId = getDefaultProjectClientId(clients);

    if (!fallbackClientId) {
      return;
    }

    setProjectForm((currentForm) => ({
      ...currentForm,
      clientId: fallbackClientId,
    }));
  }, [showProjectModal, clients, projectForm.clientId]);

  const openCreateModal = () => {
    const defaultClientId = getDefaultProjectClientId(clients);

    setModalMode('create');
    setEditingProjectId(null);
    setProjectForm({
      ...INITIAL_PROJECT_FORM,
      clientId: defaultClientId,
    });
    setProjectFormError('');
    setShowProjectModal(true);
  };

  const openEditModal = (project) => {
    const matchingClient = clients.find(
      (client) =>
        String(client.name).trim().toLowerCase() ===
        String(project.clientName || '').trim().toLowerCase()
    );

    const resolvedClientId =
      project.clientId ||
      matchingClient?.id ||
      getDefaultProjectClientId(clients);

    setModalMode('edit');
    setEditingProjectId(project.id);
    setProjectForm({
      name: project.name || '',
      clientId: resolvedClientId,
      endDate: formatInputDate(project.endDate || project.dueDate),
      description: project.description || '',
      status: normalizeEditableProjectStatus(project.status)
    });
    setProjectFormError('');
    setShowProjectModal(true);
  };

  const closeModal = () => {
    setShowProjectModal(false);
    setProjectFormError('');
    setEditingProjectId(null);
  };

  const handleProjectFormChange = (event) => {
    const { name, value } = event.target;

    setProjectForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const handleProjectSubmit = async (event) => {
    event.preventDefault();

    const trimmedName = projectForm.name.trim();
    const selectedClientId = String(projectForm.clientId || '').trim();
    const trimmedEndDate = projectForm.endDate.trim();

    if (!trimmedName) {
      setProjectFormError('El nombre del proyecto es obligatorio.');
      return;
    }

    if (!selectedClientId) {
      setProjectFormError('Debes seleccionar un cliente para el proyecto.');
      return;
    }

    const selectedClientExists = clients.some(
      (client) => String(client.id || '').trim() === selectedClientId,
    );

    if (!selectedClientExists) {
      setProjectFormError('Selecciona un cliente valido para el proyecto.');
      return;
    }

    if (trimmedEndDate) {
      const minAllowedEndDate =
        modalMode === 'edit'
          ? editEndDateMin
          : createEndDateBounds.min;

      if (minAllowedEndDate && trimmedEndDate < minAllowedEndDate) {
        setProjectFormError(
          modalMode === 'edit'
            ? 'La fecha de finalizacion no puede ser menor al createdAt del proyecto.'
            : 'La fecha de finalizacion no puede ser menor a la fecha actual.'
        );
        return;
      }

      if (trimmedEndDate > createEndDateBounds.max) {
        setProjectFormError('La fecha de finalizacion no puede superar 5 anos desde hoy.');
        return;
      }
    }

    setSubmittingProject(true);
    setProjectFormError('');

    try {
      const normalizedEndDate = formatApiDate(projectForm.endDate);
      const normalizedStatus =
        modalMode === 'edit'
          ? projectForm.status === 'inactive'
            ? 'inactive'
            : 'active'
          : 'active';

      const payload = {
        name: trimmedName,
        description: projectForm.description.trim() || undefined,
        endDate: normalizedEndDate,
        status: normalizedStatus,
        clientId: selectedClientId
      };

      if (modalMode === 'edit' && editingProjectId) {
        await apiService.projects.update(editingProjectId, payload);
      } else {
        await apiService.projects.create(payload);
      }

      closeModal();
      await loadPageData();
    } catch (submitError) {
      setProjectFormError(String(submitError?.message || 'No se pudo guardar el proyecto.'));
    } finally {
      setSubmittingProject(false);
    }
  };

  const handleDeleteProject = (project) => {
    setProjectToDelete(project);
    setShowDeleteModal(true);
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) {
      return;
    }

    try {
      setDeletingProjectId(projectToDelete.id);
      await apiService.projects.remove(projectToDelete.id);
      await loadPageData();
      if (isSameId(expandedProjectId, projectToDelete.id)) {
        setExpandedProjectId(null);
      }
      setShowDeleteModal(false);
      setProjectToDelete(null);
    } catch (deleteError) {
      setError(String(deleteError?.message || 'No se pudo eliminar el proyecto.'));
      setShowDeleteModal(false);
      setProjectToDelete(null);
    } finally {
      setDeletingProjectId(null);
    }
  };

  const toggleExpandedProject = (projectId) => {
    setExpandedProjectId((current) => (isSameId(current, projectId) ? null : projectId));
  };

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((prevFilters) => ({
      ...prevFilters,
      [name]: value,
    }));
  };

  const clearFilters = () => {
    setError('');
    setFilters(INITIAL_FILTERS);
  };

  const retryLoad = () => {
    if (hasActiveProjectFilters(filters)) {
      applyFilters(filters);
      return;
    }

    loadPageData();
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar />

        <main className="flex-1 overflow-auto">
          <div className="p-6 md:p-8">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mt-2">Proyectos de Investigación</h1>
              </div>

              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center justify-center gap-2 bg-emerald-500! hover:bg-emerald-600! text-gray-900! hover:text-white! font-semibold px-5! py-3! rounded-lg shadow-sm transition-all duration-200"
              >
                <span className="text-lg leading-none">+</span>
                Crear Nuevo Proyecto
              </button>
            </div>

            <div className="mt-6 bg-white p-4 rounded-lg shadow-md">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Name search — invisible label keeps height consistent with date columns */}
                <div className="flex flex-col">
                  <span className="text-xs text-transparent mb-1 select-none" aria-hidden="true">&nbsp;</span>
                  <input
                    type="text"
                    name="name"
                    value={filters.name}
                    onChange={handleFilterChange}
                    placeholder="Buscar por nombre"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  />
                </div>

                <div className="flex flex-col">
                  <span className="text-xs text-transparent mb-1 select-none" aria-hidden="true">&nbsp;</span>
                  <select
                    name="clientId"
                    value={filters.clientId}
                    onChange={handleFilterChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  >
                    <option value="">Todos los clientes</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status select — invisible label keeps height consistent with date columns */}
                <div className="flex flex-col">
                  <span className="text-xs text-transparent mb-1 select-none" aria-hidden="true">&nbsp;</span>
                  <select
                    name="status"
                    value={filters.status}
                    onChange={handleFilterChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  >
                    <option value="">Todos los estados</option>
                    {availableStatuses.map((status) => (
                      <option key={status} value={status}>
                        {translateStatus(status)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col">
                  <label className="text-xs text-gray-500 mb-1">Desde</label>
                  <input
                    type="date"
                    name="fromDate"
                    value={filters.fromDate}
                    onChange={handleFilterChange}
                    max={createEndDateBounds.min}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-gray-500 mb-1">Hasta</label>
                  <input
                    type="date"
                    name="toDate"
                    value={filters.toDate}
                    onChange={handleFilterChange}
                    max={createEndDateBounds.min}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  />
                </div>
              </div>
              <div className="flex justify-end mt-4">
                <button
                  onClick={clearFilters}
                  className="text-gray-600 hover:text-gray-800"
                >
                  Limpiar filtros
                </button>
              </div>
            </div>

            {error && (
              <div className="mt-5 p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 flex items-center justify-between gap-3">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={retryLoad}
                  className="inline-flex items-center justify-center px-3! py-1.5! rounded-md border border-red-300 bg-white! text-red-700 hover:bg-red-100! transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {!loading && projectRows.length === 0 && (
              <section className="mt-6 bg-white border border-gray-200 rounded-xl shadow-sm p-10 text-center">
                <h3 className="text-xl font-semibold text-gray-900">No se encontraron proyectos</h3>
                <p className="text-sm text-gray-500 mt-2">
                  No hay proyectos disponibles en la base de datos.
                </p>
              </section>
            )}

            <section className="mt-6 space-y-4">
              {projectRows.map((project, index) => {
                const statusMeta = getProjectStatusMeta(project.status);
                const isExpanded = isSameId(project.id, expandedProjectId);

                return (
                  <div key={project.id}>
                    <article
                      className="bg-white border border-gray-200 rounded-lg shadow-sm px-5 md:px-6 py-4 flex items-center justify-between gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-md bg-gray-100 text-gray-400 flex items-center justify-center text-lg font-semibold uppercase">
                          {String(project.name || 'P').charAt(0)}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-lg font-semibold text-gray-900 truncate">{project.name}</h4>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide ${statusMeta.classes}`}>
                              {statusMeta.label}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">{project.collapsedSubtitle}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleExpandedProject(project.id)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-transparent! border-0! p-0! text-gray-400 hover:text-gray-600 transition-colors"
                        aria-label={isExpanded ? 'Contraer detalles del proyecto' : 'Expandir detalles del proyecto'}
                      >
                        <span className={`text-xl leading-none transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                          ›
                        </span>
                      </button>
                    </article>

                    {isExpanded && (
                      <section className="mt-6 bg-white border border-gray-200 rounded-xl shadow-[0_10px_28px_rgba(15,23,42,0.05)] overflow-hidden">
                        <div className="px-5 md:px-6 py-5 border-b border-gray-200 flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
                          <div>
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide bg-emerald-50 text-emerald-700">
                                {project.id}
                              </span>
                              <h2 className="text-2xl font-bold text-gray-900">{project.name}</h2>
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide ${statusMeta.classes}`}>
                                {statusMeta.label}
                              </span>
                            </div>
                            <p className="text-gray-600 mt-2 text-sm">{project.description || '-'}</p>
                          </div>

                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => navigate(`/projects/${project.id}/detail`)}
                              className="inline-flex items-center justify-center gap-2 bg-white! border border-gray-300 text-gray-700 hover:bg-gray-50! px-4! py-2! rounded-md text-sm font-semibold transition-all"
                            >
                              <div className="relative w-6 h-6 flex items-center justify-center">
                                <Icon icon={faFile} size={18} color="currentColor" />
                                <Icon 
                                  icon={faMagnifyingGlass} 
                                  size={10} 
                                  color="currentColor" 
                                  className="absolute bottom-0 right-0"
                                  style={{
                                    filter: 'drop-shadow(0 0 1px white) drop-shadow(0 0 0.5px white)',
                                    textShadow: '0 0 3px white, 0 0 2px white'
                                  }}
                                />
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditModal(project)}
                              className="inline-flex items-center justify-center gap-2 bg-white! border border-gray-300 text-gray-700 hover:bg-gray-50! px-4! py-2! rounded-md text-sm font-semibold transition-all"
                            >
                              Editar Proyecto
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteProject(project)}
                              disabled={deletingProjectId === project.id}
                              className="inline-flex items-center justify-center gap-2 bg-white! border border-red-300 text-red-600 hover:bg-red-50! px-4! py-2! rounded-md text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {deletingProjectId === project.id ? 'Eliminando...' : 'Eliminar Proyecto'}
                            </button>
                          </div>
                        </div>

                        {/* ── Project metadata grid ── */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 px-5 md:px-6 py-5 border-b border-gray-200">
                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Cliente Principal</p>
                            <p className="text-sm font-semibold text-gray-900 mt-2">{project.clientName || '-'}</p>
                          </div>

                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Muestras Asociadas</p>
                            <p className="text-sm font-semibold text-gray-900 mt-2">{associatedSamplesCount} Total</p>
                          </div>

                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Fecha de Creación</p>
                            <p className="text-sm font-semibold text-gray-900 mt-2">{formatDisplayDate(project.createdAt)}</p>
                          </div>

                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Fecha Límite</p>
                            <p className="text-sm font-semibold text-gray-900 mt-2">{formatDisplayDate(project.dueDate)}</p>
                          </div>
                        </div>

                        <div className="px-5 md:px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
                          <h3 className="text-base font-semibold text-gray-900">Muestras Recientes</h3>

                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full min-w-205">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Código de Muestra</th>
                                <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Estado</th>
                                <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Plantilla</th>
                                <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Creado En</th>
                                <th className="px-6 py-4 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500"></th>
                              </tr>
                            </thead>

                            <tbody>
                              {expandedProjectSamples.length === 0 ? (
                                <tr>
                                  <td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">
                                    No se encontraron muestras para este proyecto en la base de datos.
                                  </td>
                                </tr>
                              ) : (
                                expandedProjectSamples.slice(0, 3).map((sampleRow) => {
                                  const sampleStatusMeta = getSampleStatusMeta(sampleRow.status);

                                  return (
                                    <tr
                                      key={sampleRow.id}
                                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors duration-200"
                                    >
                                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">{sampleRow.sampleId}</td>
                                      <td className="px-6 py-4 text-sm">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold uppercase ${sampleStatusMeta.classes}`}>
                                          {sampleStatusMeta.label}
                                        </span>
                                      </td>
                                      <td className="px-6 py-4 text-sm text-gray-600">{sampleRow.template}</td>
                                      <td className="px-6 py-4 text-sm text-gray-500">{formatDisplayDate(sampleRow.createdAt)}</td>
                                      <td className="px-6 py-4 text-right text-sm">
                                        {/* <button
                                          type="button"
                                          className="bg-transparent! border-0! p-0! text-emerald-600 font-semibold hover:text-emerald-700 transition-colors"
                                        >
                                          Ver
                                        </button> */}
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
            </section>

            <div className="mt-6 border-t border-gray-200 pt-4 text-xs text-gray-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                {loading ? 'SINCRONIZANDO PROYECTOS...' : 'SISTEMA EN LINEA'}
              </p>
            </div>
          </div>
        </main>
      </div>

      {showProjectModal && (
        <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-190 bg-white rounded-xl border border-gray-200 shadow-[0_30px_80px_rgba(15,23,42,0.3)] overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 flex items-start justify-between">
              <div>
                <h2 className="text-3xl font-bold text-gray-900">
                  {modalMode === 'edit' ? 'Editar Proyecto' : 'Crear Nuevo Proyecto'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Inicializa un nuevo espacio clinico para el seguimiento de muestras
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="inline-flex items-center justify-center p-0! w-8 h-8 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
                aria-label="Close modal"
              >
                x
              </button>
            </div>

            <form onSubmit={handleProjectSubmit} className="px-6 py-5 space-y-4">
              {projectFormError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {projectFormError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold tracking-[0.18em] text-gray-600 uppercase mb-2">
                  Nombre del Proyecto
                </label>
                <input
                  type="text"
                  name="name"
                  value={projectForm.name}
                  onChange={handleProjectFormChange}
                  required
                  maxLength={150}
                  placeholder="ej. Sintesis Molecular Zeta"
                  className="w-full px-4 py-3 border border-gray-200 rounded-md bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                />
                <p className="text-[11px] text-right text-gray-400 mt-1">
                  {projectForm.name.length}/150 CARACTERES
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold tracking-[0.18em] text-gray-600 uppercase mb-2">
                  Cliente
                </label>
                <select
                  name="clientId"
                  value={projectForm.clientId}
                  onChange={handleProjectFormChange}
                  required
                  disabled={!clients.length}
                  className="w-full px-4 py-3 border border-gray-200 rounded-md bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                >
                  {clients.length === 0 ? (
                    <option value="">No hay clientes disponibles</option>
                  ) : (
                    clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {modalMode === 'edit' && (
                <div>
                  <label className="block text-xs font-bold tracking-[0.18em] text-gray-600 uppercase mb-2">
                    Estado
                  </label>
                  <select
                    name="status"
                    value={projectForm.status}
                    onChange={handleProjectFormChange}
                    className="w-full px-4 py-3 border border-gray-200 rounded-md bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                  >
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold tracking-[0.18em] text-gray-600 uppercase mb-2">
                  Fecha de Finalizacion
                </label>
                <input
                  type="date"
                  name="endDate"
                  value={projectForm.endDate}
                  onChange={handleProjectFormChange}
                  min={
                    modalMode === 'edit'
                      ? editEndDateMin || undefined
                      : createEndDateBounds.min
                  }
                  max={createEndDateBounds.max}
                  className="w-full px-4 py-3 border border-gray-200 rounded-md bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold tracking-[0.18em] text-gray-600 uppercase mb-2">
                  Descripcion
                </label>
                <textarea
                  name="description"
                  value={projectForm.description}
                  onChange={handleProjectFormChange}
                  rows={4}
                  placeholder="Describe brevemente el alcance y objetivos de este proyecto de investigacion..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-md bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-gray-200 mt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex items-center justify-center bg-white! text-gray-700 hover:bg-gray-100! px-5! py-2.5! rounded-md font-semibold transition-colors"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={submittingProject || clients.length === 0}
                  className="inline-flex items-center justify-center bg-emerald-500! hover:bg-emerald-600! text-gray-900! hover:text-white! disabled:bg-emerald-300! px-5! py-2.5! rounded-md font-semibold transition-all"
                >
                  {submittingProject
                    ? modalMode === 'edit'
                      ? 'Guardando...'
                      : 'Creando...'
                    : modalMode === 'edit'
                      ? 'Guardar Cambios'
                      : 'Crear Proyecto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteModal && projectToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-sm w-full p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-4 text-xl">
              <Icon icon={faTriangleExclamation} size={20} color="currentColor" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">¿Eliminar proyecto?</h3>
            <p className="text-gray-500 mb-6 leading-relaxed">
              Esta acción no se puede deshacer. El proyecto {projectToDelete.name} y todas sus muestras asociadas se eliminarán definitivamente del sistema.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={confirmDeleteProject}
                disabled={deletingProjectId === projectToDelete.id}
                className="w-full bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white px-4 py-3 rounded-xl font-bold transition-all"
              >
                {deletingProjectId === projectToDelete.id
                  ? 'Eliminando...'
                  : 'Si, eliminar definitivamente'}
              </button>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setProjectToDelete(null);
                }}
                className="w-full text-gray-500 px-4 py-3 font-bold hover:bg-gray-50 rounded-xl transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}