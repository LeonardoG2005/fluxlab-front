/**
 * Templates Table Component
 * 
 * Displays a list of data templates with actions to create, edit, and delete
 * Integrates with Supabase authentication and JWT tokens
 */

import { useState, useEffect, useRef } from 'react';
import {
  faClipboardList,
  faDownload,
  faFileLines,
  faPenToSquare,
  faTrashCan,
  faTriangleExclamation
} from '@fortawesome/free-solid-svg-icons';
import * as XLSX from 'xlsx';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import TemplateBuilder from './TemplateBuilder';
import Icon from './Icon';

export default function TemplatesTable() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [templateSearch, setTemplateSearch] = useState('');
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState(null);
  const hasMountedRef = useRef(false);

  // Load templates on component mount
  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    const timeoutId = setTimeout(() => {
      loadTemplates(templateSearch);
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [templateSearch]);

  const loadTemplates = async (name = '') => {
    try {
      setLoading(true);
      setError(null);

      const trimmedName = String(name || '').trim();
      const data = trimmedName
        ? await apiService.templates.searchByName(trimmedName)
        : await apiService.templates.getAll();

      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading templates:', err);
      setError(err.message || 'Error al cargar las plantillas');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    setSelectedTemplate(null);
    setShowBuilder(true);
  };

  const handleEdit = (template) => {
    setSelectedTemplate(template);
    setShowBuilder(true);
  };

  const sanitizeFilename = (value) => {
    const baseName = String(value || '').trim();
    const normalized = baseName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const sanitized = normalized.replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '');

    return sanitized || 'template';
  };

  const buildTemplateHeaders = (template) => {
    const baseHeaders = ['code', 'customCode'];
    const fields = Array.isArray(template?.fields) ? template.fields : [];
    const reservedHeaders = new Set(baseHeaders.map((header) => header.toLowerCase()));
    const uniqueHeaders = [];
    const seen = new Set();

    fields
      .map((field) => String(field?.name || '').trim())
      .filter(Boolean)
      .forEach((name) => {
        const key = name.toLowerCase();
        if (reservedHeaders.has(key) || seen.has(key)) {
          return;
        }
        seen.add(key);
        uniqueHeaders.push(name);
      });

    return [...baseHeaders, ...uniqueHeaders];
  };

  const formatCreatedAt = (value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';

    return parsed.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const handleDownloadTemplate = (template) => {
    try {
      const headers = buildTemplateHeaders(template);
      const worksheet = XLSX.utils.aoa_to_sheet([headers]);
      worksheet['!cols'] = headers.map(() => ({ wch: 20 }));
      const workbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla');

      const createdAt = formatCreatedAt(template?.createdAt || template?.created_at);
      const fields = Array.isArray(template?.fields) ? template.fields : [];
      const infoRows = [
        ['Nombre', template?.name || ''],
        ['Descripcion', template?.description || ''],
        ['Creado en', createdAt]
      ];

      const fieldRows = fields.map((field) => [
        String(field?.name || ''),
        String(field?.dataType || field?.data_type || ''),
        field?.required ? 'Si' : 'No'
      ]);

      const infoSheetRows = [
        ...infoRows,
        [],
        ['Campos'],
        ['Nombre', 'Tipo de dato', 'Requerido'],
        ...fieldRows
      ];
      const infoSheet = XLSX.utils.aoa_to_sheet(infoSheetRows);
      infoSheet['!cols'] = [
        { wch: 28 },
        { wch: 40 },
        { wch: 16 }
      ];
      infoSheet['!rows'] = infoSheetRows.map((_, index) => ({
        hpt: index <= 2 ? 22 : 18
      }));
      XLSX.utils.book_append_sheet(workbook, infoSheet, 'Informacion');

      const fileName = `${sanitizeFilename(template?.name)}.xlsx`;
      XLSX.writeFile(workbook, fileName, { bookType: 'xlsx' });
    } catch (err) {
      console.error('Error downloading template:', err);
      setError('Error al descargar la plantilla: ' + (err.message || 'Intenta de nuevo más tarde'));
    }
  };

  const handleSaveSuccess = (updatedTemplate) => {
    if (selectedTemplate) {
      // Update existing: replace and keep order or move to top if preferred
      // For now, let's keep it in its place but update the data
      setTemplates(templates.map(t => t.id === updatedTemplate.id ? updatedTemplate : t));
    } else {
      // Add new: ALWAYS AT THE TOP
      setTemplates([updatedTemplate, ...templates]);
    }
    setShowBuilder(false);
    setSelectedTemplate(null);
  };

  const handleCancelBuilder = () => {
    setShowBuilder(false);
    setSelectedTemplate(null);
  };

  const handleDelete = (id) => {
    setTemplateToDelete(id);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!templateToDelete) return;
    
    try {
      await apiService.templates.remove(templateToDelete);
      setTemplates(templates.filter(t => t.id !== templateToDelete));
      setShowDeleteModal(false);
      setTemplateToDelete(null);
    } catch (err) {
      console.error('Error deleting template:', err);
      setError('Error al eliminar la plantilla: ' + (err.message || 'Intenta de nuevo más tarde'));
      setShowDeleteModal(false);
    }
  };

  if (showBuilder) {
    return (
      <TemplateBuilder 
        template={selectedTemplate}
        onSave={handleSaveSuccess} 
        onCancel={handleCancelBuilder} 
      />
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 font-medium">
          <span className="inline-flex items-center gap-2">
            <Icon icon={faTriangleExclamation} size={14} color="currentColor" />
            {error}
          </span>
        </div>
      )}

      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Plantillas de Datos</h2>
          <p className="text-sm text-gray-500">Define la estructura para tus protocolos de laboratorio</p>
        </div>
        <button
          onClick={handleCreateNew}
          className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-green-100"
        >
          <span>+</span>
          <span>Nueva Plantilla</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={templateSearch}
            onChange={(event) => setTemplateSearch(event.target.value)}
            placeholder="Buscar por nombre"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
          />
          <button
            type="button"
            onClick={() => setTemplateSearch('')}
            className="px-4 py-3 rounded-xl font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Limpiar
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-2">
          <div className="text-gray-500 italic">Cargando templates...</div>
        </div>
      )}

      {/* Templates List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl border-2 border-dashed border-gray-100 p-12 text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl text-gray-300">
              <Icon icon={faClipboardList} size={24} color="currentColor" />
            </div>
            <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">No hay plantillas creadas</p>
          </div>
        ) : (
          templates.map((template) => (
            <div 
              key={template.id} 
              className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl transition-all group flex flex-col h-full relative"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-xl">
                  <Icon icon={faFileLines} size={18} color="#059669" />
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={() => handleEdit(template)}
                    className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                    title="Editar"
                  >
                    <Icon icon={faPenToSquare} size={14} color="currentColor" />
                  </button>
                  <button
                    onClick={() => handleDownloadTemplate(template)}
                    className="p-2 text-gray-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                    title="Descargar"
                  >
                    <Icon icon={faDownload} size={14} color="currentColor" />
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg"
                    title="Eliminar"
                  >
                    <Icon icon={faTrashCan} size={14} color="currentColor" />
                  </button>
                </div>
              </div>
              
              <h3 className="text-lg font-bold text-gray-900 mb-2">{template.name}</h3>
              <p className="text-sm text-gray-500 line-clamp-2 mb-4 flex-1">
                {template.description || 'Sin descripción disponible para esta plantilla.'}
              </p>
              
              <div className="pt-4 border-t border-gray-50 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  {template.fields?.length || 0} Campos
                </span>
                <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-black rounded-lg uppercase tracking-widest">
                  Ver Detalles
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-sm w-full p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-4 text-xl">
              <Icon icon={faTriangleExclamation} size={20} color="currentColor" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">¿Eliminar plantilla?</h3>
            <p className="text-gray-500 mb-6 leading-relaxed">
              Esta acción no puede deshacerse. Asegúrate de que no haya muestras usando esta plantilla.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={confirmDelete}
                className="w-full bg-red-500 hover:bg-red-600 text-white px-4 py-3 rounded-xl font-bold transition-all"
              >
                Sí, eliminar definitivamente
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
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
