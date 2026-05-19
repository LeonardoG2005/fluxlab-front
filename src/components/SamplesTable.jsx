/**
 * Samples Table Component
 * 
 * Displays a list of lab samples with their associated templates and status
 * Integrates with Inline Editing, Quick Add, and a traditional Creation Modal
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  faCheck,
  faFileLines,
  faFolderOpen,
  faFloppyDisk,
  faPenToSquare,
  faTriangleExclamation,
  faTrashCan,
  faXmark
} from '@fortawesome/free-solid-svg-icons';
import { apiService } from '../services/api';
import Icon from './Icon';
import * as XLSX from 'xlsx';

export default function SamplesTable() {
  const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024;
  const INITIAL_SAMPLE_FILTERS = {
    clientId: '',
    fromDate: '',
    toDate: ''
  };

  const fileInputRefs = useRef({});
  const [samples, setSamples] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [importMessage, setImportMessage] = useState(null);
  const [importingProjectId, setImportingProjectId] = useState(null);
  const [showImportTemplateModal, setShowImportTemplateModal] = useState(false);
  const [importDraft, setImportDraft] = useState(null);
  const [importTemplateName, setImportTemplateName] = useState('');
  const [importFieldSettings, setImportFieldSettings] = useState([]);
  const [importModalError, setImportModalError] = useState(null);
  const [dragActiveProjectId, setDragActiveProjectId] = useState(null);
  const dragDepthRef = useRef(0);
  
  // Inline Editing State
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    code: '',
    customCode: '',
    status: '',
    fieldValues: {}
  });

  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const confirmResolverRef = useRef(null);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    message: ''
  });
  const [sampleToDelete, setSampleToDelete] = useState(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState(INITIAL_SAMPLE_FILTERS);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quick Add State (for the "+" in templates)
  const [quickAddRow, setQuickAddRow] = useState({
    templateId: null,
    projectId: null,
    code: '',
    customCode: '',
    status: 'pending',
    fieldValues: {}
  });
  const [quickAddErrorRowKey, setQuickAddErrorRowKey] = useState(null);

  // Dedicated Create Form State (for the Modal)
  const [createFormData, setCreateFormData] = useState({
    code: '',
    customCode: '',
    projectId: '',
    templateId: '',
    status: 'pending'
  });

  const showImportConfirmation = (message) => {
    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmDialog({
        open: true,
        message: String(message || '')
      });
    });
  };

  const resolveImportConfirmation = (accepted) => {
    if (confirmResolverRef.current) {
      confirmResolverRef.current(Boolean(accepted));
      confirmResolverRef.current = null;
    }

    setConfirmDialog({
      open: false,
      message: ''
    });
  };

  const normalizeText = (value) => {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  };

  const normalizeFieldKey = (value) => normalizeText(value).replace(/\s+/g, '');

  const parseCollection = (payload, keys = []) => {
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
  };

  const parseClientsResponse = (payload) => {
    const rawClients = parseCollection(payload, ['clients', 'items', 'results']);

    return rawClients
      .map((rawClient, index) => ({
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
      }))
      .sort((leftClient, rightClient) =>
        String(leftClient.name || '').localeCompare(String(rightClient.name || ''), 'es', {
          sensitivity: 'base'
        })
      );
  };

  const formatLocalDateForInput = (date) => {
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  };

  const getDatePartFromValue = (value) => {
    const rawValue = String(value || '').trim();

    if (!rawValue) {
      return '';
    }

    const datePartMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (datePartMatch) {
      return `${datePartMatch[1]}-${datePartMatch[2]}-${datePartMatch[3]}`;
    }

    const parsedDate = new Date(rawValue);

    if (Number.isNaN(parsedDate.getTime())) {
      return '';
    }

    const year = String(parsedDate.getUTCFullYear());
    const month = String(parsedDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(parsedDate.getUTCDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  };

  const buildFieldSignature = (fields = []) => {
    return fields
      .map((field) => ({
        name: normalizeFieldKey(field?.name),
        rawName: String(field?.name || '')
      }))
      .filter((field) =>
        field.name &&
        field.name !== 'code' &&
        field.name !== 'customcode' &&
        field.name !== 'custom_code' &&
        field.rawName.trim() !== ''
      )
      .map((field) => field.name)
      .join('||');
  };

  const getTemplateFieldSignature = (template) => {
    if (!Array.isArray(template?.fields) || template.fields.length === 0) {
      return '';
    }

    return buildFieldSignature(template.fields);
  };

  const resolveTemplateWithFields = async (template) => {
    if (!template) return null;

    if (Array.isArray(template.fields) && template.fields.length > 0) {
      return template;
    }

    return apiService.templates.getById(template.id);
  };

  const findTemplateWithMatchingFields = async (fields) => {
    const targetSignature = buildFieldSignature(fields);
    if (!targetSignature) return null;

    for (const template of templates) {
      const resolvedTemplate = await resolveTemplateWithFields(template);
      if (buildFieldSignature(resolvedTemplate?.fields || []) === targetSignature) {
        return resolvedTemplate;
      }
    }

    return null;
  };

  const isCsvFile = (fileName) => String(fileName || '').toLowerCase().endsWith('.csv');
  const isXlsxFile = (fileName) => String(fileName || '').toLowerCase().endsWith('.xlsx');

  const detectDelimiter = (text) => {
    const previewLine = String(text || '').split(/\r?\n/).find(line => line.trim().length > 0) || '';
    const commaCount = (previewLine.match(/,/g) || []).length;
    const semicolonCount = (previewLine.match(/;/g) || []).length;
    return semicolonCount > commaCount ? ';' : ',';
  };

  const parseCsvText = (text, delimiter) => {
    const rows = [];
    let row = [];
    let value = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          value += '"';
          i += 1;
          continue;
        }

        inQuotes = !inQuotes;
        continue;
      }

      if (!inQuotes && char === delimiter) {
        row.push(value);
        value = '';
        continue;
      }

      if (!inQuotes && (char === '\n' || char === '\r')) {
        if (char === '\r' && nextChar === '\n') {
          i += 1;
        }

        row.push(value);
        rows.push(row);
        row = [];
        value = '';
        continue;
      }

      value += char;
    }

    row.push(value);
    rows.push(row);

    if (inQuotes) {
      throw new Error('El CSV contiene comillas sin cerrar.');
    }

    return rows;
  };

  const parseBooleanValue = (value) => {
    const normalized = normalizeFieldKey(value);
    if (!normalized) return false;
    return ['true', '1', 'si', 'yes', 'y', 'verdadero'].includes(normalized);
  };

  const isNumberLike = (value) => {
    if (value === null || value === undefined || String(value).trim() === '') return false;
    const normalized = String(value).trim().replace(',', '.');
    return normalized !== '' && Number.isFinite(Number(normalized));
  };

  const isDateLike = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return false;
    const isoLike = /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/;
    const shortDateLike = /^\d{2}[/-]\d{2}[/-]\d{4}$/;
    if (!isoLike.test(raw) && !shortDateLike.test(raw)) return false;
    return !Number.isNaN(new Date(raw).getTime());
  };

  const inferFieldTypeFromValues = (values) => {
    const nonEmpty = values
      .map(value => String(value || '').trim())
      .filter(value => value !== '');

    if (nonEmpty.length === 0) return 'text';

    const allBoolean = nonEmpty.every(value => {
      const normalized = normalizeFieldKey(value);
      return ['true', 'false', '1', '0', 'si', 'no', 'yes', 'y', 'n', 'verdadero', 'falso'].includes(normalized);
    });

    if (allBoolean) return 'boolean';

    const allNumber = nonEmpty.every(value => isNumberLike(value));
    if (allNumber) return 'number';

    const allDate = nonEmpty.every(value => isDateLike(value));
    if (allDate) return 'date';

    return 'text';
  };

  const buildValueByType = (dataType, rawValue) => {
    const stringValue = String(rawValue ?? '').trim();

    if (dataType === 'boolean') {
      return { valueBoolean: parseBooleanValue(stringValue) };
    }

    if (dataType === 'number') {
      const normalized = stringValue.replace(',', '.');
      const parsed = Number(normalized);
      return { valueNumber: Number.isFinite(parsed) ? parsed : 0 };
    }

    if (dataType === 'date') {
      if (!stringValue) return { valueDate: new Date().toISOString() };
      const parsed = new Date(stringValue);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error(`La fecha "${stringValue}" no es valida.`);
      }
      return { valueDate: parsed.toISOString() };
    }

    return { valueText: stringValue };
  };

  const parseSpreadsheetFile = async (file) => {
    if (isXlsxFile(file.name)) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        throw new Error('El archivo .xlsx no contiene hojas.');
      }

      const firstSheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(firstSheet, {
        header: 1,
        raw: false,
        blankrows: false,
        defval: ''
      });

      return rows.map((row) =>
        Array.isArray(row) ? row.map((cell) => String(cell ?? '').trim()) : []
      );
    }

    if (isCsvFile(file.name)) {
      const rawText = await file.text();
      const csvText = String(rawText || '').replace(/^\uFEFF/, '');
      const delimiter = detectDelimiter(csvText);

      return parseCsvText(csvText, delimiter)
        .map(row => row.map(cell => String(cell || '').trim()));
    }

    throw new Error('Formato no soportado. Solo se aceptan archivos .csv o .xlsx.');
  };

  const filterDateMax = useMemo(() => formatLocalDateForInput(new Date()), []);

  const filterError = useMemo(() => {
    if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
      return 'La fecha "Desde" no puede ser mayor que la fecha "Hasta".';
    }

    return '';
  }, [filters.fromDate, filters.toDate]);

  const hasActiveFilters = useMemo(() => {
    return Boolean(
      String(searchQuery || '').trim() ||
      filterStatus !== 'all' ||
      filters.clientId ||
      filters.fromDate ||
      filters.toDate
    );
  }, [searchQuery, filterStatus, filters.clientId, filters.fromDate, filters.toDate]);

  // Load data on mount and whenever client filter changes.
  useEffect(() => {
    loadData(filters.clientId);
  }, [filters.clientId]);

  const loadData = async (clientId = '') => {
    const normalizedClientId = String(clientId || '').trim();

    try {
      setLoading(true);
      setError(null);
      
      const [samplesData, templatesData, projectsResponse, clientsResponse] = await Promise.all([
        (normalizedClientId
          ? apiService.samples.getByClient(normalizedClientId)
          : apiService.samples.getAll()).catch(err => {
          console.error('Error fetching samples:', err);
          return [];
        }),
        apiService.templates.getAll().catch(err => {
          console.error('Error fetching templates:', err);
          return [];
        }),
        apiService.projects.getAll(
          normalizedClientId
            ? { clientId: normalizedClientId }
            : {}
        ).catch(err => {
          console.error('Error fetching projects:', err);
          return [];
        }),
        apiService.clients.getAll().catch(err => {
          console.error('Error fetching clients:', err);
          return [];
        })
      ]);

      const samplesArray = Array.isArray(samplesData) ? samplesData : [];
      setSamples(samplesArray);
      setTemplates(Array.isArray(templatesData) ? templatesData : []);
      setClients(parseClientsResponse(clientsResponse));
      
      const projectsList = projectsResponse?.data && Array.isArray(projectsResponse.data) 
        ? projectsResponse.data 
        : (Array.isArray(projectsResponse) ? projectsResponse : []);
        
      setProjects(projectsList);
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err.message || 'Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (sample) => {
    setEditingId(sample.id);
    const initialFieldValues = {};
    const valuesSource = sample.sampleFieldValues || sample.values || [];
    
    valuesSource.forEach(v => {
      const fieldId = v.field?.id || v.fieldId;
      if (fieldId) {
        let val = '';
        if (v.valueText !== null && v.valueText !== undefined) val = v.valueText;
        else if (v.valueNumber !== null && v.valueNumber !== undefined) val = v.valueNumber;
        else if (v.valueDate !== null && v.valueDate !== undefined) val = v.valueDate;
        else if (v.valueBoolean !== null && v.valueBoolean !== undefined) val = v.valueBoolean;
        initialFieldValues[fieldId] = val;
      }
    });

    setEditFormData({
      code: sample.code || '',
      customCode: sample.customCode || '',
      status: sample.status,
      fieldValues: initialFieldValues
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditFormData({ code: '', customCode: '', status: '', fieldValues: {} });
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
  };

  const handleSampleFilterChange = (event) => {
    const { name, value } = event.target;

    setFilters((currentFilters) => ({
      ...currentFilters,
      [name]: value,
    }));
  };

  const clearFilters = () => {
    setFilters(INITIAL_SAMPLE_FILTERS);
    setSearchQuery('');
    setFilterStatus('all');
    setError(null);
  };

  const saveInlineEdit = async (event, sample) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const scrollContainer = document.querySelector('main.flex-1.overflow-auto');
    const previousScrollTop = scrollContainer?.scrollTop;

    setIsSubmitting(true);
    try {
      const normalizedCode = String(editFormData.code || '').trim();
      const normalizedCustomCode = String(editFormData.customCode || '').trim();
      const nextCustomCode = normalizedCustomCode ? normalizedCustomCode : null;

      if (!normalizedCode) {
        throw new Error('El código de la muestra es obligatorio.');
      }

      const template = templates.find(t => t.id === (sample.template?.id || sample.templateId));
      const payload = {
        status: editFormData.status,
        customCode: nextCustomCode,
        values: Object.entries(editFormData.fieldValues).map(([fieldId, value]) => {
          const field = template?.fields?.find(f => f.id === fieldId);
          return {
            fieldId,
            valueText: field?.dataType === 'text' ? (value !== null ? String(value) : "") : null,
            valueNumber: field?.dataType === 'number' ? (value !== null && value !== "" ? Number(value) : 0) : null,
            valueDate: field?.dataType === 'date' ? (value || new Date().toISOString()) : null,
            valueBoolean: field?.dataType === 'boolean' ? (value === true || value === "true") : null
          };
        })
      };

      const updatePayload = {
        code: normalizedCode,
        status: editFormData.status,
        customCode: nextCustomCode,
      };

      await apiService.samples.update(sample.id, updatePayload);

      const updatedSample = await apiService.samples.updateWithValues(sample.id, payload);

      setSamples((prevSamples) => prevSamples.map((existingSample) => {
        if (existingSample.id !== sample.id) return existingSample;

        if (!updatedSample || typeof updatedSample !== 'object') {
          return {
            ...existingSample,
            code: normalizedCode,
            customCode: nextCustomCode,
            status: payload.status,
          };
        }

        const mergedSample = {
          ...existingSample,
          ...updatedSample,
          template: updatedSample.template ?? existingSample.template,
          project: updatedSample.project ?? existingSample.project,
        };

        mergedSample.customCode = nextCustomCode;

        return mergedSample;
      }));
      cancelEditing();

      if (scrollContainer && typeof previousScrollTop === 'number') {
        requestAnimationFrame(() => {
          scrollContainer.scrollTop = previousScrollTop;
        });
      }
    } catch (err) {
      console.error('Error saving edit:', err);
      setError(err.message || 'Error al actualizar la muestra');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handeModalCreate = async (e) => {
    e.preventDefault();
    if (!createFormData.code || !createFormData.projectId || !createFormData.templateId) {
      setError('Por favor completa los campos obligatorios');
      return;
    }

    setIsSubmitting(true);
    try {
      const template = templates.find(t => t.id === createFormData.templateId);
      const normalizedCustomCode = String(createFormData.customCode || '').trim();
      
      const initialValues = (template?.fields || []).map(field => {
        const base = { fieldId: field.id };
        if (field.dataType === 'boolean') return { ...base, valueBoolean: false };
        if (field.dataType === 'number') return { ...base, valueNumber: 0 };
        if (field.dataType === 'date') return { ...base, valueDate: new Date().toISOString() };
        return { ...base, valueText: "" };
      });

      const payload = {
        code: createFormData.code,
        projectId: createFormData.projectId,
        templateId: createFormData.templateId,
        status: createFormData.status,
        values: initialValues
      };

      if (normalizedCustomCode) {
        payload.customCode = normalizedCustomCode;
      }

      await apiService.samples.createWithValues(payload);
      
      await loadData(filters.clientId);
      setShowCreateModal(false);
      setCreateFormData({ code: '', customCode: '', projectId: '', templateId: '', status: 'pending' });
    } catch (err) {
      setError(err.message || 'Error al crear la muestra');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickAdd = async (templateId, projectId) => {
    const currentQuickAddRowKey = `${projectId}-${templateId}`;

    const scrollContainer = document.querySelector('main.flex-1.overflow-auto');
    const previousScrollTop = scrollContainer?.scrollTop;

    const triggerQuickAddErrorFlash = () => {
      setQuickAddErrorRowKey(currentQuickAddRowKey);
      window.setTimeout(() => {
        setQuickAddErrorRowKey((currentKey) => (
          currentKey === currentQuickAddRowKey ? null : currentKey
        ));
      }, 700);
    };

    if (!quickAddRow.code || quickAddRow.code.trim() === '') {
      setError('El código es requerido para la creación rápida');
      triggerQuickAddErrorFlash();
      return;
    }

    setIsSubmitting(true);
    try {
      const template = templates.find(t => t.id === templateId);
      const normalizedCustomCode = String(quickAddRow.customCode || '').trim();
      const payload = {
        code: quickAddRow.code,
        status: quickAddRow.status,
        templateId,
        projectId,
        values: Object.entries(quickAddRow.fieldValues).map(([fieldId, value]) => {
          const field = template?.fields?.find(f => f.id === fieldId);
          const base = { fieldId };
          if (field?.dataType === 'text') return { ...base, valueText: String(value || "") };
          if (field?.dataType === 'number') return { ...base, valueNumber: (value !== "" ? Number(value) : 0) };
          if (field?.dataType === 'date') return { ...base, valueDate: (value || new Date().toISOString()) };
          if (field?.dataType === 'boolean') return { ...base, valueBoolean: (value === true || value === "true") };
          return { ...base, valueText: "" };
        })
      };

      if (normalizedCustomCode) {
        payload.customCode = normalizedCustomCode;
      }

      const createdSample = await apiService.samples.createWithValues(payload);
      const project = projects.find(p => p.id === projectId);

      const normalizedSample = createdSample && typeof createdSample === 'object'
        ? {
            ...createdSample,
            templateId: createdSample.templateId ?? templateId,
            projectId: createdSample.projectId ?? projectId,
            template: createdSample.template ?? template,
            project: createdSample.project ?? project,
          }
        : {
            id: `temp-${Date.now()}`,
            code: payload.code,
            customCode: payload.customCode ?? null,
            status: payload.status,
            templateId,
            projectId,
            template,
            project,
          };

      setSamples((prevSamples) => {
        if (normalizedSample?.id) {
          const withoutSame = prevSamples.filter((s) => s.id !== normalizedSample.id);
          return [...withoutSame, normalizedSample];
        }
        return [...prevSamples, normalizedSample];
      });

      setQuickAddRow({ templateId: null, projectId: null, code: '', customCode: '', status: 'pending', fieldValues: {} });
      setQuickAddErrorRowKey(null);

      if (scrollContainer && typeof previousScrollTop === 'number') {
        requestAnimationFrame(() => {
          scrollContainer.scrollTop = previousScrollTop;
        });
      }
    } catch (err) {
      setError(err.message || 'Error en creación rápida');
      triggerQuickAddErrorFlash();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (id) => {
    setSampleToDelete(id);
    setShowDeleteModal(true);
  };

  const handleBulkDeleteClick = (project, template) => {
    setBulkDeleteTarget({
      projectId: project.id,
      templateId: template.id,
      projectName: project.name,
      templateName: template.name,
      sampleCount: template.samples.length
    });
    setShowBulkDeleteModal(true);
  };

  const handleImportClick = (projectId) => {
    const input = fileInputRefs.current[projectId];
    if (!input) return;
    input.value = '';
    input.click();
  };

  const isFileDragEvent = (event) => {
    const types = Array.from(event?.dataTransfer?.types || []);
    return types.includes('Files');
  };

  const handleDragEnter = (projectId, event) => {
    if (!isFileDragEvent(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragActiveProjectId(projectId);
  };

  const handleDragOver = (projectId, event) => {
    if (!isFileDragEvent(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (dragActiveProjectId !== projectId) {
      setDragActiveProjectId(projectId);
    }
  };

  const handleDragLeave = (projectId, event) => {
    if (!isFileDragEvent(event)) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(dragDepthRef.current - 1, 0);
    if (dragDepthRef.current === 0 && dragActiveProjectId === projectId) {
      setDragActiveProjectId(null);
    }
  };

  const handleDropFile = (project, event) => {
    if (!isFileDragEvent(event)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragActiveProjectId(null);

    const droppedFile = event.dataTransfer?.files?.[0];
    if (!droppedFile) return;

    handleImportFile(project, droppedFile);
  };

  const resetImportDraft = () => {
    setImportDraft(null);
    setImportTemplateName('');
    setImportFieldSettings([]);
    setImportModalError(null);
    setShowImportTemplateModal(false);
  };

  const runBulkImport = async ({ project, rows, template }) => {
    const headerRow = rows[0];
    const sampleRows = rows.slice(1);

    const templateFields = Array.isArray(template.fields) ? template.fields : [];
    if (templateFields.length === 0) {
      throw new Error('La plantilla no contiene campos para mapear el archivo importado.');
    }

    const headerMeta = headerRow.map((header, index) => ({
      original: header,
      normalized: normalizeFieldKey(header),
      index
    }));

    const templateColumns = headerMeta.filter((column, index) => index > 1);

    const templateFieldMap = new Map(
      templateFields.map((field) => [normalizeFieldKey(field.name), field])
    );

    const unmatchedColumns = templateColumns
      .filter(column => !templateFieldMap.has(column.normalized))
      .map(column => column.original);

    if (unmatchedColumns.length > 0) {
      throw new Error(`Los siguientes campos no existen en la plantilla: ${unmatchedColumns.join(', ')}.`);
    }

    const requiredTemplateFields = templateFields
      .filter(field => field.required)
      .map(field => normalizeFieldKey(field.name));

    const csvFieldNames = new Set(templateColumns.map(column => column.normalized));
    const missingRequiredFields = requiredTemplateFields
      .filter(fieldName => !csvFieldNames.has(fieldName));

    if (missingRequiredFields.length > 0) {
      throw new Error(`Faltan campos requeridos de la plantilla: ${missingRequiredFields.join(', ')}.`);
    }

    const mappedColumns = templateColumns.map(column => ({
      ...column,
      templateField: templateFieldMap.get(column.normalized)
    }));

    const samplesPayload = sampleRows.map((row, rowIndex) => {
      const code = String(row[0] || '').trim();
      const customCode = String(row[1] || '').trim();
      if (!code) {
        throw new Error(`La fila ${rowIndex + 2} no tiene valor en la columna code.`);
      }

      const values = mappedColumns.map(column => {
        const rawValue = row[column.index];
        const typedValue = buildValueByType(column.templateField.dataType, rawValue);

        return {
          fieldId: column.templateField.id,
          ...typedValue
        };
      });

      const samplePayload = {
        code,
        templateId: template.id,
        projectId: project.id,
        status: 'pending',
        values
      };

      if (customCode) {
        samplePayload.customCode = customCode;
      }

      return samplePayload;
    });

    await apiService.samples.createManyWithValues({ samples: samplesPayload });

    await loadData(filters.clientId);
    setImportMessage(
      `Se importaron ${samplesPayload.length} muestras en el proyecto "${project.name}" con la plantilla "${template.name}".`
    );
  };

  const confirmTemplateFromDraft = async () => {
    if (!importDraft) return;

    const name = String(importTemplateName || '').trim();
    if (!name) {
      setImportModalError('Debes indicar un nombre de plantilla para continuar.');
      return;
    }

    if (!Array.isArray(importFieldSettings) || importFieldSettings.length === 0) {
      setImportModalError('No hay campos para crear la plantilla.');
      return;
    }

    try {
      setImportModalError(null);
      setImportingProjectId(importDraft.project.id);

      const existingTemplateByName = templates.find(
        (template) => normalizeFieldKey(template.name) === normalizeFieldKey(name)
      );

      const matchingTemplateByFields = await findTemplateWithMatchingFields(importFieldSettings);

      if (matchingTemplateByFields) {
        const shouldAddSamplesToExistingTemplate = await showImportConfirmation(
          `La plantilla "${matchingTemplateByFields.name}" ya existe. ¿Estas seguro de agregar solo las muestras a esta plantilla?`
        );

        if (!shouldAddSamplesToExistingTemplate) {
          setImportModalError('Importacion cancelada por el usuario.');
          return;
        }

        await runBulkImport({
          project: importDraft.project,
          rows: importDraft.rows,
          template: matchingTemplateByFields
        });

        resetImportDraft();
        return;
      }

      if (existingTemplateByName) {
        const resolvedTemplateByName = await resolveTemplateWithFields(existingTemplateByName);
        const importedFieldsSignature = buildFieldSignature(importFieldSettings);
        const existingFieldsSignature = buildFieldSignature(resolvedTemplateByName?.fields || []);

        if (importedFieldsSignature && existingFieldsSignature && importedFieldsSignature !== existingFieldsSignature) {
          setImportModalError(
            `Ya existe una plantilla llamada "${resolvedTemplateByName.name}" pero tiene campos diferentes. ` +
            'Cambia el nombre de la plantilla importada o usa un archivo con la misma estructura.'
          );
          return;
        }
      }

      const shouldCreateNewTemplate = await showImportConfirmation(
        `Se creara una plantilla nueva llamada "${name}". ¿Deseas continuar?`
      );

      if (!shouldCreateNewTemplate) {
        setImportModalError('Importacion cancelada por el usuario.');
        return;
      }

      const createdTemplate = await apiService.templates.createWithFields({
        name,
        description: `Plantilla creada por importacion para ${importDraft.project.name}`,
        fields: importFieldSettings.map((field, index) => ({
          name: field.name,
          dataType: field.dataType,
          required: Boolean(field.required),
          orderIndex: index
        }))
      });

      const resolvedTemplate = Array.isArray(createdTemplate?.fields) && createdTemplate.fields.length > 0
        ? createdTemplate
        : await apiService.templates.getById(createdTemplate.id);

      await runBulkImport({
        project: importDraft.project,
        rows: importDraft.rows,
        template: resolvedTemplate
      });

      resetImportDraft();
    } catch (err) {
      setImportModalError(
        err.message || 'No se pudo importar. Verifica si hay códigos o customCode duplicados.'
      );
    } finally {
      setImportingProjectId(null);
    }
  };

  const handleImportFile = async (project, file) => {
    if (!file) return;

    setError(null);
    setImportMessage(null);
    setImportModalError(null);
    setImportingProjectId(project.id);

    try {
      if (file.size > MAX_IMPORT_FILE_BYTES) {
        const fileSizeInMb = (file.size / (1024 * 1024)).toFixed(2);
        throw new Error(`El archivo pesa ${fileSizeInMb} MB y excede el limite de 20 MB.`);
      }

      const fileNameWithoutExtension = file.name.replace(/\.[^/.]+$/, '').trim();
      const suggestedTemplateName = fileNameWithoutExtension || `Plantilla ${project.name}`;

      const parsedRows = await parseSpreadsheetFile(file);

      const contentRows = parsedRows.filter(row => row.some(cell => cell !== ''));
      if (contentRows.length < 2) {
        throw new Error('El archivo debe contener encabezados y al menos una fila de muestra.');
      }

      const headerRow = contentRows[0];
      const sampleRows = contentRows.slice(1);

      const width = headerRow.length;
      if (width < 3) {
        throw new Error('El archivo debe tener las columnas code y customCode, y al menos una columna de campo.');
      }

      const normalizedSampleRows = sampleRows.map((row, index) => {
        if (row.length > width) {
          throw new Error(`La fila ${index + 2} tiene ${row.length} columnas y se esperaban ${width}.`);
        }

        if (row.length === width) {
          return row;
        }

        return [...row, ...new Array(width - row.length).fill('')];
      });

      const headerMeta = headerRow.map((header, index) => ({
        original: header,
        normalized: normalizeFieldKey(header),
        index
      }));

      if (headerMeta.some(h => !h.normalized)) {
        throw new Error('Todos los encabezados de la primera fila deben tener nombre.');
      }

      const duplicateHeaders = headerMeta.filter((header, idx) =>
        headerMeta.findIndex(item => item.normalized === header.normalized) !== idx
      );
      if (duplicateHeaders.length > 0) {
        throw new Error(`Hay columnas duplicadas: ${duplicateHeaders.map(h => h.original).join(', ')}.`);
      }

      const firstColumn = headerMeta[0];
      if (!firstColumn || firstColumn.normalized !== 'code') {
        throw new Error('La primera columna debe llamarse exactamente code.');
      }

      const customCodeColumn = headerMeta[1];
      const normalizedCustomCodeHeader = customCodeColumn?.normalized;
      const isCustomCodeHeader = ['customcode', 'custom_code'].includes(normalizedCustomCodeHeader);

      if (!isCustomCodeHeader) {
        throw new Error('La segunda columna debe llamarse customCode.');
      }

      const templateColumns = headerMeta.slice(2);

      if (templateColumns.length === 0) {
        throw new Error('No hay columnas para construir campos de plantilla.');
      }

      const rowsWithEmptyCode = normalizedSampleRows
        .map((row, index) => ({ row, rowNumber: index + 2 }))
        .filter(item => String(item.row[0] || '').trim() === '');

      if (rowsWithEmptyCode.length > 0) {
        throw new Error(`Hay filas sin code en: ${rowsWithEmptyCode.slice(0, 5).map(item => item.rowNumber).join(', ')}.`);
      }

      const inferredFieldSettings = templateColumns.map((column) => {
        const columnValues = normalizedSampleRows.map(row => row[column.index]);
        const hasEmptyValues = columnValues.some(value => String(value || '').trim() === '');

        return {
          name: column.original,
          dataType: inferFieldTypeFromValues(columnValues),
          required: !hasEmptyValues
        };
      });

      setImportDraft({
        project,
        rows: [headerRow, ...normalizedSampleRows]
      });
      setImportTemplateName(suggestedTemplateName);
      setImportFieldSettings(inferredFieldSettings);
      setImportModalError(null);
      setShowImportTemplateModal(true);
    } catch (err) {
      setError(err.message || 'Error al importar el archivo.');
    } finally {
      setImportingProjectId(null);
    }
  };

  const handleImportFileChange = async (project, event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await handleImportFile(project, file);

    if (event.target) {
      event.target.value = '';
    }
  };

  const confirmDelete = async () => {
    if (!sampleToDelete) return;
    try {
      setIsSubmitting(true);
      await apiService.samples.remove(sampleToDelete);
      setSamples(samples.filter(s => s.id !== sampleToDelete));
      setShowDeleteModal(false);
      setSampleToDelete(null);
    } catch (err) {
      console.error('Error deleting sample:', err);
      setError('Error al eliminar la muestra');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmBulkDelete = async () => {
    if (!bulkDeleteTarget) return;

    try {
      setBulkDeleting(true);
      const response = await apiService.samples.removeBulk(
        bulkDeleteTarget.projectId,
        bulkDeleteTarget.templateId
      );

      setSamples((currentSamples) => currentSamples.filter((sample) => {
        const sampleProjectId = sample.project?.id || sample.projectId;
        const sampleTemplateId = sample.template?.id || sample.templateId;
        return !(
          sampleProjectId === bulkDeleteTarget.projectId &&
          sampleTemplateId === bulkDeleteTarget.templateId
        );
      }));

      if (response?.deleted) {
        setImportMessage(
          `Se eliminaron ${response.deleted} muestras de la plantilla "${bulkDeleteTarget.templateName}".`
        );
      }
    } catch (err) {
      console.error('Error deleting samples:', err);
      setError(err.message || 'Error al eliminar las muestras');
    } finally {
      setBulkDeleting(false);
      setShowBulkDeleteModal(false);
      setBulkDeleteTarget(null);
    }
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'rejected': return 'bg-red-100 text-red-800 border-red-200';
      case 'pending': return 'bg-orange-100 text-orange-800 border-orange-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusDisplayLabel = (status) => {
    switch (status) {
      case 'pending':
        return 'PENDIENTE';
      case 'completed':
        return 'COMPLETADA';
      case 'rejected':
        return 'RECHAZADA';
      default:
        return status;
    }
  };

  const formatDate = (dateString) => {
    const datePart = getDatePartFromValue(dateString);

    if (!datePart) {
      return 'N/A';
    }

    const [year, month, day] = datePart.split('-').map((value) => Number(value));

    if (!year || !month || !day) {
      return 'Fecha invalida';
    }

    const utcDate = new Date(Date.UTC(year, month - 1, day));

    return utcDate.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC'
    });
  };

  const getFieldTypeLabel = (dataType) => {
    switch (dataType) {
      case 'number': return 'Num';
      case 'text': return 'Texto';
      case 'boolean': return 'V/F';
      case 'date': return 'Fecha';
      default: return 'Texto';
    }
  };

  const filteredSamples = useMemo(() => {
    if (filterError) {
      return [];
    }

    const normalizedQuery = normalizeText(searchQuery);

    return (samples || []).filter((sample) => {
      if (filterStatus !== 'all' && sample.status !== filterStatus) {
        return false;
      }

      if (normalizedQuery) {
        const matchesCode = normalizeText(sample.code).includes(normalizedQuery);
        const matchesCustomCode = normalizeText(sample.customCode).includes(normalizedQuery);

        if (!matchesCode && !matchesCustomCode) {
          return false;
        }
      }

      if (!filters.fromDate && !filters.toDate) {
        return true;
      }

      const sampleCreatedDate = getDatePartFromValue(sample.createdAt);

      if (!sampleCreatedDate) {
        return false;
      }

      if (filters.fromDate && sampleCreatedDate < filters.fromDate) {
        return false;
      }

      if (filters.toDate && sampleCreatedDate > filters.toDate) {
        return false;
      }

      return true;
    });
  }, [samples, filterStatus, searchQuery, filters.fromDate, filters.toDate, filterError]);

  const shouldHideProjectsWithoutSamples = Boolean(
    String(searchQuery || '').trim() ||
    filterStatus !== 'all' ||
    filters.fromDate ||
    filters.toDate
  );

  const groupedDataByProject = useMemo(() => {
    const groupedProjects = projects.map((project) => {
      const projectSamples = filteredSamples.filter((sample) =>
        sample.project?.id === project.id ||
        (sample.project && sample.project.id === project.id) ||
        sample.projectId === project.id
      );

      const projectTemplates = templates
        .map((template) => {
          const templateSamples = projectSamples.filter((sample) =>
            sample.template?.id === template.id ||
            (sample.template && sample.template.id === template.id) ||
            sample.templateId === template.id
          );

          return { ...template, samples: templateSamples };
        })
        .filter((template) => template.samples.length > 0);

      return { ...project, templates: projectTemplates, totalSamples: projectSamples.length };
    });

    if (!shouldHideProjectsWithoutSamples) {
      return groupedProjects;
    }

    return groupedProjects.filter((project) => project.totalSamples > 0);
  }, [projects, templates, filteredSamples, shouldHideProjectsWithoutSamples]);

  const existingTemplateByNameForImport = showImportTemplateModal
    ? templates.find(
      (template) => normalizeFieldKey(template.name) === normalizeFieldKey(importTemplateName)
    )
    : null;

  const importFieldSignature = showImportTemplateModal
    ? buildFieldSignature(importFieldSettings)
    : '';

  const existingTemplateByFieldsForImport = showImportTemplateModal && importFieldSignature
    ? templates.find(
      (template) => getTemplateFieldSignature(template) === importFieldSignature
    )
    : null;

  const nameTemplateFieldSignature = getTemplateFieldSignature(existingTemplateByNameForImport);

  const hasKnownNameConflict = Boolean(
    existingTemplateByNameForImport &&
    nameTemplateFieldSignature &&
    importFieldSignature &&
    nameTemplateFieldSignature !== importFieldSignature
  );

  const templatePreferredForImport = existingTemplateByFieldsForImport || existingTemplateByNameForImport;

  const isExistingTemplateAssociatedToProject = Boolean(templatePreferredForImport && importDraft && samples.some(
    (sample) =>
      (sample.project?.id || sample.projectId) === importDraft.project.id &&
      (sample.template?.id || sample.templateId) === templatePreferredForImport.id
  ));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Cargando muestras...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {importMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-emerald-800">
          {importMessage}
        </div>
      )}

      {/* Header Controls */}
      <div className="space-y-4 mb-4">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 border-l-4 border-teal-500 pl-3">Muestras</h2>
            <p className="text-xs text-gray-500 pl-3 mt-1 font-bold">
              {filteredSamples.length} de {samples.length} muestras
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="whitespace-nowrap bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition font-medium text-sm flex items-center gap-2 shadow-sm"
          >
            <span>+</span> Crear Muestra
          </button>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <input
              type="text"
              placeholder="Buscar por código de cliente o lab"
              value={searchQuery}
              onChange={(event) => handleSearch(event.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            />

            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            >
              <option value="all">Todos los estados</option>
              <option value="pending">Pendiente</option>
              <option value="completed">Completada</option>
              <option value="rejected">Rechazada</option>
            </select>

            <select
              name="clientId"
              value={filters.clientId}
              onChange={handleSampleFilterChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            >
              <option value="">Todos los clientes</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>

            <input
              type="date"
              name="fromDate"
              value={filters.fromDate}
              onChange={handleSampleFilterChange}
              max={filterDateMax}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            />

            <input
              type="date"
              name="toDate"
              value={filters.toDate}
              onChange={handleSampleFilterChange}
              max={filterDateMax}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            />
          </div>

          <div className="flex justify-end mt-3">
            <button
              type="button"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              className="text-sm text-gray-600 hover:text-gray-800 disabled:text-gray-400"
            >
              Limpiar filtros
            </button>
          </div>
        </div>
      </div>

      {filterError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {filterError}
        </div>
      )}

      {groupedDataByProject.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center mt-6">
          <p className="text-gray-500 font-medium">No hay muestras para mostrar.</p>
        </div>
      ) : (
        <div className="space-y-8 mt-6">
          {groupedDataByProject.map((project) => (
            <div
              key={project.id}
              className="space-y-4 relative"
              onDragEnter={(event) => handleDragEnter(project.id, event)}
              onDragOver={(event) => handleDragOver(project.id, event)}
              onDragLeave={(event) => handleDragLeave(project.id, event)}
              onDrop={(event) => handleDropFile(project, event)}
            >
              {dragActiveProjectId === project.id && (
                <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-emerald-400 bg-emerald-50/90 text-emerald-900 pointer-events-none">
                  <div className="flex flex-col items-center gap-2 text-center px-6">
                    <div className="text-lg font-black uppercase tracking-[0.2em]">Arrastra aqui</div>
                    <div className="text-xs font-semibold uppercase tracking-widest">Suelta para importar muestras</div>
                  </div>
                </div>
              )}
              {/* Project Bar */}
              <div className="bg-slate-900 text-white px-6 py-3 rounded-lg flex items-center justify-between shadow-md gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-teal-500 p-1.5 rounded-md text-white">
                    <Icon icon={faFolderOpen} size={14} color="currentColor" />
                  </div>
                  <h2 className="text-lg font-bold">
                    Proyecto: {project.name}
                  </h2>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    ref={(element) => {
                      if (element) {
                        fileInputRefs.current[project.id] = element;
                      }
                    }}
                    type="file"
                    accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(event) => handleImportFileChange(project, event)}
                  />
                  <button
                    type="button"
                    onClick={() => handleImportClick(project.id)}
                    disabled={isSubmitting || importingProjectId === project.id}
                    className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider hover:bg-emerald-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importingProjectId === project.id ? 'Importando...' : 'Importar'}
                  </button>
                </div>
              </div>

              {/* Templates under Project */}
              <div className="space-y-6">
                {project.templates.length === 0 && (
                  <div className="ml-4 bg-white border border-gray-100 rounded-xl p-6 text-sm text-gray-500 shadow-sm">
                    Este proyecto aun no tiene muestras asociadas. Puedes usar "Importar" para cargar nuevas muestras.
                  </div>
                )}

                {project.templates.map(template => (
                  <div key={`${project.id}-${template.id}`} className="ml-4 bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                    {/* Template Header */}
                    <div className="bg-gray-50/50 px-6 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">
                          <Icon icon={faFileLines} size={14} color="currentColor" />
                        </span>
                        <h3 className="text-slate-700 font-bold">Plantilla: {template.name}</h3>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {template.samples.length} MUESTRAS
                        </span>
                        <button
                          type="button"
                          onClick={() => handleBulkDeleteClick(project, template)}
                          disabled={template.samples.length === 0 || bulkDeleting}
                          className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] px-2.5 py-1 rounded-md border border-red-200 text-red-500 hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Icon icon={faTrashCan} size={10} color="currentColor" />
                          Eliminar todas
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-white border-b border-gray-200">
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">CÓDIGO DEL CLIENTE</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">CÓDIGO LAB</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">ESTADO</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">FECHA DE CREACIÓN</th>
                            {template.fields?.map(field => (
                              <th key={field.id} className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">
                                {field.name}{' '}
                                <span className="normal-case tracking-normal">
                                  ({getFieldTypeLabel(field.dataType)})
                                </span>
                              </th>
                            ))}
                            <th className="px-6 py-4 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">ACCIONES</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {template.samples.map(sample => {
                            const isEditingCurrent = editingId === sample.id;
                            
                            return (
                              <tr key={sample.id} className={`${isEditingCurrent ? "bg-teal-50/30" : "hover:bg-slate-50/50"} transition`}>
                                <td className="px-6 py-4 font-mono text-xs font-bold text-teal-600">
                                  {isEditingCurrent ? (
                                    <input
                                      type="text"
                                      className="w-full text-xs font-bold text-slate-900 border border-teal-200 rounded px-2 py-1 bg-white"
                                      value={editFormData.code}
                                      onChange={(event) =>
                                        setEditFormData({
                                          ...editFormData,
                                          code: event.target.value,
                                        })
                                      }
                                      placeholder="Código de muestra"
                                    />
                                  ) : (
                                    sample.code
                                  )}
                                </td>
                                <td className="px-6 py-4 font-mono text-xs font-bold text-slate-500">
                                  {isEditingCurrent ? (
                                    <input
                                      type="text"
                                      className="w-full text-xs font-bold text-slate-900 border border-teal-200 rounded px-2 py-1 bg-white"
                                      value={editFormData.customCode}
                                      onChange={(event) =>
                                        setEditFormData({
                                          ...editFormData,
                                          customCode: event.target.value,
                                        })
                                      }
                                      placeholder="Código Lab"
                                    />
                                  ) : (
                                    sample.customCode || '-'
                                  )}
                                </td>
                                <td className="px-6 py-4">
                                  {isEditingCurrent ? (
                                    <select 
                                      className="text-xs border border-teal-200 rounded px-2 py-1 bg-white focus:ring-1 focus:ring-teal-500 outline-none font-bold uppercase"
                                      value={editFormData.status}
                                      onChange={(e) => setEditFormData({...editFormData, status: e.target.value})}
                                    >
                                      <option value="pending">PENDIENTE</option>
                                      <option value="completed">COMPLETADA</option>
                                      <option value="rejected">RECHAZADA</option>
                                    </select>
                                  ) : (
                                    <span className={`px-2.5 py-1 text-[10px] font-black tracking-wider rounded-md border ${getStatusBadgeColor(sample.status)}`}>
                                      {getStatusDisplayLabel(sample.status)}
                                    </span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-xs font-bold text-slate-400">
                                  {formatDate(sample.createdAt)}
                                </td>
                                
                                {/* Dynamic Field Values */}
                                {template.fields?.map(field => {
                                  const valObj = (sample.sampleFieldValues || sample.values || []).find(v => (v.field?.id === field.id || v.fieldId === field.id));
                                  
                                  if (isEditingCurrent) {
                                    return (
                                      <td key={field.id} className="px-6 py-4">
                                        {field.dataType === 'boolean' ? (
                                          <input
                                            type="checkbox"
                                            className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                                            checked={!!editFormData.fieldValues[field.id]}
                                            onChange={(e) => setEditFormData({
                                              ...editFormData,
                                              fieldValues: { ...editFormData.fieldValues, [field.id]: e.target.checked }
                                            })}
                                          />
                                        ) : (
                                          <input
                                            type={field.dataType === "number" ? "number" : "text"}
                                            className="w-full text-xs font-bold text-slate-900 border border-teal-200 rounded px-2 py-1 bg-white"
                                            value={editFormData.fieldValues[field.id] || ""}
                                            onChange={(e) => setEditFormData({
                                              ...editFormData,
                                              fieldValues: { ...editFormData.fieldValues, [field.id]: e.target.value }
                                            })}
                                          />
                                        )}
                                      </td>
                                    );
                                  }

                                  if (field.dataType === 'boolean') {
                                    const isChecked = Boolean(valObj?.valueBoolean);
                                    return (
                                      <td key={field.id} className="px-6 py-4">
                                        <input
                                          type="checkbox"
                                          className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-0 cursor-not-allowed disabled:opacity-100"
                                          checked={isChecked}
                                          disabled
                                        />
                                      </td>
                                    );
                                  }

                                  let displayVal = "-";
                                  if (valObj) {
                                    if (valObj.valueText !== null && valObj.valueText !== undefined && valObj.valueText !== "") displayVal = valObj.valueText;
                                    else if (valObj.valueNumber !== null && valObj.valueNumber !== undefined) displayVal = valObj.valueNumber;
                                    else if (valObj.valueDate !== null && valObj.valueDate !== undefined) displayVal = valObj.valueDate;
                                  }
                                  return (<td key={field.id} className="px-6 py-4 text-xs font-black text-slate-900">{displayVal}</td>);
                                })}

                                <td className="px-6 py-4 text-right">
                                  {isEditingCurrent ? (
                                    <div className="flex items-center justify-end gap-3">
                                      <button 
                                        type="button"
                                        onClick={(event) => saveInlineEdit(event, sample)}
                                        className="text-green-600 hover:scale-125 transition text-lg"
                                        title="Guardar"
                                        disabled={isSubmitting}
                                      >
                                        {isSubmitting ? "..." : <Icon icon={faCheck} size={16} color="currentColor" />}
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={cancelEditing}
                                        className="text-red-600 hover:scale-125 transition text-lg"
                                        title="Cancelar"
                                        disabled={isSubmitting}
                                      >
                                        <Icon icon={faXmark} size={16} color="currentColor" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-end gap-3 opacity-30 hover:opacity-100 transition">
                                      <button type="button" onClick={() => startEditing(sample)} className="hover:scale-120 hover:grayscale-0 transition grayscale" title="Editar">
                                        <Icon icon={faPenToSquare} size={14} color="currentColor" />
                                      </button>
                                      <button type="button" onClick={() => handleDelete(sample.id)} className="hover:scale-120 hover:grayscale-0 transition grayscale" title="Eliminar">
                                        <Icon icon={faTrashCan} size={14} color="currentColor" />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}

                          {/* QUICK ADD ROW */}
                          <tr
                            className={`group transition-colors duration-200 ${
                              quickAddErrorRowKey === `${project.id}-${template.id}`
                                ? 'bg-red-100/80 animate-pulse'
                                : 'bg-slate-50/20'
                            }`}
                          >
                            <td className="px-6 py-3">
                              <input
                                type="text"
                                placeholder="AGREGAR MUESTRA"
                                className={`w-full bg-white border rounded px-2 py-1 text-xs font-bold text-slate-900 placeholder-slate-300 focus:ring-1 ${
                                  quickAddErrorRowKey === `${project.id}-${template.id}`
                                    ? 'border-red-300 focus:ring-red-500 focus:border-red-400'
                                    : 'border-teal-200 focus:ring-teal-500 focus:border-teal-300'
                                }`}
                                value={quickAddRow.templateId === template.id && quickAddRow.projectId === project.id ? quickAddRow.code : ""}
                                onChange={(e) => setQuickAddRow({ ...quickAddRow, templateId: template.id, projectId: project.id, code: e.target.value })}
                                onKeyDown={(e) => { if (e.key === "Enter") handleQuickAdd(template.id, project.id); }}
                              />
                            </td>
                            <td className="px-6 py-3">
                              <input
                                type="text"
                                placeholder="Código Lab"
                                className="w-full bg-white border border-teal-200 rounded px-2 py-1 text-xs font-bold text-slate-500 placeholder-slate-300 focus:ring-1 focus:ring-teal-500 focus:border-teal-300"
                                value={quickAddRow.templateId === template.id && quickAddRow.projectId === project.id ? quickAddRow.customCode : ""}
                                onChange={(e) => setQuickAddRow({ ...quickAddRow, templateId: template.id, projectId: project.id, customCode: e.target.value })}
                                onKeyDown={(e) => { if (e.key === "Enter") handleQuickAdd(template.id, project.id); }}
                              />
                            </td>
                            <td className="px-6 py-3">
                              <select 
                                className="w-full bg-white border border-teal-200 rounded px-2 py-1 text-[10px] font-black uppercase text-slate-500 cursor-pointer focus:ring-1 focus:ring-teal-500 focus:border-teal-300"
                                value={quickAddRow.templateId === template.id && quickAddRow.projectId === project.id ? quickAddRow.status : "pending"}
                                onChange={(e) => setQuickAddRow({ ...quickAddRow, templateId: template.id, projectId: project.id, status: e.target.value })}
                              >
                                <option value="pending">PENDIENTE</option>
                                <option value="completed">COMPLETADA</option>
                                <option value="rejected">RECHAZADA</option>
                              </select>
                            </td>
                            <td className="px-6 py-3 text-[10px] font-bold text-slate-300">AUTO GENERADA</td>
                            {template.fields?.map(field => (
                              <td key={field.id} className="px-6 py-3">
                                {field.dataType === 'boolean' ? (
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 text-teal-600 border-teal-300 rounded focus:ring-teal-500"
                                    checked={quickAddRow.templateId === template.id && quickAddRow.projectId === project.id ? !!quickAddRow.fieldValues[field.id] : false}
                                    onChange={(e) => setQuickAddRow({ ...quickAddRow, templateId: template.id, projectId: project.id, fieldValues: { ...quickAddRow.fieldValues, [field.id]: e.target.checked } })}
                                  />
                                ) : (
                                  <input
                                    type={field.dataType === "number" ? "number" : "text"}
                                    placeholder="..."
                                    className="w-full bg-white border border-teal-200 rounded px-2 py-1 text-xs font-black text-slate-500 placeholder-slate-300 focus:ring-1 focus:ring-teal-500 focus:border-teal-300"
                                    value={quickAddRow.templateId === template.id && quickAddRow.projectId === project.id ? (quickAddRow.fieldValues[field.id] || "") : ""}
                                    onChange={(e) => setQuickAddRow({ ...quickAddRow, templateId: template.id, projectId: project.id, fieldValues: { ...quickAddRow.fieldValues, [field.id]: e.target.value } })}
                                    onKeyDown={(e) => { if (e.key === "Enter") handleQuickAdd(template.id, project.id); }}
                                  />
                                )}
                              </td>
                            ))}
                            <td className="px-6 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleQuickAdd(template.id, project.id)}
                                className={`font-bold text-lg transition-colors ${
                                  quickAddErrorRowKey === `${project.id}-${template.id}`
                                    ? 'text-red-500 hover:text-red-600'
                                    : 'text-slate-300 hover:text-teal-500'
                                }`}
                              >
                                {isSubmitting ? "..." : "+"}
                              </button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* IMPORT TEMPLATE CONFIG MODAL */}
      {showImportTemplateModal && importDraft && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="bg-emerald-700 px-6 py-4 flex items-center justify-between text-white">
              <div>
                <h3 className="text-lg font-bold">Configurar Plantilla Para Importación</h3>
                <p className="text-xs text-emerald-100 mt-1">
                  Proyecto: {importDraft.project.name}
                </p>
              </div>
              <button
                onClick={resetImportDraft}
                className="bg-white/20 hover:bg-white/30 p-1.5 rounded-lg transition"
              >
                <span className="block text-xl leading-none">&times;</span>
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-auto">
              <div className="bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-3 py-2 text-xs">
                <span className="font-black">Aviso:</span> las columnas <span className="font-black">code</span> y <span className="font-black">customCode</span> son obligatorias en la estructura y no crean campos nuevos. Tamaño máximo: <span className="font-black">20 MB</span>.
              </div>

              {existingTemplateByNameForImport && !hasKnownNameConflict && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 text-sm">
                  La plantilla <span className="font-black">{existingTemplateByNameForImport.name}</span> ya existe en general.
                  {isExistingTemplateAssociatedToProject
                    ? ' Ya está asociada a este proyecto: solo se agregarán nuevas muestras a esa plantilla.'
                    : ' Se usará esta plantilla existente para agregar las muestras.'}
                </div>
              )}

              {existingTemplateByFieldsForImport && (
                <div className="bg-cyan-50 border border-cyan-200 text-cyan-800 rounded-lg p-4 text-sm">
                  Ya existe una plantilla con los mismos campos importados:
                  {' '}<span className="font-black">{existingTemplateByFieldsForImport.name}</span>.
                  {' '}Se usará esta plantilla para importar las muestras y evitar duplicados.
                </div>
              )}

              {hasKnownNameConflict && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-4 text-sm font-semibold">
                  Ya existe una plantilla con ese nombre, pero sus campos no coinciden con los del archivo.
                  Cambia el nombre para crear una nueva plantilla o usa un archivo con la misma estructura.
                </div>
              )}

              {importModalError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm font-semibold">
                  {importModalError}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                  Nombre de la plantilla
                </label>
                <input
                  type="text"
                  value={importTemplateName}
                  onChange={(e) => {
                    setImportTemplateName(e.target.value);
                    if (importModalError) {
                      setImportModalError(null);
                    }
                  }}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-gray-700"
                  placeholder="Ej: Plantilla de importación"
                />
              </div>

              <div>
                <h4 className="text-sm font-black text-gray-700 uppercase tracking-wider mb-3">
                  Campos detectados y requeridos
                </h4>

                <div className="space-y-2">
                  {importFieldSettings.map((field, index) => (
                    <div key={`${field.name}-${index}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
                      <div>
                        <p className="text-sm font-bold text-gray-800">{field.name}</p>
                        <p className="text-[11px] text-gray-500">Tipo detectado: {field.dataType}</p>
                      </div>

                      <label className="inline-flex items-center gap-2 text-xs font-bold text-gray-600 uppercase tracking-wide">
                        <input
                          type="checkbox"
                          checked={Boolean(field.required)}
                          onChange={(e) => setImportFieldSettings((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, required: e.target.checked }
                                : item
                            )
                          )}
                          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        Required
                      </label>

                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-100 rounded px-2 py-1">
                        {field.required ? 'Si' : 'No'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetImportDraft}
                  className="flex-1 px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmTemplateFromDraft}
                  disabled={importingProjectId === importDraft.project.id || hasKnownNameConflict}
                  className="flex-1 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-lg shadow-emerald-200 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Icon icon={faFloppyDisk} size={14} color="currentColor" />
                  {importingProjectId === importDraft.project.id
                    ? 'Importando...'
                    : existingTemplateByFieldsForImport
                      ? 'Agregar Muestras a Plantilla con Mismos Campos'
                      : hasKnownNameConflict
                        ? 'Cambia el Nombre para Continuar'
                      : 'Crear Plantilla e Importar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE MODAL (Restored) */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all">
            {/* Modal Header */}
            <div className="bg-emerald-500 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">Crear Muestra</h3>
              </div>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="bg-white/20 hover:bg-white/30 p-1.5 rounded-lg transition"
              >
                <span className="block text-xl leading-none">&times;</span>
              </button>
            </div>

            <form onSubmit={handeModalCreate} className="p-6 space-y-5">
              {/* Código */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 font-bold">
                  CÓDIGO DEL CLIENTE *
                </label>
                <input
                  type="text"
                  placeholder="Ej: BIO-MS-001"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-gray-700 transition"
                  value={createFormData.code}
                  onChange={(e) => setCreateFormData({...createFormData, code: e.target.value})}
                  required
                />
              </div>

              {/* Custom Code */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 font-bold">
                  CÓDIGO LABORATORIO
                </label>
                <input
                  type="text"
                  placeholder="Ej: EXT-001"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-gray-700 transition"
                  value={createFormData.customCode}
                  onChange={(e) => setCreateFormData({...createFormData, customCode: e.target.value})}
                />
              </div>

              {/* Proyecto */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 font-bold">
                  PROYECTO *
                </label>
                <select
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-gray-700 appearance-none transition"
                  value={createFormData.projectId}
                  onChange={(e) => setCreateFormData({...createFormData, projectId: e.target.value})}
                  required
                >
                  <option value="">Selecciona un proyecto</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Template */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 font-bold">
                  TEMPLATE *
                </label>
                <select
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-gray-700 transition"
                  value={createFormData.templateId}
                  onChange={(e) => setCreateFormData({...createFormData, templateId: e.target.value})}
                  required
                >
                  <option value="">Selecciona un template</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Estado */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 font-bold">
                  ESTADO
                </label>
                <select
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-gray-700 transition"
                  value={createFormData.status}
                  onChange={(e) => setCreateFormData({...createFormData, status: e.target.value})}
                >
                  <option value="pending">Pendiente</option>
                  <option value="completed">Completado</option>
                  <option value="rejected">Rechazado</option>
                </select>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg transition"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg shadow-emerald-200 transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Creando...' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK DELETE MODAL */}
      {showBulkDeleteModal && bulkDeleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 overflow-hidden">
            <div className="mb-4 text-center">
              <div className="bg-red-50 text-red-500 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
                <Icon icon={faTriangleExclamation} size={18} color="currentColor" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Eliminar todas las muestras</h3>
              <p className="text-gray-500 text-sm">
                Se eliminaran {bulkDeleteTarget.sampleCount} muestras de la plantilla
                "{bulkDeleteTarget.templateName}" en el proyecto "{bulkDeleteTarget.projectName}".
              </p>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowBulkDeleteModal(false);
                  setBulkDeleteTarget(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold transition"
                disabled={bulkDeleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmBulkDelete}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-bold transition disabled:opacity-50"
                disabled={bulkDeleting}
              >
                {bulkDeleting ? 'Eliminando...' : 'Eliminar todo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 overflow-hidden">
            <div className="mb-4 text-center">
              <div className="bg-red-50 text-red-500 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
                <Icon icon={faTriangleExclamation} size={18} color="currentColor" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">¿Eliminar Muestra?</h3>
              <p className="text-gray-500 text-sm">Esta acción es irreversible y eliminará todos los datos asociados.</p>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold transition">No, volver</button>
              <button onClick={confirmDelete} className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-bold transition">Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Confirmation Modal */}
      {confirmDialog.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-emerald-600 px-6 py-4 text-white">
              <h3 className="text-lg font-bold">Confirmar Importación</h3>
            </div>

            <div className="p-6">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-emerald-900 text-sm leading-relaxed">
                <div className="flex items-start gap-3">
                  <div className="bg-emerald-100 text-emerald-700 w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    <Icon icon={faTriangleExclamation} size={14} color="currentColor" />
                  </div>
                  <p className="font-semibold">{confirmDialog.message}</p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => resolveImportConfirmation(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => resolveImportConfirmation(true)}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

