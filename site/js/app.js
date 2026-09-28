(function () {
  'use strict';

  const app = document.getElementById('app');
  const modal = document.getElementById('app-modal');
  const modalForm = document.getElementById('modal-form');
  const modalTitle = document.getElementById('modal-title');
  const modalEyebrow = document.getElementById('modal-eyebrow');
  const modalBody = document.getElementById('modal-body');
  const modalSubmit = document.getElementById('modal-submit');
  const modalClose = document.getElementById('modal-close');
  const modalCancel = document.getElementById('modal-cancel');
  const toastRegion = document.getElementById('toast-region');

  const UI = {
    modalHandler: null,
    librarySearch: '',
    libraryFilter: PFMEA_STORAGE.readSettings().libraryFilter || 'all',
    mapValidation: null,
    lastSaveAt: null
  };

  const STATUS_LABELS = {
    draft: 'Borrador',
    'in-review': 'En revisión',
    final: 'Final',
    archived: 'Archivado',
    replaced: 'Reemplazado',
    'not-started': 'No iniciada',
    'in-progress': 'En progreso',
    complete: 'Completa',
    'review-required': 'Revisión requerida',
    error: 'Con errores',
    pending: 'Pendiente',
    'not-applicable': 'No aplica',
    proposed: 'Propuesta',
    accepted: 'Aceptada',
    implemented: 'Implementada',
    'pending-verification': 'Pendiente de verificación',
    'effectiveness-verified': 'Efectividad verificada',
    cancelled: 'Cancelada',
    'requires-action': 'Requiere acción',
    'accepted-currently': 'Aceptado actualmente',
    'accepted-with-justification': 'Aceptado con justificación',
    'accepted-temporarily': 'Aceptado temporalmente',
    'closed-after-action': 'Cerrado después de acción',
    evaluated: 'Evaluado',
    'action-open': 'Acción abierta'
  };

  const NODE_TYPES = {
    start: 'Inicio',
    end: 'Fin',
    operation: 'Operación',
    inspection: 'Inspección / control',
    decision: 'Decisión',
    transport: 'Transporte',
    storage: 'Almacenamiento',
    wait: 'Espera',
    external: 'Proceso externo',
    rework: 'Retrabajo',
    subprocess: 'Subproceso'
  };

  const FAILURE_SUGGESTIONS = [
    'No ocurre',
    'Ocurre parcialmente',
    'Ocurre en exceso',
    'Ocurre de manera insuficiente',
    'Ocurre demasiado temprano',
    'Ocurre demasiado tarde',
    'Ocurre de forma intermitente',
    'Resultado variable o inconsistente',
    'Material incorrecto',
    'Unidad incorrecta',
    'Contaminación',
    'Daño',
    'Operación omitida',
    'Operación adicional',
    'No detecta o no rechaza el defecto'
  ];

  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const attr = (value) => esc(value).replaceAll('\n', '&#10;');

  function formatDate(value, includeTime = false) {
    if (!value) return 'Sin fecha';
    const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('es-AR', includeTime
      ? { dateStyle: 'short', timeStyle: 'short' }
      : { dateStyle: 'short' }).format(date);
  }

  function relativeDate(value) {
    if (!value) return 'nunca';
    const date = new Date(value);
    const diff = Date.now() - date.getTime();
    const minutes = Math.max(0, Math.round(diff / 60000));
    if (minutes < 1) return 'recién';
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.round(hours / 24);
    return `hace ${days} día${days === 1 ? '' : 's'}`;
  }

  function statusLabel(status) {
    return STATUS_LABELS[status] || String(status || 'Sin estado');
  }

  function statusTone(status) {
    if (['complete', 'final', 'effectiveness-verified', 'accepted-currently', 'closed-after-action'].includes(status)) return 'success';
    if (['error', 'cancelled'].includes(status)) return 'danger';
    if (['in-progress', 'pending', 'review-required', 'requires-action', 'accepted-temporarily', 'pending-verification'].includes(status)) return 'warning';
    if (['in-review', 'evaluated', 'implemented'].includes(status)) return 'info';
    return '';
  }

  function badge(status, label = null) {
    return `<span class="badge ${statusTone(status)}">${esc(label || statusLabel(status))}</span>`;
  }

  function rpnClass(rpn, project) {
    const value = Number(rpn || 0);
    if (value >= Number(project.methodology.thresholds.actionRpn || 180)) return 'rpn-high';
    if (value >= Number(project.methodology.thresholds.reviewRpn || 120)) return 'rpn-medium';
    return 'rpn-low';
  }

  function navigate(hash) {
    if (window.location.hash === hash) render();
    else window.location.hash = hash;
  }

  function parseRoute() {
    const raw = window.location.hash.replace(/^#\/?/, '');
    const segments = raw.split('/').filter(Boolean).map(decodeURIComponent);
    if (!segments.length) return { page: 'projects', segments: [] };
    if (segments[0] === 'projects') return { page: 'projects', segments };
    if (segments[0] === 'project' && segments[1]) {
      return {
        page: 'project',
        projectId: segments[1],
        section: segments[2] || 'overview',
        arg1: segments[3] || null,
        arg2: segments[4] || null,
        segments
      };
    }
    return { page: 'projects', segments: [] };
  }

  function projectRoute(projectId, section = 'overview', arg1 = null, arg2 = null) {
    const parts = ['#project', encodeURIComponent(projectId), section];
    if (arg1) parts.push(encodeURIComponent(arg1));
    if (arg2) parts.push(encodeURIComponent(arg2));
    return parts.join('/');
  }

  function toast(title, detail = '') {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<strong>${esc(title)}</strong>${detail ? `<span>${esc(detail)}</span>` : ''}`;
    toastRegion.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function downloadBlob(content, filename, type = 'application/octet-stream') {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function safeFilename(value) {
    return String(value || 'PFMEA')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function getByPath(object, path) {
    return path.split('.').reduce((current, key) => current?.[key], object);
  }

  function setByPath(object, path, value) {
    const keys = path.split('.');
    let current = object;
    keys.slice(0, -1).forEach((key) => {
      if (!current[key] || typeof current[key] !== 'object') current[key] = {};
      current = current[key];
    });
    current[keys[keys.length - 1]] = value;
  }

  function persist(project, { rerender = true, message = null } = {}) {
    const saved = PFMEA_STORAGE.saveProject(project);
    UI.lastSaveAt = new Date();
    if (message) toast(message);
    if (rerender) render();
    return saved;
  }

  function inputField({ label, path, value, type = 'text', required = false, full = false, help = '', options = null, min = null, max = null, readonly = false }) {
    const common = `data-bind="${attr(path)}" ${required ? 'required' : ''} ${readonly ? 'readonly' : ''} ${min !== null ? `min="${min}"` : ''} ${max !== null ? `max="${max}"` : ''}`;
    let control = '';
    if (type === 'textarea') {
      control = `<textarea ${common}>${esc(value)}</textarea>`;
    } else if (options) {
      control = `<select ${common}>${options.map((option) => {
        const optionValue = typeof option === 'object' ? option.value : option;
        const optionLabel = typeof option === 'object' ? option.label : option;
        return `<option value="${attr(optionValue)}" ${String(optionValue) === String(value) ? 'selected' : ''}>${esc(optionLabel)}</option>`;
      }).join('')}</select>`;
    } else {
      control = `<input type="${attr(type)}" value="${attr(value)}" ${common} />`;
    }
    return `<div class="field ${full ? 'full' : ''}"><label>${esc(label)}${required ? ' *' : ''}</label>${control}${help ? `<small>${esc(help)}</small>` : ''}</div>`;
  }

  function selectOptions(values, current, mapper = (value) => ({ value, label: value })) {
    return values.map((value) => mapper(value)).map((option) => `<option value="${attr(option.value)}" ${String(option.value) === String(current) ? 'selected' : ''}>${esc(option.label)}</option>`).join('');
  }

  function openForm(config) {
    modalEyebrow.textContent = config.eyebrow || 'PFMEA Flow';
    modalTitle.textContent = config.title || 'Formulario';
    modalSubmit.textContent = config.submitLabel || 'Guardar';
    const fields = config.fields || [];
    const standardFields = fields.filter((field) => !field.advanced);
    const advancedFields = fields.filter((field) => field.advanced);
    const gridClass = config.columns === 1 ? 'one' : config.columns === 3 ? 'three' : '';
    modalBody.innerHTML = `<div class="form-grid ${gridClass}">
      ${standardFields.map((field) => modalField(field)).join('')}
    </div>
    ${advancedFields.length ? `<details class="advanced-disclosure" ${config.advancedOpen ? 'open' : ''}>
      <summary><span>Más detalles técnicos</span><small>${advancedFields.length} campos opcionales</small></summary>
      <div class="form-grid ${gridClass}">${advancedFields.map((field) => modalField(field)).join('')}</div>
    </details>` : ''}
    ${config.afterHtml || ''}`;
    UI.modalHandler = config.onSubmit || null;
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
    setTimeout(() => modalBody.querySelector('input, textarea, select')?.focus(), 30);
  }

  function modalField(field) {
    const value = field.value ?? '';
    const classes = `field ${field.full ? 'full' : ''}`;
    const common = `name="${attr(field.name)}" ${field.required ? 'required' : ''} ${field.min !== undefined ? `min="${field.min}"` : ''} ${field.max !== undefined ? `max="${field.max}"` : ''}`;
    let control = '';
    if (field.type === 'textarea') {
      control = `<textarea ${common} placeholder="${attr(field.placeholder || '')}">${esc(value)}</textarea>`;
    } else if (field.type === 'select') {
      control = `<select ${common}>${(field.options || []).map((option) => {
        const optionValue = typeof option === 'object' ? option.value : option;
        const optionLabel = typeof option === 'object' ? option.label : option;
        return `<option value="${attr(optionValue)}" ${String(optionValue) === String(value) ? 'selected' : ''}>${esc(optionLabel)}</option>`;
      }).join('')}</select>`;
    } else if (field.type === 'checkbox') {
      control = `<label class="action-row"><input style="width:auto;min-height:auto" type="checkbox" ${common} ${value ? 'checked' : ''} /> <span>${esc(field.checkboxLabel || field.label)}</span></label>`;
    } else {
      control = `<input type="${attr(field.type || 'text')}" value="${attr(value)}" ${common} placeholder="${attr(field.placeholder || '')}" />`;
    }
    return `<div class="${classes}">${field.type === 'checkbox' ? '' : `<label>${esc(field.label)}${field.required ? ' *' : ''}</label>`}${control}${field.help ? `<small>${esc(field.help)}</small>` : ''}</div>`;
  }

  function closeModal() {
    UI.modalHandler = null;
    if (typeof modal.close === 'function') modal.close();
    else modal.removeAttribute('open');
    modalForm.reset();
  }

  function collectModalData() {
    const data = {};
    modalBody.querySelectorAll('[name]').forEach((element) => {
      data[element.name] = element.type === 'checkbox' ? element.checked : element.value;
    });
    return data;
  }

  modalForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!modalForm.reportValidity()) return;
    const handler = UI.modalHandler;
    const data = collectModalData();
    closeModal();
    if (handler) handler(data);
  });
  modalClose.addEventListener('click', closeModal);
  modalCancel.addEventListener('click', closeModal);

  function renderLibrary() {
    const projects = PFMEA_STORAGE.listProjects();
    const search = UI.librarySearch.trim().toLowerCase();
    const filtered = projects.filter((project) => {
      const matchesFilter = UI.libraryFilter === 'all' || project.metadata.status === UI.libraryFilter;
      const haystack = [project.metadata.name, project.metadata.code, project.metadata.processName, project.metadata.site].join(' ').toLowerCase();
      return matchesFilter && (!search || haystack.includes(search));
    });

    app.innerHTML = `
      <div class="library-shell">
        <header class="library-topbar">
          <div class="brand-lockup">
            <div class="brand-mark">PF</div>
            <div><div class="brand-title">PFMEA Flow</div><div class="brand-subtitle">Aplicación local-first · v0.4.1</div></div>
          </div>
          <button class="button secondary small" data-action="reset-demo">Restaurar proyecto demo</button>
        </header>
        <main class="library-content">
          <section class="library-hero">
            <div>
              <p class="eyebrow">Biblioteca local</p>
              <h1>Proyectos PFMEA</h1>
              <p>Construí el mapa de proceso, analizá cada cadena de falla y conservá el proyecto en este navegador. La v0.4.1 suma publicación estable, una base local robusta, copias internas y archivos portátiles para que el trabajo no dependa de una sola pestaña con aspiraciones de inmortalidad.</p>
            </div>
            <div class="action-row">
              <button class="button primary" data-action="new-project">＋ Crear proyecto</button>
              <button class="button secondary" data-action="import-project">⇧ Importar proyecto</button>
              <input class="sr-only" id="project-file-input" type="file" accept=".json,.pfmea" />
            </div>
          </section>

          <section class="library-controls">
            <div class="search-field"><input id="library-search" type="search" value="${attr(UI.librarySearch)}" placeholder="Buscar por nombre, código, proceso o sitio" /></div>
            <div class="segmented" aria-label="Filtrar proyectos">
              ${[
                ['all', 'Todos'], ['draft', 'Borrador'], ['in-review', 'En revisión'], ['final', 'Final'], ['archived', 'Archivados']
              ].map(([value, label]) => `<button class="${UI.libraryFilter === value ? 'active' : ''}" data-action="library-filter" data-value="${value}">${label}</button>`).join('')}
            </div>
          </section>

          ${filtered.length ? `<section class="project-grid">${filtered.map(renderProjectCard).join('')}</section>` : `
            <section class="empty-state">
              <div class="empty-icon">◇</div>
              <h2>No hay proyectos para mostrar</h2>
              <p>${projects.length ? 'El filtro actual no encontró coincidencias.' : 'Creá un proyecto nuevo o importá uno existente.'}</p>
            </section>`}
        </main>
      </div>`;

    const searchInput = document.getElementById('library-search');
    searchInput?.addEventListener('input', (event) => {
      UI.librarySearch = event.target.value;
      clearTimeout(searchInput._timer);
      searchInput._timer = setTimeout(renderLibrary, 120);
    });
  }

  function renderProjectCard(project) {
    const metrics = PFMEA_MODEL.projectMetrics(project);
    return `
      <article class="project-card">
        <div class="card-topline">
          <div>
            <p class="eyebrow">${esc(project.metadata.code)} · Rev. ${esc(project.metadata.revision)}</p>
            <h3>${esc(project.metadata.name)}</h3>
            <div class="meta">${esc(project.metadata.processName || 'Proceso todavía no definido')}</div>
          </div>
          ${badge(project.metadata.status)}
        </div>
        <div class="card-metrics">
          <div class="metric-mini"><strong>${metrics.totalProgress}%</strong><span>avance</span></div>
          <div class="metric-mini"><strong>${metrics.risks}</strong><span>riesgos</span></div>
          <div class="metric-mini"><strong>${metrics.openActions}</strong><span>acciones abiertas</span></div>
        </div>
        <div class="meta">Modificado ${relativeDate(project.metadata.updatedAt)} · Copia externa ${relativeDate(project.metadata.lastExternalBackupAt)}</div>
        <div class="card-footer">
          <button class="button primary small" data-action="open-project" data-project-id="${attr(project.id)}">Abrir proyecto</button>
          <div class="action-row">
            <button class="button ghost small" data-action="duplicate-project" data-project-id="${attr(project.id)}">Duplicar</button>
            <button class="button ghost small" data-action="project-more" data-project-id="${attr(project.id)}">Más</button>
          </div>
        </div>
      </article>`;
  }

  function workspaceShell(project, activeSection, config) {
    const metrics = PFMEA_MODEL.projectMetrics(project);
    const sidebarItems = [
      ['overview', '◫', 'Resumen', ''],
      ['setup', '⚙', 'Configuración', `${metrics.setupProgress}%`],
      ['map', '⌘', 'Mapa de proceso', project.processMap.confirmedAt ? 'Confirmado' : `${metrics.mapProgress}%`],
      ['analysis', '◉', 'Análisis PFMEA', `${metrics.completedStages}/${metrics.stages}`],
      ['matrix', '▦', 'Vista matricial', `${metrics.risks}`],
      ['actions', '✓', 'Plan de acciones', `${metrics.openActions}`],
      ['review', '⚠', 'Revisión final', `${validateProject(project, project.metadata.status === 'draft' ? 'in-review' : 'final').length}`],
      ['export', '⇩', 'Exportación', project.metadata.lastExportAt ? 'Generado' : 'Nunca']
    ];

    const bodyClass = config.contextHtml ? 'content-grid' : 'content-grid no-context';
    app.innerHTML = `
      <div class="workspace">
        <header class="workspace-topbar">
          <button class="icon-button mobile-sidebar-toggle" data-action="mobile-menu" aria-label="Abrir menú">☰</button>
          <button class="icon-button" data-action="back-library" aria-label="Volver a proyectos">‹</button>
          <div class="brand-mark">PF</div>
          <div class="topbar-project">
            <strong>${esc(project.metadata.name)}</strong>
            <span>${esc(project.metadata.code)} · Rev. ${esc(project.metadata.revision)} · ${statusLabel(project.metadata.status)}</span>
          </div>
          <div class="save-state" title="${attr(PFMEA_STORAGE.storageLabel())}">${PFMEA_STORAGE.isPersistent() ? `● Guardado ${UI.lastSaveAt ? relativeDate(UI.lastSaveAt) : relativeDate(project.metadata.updatedAt)} · ${esc(PFMEA_STORAGE.storageLabel())}` : `⚠ Modo temporal: exportá una copia JSON`}</div>
          <button class="button ghost small topbar-mode" data-action="toggle-advanced-fields">${project.clientState.showAdvancedFields ? 'Ocultar detalles' : 'Detalles avanzados'}</button>
          <button class="button ghost small" data-action="manage-snapshots" data-project-id="${attr(project.id)}">Copias internas</button>
          <button class="button secondary small" data-action="export-backup" data-project-id="${attr(project.id)}">Copia JSON</button>
        </header>
        <div class="workspace-body">
          <aside class="sidebar">
            <div class="sidebar-section-title">Proyecto</div>
            <nav class="sidebar-nav">
              ${sidebarItems.map(([section, icon, label, count]) => `<button class="sidebar-link ${activeSection === section ? 'active' : ''}" data-route="${projectRoute(project.id, section)}">
                <span class="nav-icon">${icon}</span><span class="nav-label">${esc(label)}</span><span class="nav-count">${esc(count)}</span>
              </button>`).join('')}
            </nav>
            <div class="sidebar-bottom">
              <p>Avance general · ${metrics.totalProgress}%</p>
              <div class="progress-track"><div class="progress-fill" style="width:${metrics.totalProgress}%"></div></div>
              <p style="margin-top:12px">${metrics.criticalRisks} riesgos críticos · ${metrics.overdueActions} acciones vencidas</p>
            </div>
          </aside>
          <main class="main-area">
            <header class="content-header">
              <div><p class="eyebrow">${esc(config.eyebrow || 'Proyecto PFMEA')}</p><h1>${esc(config.title)}</h1><p>${esc(config.description || '')}</p></div>
              ${config.headerActions ? `<div class="action-row">${config.headerActions}</div>` : ''}
            </header>
            <div class="content-body">
              <div class="${bodyClass}">
                <section>${config.mainHtml}</section>
                ${config.contextHtml ? `<aside class="context-panel">${config.contextHtml}</aside>` : ''}
              </div>
            </div>
          </main>
        </div>
      </div>`;
  }

  function renderOverview(project) {
    const metrics = PFMEA_MODEL.projectMetrics(project);
    const topRisks = [...project.risks].sort((a, b) => Number(b.current?.rpn || 0) - Number(a.current?.rpn || 0)).slice(0, 6);
    const nextAction = nextRecommendedRoute(project);
    const progressRows = [
      ['Configuración', metrics.setupProgress, projectRoute(project.id, 'setup')],
      ['Mapa de proceso', metrics.mapProgress, projectRoute(project.id, 'map')],
      ['Análisis PFMEA', metrics.analysisProgress, projectRoute(project.id, 'analysis')],
      ['Plan de acciones', metrics.actionProgress, projectRoute(project.id, 'actions')],
      ['Revisión final', project.workflow.sectionStatus.review === 'complete' ? 100 : 0, projectRoute(project.id, 'review')]
    ];

    const mainHtml = `
      <div class="kpi-grid">
        ${kpi('Etapas de proceso', metrics.stages, `${metrics.completedStages} analizadas`)}
        ${kpi('Riesgos evaluados', metrics.evaluatedRisks, `${metrics.criticalRisks} críticos o de acción`)}
        ${kpi('RPN máximo', metrics.maxRpn || '—', 'Riesgo actual más alto')}
        ${kpi('Acciones abiertas', metrics.openActions, `${metrics.overdueActions} vencidas`)}
      </div>

      <div class="split-grid">
        <section class="panel">
          <div class="panel-header"><h2>Avance del proyecto</h2><span class="badge brand">${metrics.totalProgress}% general</span></div>
          <div class="panel-body">
            <div class="steps-list">
              ${progressRows.map(([label, value, route], index) => `<button class="step-row ${value === 100 ? 'complete' : ''}" style="width:100%;border-left:0;border-right:0;border-top:0;background:transparent;text-align:left" data-route="${route}">
                <span class="step-index">${value === 100 ? '✓' : index + 1}</span>
                <span><strong>${esc(label)}</strong><span>${value}% completo</span></span>
                <span class="badge ${value === 100 ? 'success' : value ? 'warning' : ''}">${value === 100 ? 'Completo' : value ? 'En curso' : 'Pendiente'}</span>
              </button>`).join('')}
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-header"><h2>Siguiente paso recomendado</h2></div>
          <div class="panel-body">
            <p class="eyebrow">Continuidad</p>
            <h3>${esc(nextAction.label)}</h3>
            <p class="muted">${esc(nextAction.description)}</p>
            <button class="button primary" data-route="${nextAction.route}">${esc(nextAction.button)}</button>
            <div class="divider"></div>
            <p class="small muted">Última copia externa: ${relativeDate(project.metadata.lastExternalBackupAt)}. La memoria del navegador es útil, pero no merece una fe religiosa.</p>
          </div>
        </section>
      </div>

      <section class="panel">
        <div class="panel-header"><h2>Riesgos principales</h2><button class="button secondary small" data-route="${projectRoute(project.id, 'matrix')}">Abrir matriz</button></div>
        <div class="panel-body">
          ${topRisks.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Riesgo</th><th>Etapa</th><th>Modo de falla</th><th class="numeric">G</th><th class="numeric">O</th><th class="numeric">D</th><th class="numeric">RPN</th><th>Decisión</th></tr></thead>
            <tbody>${topRisks.map((risk) => riskRow(project, risk)).join('')}</tbody>
          </table></div>` : `<div class="empty-state"><h2>Todavía no hay riesgos</h2><p>El análisis comenzará después de definir funciones, fallas, efectos y causas.</p></div>`}
        </div>
      </section>`;

    const contextHtml = `
      <section class="panel"><div class="panel-header"><h3>Identificación</h3></div><div class="panel-body">
        <p class="small"><strong>Proceso</strong><br>${esc(project.metadata.processName || 'Sin definir')}</p>
        <p class="small"><strong>Sitio / línea</strong><br>${esc([project.metadata.site, project.metadata.areaLine].filter(Boolean).join(' · ') || 'Sin definir')}</p>
        <p class="small"><strong>Responsable</strong><br>${esc(project.metadata.owner || 'Sin definir')}</p>
        <p class="small"><strong>Estado</strong><br>${badge(project.metadata.status)}</p>
      </div></section>
      <section class="panel"><div class="panel-header"><h3>Atención requerida</h3></div><div class="panel-body">
        <div class="alert-list">
          ${metrics.overdueActions ? alertItem('warning', `${metrics.overdueActions} acciones vencidas`, 'Revisar responsables y fechas objetivo.', projectRoute(project.id, 'actions')) : ''}
          ${metrics.criticalRisks ? alertItem('warning', `${metrics.criticalRisks} riesgos prioritarios`, 'Incluyen gravedad crítica o RPN por encima del umbral de acción.', projectRoute(project.id, 'review')) : ''}
          ${!project.metadata.lastExternalBackupAt ? alertItem('info', 'Proyecto sin copia externa', 'Exportá el archivo JSON para conservarlo fuera de este navegador.', projectRoute(project.id, 'export')) : ''}
          ${!metrics.overdueActions && !metrics.criticalRisks && project.metadata.lastExternalBackupAt ? '<p class="small muted">No hay alertas urgentes en este momento.</p>' : ''}
        </div>
      </div></section>`;

    workspaceShell(project, 'overview', {
      eyebrow: `${project.metadata.code} · Revisión ${project.metadata.revision}`,
      title: 'Resumen del proyecto',
      description: 'Estado general del PFMEA, riesgos prioritarios y próximo trabajo pendiente.',
      headerActions: `<button class="button primary" data-route="${nextAction.route}">${esc(nextAction.button)}</button>`,
      mainHtml,
      contextHtml
    });
  }

  function kpi(label, value, foot) {
    return `<div class="kpi-card"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div><div class="kpi-foot">${esc(foot)}</div></div>`;
  }

  function nextRecommendedRoute(project) {
    const metrics = PFMEA_MODEL.projectMetrics(project);
    if (metrics.setupProgress < 100) return { label: 'Completar definición del análisis', description: 'Faltan datos de identificación, alcance o responsables.', route: projectRoute(project.id, 'setup', 'identification'), button: 'Continuar configuración' };
    if (!project.processMap.confirmedAt) return { label: 'Validar el mapa de proceso', description: 'El flujo existe, pero todavía no fue confirmado para análisis.', route: projectRoute(project.id, 'map'), button: 'Abrir mapa' };
    const pendingStage = project.processMap.nodes
      .filter((node) => !node.archived && !['start', 'end'].includes(node.type))
      .sort((a, b) => a.analysisOrder - b.analysisOrder)
      .find((node) => !['complete', 'not-applicable'].includes(project.workflow.stageStatus[node.id]));
    if (pendingStage) return { label: `Analizar ${pendingStage.code} · ${pendingStage.name}`, description: 'Es la primera etapa del orden lógico que todavía tiene trabajo pendiente.', route: projectRoute(project.id, 'analysis', pendingStage.id, 'chain'), button: 'Continuar análisis' };
    if (project.actions.some((action) => !['effectiveness-verified', 'cancelled', 'replaced'].includes(action.status))) return { label: 'Revisar acciones abiertas', description: 'El análisis está avanzado, pero quedan mitigaciones sin cerrar.', route: projectRoute(project.id, 'actions'), button: 'Abrir acciones' };
    return { label: 'Ejecutar revisión final', description: 'Verificá integridad y coherencia antes de finalizar la revisión.', route: projectRoute(project.id, 'review'), button: 'Revisar proyecto' };
  }

  function riskRow(project, risk) {
    const context = PFMEA_MODEL.riskContext(project, risk);
    const route = context.stage ? projectRoute(project.id, 'analysis', context.stage.id, 'chain') : projectRoute(project.id, 'matrix');
    return `<tr class="clickable" data-route="${route}" data-select-risk="${attr(risk.id)}">
      <td><strong>${esc(risk.code)}</strong></td>
      <td>${esc(context.stage ? `${context.stage.code} · ${context.stage.name}` : 'Sin etapa')}</td>
      <td>${esc(context.failureMode?.description || 'Sin modo de falla')}</td>
      <td class="numeric">${esc(risk.current?.severity ?? '—')}</td>
      <td class="numeric">${esc(risk.current?.occurrence ?? '—')}</td>
      <td class="numeric">${esc(risk.current?.detection ?? '—')}</td>
      <td class="numeric ${rpnClass(risk.current?.rpn, project)}">${esc(risk.current?.rpn ?? '—')}</td>
      <td>${badge(risk.decision)}</td>
    </tr>`;
  }

  function alertItem(type, title, detail, route = '') {
    const icon = type === 'error' ? '×' : type === 'warning' ? '!' : 'i';
    return `<div class="alert-item ${type}"><span>${icon}</span><div><strong>${esc(title)}</strong><p>${esc(detail)}</p></div>${route ? `<button class="button ghost small" data-route="${route}">Abrir</button>` : ''}</div>`;
  }


  function openIssuesDialog(title, issues, intro = '') {
    openForm({
      eyebrow: 'Control de completitud',
      title,
      submitLabel: 'Entendido',
      fields: [],
      afterHtml: `${intro ? `<p class="muted small">${esc(intro)}</p>` : ''}<div class="alert-list">${issues.map((issue) => alertItem(issue.severity || 'warning', issue.title, issue.detail, issue.route)).join('')}</div>`,
      onSubmit: () => {}
    });
  }

  function renderSetup(project, tab = 'identification') {
    const validTabs = ['identification', 'scope', 'team', 'references', 'scales'];
    if (!validTabs.includes(tab)) tab = 'identification';
    project.clientState.setupTab = tab;
    PFMEA_STORAGE.saveProject(project);
    const tabs = [
      ['identification', 'Identificación'],
      ['scope', 'Alcance'],
      ['team', 'Equipo'],
      ['references', 'Referencias'],
      ['scales', 'Metodología y escalas']
    ];
    const mainHtml = `
      <div class="inner-tabs">${tabs.map(([key, label]) => `<button class="inner-tab ${tab === key ? 'active' : ''}" data-route="${projectRoute(project.id, 'setup', key)}">${esc(label)}</button>`).join('')}</div>
      ${tab === 'identification' ? renderIdentification(project) : ''}
      ${tab === 'scope' ? renderScope(project) : ''}
      ${tab === 'team' ? renderTeam(project) : ''}
      ${tab === 'references' ? renderReferences(project) : ''}
      ${tab === 'scales' ? renderScales(project) : ''}`;

    const metrics = PFMEA_MODEL.projectMetrics(project);
    const contextHtml = `
      <section class="panel"><div class="panel-header"><h3>Estado</h3></div><div class="panel-body">
        <div class="kpi-value">${metrics.setupProgress}%</div>
        <p class="small muted">Avance de cuatro datos esenciales: proyecto, proceso, inicio y fin del alcance. El resto puede completarse cuando aporte valor.</p>
        <div class="progress-track" style="background:#e4e7ec"><div class="progress-fill" style="width:${metrics.setupProgress}%"></div></div>
      </div></section>
      <section class="panel"><div class="panel-header"><h3>Principio de diseño</h3></div><div class="panel-body"><p class="small muted">Cada proyecto conserva una copia de sus escalas G/O/D. Cambiar una plantilla futura no debe reescribir el significado de una evaluación pasada, porque todavía no inventamos la máquina del tiempo regulatoria.</p></div></section>`;

    workspaceShell(project, 'setup', {
      eyebrow: 'Paso 1',
      title: 'Configuración del PFMEA',
      description: 'Completá primero lo esencial. Equipo, referencias y detalle metodológico pueden agregarse sin bloquear el borrador.',
      headerActions: `<button class="button primary" data-route="${projectRoute(project.id, 'map')}">Continuar al mapa</button>`,
      mainHtml,
      contextHtml
    });
  }

  function renderIdentification(project) {
    const advanced = project.clientState.showAdvancedFields;
    return `<section class="panel"><div class="panel-header"><div><h2>Identificación del proyecto</h2><p class="small muted" style="margin:3px 0 0">El borrador solo necesita un nombre y el proceso. El resto se completa cuando realmente aporta contexto.</p></div><div class="action-row">${badge(project.metadata.status)}<button class="button ghost small" data-action="toggle-advanced-fields">${advanced ? 'Ocultar detalles' : 'Mostrar detalles'}</button></div></div><div class="panel-body">
      <div class="form-grid">
        ${inputField({ label: 'Nombre del proyecto', path: 'metadata.name', value: project.metadata.name, help: 'Dato esencial.' })}
        ${inputField({ label: 'Nombre del proceso', path: 'metadata.processName', value: project.metadata.processName, full: true, help: 'Dato esencial.' })}
        ${inputField({ label: 'Producto o familia', path: 'metadata.productFamily', value: project.metadata.productFamily, help: 'Opcional durante el borrador.' })}
        ${inputField({ label: 'Responsable', path: 'metadata.owner', value: project.metadata.owner, help: 'Recomendado; requerido al cerrar la revisión.' })}
      </div>
      ${advanced ? `<div class="divider"></div><div class="advanced-section"><div class="advanced-section-title"><span>Detalles documentales</span><small>Opcionales durante el análisis</small></div><div class="form-grid">
        ${inputField({ label: 'Código PFMEA', path: 'metadata.code', value: project.metadata.code })}
        ${inputField({ label: 'Revisión', path: 'metadata.revision', value: project.metadata.revision })}
        ${inputField({ label: 'Sitio / planta', path: 'metadata.site', value: project.metadata.site })}
        ${inputField({ label: 'Área o línea', path: 'metadata.areaLine', value: project.metadata.areaLine })}
        ${inputField({ label: 'Fecha de inicio', path: 'metadata.startDate', value: project.metadata.startDate, type: 'date' })}
        ${inputField({ label: 'Fecha objetivo', path: 'metadata.targetDate', value: project.metadata.targetDate, type: 'date' })}
        ${inputField({ label: 'Cliente', path: 'metadata.customer', value: project.metadata.customer })}
        ${inputField({ label: 'Proyecto relacionado', path: 'metadata.projectReference', value: project.metadata.projectReference })}
        ${inputField({ label: 'Número de cambio', path: 'metadata.changeNumber', value: project.metadata.changeNumber })}
      </div></div>` : `<div class="lean-hint"><strong>Modo estándar</strong><span>Código, revisión, sitio, fechas y referencias del cambio están ocultos, no eliminados.</span></div>`}
    </div></section>`;
  }

  function renderScope(project) {
    const advanced = project.clientState.showAdvancedFields;
    return `<section class="panel"><div class="panel-header"><div><h2>Alcance del análisis</h2><p class="small muted" style="margin:3px 0 0">Definí los límites. Las hipótesis y interfaces pueden documentarse después.</p></div><button class="button ghost small" data-action="toggle-advanced-fields">${advanced ? 'Ocultar detalles' : 'Mostrar detalles'}</button></div><div class="panel-body">
      <div class="form-grid one">
        ${inputField({ label: 'Inicio del proceso', path: 'scope.processStart', value: project.scope.processStart, type: 'textarea', full: true, help: 'Necesario antes de enviar el PFMEA a revisión.' })}
        ${inputField({ label: 'Fin del proceso', path: 'scope.processEnd', value: project.scope.processEnd, type: 'textarea', full: true, help: 'Necesario antes de enviar el PFMEA a revisión.' })}
        ${inputField({ label: 'Objetivo del análisis', path: 'scope.objective', value: project.scope.objective, type: 'textarea', full: true, help: 'Recomendado, no bloquea el borrador.' })}
      </div>
      ${advanced ? `<div class="divider"></div><div class="advanced-section"><div class="advanced-section-title"><span>Contexto adicional</span><small>Solo cuando sea útil</small></div><div class="form-grid one">
        ${inputField({ label: 'Productos o variantes incluidos', path: 'scope.includedProducts', value: project.scope.includedProducts, type: 'textarea', full: true })}
        ${inputField({ label: 'Exclusiones', path: 'scope.exclusions', value: project.scope.exclusions, type: 'textarea', full: true })}
        ${inputField({ label: 'Supuestos', path: 'scope.assumptions', value: project.scope.assumptions, type: 'textarea', full: true })}
        ${inputField({ label: 'Interfaces con otros procesos', path: 'scope.interfaces', value: project.scope.interfaces, type: 'textarea', full: true })}
        ${inputField({ label: 'Procesos externos', path: 'scope.externalProcesses', value: project.scope.externalProcesses, type: 'textarea', full: true })}
        ${inputField({ label: 'Restricciones', path: 'scope.constraints', value: project.scope.constraints, type: 'textarea', full: true })}
      </div></div>` : `<div class="lean-hint"><strong>Información opcional oculta</strong><span>Productos incluidos, exclusiones, supuestos, interfaces, procesos externos y restricciones.</span></div>`}
    </div></section>`;
  }

  function renderTeam(project) {
    return `<section class="panel"><div class="panel-header"><h2>Equipo participante</h2><button class="button primary small" data-action="add-team-member">＋ Agregar participante</button></div><div class="panel-body">
      ${project.team.length ? `<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Rol</th><th>Área</th><th>Especialidad</th><th></th></tr></thead><tbody>
        ${project.team.map((member) => `<tr><td><strong>${esc(member.name)}</strong></td><td>${esc(member.role)}</td><td>${esc(member.area)}</td><td>${esc(member.specialty)}</td><td><button class="button ghost small" data-action="delete-team-member" data-id="${attr(member.id)}">Eliminar</button></td></tr>`).join('')}
      </tbody></table></div>` : `<div class="empty-state"><h2>Equipo todavía no documentado</h2><p>Es opcional durante el borrador. Podés registrar participantes antes de enviar el PFMEA a revisión.</p></div>`}
    </div></section>`;
  }

  function renderReferences(project) {
    return `<section class="panel"><div class="panel-header"><h2>Documentos de referencia</h2><button class="button primary small" data-action="add-reference">＋ Agregar referencia</button></div><div class="panel-body">
      ${project.references.length ? `<div class="table-wrap"><table><thead><tr><th>Código</th><th>Documento</th><th>Rev.</th><th>Tipo</th><th>Ubicación</th><th></th></tr></thead><tbody>
        ${project.references.map((ref) => `<tr><td><strong>${esc(ref.code)}</strong></td><td>${esc(ref.title)}</td><td>${esc(ref.revision)}</td><td>${esc(ref.type)}</td><td>${esc(ref.location)}</td><td><button class="button ghost small" data-action="delete-reference" data-id="${attr(ref.id)}">Eliminar</button></td></tr>`).join('')}
      </tbody></table></div>` : `<div class="empty-state"><h2>Sin referencias registradas</h2><p>Son opcionales. Agregá especificaciones, planos o análisis previos solo cuando aporten trazabilidad.</p></div>`}
    </div></section>`;
  }

  function renderScales(project) {
    const thresholds = project.methodology.thresholds;
    const advanced = project.clientState.showAdvancedFields;
    return `<section class="panel"><div class="panel-header"><div><h2>Metodología de evaluación</h2><p class="small muted" style="margin:3px 0 0">La plantilla genérica ya está lista. Solo tocala si el proyecto exige una escala corporativa distinta.</p></div><div class="action-row"><span class="badge brand">${esc(project.methodology.method)}</span><button class="button ghost small" data-action="toggle-advanced-fields">${advanced ? 'Ocultar detalles' : 'Configurar'}</button></div></div><div class="panel-body">
      <div class="triple-grid">
        ${Object.values(project.methodology.scales).map((scale) => `<div class="subtle-panel"><p class="eyebrow">Escala activa</p><h3>${esc(scale.name)}</h3><p class="small muted">${esc(scale.revision)}</p><button class="button secondary small" data-action="view-scale" data-scale-id="${attr(scale.id)}">Ver criterios</button></div>`).join('')}
      </div>
      ${advanced ? `<div class="divider"></div><div class="advanced-section"><div class="advanced-section-title"><span>Umbrales de alerta</span><small>No determinan aceptación automática</small></div><div class="form-grid three">
        ${inputField({ label: 'Gravedad crítica', path: 'methodology.thresholds.criticalSeverity', value: thresholds.criticalSeverity, type: 'number', min: 1, max: 10 })}
        ${inputField({ label: 'RPN para revisión', path: 'methodology.thresholds.reviewRpn', value: thresholds.reviewRpn, type: 'number', min: 1, max: 1000 })}
        ${inputField({ label: 'RPN para acción', path: 'methodology.thresholds.actionRpn', value: thresholds.actionRpn, type: 'number', min: 1, max: 1000 })}
        ${inputField({ label: 'Detección débil desde', path: 'methodology.thresholds.weakDetection', value: thresholds.weakDetection, type: 'number', min: 1, max: 10 })}
        ${inputField({ label: 'Ocurrencia elevada desde', path: 'methodology.thresholds.highOccurrence', value: thresholds.highOccurrence, type: 'number', min: 1, max: 10 })}
      </div></div>` : `<div class="lean-hint"><strong>Sin configuración necesaria</strong><span>Los umbrales avanzados están ocultos. El RPN seguirá calculándose normalmente.</span></div>`}
    </div></section>`;
  }

  function scaleTable(scale) {
    return `<div style="margin-bottom:22px"><div class="item-card-header"><div><h3>${esc(scale.name)}</h3><p class="muted small">${esc(scale.revision)}</p></div><button class="button secondary small" data-action="view-scale" data-scale-id="${attr(scale.id)}">Ver completa</button></div>
      <div class="table-wrap"><table><thead><tr><th>Puntaje</th><th>Criterio</th><th>Descripción</th></tr></thead><tbody>
        ${scale.values.filter((item) => [1, 3, 5, 7, 9, 10].includes(item.score)).map((item) => `<tr><td class="numeric"><strong>${item.score}</strong></td><td>${esc(item.title)}</td><td>${esc(item.description)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  }

  function renderMap(project) {
    const nodes = project.processMap.nodes.filter((node) => !node.archived);
    const edges = project.processMap.edges.filter((edge) => !edge.archived);
    let selected = nodes.find((node) => node.id === project.clientState.selectedMapNodeId) || nodes[0] || null;
    if (selected && project.clientState.selectedMapNodeId !== selected.id) {
      project.clientState.selectedMapNodeId = selected.id;
      PFMEA_STORAGE.saveProject(project);
    }
    const validation = UI.mapValidation || validateMap(project);

    const mapHtml = `
      <div class="toolbar" style="margin-bottom:12px">
        <button class="button primary small" data-action="add-stage">＋ Agregar etapa</button>
        <button class="button secondary small" data-action="add-edge">↗ Nueva conexión</button>
        <button class="button secondary small" data-action="validate-map">✓ Validar mapa</button>
        <button class="button ghost small" data-action="export-map-svg">⇩ SVG</button>
        <span class="toolbar-spacer"></span>
        ${project.processMap.confirmedAt ? badge('complete', `Confirmado ${formatDate(project.processMap.confirmedAt)}`) : badge('in-progress', 'Mapa en borrador')}
      </div>

      <div class="map-workspace">
        <aside class="map-panel left">
          <p class="eyebrow">Asistente rápido</p>
          <h3>Agregar al flujo</h3>
          <p class="map-help">Elegí un tipo de etapa. La posición y conexión se pueden ajustar después.</p>
          <div class="node-palette">
            ${Object.entries(NODE_TYPES).map(([type, label]) => `<button class="palette-item" data-action="add-stage" data-node-type="${type}">${esc(label)}</button>`).join('')}
          </div>
          <div class="divider"></div>
          <h3>Etapas</h3>
          <div class="card-list">
            ${nodes.sort((a, b) => a.analysisOrder - b.analysisOrder).map((node) => `<button class="stage-button ${selected?.id === node.id ? 'active' : ''}" data-action="select-map-node" data-node-id="${attr(node.id)}"><strong>${esc(node.code)} · ${esc(node.name)}</strong><span>${esc(NODE_TYPES[node.type] || node.type)}</span></button>`).join('')}
          </div>
        </aside>

        <div class="map-canvas-wrap" id="map-scroll">
          <div class="map-canvas" id="map-canvas">
            <svg class="map-edges" aria-hidden="true" viewBox="0 0 1400 820">
              <defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#7b8b9c"></polygon></marker></defs>
              ${edges.map((edge) => renderEdgeSvg(project, edge)).join('')}
            </svg>
            ${nodes.map((node) => renderMapNode(project, node, selected?.id === node.id)).join('')}
          </div>
        </div>

        <aside class="map-panel right">
          ${selected ? `<p class="eyebrow">Etapa seleccionada</p><h3>${esc(selected.code)} · ${esc(selected.name)}</h3>
            <p class="small muted">${esc(NODE_TYPES[selected.type] || selected.type)}</p>
            <p class="small">${esc(selected.description || 'Sin descripción')}</p>
            <div class="subtle-panel">
              <p class="small"><strong>Área</strong><br>${esc(selected.area || 'Sin definir')}</p>
              <p class="small"><strong>Responsable</strong><br>${esc(selected.responsible || 'Sin definir')}</p>
              <p class="small"><strong>Orden de análisis</strong><br>${esc(selected.analysisOrder)}</p>
            </div>
            <div class="action-row" style="margin-top:12px">
              <button class="button primary small" data-action="edit-stage" data-node-id="${attr(selected.id)}">Editar</button>
              ${!['start', 'end'].includes(selected.type) ? `<button class="button secondary small" data-route="${projectRoute(project.id, 'analysis', selected.id, 'functions')}">Analizar</button>` : ''}
              <button class="button ghost small" data-action="archive-stage" data-node-id="${attr(selected.id)}">Archivar</button>
            </div>` : '<p class="small muted">Seleccioná una etapa para ver sus propiedades.</p>'}
          <div class="divider"></div>
          <p class="eyebrow">Validación</p>
          <p class="small muted">${validation.filter((item) => item.severity === 'error').length} errores · ${validation.filter((item) => item.severity === 'warning').length} advertencias</p>
          <button class="button secondary small" data-action="validate-map">Ver detalle</button>
          <div class="divider"></div>
          <p class="eyebrow">Reglas del mapa</p>
          <p class="small muted">La posición visual no define el orden del PFMEA. Cada etapa conserva un código y un orden de análisis independientes.</p>
          <ul class="small muted"><li>Debe existir al menos un inicio y un fin.</li><li>Las decisiones necesitan dos o más salidas.</li><li>Los ciclos están permitidos si son intencionales.</li></ul>
        </aside>
      </div>`;

    workspaceShell(project, 'map', {
      eyebrow: 'Paso 2',
      title: 'Mapa de proceso',
      description: 'Construí y editá el flujo. Arrastrá las etapas para ordenar el lienzo y usá las conexiones para representar rutas normales, rechazos y retrabajos.',
      headerActions: `<button class="button ${project.processMap.confirmedAt ? 'secondary' : 'primary'}" data-action="confirm-map">${project.processMap.confirmedAt ? 'Reconfirmar mapa' : 'Confirmar para análisis'}</button>`,
      mainHtml: mapHtml
    });

    bindMapDrag(project);
    if (selected) {
      const scroll = document.getElementById('map-scroll');
      if (scroll) {
        scroll.scrollLeft = Math.max(0, Number(selected.position?.x || 0) - scroll.clientWidth / 2 + 81);
        scroll.scrollTop = Math.max(0, Number(selected.position?.y || 0) - scroll.clientHeight / 2 + 38);
      }
    }
  }

  function renderMapNode(project, node, selected) {
    const risks = PFMEA_MODEL.stageRisks(project, node.id);
    const maxRpn = risks.reduce((max, risk) => Math.max(max, Number(risk.current?.rpn || 0)), 0);
    return `<div class="map-node ${attr(node.type)} ${selected ? 'selected' : ''}" data-map-node="${attr(node.id)}" data-action="select-map-node" data-node-id="${attr(node.id)}" style="left:${Number(node.position?.x || 0)}px;top:${Number(node.position?.y || 0)}px">
      <span class="node-code">${esc(node.code)} · ${esc(NODE_TYPES[node.type] || node.type)}</span>
      <strong>${esc(node.name)}</strong>
      <div class="node-meta"><span>${risks.length} riesgo${risks.length === 1 ? '' : 's'}</span>${maxRpn ? `<span class="risk-dot">RPN ${maxRpn}</span>` : '<span>Sin evaluar</span>'}</div>
    </div>`;
  }

  function renderEdgeSvg(project, edge) {
    const source = project.processMap.nodes.find((node) => node.id === edge.sourceNodeId);
    const target = project.processMap.nodes.find((node) => node.id === edge.targetNodeId);
    if (!source || !target || source.archived || target.archived) return '';
    const sx = Number(source.position?.x || 0) + 81;
    const sy = Number(source.position?.y || 0) + 38;
    const tx = Number(target.position?.x || 0) + 81;
    const ty = Number(target.position?.y || 0) + 38;
    const dx = tx - sx;
    const curve = Math.max(50, Math.abs(dx) * 0.35);
    const c1x = sx + (dx >= 0 ? curve : -curve);
    const c2x = tx - (dx >= 0 ? curve : -curve);
    const path = `M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ty}, ${tx} ${ty}`;
    const label = edge.label || edge.condition || '';
    return `<path class="map-edge ${edge.flowType !== 'normal' ? 'alt' : ''}" d="${path}"></path>${label ? `<text class="map-edge-label" x="${(sx + tx) / 2}" y="${(sy + ty) / 2 - 7}" text-anchor="middle">${esc(label)}</text>` : ''}`;
  }

  function validateMap(project) {
    const issues = [];
    const nodes = project.processMap.nodes.filter((node) => !node.archived);
    const edges = project.processMap.edges.filter((edge) => !edge.archived);
    const starts = nodes.filter((node) => node.type === 'start');
    const ends = nodes.filter((node) => node.type === 'end');
    if (!starts.length) issues.push({ severity: 'error', title: 'No existe etapa de inicio', detail: 'Agregá al menos un nodo de tipo Inicio.' });
    if (!ends.length) issues.push({ severity: 'error', title: 'No existe etapa de fin', detail: 'Agregá al menos un nodo de tipo Fin.' });
    const codes = new Map();
    nodes.forEach((node) => {
      if (!node.name?.trim()) issues.push({ severity: 'error', title: `Etapa ${node.code || node.id} sin nombre`, detail: 'Todas las etapas deben tener un nombre.', nodeId: node.id });
      if (codes.has(node.code)) issues.push({ severity: 'error', title: `Código duplicado ${node.code}`, detail: 'Los códigos de etapa deben ser únicos.', nodeId: node.id });
      codes.set(node.code, node.id);
      const incoming = edges.filter((edge) => edge.targetNodeId === node.id);
      const outgoing = edges.filter((edge) => edge.sourceNodeId === node.id);
      if (node.type !== 'start' && !incoming.length) issues.push({ severity: 'warning', title: `${node.code} · ${node.name} sin entrada`, detail: 'La etapa no recibe ninguna conexión.', nodeId: node.id });
      if (node.type !== 'end' && !outgoing.length) issues.push({ severity: 'warning', title: `${node.code} · ${node.name} sin salida`, detail: 'La etapa no conduce a otra etapa.', nodeId: node.id });
      if (node.type === 'decision' && outgoing.length < 2) issues.push({ severity: 'warning', title: `Decisión ${node.code} con una sola salida`, detail: 'Una decisión debería representar al menos dos rutas.', nodeId: node.id });
    });
    edges.forEach((edge) => {
      if (!nodes.some((node) => node.id === edge.sourceNodeId) || !nodes.some((node) => node.id === edge.targetNodeId)) {
        issues.push({ severity: 'error', title: 'Conexión huérfana', detail: 'Una conexión apunta a una etapa inexistente.', edgeId: edge.id });
      }
    });
    if (!issues.length) issues.push({ severity: 'info', title: 'Mapa estructuralmente válido', detail: 'No se detectaron errores ni advertencias básicas.' });
    return issues;
  }

  function bindMapDrag(project) {
    const canvas = document.getElementById('map-canvas');
    if (!canvas) return;
    canvas.querySelectorAll('[data-map-node]').forEach((nodeEl) => {
      let moved = false;
      let startX = 0;
      let startY = 0;
      let originX = 0;
      let originY = 0;
      const id = nodeEl.dataset.mapNode;
      const node = project.processMap.nodes.find((item) => item.id === id);
      if (!node) return;
      nodeEl.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        moved = false;
        startX = event.clientX;
        startY = event.clientY;
        originX = Number(node.position?.x || 0);
        originY = Number(node.position?.y || 0);
        nodeEl.setPointerCapture(event.pointerId);
      });
      nodeEl.addEventListener('pointermove', (event) => {
        if (!nodeEl.hasPointerCapture(event.pointerId)) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        const x = Math.max(0, Math.min(1230, originX + dx));
        const y = Math.max(0, Math.min(730, originY + dy));
        nodeEl.style.left = `${x}px`;
        nodeEl.style.top = `${y}px`;
      });
      nodeEl.addEventListener('pointerup', (event) => {
        if (!nodeEl.hasPointerCapture(event.pointerId)) return;
        nodeEl.releasePointerCapture(event.pointerId);
        if (moved) {
          node.position = { x: parseFloat(nodeEl.style.left), y: parseFloat(nodeEl.style.top) };
          project.clientState.selectedMapNodeId = node.id;
          persist(project, { rerender: true });
        }
      });
      nodeEl.addEventListener('click', (event) => {
        if (moved) event.stopImmediatePropagation();
      }, true);
    });
  }

  function renderAnalysis(project, stageId, tab = 'chain') {
    const stages = project.processMap.nodes
      .filter((node) => !node.archived && !['start', 'end'].includes(node.type))
      .sort((a, b) => Number(a.analysisOrder || 0) - Number(b.analysisOrder || 0));
    let stage = stages.find((item) => item.id === stageId) || stages[0] || null;
    if (!stage) {
      workspaceShell(project, 'analysis', {
        eyebrow: 'Paso 3',
        title: 'Análisis PFMEA',
        description: 'Todavía no existen etapas analizables.',
        mainHtml: `<div class="empty-state"><h2>Primero necesitás un mapa</h2><p>Agregá al menos una operación, inspección o decisión al flujo.</p><button class="button primary" data-route="${projectRoute(project.id, 'map')}">Abrir mapa</button></div>`
      });
      return;
    }

    const validTabs = ['chain', 'functions', 'failures', 'effects-causes', 'controls', 'evaluation'];
    if (!validTabs.includes(tab)) tab = 'chain';
    project.clientState.analysisTab = tab;
    PFMEA_STORAGE.saveProject(project);
    const tabs = [
      ['chain', 'Cadena de riesgo'],
      ...(project.clientState.showAdvancedFields ? [
        ['functions', 'Funciones'],
        ['failures', 'Modos de falla'],
        ['effects-causes', 'Efectos y causas'],
        ['controls', 'Controles'],
        ['evaluation', 'Evaluación']
      ] : [])
    ];
    const stageRisks = PFMEA_MODEL.stageRisks(project, stage.id);
    const maxRpn = stageRisks.reduce((max, risk) => Math.max(max, Number(risk.current?.rpn || 0)), 0);
    const stageFunctions = project.functions.filter((fn) => fn.stageId === stage.id && fn.status !== 'archived');
    const stageFailureIds = project.failureModes.filter((fm) => stageFunctions.some((fn) => fn.id === fm.functionId) && fm.status === 'active').map((fm) => fm.id);
    const stageCauses = project.causes.filter((cause) => stageFailureIds.includes(cause.failureModeId) && cause.status === 'active');

    const content = tab === 'chain' ? renderRiskChainTab(project, stage)
      : tab === 'functions' ? renderFunctionsTab(project, stage)
      : tab === 'failures' ? renderFailuresTab(project, stage)
      : tab === 'effects-causes' ? renderEffectsCausesTab(project, stage)
      : tab === 'controls' ? renderControlsTab(project, stage)
      : renderEvaluationTab(project, stage);

    const analysisHtml = `
      <div class="analysis-layout">
        <aside class="panel stage-browser">
          <div class="panel-header"><h3>Etapas</h3><span class="badge">${stages.length}</span></div>
          <div class="panel-body" style="padding:10px">
            <div class="stage-list">
              ${stages.map((item) => {
                const risks = PFMEA_MODEL.stageRisks(project, item.id);
                const itemMax = risks.reduce((max, risk) => Math.max(max, Number(risk.current?.rpn || 0)), 0);
                const status = project.workflow.stageStatus[item.id] || 'not-started';
                return `<button class="stage-button ${stage.id === item.id ? 'active' : ''}" data-route="${projectRoute(project.id, 'analysis', item.id, tab)}">
                  <span class="stage-status">${status === 'complete' ? '✓' : status === 'review-required' ? '!' : ''}</span>
                  <strong>${esc(item.code)} · ${esc(item.name)}</strong>
                  <span>${risks.length} riesgos${itemMax ? ` · RPN máx. ${itemMax}` : ''}</span>
                </button>`;
              }).join('')}
            </div>
          </div>
        </aside>
        <div>
          <div class="analysis-toolbar">
            <div><p class="eyebrow">Etapa ${esc(stage.code)}</p><h2 style="margin-bottom:3px">${esc(stage.name)}</h2><div class="breadcrumb">${esc(NODE_TYPES[stage.type] || stage.type)} · ${stageFunctions.length} funciones · ${stageCauses.length} causas · ${stageRisks.length} riesgos</div></div>
            <div class="action-row"><button class="button secondary small" data-route="${projectRoute(project.id, 'map')}">Ver en mapa</button>${maxRpn ? `<span class="badge ${rpnClass(maxRpn, project).includes('high') ? 'danger' : 'warning'}">RPN máx. ${maxRpn}</span>` : ''}</div>
          </div>
          <div class="inner-tabs">${tabs.map(([key, label]) => `<button class="inner-tab ${tab === key ? 'active' : ''}" data-route="${projectRoute(project.id, 'analysis', stage.id, key)}">${esc(label)}</button>`).join('')}</div>
          ${!project.clientState.showAdvancedFields ? `<div class="lean-banner"><strong>Modo estándar</strong><span>Solo se muestran los datos necesarios para analizar el riesgo. Activá “Detalles avanzados” cuando necesites documentación técnica adicional.</span></div>` : ''}
          ${content}
          <div class="panel" style="margin-top:18px"><div class="panel-body"><div class="action-row">
            <label class="small muted">Estado de la etapa</label>
            <select style="width:auto" data-stage-status="${attr(stage.id)}">
              ${selectOptions([
                { value: 'not-started', label: 'No iniciada' },
                { value: 'in-progress', label: 'En progreso' },
                { value: 'complete', label: 'Completa' },
                { value: 'review-required', label: 'Revisión requerida' },
                { value: 'not-applicable', label: 'No aplica' }
              ], project.workflow.stageStatus[stage.id] || 'not-started', (item) => item)}
            </select>
            <span class="toolbar-spacer"></span>
            ${previousStageButton(project, stages, stage, tab)}
            ${nextStageButton(project, stages, stage, tab)}
          </div></div></div>
        </div>
      </div>`;

    const stageIssues = validateStage(project, stage.id, 'working');
    const contextHtml = `
      <section class="panel"><div class="panel-header"><h3>Estado de la etapa</h3></div><div class="panel-body">
        ${badge(project.workflow.stageStatus[stage.id] || 'not-started')}
        <div class="divider"></div>
        <p class="small"><strong>${stageFunctions.length}</strong> funciones<br><strong>${stageFailureIds.length}</strong> modos de falla<br><strong>${stageCauses.length}</strong> causas<br><strong>${stageRisks.length}</strong> riesgos</p>
      </div></section>
      <section class="panel"><div class="panel-header"><h3>Validaciones</h3><span class="badge ${stageIssues.length ? 'warning' : 'success'}">${stageIssues.length}</span></div><div class="panel-body">
        <div class="alert-list">${stageIssues.length ? stageIssues.slice(0, 6).map((issue) => alertItem(issue.severity, issue.title, issue.detail, issue.route)).join('') : '<p class="small muted">No se detectaron pendientes estructurales en esta etapa.</p>'}</div>
      </div></section>
      <section class="panel"><div class="panel-header"><h3>Ayuda contextual</h3></div><div class="panel-body">${analysisHelp(tab)}</div></section>`;

    workspaceShell(project, 'analysis', {
      eyebrow: 'Paso 3 a 7',
      title: 'Análisis PFMEA guiado',
      description: 'El modo estándar muestra la cadena completa en una sola ficha. Los formularios técnicos siguen disponibles al activar Detalles avanzados.',
      headerActions: `<button class="button secondary" data-route="${projectRoute(project.id, 'matrix')}">Abrir vista matricial</button>`,
      mainHtml: analysisHtml,
      contextHtml
    });
  }

  function previousStageButton(project, stages, stage, tab) {
    const index = stages.findIndex((item) => item.id === stage.id);
    if (index <= 0) return '';
    return `<button class="button secondary small" data-route="${projectRoute(project.id, 'analysis', stages[index - 1].id, tab)}">← ${esc(stages[index - 1].code)}</button>`;
  }

  function nextStageButton(project, stages, stage, tab) {
    const index = stages.findIndex((item) => item.id === stage.id);
    if (index < 0 || index >= stages.length - 1) return `<button class="button primary small" data-route="${projectRoute(project.id, 'review')}">Ir a revisión</button>`;
    return `<button class="button primary small" data-route="${projectRoute(project.id, 'analysis', stages[index + 1].id, tab)}">${esc(stages[index + 1].code)} →</button>`;
  }

  function analysisHelp(tab) {
    const help = {
      chain: '<p class="small muted"><strong>Camino esencial:</strong> resultado esperado → modo de falla → efecto → causa → controles → G/O/D → decisión.</p><p class="small muted">Podés dejar datos incompletos durante el borrador. Los bloqueos aparecen recién al marcar una etapa completa o enviar el proyecto a revisión.</p>',
      functions: '<p class="small muted"><strong>Pregunta central:</strong> ¿qué debe hacer correctamente esta etapa y qué requisito debe cumplir?</p><p class="small muted">Una etapa puede tener varias funciones. Evitá describir la actividad solamente; registrá también el resultado esperado.</p>',
      failures: '<p class="small muted"><strong>Pregunta central:</strong> ¿de qué maneras puede dejar de cumplirse cada función?</p><p class="small muted">Las sugerencias son disparadores, no respuestas oficiales emitidas por una deidad del AMFE.</p>',
      'effects-causes': '<p class="small muted"><strong>Efecto:</strong> qué sucede si aparece la falla.<br><strong>Causa:</strong> qué condición produce esa falla.</p><p class="small muted">La gravedad se asigna al efecto; la ocurrencia y detección se evaluarán por causa.</p>',
      controls: '<p class="small muted">Separá prevención, detección y plan de reacción. Un procedimiento no es automáticamente un poka-yoke, por mucho que alguien lo escriba en negrita.</p>',
      evaluation: '<p class="small muted">Cada causa genera una evaluación independiente. El RPN se calcula como G × O × D, pero la decisión de aceptar o actuar sigue siendo del equipo.</p>'
    };
    return help[tab] || '';
  }

  function renderRiskChainTab(project, stage) {
    const functions = project.functions.filter((fn) => fn.stageId === stage.id && fn.status !== 'archived');
    if (!functions.length) {
      return `<div class="empty-state"><h2>Empezá por el resultado esperado</h2><p>Una frase clara alcanza. Por ejemplo: “Dosificar 500 mL ± 5 mL en cada botella”. Los detalles técnicos pueden esperar su turno civilizado.</p><button class="button primary" data-action="add-function" data-stage-id="${attr(stage.id)}">Agregar resultado esperado</button></div>`;
    }

    return `<div class="risk-chain">
      <div class="lean-flow-key" aria-label="Secuencia del análisis">
        <span>Qué debe lograr</span><b>→</b><span>Cómo falla</span><b>→</b><span>Qué ocurre</span><b>→</b><span>Por qué ocurre</span><b>→</b><span>Controles</span><b>→</b><span>G/O/D</span>
      </div>
      ${functions.map((fn) => {
        const modes = project.failureModes.filter((mode) => mode.functionId === fn.id && mode.status === 'active');
        return `<section class="panel function-chain-block">
          <div class="panel-header"><div><p class="eyebrow">Qué debe lograr</p><h2>${esc(fn.description)}</h2>${fn.requirement ? `<p class="small muted" style="margin:5px 0 0">${esc(fn.requirement)}</p>` : ''}</div><button class="button primary small" data-action="add-failure" data-function-id="${attr(fn.id)}">＋ Cómo puede fallar</button></div>
          <div class="panel-body">
            ${modes.length ? modes.map((mode) => renderFailureChainBlock(project, stage, fn, mode)).join('') : `<div class="chain-empty"><div><strong>Todavía no hay modos de falla.</strong><span>Describí una forma concreta en que este resultado podría no cumplirse.</span></div><button class="button secondary small" data-action="add-failure" data-function-id="${attr(fn.id)}">Agregar modo</button></div>`}
          </div>
        </section>`;
      }).join('')}
      <button class="button secondary" data-action="add-function" data-stage-id="${attr(stage.id)}">＋ Agregar otro resultado esperado</button>
    </div>`;
  }

  function renderFailureChainBlock(project, stage, fn, mode) {
    const effects = project.effects.filter((effect) => effect.failureModeId === mode.id && effect.active !== false);
    const causes = project.causes.filter((cause) => cause.failureModeId === mode.id && cause.status === 'active');
    const governing = PFMEA_MODEL.governingSeverity(project, mode.id);
    const governingEffect = effects.find((effect) => effect.id === governing.effectId) || effects[0] || null;
    return `<article class="failure-chain-block">
      <div class="failure-chain-header">
        <div><p class="eyebrow">Cómo puede fallar</p><h3>${esc(mode.description)}</h3></div>
        <div class="action-row">
          <button class="button secondary small" data-action="add-effect" data-failure-id="${attr(mode.id)}">＋ Efecto</button>
          <button class="button secondary small" data-action="add-cause" data-failure-id="${attr(mode.id)}">＋ Causa</button>
        </div>
      </div>
      <div class="governing-effect ${governingEffect ? '' : 'missing'}">
        <div><span>Qué ocurre</span><strong>${governingEffect ? esc(governingEffect.description) : 'Efecto todavía no definido'}</strong>${effects.length > 1 ? `<small>${effects.length} efectos registrados; se usa el de mayor Gravedad.</small>` : ''}</div>
        <div class="governing-score"><span>G</span><strong>${governingEffect?.severity || '—'}</strong></div>
      </div>
      <div class="cause-chain-list">
        ${causes.length ? causes.map((cause) => renderLeanCauseCard(project, stage, fn, mode, cause, governingEffect)).join('') : `<div class="chain-empty"><div><strong>Falta identificar al menos una causa.</strong><span>La evaluación se calcula por causa, no por una nube genérica de posibilidades.</span></div><button class="button primary small" data-action="add-cause" data-failure-id="${attr(mode.id)}">Agregar causa</button></div>`}
      </div>
    </article>`;
  }

  function renderLeanCauseCard(project, stage, fn, mode, cause, governingEffect) {
    const links = project.controlLinks.filter((link) => link.causeId === cause.id);
    const controls = links.map((link) => project.controls.find((control) => control.id === link.controlId)).filter(Boolean);
    const preventive = controls.filter((control) => control.type === 'preventive');
    const detection = controls.filter((control) => control.type === 'detection');
    const preventiveAbsent = Boolean(cause.controlAbsence?.preventiveConfirmed);
    const detectionAbsent = Boolean(cause.controlAbsence?.detectionConfirmed);
    const risk = project.risks.find((item) => item.causeId === cause.id && item.status !== 'archived') || null;
    const actions = risk ? project.actions.filter((action) => action.linkedRiskIds?.includes(risk.id)) : [];
    const reactions = project.reactionPlans.filter((plan) => plan.linkedCauseIds?.includes(cause.id));
    const checks = [
      Boolean(governingEffect && Number(governingEffect.severity)),
      Boolean(preventive.length || preventiveAbsent),
      Boolean(detection.length || detectionAbsent),
      Boolean(risk && Number(risk.current?.occurrence)),
      Boolean(risk && Number(risk.current?.detection)),
      Boolean(risk && risk.decision && risk.decision !== 'pending')
    ];
    const completeCount = checks.filter(Boolean).length;
    const complete = completeCount === checks.length;
    const needsJustification = risk && (['accepted-with-justification', 'accepted-temporarily'].includes(risk.decision) || Number(risk.current?.severity || 0) >= Number(project.methodology.thresholds.criticalSeverity || 9));

    return `<article class="risk-chain-card ${complete ? 'complete' : ''}">
      <div class="risk-chain-card-header">
        <div><p class="eyebrow">Por qué puede ocurrir</p><h3>${esc(cause.description)}</h3></div>
        <div class="action-row">${risk ? badge(risk.decision) : badge('pending', 'Sin evaluar')}<span class="completion-chip ${complete ? 'done' : ''}">${completeCount}/${checks.length}</span></div>
      </div>

      <div class="chain-control-grid">
        <div class="chain-control-cell">
          <div class="chain-cell-title"><span>Prevención</span><button class="button ghost small" data-action="add-control" data-cause-id="${attr(cause.id)}" data-control-type="preventive">＋</button></div>
          ${renderLeanControlSummary(preventive, preventiveAbsent, 'preventivo')}
          ${!preventive.length && !preventiveAbsent ? `<button class="text-button" data-action="confirm-no-control" data-cause-id="${attr(cause.id)}" data-control-type="preventive">Confirmar que no existe</button>` : ''}
        </div>
        <div class="chain-control-cell">
          <div class="chain-cell-title"><span>Detección</span><button class="button ghost small" data-action="add-control" data-cause-id="${attr(cause.id)}" data-control-type="detection">＋</button></div>
          ${renderLeanControlSummary(detection, detectionAbsent, 'de detección')}
          ${!detection.length && !detectionAbsent ? `<button class="text-button" data-action="confirm-no-control" data-cause-id="${attr(cause.id)}" data-control-type="detection">Confirmar que no existe</button>` : ''}
        </div>
      </div>

      ${risk ? `<div class="lean-risk-evaluation">
        <div class="score-box"><label>Gravedad</label><select data-risk-id="${attr(risk.id)}" data-risk-rating="severity">${scoreOptions(risk.current?.severity || governingEffect?.severity)}</select></div>
        <div class="score-box"><label>Ocurrencia</label><select data-risk-id="${attr(risk.id)}" data-risk-rating="occurrence">${scoreOptions(risk.current?.occurrence)}</select></div>
        <div class="score-box"><label>Detección</label><select data-risk-id="${attr(risk.id)}" data-risk-rating="detection">${scoreOptions(risk.current?.detection)}</select></div>
        <div class="score-box rpn"><label>RPN actual</label><strong class="${rpnClass(risk.current?.rpn, project)}">${esc(risk.current?.rpn ?? '—')}</strong></div>
        <div class="score-box decision-box"><label>Decisión</label><select data-risk-id="${attr(risk.id)}" data-risk-decision="true">${selectOptions([
          { value: 'pending', label: 'Pendiente' },
          { value: 'requires-action', label: 'Requiere acción' },
          { value: 'accepted-currently', label: 'Aceptado actualmente' },
          { value: 'accepted-with-justification', label: 'Aceptado con justificación' },
          { value: 'accepted-temporarily', label: 'Aceptado temporalmente' },
          { value: 'closed-after-action', label: 'Cerrado después de acción' }
        ], risk.decision, (item) => item)}</select></div>
      </div>
      ${needsJustification ? `<div class="field compact-field"><label>Justificación de aceptación o criticidad</label><textarea data-risk-justification="${attr(risk.id)}" placeholder="Fundamento del equipo para esta decisión.">${esc(risk.acceptanceJustification || '')}</textarea></div>` : ''}
      <div class="chain-actions">
        <span class="small muted">${actions.length ? `${actions.length} acción${actions.length === 1 ? '' : 'es'} vinculada${actions.length === 1 ? '' : 's'}` : 'Sin acciones vinculadas'}${reactions.length ? ` · ${reactions.length} plan${reactions.length === 1 ? '' : 'es'} de reacción` : ''}</span>
        <span class="toolbar-spacer"></span>
        <button class="button ghost small" data-action="add-reaction" data-cause-id="${attr(cause.id)}">Plan de reacción</button>
        <button class="button primary small" data-action="add-action" data-risk-id="${attr(risk.id)}">＋ Acción</button>
      </div>` : `<div class="chain-empty compact"><div><strong>Evaluación todavía no creada.</strong><span>La causa puede guardarse sin puntuar y completarse después.</span></div><button class="button primary small" data-action="create-risk" data-cause-id="${attr(cause.id)}">Crear G/O/D</button></div>`}

      ${project.clientState.showAdvancedFields ? `<details class="inline-details"><summary>Información técnica de esta causa</summary><div class="detail-line"><span>Categoría: ${esc(cause.category || 'Sin clasificar')}</span><span>Modo: ${esc(mode.description)}</span><span>Función: ${esc(fn.description)}</span></div>${cause.evidence ? `<p class="small"><strong>Evidencia:</strong> ${esc(cause.evidence)}</p>` : ''}${controls.length ? `<p class="small"><strong>Controles:</strong> ${controls.map((control) => esc(`${control.code} · ${control.description}`)).join(' · ')}</p>` : ''}${risk?.target ? `<p class="small"><strong>RPN objetivo:</strong> ${esc(risk.target.rpn ?? '—')}</p>` : ''}</details>` : ''}
    </article>`;
  }

  function renderLeanControlSummary(controls, absenceConfirmed, label) {
    if (controls.length) {
      return `<ul class="lean-control-list">${controls.map((control) => `<li>${esc(control.description)}</li>`).join('')}</ul>`;
    }
    if (absenceConfirmed) return `<div class="control-absence confirmed">No existe control ${esc(label)} actual</div>`;
    return `<div class="control-absence">Pendiente de definir</div>`;
  }


  function renderFunctionsTab(project, stage) {
    const functions = project.functions.filter((fn) => fn.stageId === stage.id && fn.status !== 'archived');
    return `<section class="panel"><div class="panel-header"><div><h2>Funciones y requisitos</h2><p class="small muted" style="margin:3px 0 0">¿Qué debe lograr correctamente ${esc(stage.name)}?</p></div><button class="button primary small" data-action="add-function" data-stage-id="${attr(stage.id)}">＋ Agregar función</button></div><div class="panel-body">
      ${functions.length ? `<div class="card-list">${functions.map((fn) => {
        const modes = project.failureModes.filter((fm) => fm.functionId === fn.id && fm.status === 'active').length;
        const selected = project.clientState.selectedFunctionId === fn.id;
        return `<article class="item-card ${selected ? 'selected' : ''}"><div class="item-card-header"><div><p class="eyebrow">${esc(fn.id)}</p><h3>${esc(fn.description)}</h3><p><strong>Requisito:</strong> ${esc(fn.requirement || 'Sin definir')}</p><div class="detail-line"><span>${esc(fn.specification || 'Sin especificación')}</span><span>${modes} modos de falla</span></div></div><div class="item-actions"><button class="button secondary small" data-action="select-function" data-id="${attr(fn.id)}">Seleccionar</button><button class="button ghost small" data-action="delete-function" data-id="${attr(fn.id)}">Eliminar</button></div></div></article>`;
      }).join('')}</div>` : `<div class="empty-state"><h2>La etapa todavía no tiene funciones</h2><p>Describí primero qué resultado correcto debe producir. Buscar fallas antes de eso suele producir una lista creativa, pero metodológicamente huérfana.</p><button class="button primary" data-action="add-function" data-stage-id="${attr(stage.id)}">Agregar primera función</button></div>`}
    </div></section>`;
  }

  function renderFailuresTab(project, stage) {
    const functions = project.functions.filter((fn) => fn.stageId === stage.id && fn.status !== 'archived');
    return `<section class="panel"><div class="panel-header"><div><h2>Modos de falla</h2><p class="small muted" style="margin:3px 0 0">Formas en que una función o requisito puede no cumplirse.</p></div><button class="button primary small" data-action="add-failure" data-stage-id="${attr(stage.id)}" ${functions.length ? '' : 'disabled'}>＋ Agregar modo</button></div><div class="panel-body">
      ${functions.length ? functions.map((fn) => {
        const modes = project.failureModes.filter((fm) => fm.functionId === fn.id && fm.status === 'active');
        return `<div style="margin-bottom:22px"><div class="item-card-header"><div><p class="eyebrow">Función</p><h3>${esc(fn.description)}</h3></div><button class="button secondary small" data-action="add-failure" data-function-id="${attr(fn.id)}">＋ Modo de falla</button></div>
          <div class="card-list" style="margin-top:10px">${modes.length ? modes.map((mode) => {
            const effects = project.effects.filter((effect) => effect.failureModeId === mode.id && effect.active !== false).length;
            const causes = project.causes.filter((cause) => cause.failureModeId === mode.id && cause.status === 'active').length;
            const selected = project.clientState.selectedFailureModeId === mode.id;
            return `<article class="item-card ${selected ? 'selected' : ''}"><div class="item-card-header"><div><p class="eyebrow">${esc(mode.category || 'Modo de falla')}</p><h3>${esc(mode.description)}</h3><div class="detail-line"><span>${effects} efectos</span><span>${causes} causas</span><span>Origen: ${esc(mode.source || 'equipo')}</span></div></div><div class="item-actions"><button class="button secondary small" data-action="select-failure" data-id="${attr(mode.id)}">Seleccionar</button><button class="button ghost small" data-action="delete-failure" data-id="${attr(mode.id)}">Eliminar</button></div></div></article>`;
          }).join('') : '<div class="subtle-panel"><p class="small muted" style="margin:0">Todavía no hay modos de falla confirmados para esta función.</p></div>'}</div></div>`;
      }).join('') : `<div class="empty-state"><h2>Primero definí funciones</h2><p>Un modo de falla debe referirse a algo que la etapa debía hacer.</p><button class="button primary" data-route="${projectRoute(project.id, 'analysis', stage.id, 'functions')}">Volver a funciones</button></div>`}
      ${functions.length ? `<div class="divider"></div><p class="eyebrow">Biblioteca de desviaciones</p><div class="action-row">${FAILURE_SUGGESTIONS.slice(0, 8).map((suggestion) => `<button class="button secondary small" data-action="add-failure-suggestion" data-stage-id="${attr(stage.id)}" data-suggestion="${attr(suggestion)}">＋ ${esc(suggestion)}</button>`).join('')}</div>` : ''}
    </div></section>`;
  }

  function selectedFailureForStage(project, stage) {
    const functionIds = project.functions.filter((fn) => fn.stageId === stage.id && fn.status !== 'archived').map((fn) => fn.id);
    const modes = project.failureModes.filter((mode) => functionIds.includes(mode.functionId) && mode.status === 'active');
    return modes.find((mode) => mode.id === project.clientState.selectedFailureModeId) || modes[0] || null;
  }

  function renderEffectsCausesTab(project, stage) {
    const mode = selectedFailureForStage(project, stage);
    const functionIds = project.functions.filter((fn) => fn.stageId === stage.id && fn.status !== 'archived').map((fn) => fn.id);
    const modes = project.failureModes.filter((item) => functionIds.includes(item.functionId) && item.status === 'active');
    if (!mode) return `<div class="empty-state"><h2>No hay modos de falla</h2><p>Confirmá al menos uno antes de describir sus efectos y causas.</p><button class="button primary" data-route="${projectRoute(project.id, 'analysis', stage.id, 'failures')}">Ir a modos de falla</button></div>`;
    const effects = project.effects.filter((effect) => effect.failureModeId === mode.id && effect.active !== false);
    const causes = project.causes.filter((cause) => cause.failureModeId === mode.id && cause.status === 'active');
    const governing = PFMEA_MODEL.governingSeverity(project, mode.id);
    return `<section class="panel"><div class="panel-header"><div><p class="eyebrow">Modo de falla seleccionado</p><h2>${esc(mode.description)}</h2></div><select style="width:min(320px,100%)" data-action-select-failure="true">${modes.map((item) => `<option value="${attr(item.id)}" ${item.id === mode.id ? 'selected' : ''}>${esc(item.description)}</option>`).join('')}</select></div><div class="panel-body">
      <div class="split-grid">
        <div>
          <div class="item-card-header"><div><h3>Efectos potenciales</h3><p class="small muted">Qué sucede si aparece el modo de falla.</p></div><button class="button primary small" data-action="add-effect" data-failure-id="${attr(mode.id)}">＋ Efecto</button></div>
          <div class="card-list" style="margin-top:10px">${effects.length ? effects.map((effect) => `<article class="item-card ${effect.id === governing.effectId ? 'selected' : ''}"><div class="item-card-header"><div><p class="eyebrow">${esc(effect.level)} ${effect.id === governing.effectId ? '· Efecto gobernante' : ''}</p><h3>${esc(effect.description)}</h3><p>${esc(effect.affectedParty || '')}</p></div><div class="score-box"><label>Gravedad</label><strong>${esc(effect.severity || '—')}</strong></div></div><div class="item-actions"><button class="button ghost small" data-action="delete-effect" data-id="${attr(effect.id)}">Eliminar</button></div></article>`).join('') : '<div class="subtle-panel"><p class="small muted" style="margin:0">Sin efectos registrados.</p></div>'}</div>
        </div>
        <div>
          <div class="item-card-header"><div><h3>Causas potenciales</h3><p class="small muted">Qué condición puede producir el modo de falla.</p></div><button class="button primary small" data-action="add-cause" data-failure-id="${attr(mode.id)}">＋ Causa</button></div>
          <div class="card-list" style="margin-top:10px">${causes.length ? causes.map((cause) => {
            const risk = project.risks.find((item) => item.causeId === cause.id);
            const selected = project.clientState.selectedCauseId === cause.id;
            return `<article class="item-card ${selected ? 'selected' : ''}"><div class="item-card-header"><div><p class="eyebrow">${esc(cause.category)}</p><h3>${esc(cause.description)}</h3><p>${esc(cause.mechanism || '')}</p><div class="detail-line"><span>${risk ? `${risk.code} · RPN ${risk.current?.rpn ?? '—'}` : 'Sin evaluar'}</span></div></div><div class="item-actions"><button class="button secondary small" data-action="select-cause" data-id="${attr(cause.id)}">Seleccionar</button><button class="button ghost small" data-action="delete-cause" data-id="${attr(cause.id)}">Eliminar</button></div></div></article>`;
          }).join('') : '<div class="subtle-panel"><p class="small muted" style="margin:0">Sin causas registradas.</p></div>'}</div>
        </div>
      </div>
    </div></section>`;
  }

  function selectedCauseForStage(project, stage) {
    const functionIds = project.functions.filter((fn) => fn.stageId === stage.id && fn.status !== 'archived').map((fn) => fn.id);
    const failureIds = project.failureModes.filter((fm) => functionIds.includes(fm.functionId) && fm.status === 'active').map((fm) => fm.id);
    const causes = project.causes.filter((cause) => failureIds.includes(cause.failureModeId) && cause.status === 'active');
    return causes.find((cause) => cause.id === project.clientState.selectedCauseId) || causes[0] || null;
  }

  function renderControlsTab(project, stage) {
    const cause = selectedCauseForStage(project, stage);
    const functionIds = project.functions.filter((fn) => fn.stageId === stage.id && fn.status !== 'archived').map((fn) => fn.id);
    const failureIds = project.failureModes.filter((fm) => functionIds.includes(fm.functionId) && fm.status === 'active').map((fm) => fm.id);
    const causes = project.causes.filter((item) => failureIds.includes(item.failureModeId) && item.status === 'active');
    if (!cause) return `<div class="empty-state"><h2>No hay causas para analizar</h2><p>Registrá al menos una causa potencial antes de documentar controles.</p><button class="button primary" data-route="${projectRoute(project.id, 'analysis', stage.id, 'effects-causes')}">Ir a efectos y causas</button></div>`;
    const links = project.controlLinks.filter((link) => link.causeId === cause.id);
    const controls = links.map((link) => project.controls.find((control) => control.id === link.controlId)).filter(Boolean);
    const preventive = controls.filter((control) => control.type === 'preventive');
    const detection = controls.filter((control) => control.type === 'detection');
    const reactionPlans = project.reactionPlans.filter((plan) => plan.linkedCauseIds?.includes(cause.id));
    return `<section class="panel"><div class="panel-header"><div><p class="eyebrow">Causa seleccionada</p><h2>${esc(cause.description)}</h2></div><select style="width:min(340px,100%)" data-action-select-cause="true">${causes.map((item) => `<option value="${attr(item.id)}" ${item.id === cause.id ? 'selected' : ''}>${esc(item.description)}</option>`).join('')}</select></div><div class="panel-body">
      <div class="split-grid">
        <div>
          <div class="item-card-header"><div><h3>Controles preventivos</h3><p class="small muted">Evitan la causa o reducen su ocurrencia.</p></div><button class="button primary small" data-action="add-control" data-cause-id="${attr(cause.id)}" data-control-type="preventive">＋ Control</button></div>
          <div class="card-list" style="margin-top:10px">${preventive.length ? preventive.map((control) => controlCard(control)).join('') : `<div class="subtle-panel"><p class="small muted">No existe control preventivo vinculado.</p><button class="button secondary small" data-action="confirm-no-control" data-cause-id="${attr(cause.id)}" data-control-type="preventive">Confirmar ausencia</button></div>`}</div>
        </div>
        <div>
          <div class="item-card-header"><div><h3>Controles de detección</h3><p class="small muted">Detectan la causa o la falla antes de avanzar.</p></div><button class="button primary small" data-action="add-control" data-cause-id="${attr(cause.id)}" data-control-type="detection">＋ Control</button></div>
          <div class="card-list" style="margin-top:10px">${detection.length ? detection.map((control) => controlCard(control)).join('') : `<div class="subtle-panel"><p class="small muted">No existe control de detección vinculado.</p><button class="button secondary small" data-action="confirm-no-control" data-cause-id="${attr(cause.id)}" data-control-type="detection">Confirmar ausencia</button></div>`}</div>
        </div>
      </div>
      <div class="divider"></div>
      <div class="item-card-header"><div><h3>Plan de reacción o contingencia</h3><p class="small muted">Qué se hace cuando un control detecta una condición fuera de aceptación.</p></div><button class="button primary small" data-action="add-reaction" data-cause-id="${attr(cause.id)}">＋ Plan de reacción</button></div>
      <div class="card-list" style="margin-top:10px">${reactionPlans.length ? reactionPlans.map((plan) => `<article class="item-card"><p class="eyebrow">${esc(plan.code)}</p><h3>${esc(plan.trigger)}</h3><p><strong>Acción inmediata:</strong> ${esc(plan.immediateAction)}</p><div class="detail-line"><span>${plan.stopLine ? 'Detiene línea' : 'Sin detención automática'}</span><span>${plan.segregationRequired ? 'Requiere segregación' : 'Sin segregación definida'}</span><span>Responsable: ${esc(plan.responsible || 'Sin definir')}</span></div></article>`).join('') : '<div class="subtle-panel"><p class="small muted" style="margin:0">No hay plan de reacción asociado a esta causa.</p></div>'}</div>
    </div></section>`;
  }

  function controlCard(control) {
    return `<article class="item-card"><div class="item-card-header"><div><p class="eyebrow">${esc(control.code)} · ${esc(control.subtype)}</p><h3>${esc(control.description)}</h3><p>${esc(control.method || '')}</p><div class="detail-line"><span>${esc(control.frequency || 'Sin frecuencia')}</span><span>${control.automatic ? 'Automático' : 'Manual'}</span><span>${control.validated ? 'Validado' : 'Validación pendiente'}</span></div></div>${control.challengeTestRequired ? `<span class="badge ${control.challengeTestCompleted ? 'success' : 'warning'}">Challenge ${control.challengeTestCompleted ? 'completo' : 'pendiente'}</span>` : ''}</div></article>`;
  }

  function renderEvaluationTab(project, stage) {
    const functionIds = project.functions.filter((fn) => fn.stageId === stage.id && fn.status !== 'archived').map((fn) => fn.id);
    const failureIds = project.failureModes.filter((fm) => functionIds.includes(fm.functionId) && fm.status === 'active').map((fm) => fm.id);
    const causes = project.causes.filter((cause) => failureIds.includes(cause.failureModeId) && cause.status === 'active');
    if (!causes.length) return `<div class="empty-state"><h2>No hay causas evaluables</h2><p>El RPN se calcula por causa. Primero completá la cadena de falla.</p><button class="button primary" data-route="${projectRoute(project.id, 'analysis', stage.id, 'effects-causes')}">Ir a efectos y causas</button></div>`;
    return `<div class="card-list">${causes.map((cause) => {
      const failureMode = project.failureModes.find((fm) => fm.id === cause.failureModeId);
      const risk = project.risks.find((item) => item.causeId === cause.id);
      const governing = PFMEA_MODEL.governingSeverity(project, failureMode?.id);
      if (!risk) return `<article class="panel"><div class="panel-body"><p class="eyebrow">Causa sin evaluación</p><h3>${esc(cause.description)}</h3><p class="muted small">Modo de falla: ${esc(failureMode?.description || '')}</p><button class="button primary small" data-action="create-risk" data-cause-id="${attr(cause.id)}">Crear evaluación</button></div></article>`;
      const actions = project.actions.filter((action) => action.linkedRiskIds?.includes(risk.id));
      const needsJustification = ['accepted-with-justification', 'accepted-temporarily'].includes(risk.decision)
        || Number(risk.current?.severity || 0) >= Number(project.methodology.thresholds.criticalSeverity || 9);
      return `<article class="panel"><div class="panel-header"><div><p class="eyebrow">${esc(risk.code)} · ${esc(failureMode?.description || 'Modo de falla')}</p><h2>${esc(cause.description)}</h2></div>${badge(risk.decision)}</div><div class="panel-body">
        <div class="risk-score">
          <div class="score-box"><label>Gravedad</label><select data-risk-id="${attr(risk.id)}" data-risk-rating="severity">${scoreOptions(risk.current?.severity || governing.severity)}</select></div>
          <div class="score-box"><label>Ocurrencia</label><select data-risk-id="${attr(risk.id)}" data-risk-rating="occurrence">${scoreOptions(risk.current?.occurrence)}</select></div>
          <div class="score-box"><label>Detección</label><select data-risk-id="${attr(risk.id)}" data-risk-rating="detection">${scoreOptions(risk.current?.detection)}</select></div>
          <div class="score-box rpn"><label>RPN actual</label><strong class="${rpnClass(risk.current?.rpn, project)}">${esc(risk.current?.rpn ?? '—')}</strong></div>
        </div>
        <div class="form-grid" style="margin-top:14px">
          <div class="field"><label>Decisión del riesgo</label><select data-risk-id="${attr(risk.id)}" data-risk-decision="true">${selectOptions([
            { value: 'pending', label: 'Pendiente' }, { value: 'requires-action', label: 'Requiere acción' }, { value: 'accepted-currently', label: 'Aceptado actualmente' }, { value: 'accepted-with-justification', label: 'Aceptado con justificación' }, { value: 'accepted-temporarily', label: 'Aceptado temporalmente' }, { value: 'closed-after-action', label: 'Cerrado después de acción' }
          ], risk.decision, (item) => item)}</select></div>
          <div class="field"><label>Evaluación posterior</label><div class="subtle-panel small">${risk.residual ? `Residual verificado: <strong>${risk.residual.rpn}</strong>` : risk.target ? `Objetivo proyectado: <strong>${risk.target.rpn}</strong>` : 'Sin evaluación posterior'}</div></div>
        </div>
        ${needsJustification ? `<div class="field compact-field" style="margin-top:14px"><label>Justificación de aceptación o criticidad</label><textarea data-risk-justification="${attr(risk.id)}" placeholder="Fundamento del equipo para esta decisión.">${esc(risk.acceptanceJustification || '')}</textarea></div>` : ''}
        <div class="divider"></div>
        <div class="item-card-header"><div><h3>Acciones vinculadas</h3><p class="small muted">${actions.length} acciones asociadas a este riesgo.</p></div><button class="button primary small" data-action="add-action" data-risk-id="${attr(risk.id)}">＋ Agregar acción</button></div>
        <div class="card-list" style="margin-top:10px">${actions.length ? actions.map((action) => `<div class="subtle-panel"><div class="item-card-header"><div><strong>${esc(action.code)} · ${esc(action.description)}</strong><div class="detail-line"><span>${esc(action.responsible)}</span><span>${formatDate(action.targetDate)}</span></div></div>${badge(action.status)}</div></div>`).join('') : '<p class="small muted">No hay acciones vinculadas.</p>'}</div>
      </div></article>`;
    }).join('')}</div>`;
  }

  function scoreOptions(current) {
    return `<option value="">—</option>${Array.from({ length: 10 }, (_, index) => index + 1).map((score) => `<option value="${score}" ${Number(current) === score ? 'selected' : ''}>${score}</option>`).join('')}`;
  }

  function renderMatrix(project) {
    const risks = [...project.risks].sort((a, b) => Number(b.current?.rpn || 0) - Number(a.current?.rpn || 0));
    const mainHtml = `<section class="panel"><div class="panel-header"><div><h2>Matriz consolidada</h2><p class="small muted" style="margin:3px 0 0">Una fila por causa evaluada.</p></div><div class="action-row"><button class="button secondary small" data-action="export-csv">⇩ CSV</button><button class="button primary small" data-route="${projectRoute(project.id, 'analysis')}">Vista guiada</button></div></div><div class="panel-body">
      ${risks.length ? `<div class="table-wrap"><table><thead><tr><th>ID</th><th>Etapa</th><th>Función</th><th>Modo de falla</th><th>Efecto gobernante</th><th>Causa</th><th class="numeric">G</th><th class="numeric">O</th><th class="numeric">D</th><th class="numeric">RPN</th><th>Decisión</th><th>Acciones</th></tr></thead><tbody>
        ${risks.map((risk) => {
          const context = PFMEA_MODEL.riskContext(project, risk);
          const actions = project.actions.filter((action) => action.linkedRiskIds?.includes(risk.id));
          return `<tr class="clickable" data-route="${context.stage ? projectRoute(project.id, 'analysis', context.stage.id, 'chain') : projectRoute(project.id, 'matrix')}" data-select-risk="${attr(risk.id)}"><td><strong>${esc(risk.code)}</strong></td><td>${esc(context.stage ? `${context.stage.code} · ${context.stage.name}` : '')}</td><td>${esc(context.function?.description || '')}</td><td>${esc(context.failureMode?.description || '')}</td><td>${esc(context.effect?.description || '')}</td><td>${esc(context.cause?.description || '')}</td><td class="numeric">${esc(risk.current?.severity ?? '—')}</td><td class="numeric">${esc(risk.current?.occurrence ?? '—')}</td><td class="numeric">${esc(risk.current?.detection ?? '—')}</td><td class="numeric ${rpnClass(risk.current?.rpn, project)}">${esc(risk.current?.rpn ?? '—')}</td><td>${badge(risk.decision)}</td><td>${actions.map((action) => esc(action.code)).join(', ') || '—'}</td></tr>`;
        }).join('')}
      </tbody></table></div>` : '<div class="empty-state"><h2>La matriz está vacía</h2><p>Los riesgos aparecerán cuando existan causas evaluadas.</p></div>'}
    </div></section>`;

    workspaceShell(project, 'matrix', {
      eyebrow: 'Modo experto',
      title: 'Vista matricial',
      description: 'Revisión consolidada de todas las causas y evaluaciones del proyecto.',
      mainHtml,
      contextHtml: `<section class="panel"><div class="panel-header"><h3>Lectura de la tabla</h3></div><div class="panel-body"><p class="small muted">La fila representa una causa evaluada. Un mismo modo de falla puede aparecer varias veces cuando tiene causas distintas, que es precisamente el punto que las planillas demasiado compactas suelen esconder debajo de una combinación de celdas.</p></div></section>`
    });
  }

  function renderActions(project) {
    const actions = [...project.actions].sort((a, b) => {
      const overdueA = isActionOverdue(a) ? 1 : 0;
      const overdueB = isActionOverdue(b) ? 1 : 0;
      return overdueB - overdueA || String(a.targetDate || '9999').localeCompare(String(b.targetDate || '9999'));
    });
    const open = actions.filter((action) => !['effectiveness-verified', 'cancelled', 'replaced'].includes(action.status)).length;
    const overdue = actions.filter(isActionOverdue).length;
    const pendingVerification = actions.filter((action) => action.status === 'pending-verification' || action.effectiveness?.status === 'pending-verification').length;
    const mainHtml = `
      <div class="kpi-grid">
        ${kpi('Acciones totales', actions.length, 'Mitigaciones registradas')}
        ${kpi('Abiertas', open, 'Incluye propuestas y en progreso')}
        ${kpi('Vencidas', overdue, 'Fecha objetivo superada')}
        ${kpi('Pendientes de verificar', pendingVerification, 'Implementadas sin cierre de efectividad')}
      </div>
      <section class="panel"><div class="panel-header"><div><h2>Plan de acciones</h2><p class="small muted" style="margin:3px 0 0">Una acción puede mitigar varios riesgos.</p></div><button class="button primary small" data-action="add-general-action">＋ Agregar acción</button></div><div class="panel-body">
        ${actions.length ? `<div class="table-wrap"><table><thead><tr><th>Acción</th><th>Descripción</th><th>Riesgos</th><th>Responsable</th><th>Fecha objetivo</th><th>Prioridad</th><th>Estado</th></tr></thead><tbody>
          ${actions.map((action) => `<tr><td><strong>${esc(action.code)}</strong>${isActionOverdue(action) ? '<br><span class="badge danger">Vencida</span>' : ''}</td><td>${esc(action.description)}</td><td>${(action.linkedRiskIds || []).map((id) => esc(project.risks.find((risk) => risk.id === id)?.code || id)).join(', ') || '—'}</td><td>${esc(action.responsible || 'Sin asignar')}</td><td>${formatDate(action.targetDate)}</td><td>${badge(action.priority === 'critical' ? 'requires-action' : action.priority === 'high' ? 'in-progress' : '', action.priority || 'Sin prioridad')}</td><td><select data-action-status="${attr(action.id)}">${selectOptions([
            { value: 'proposed', label: 'Propuesta' }, { value: 'accepted', label: 'Aceptada' }, { value: 'in-progress', label: 'En progreso' }, { value: 'implemented', label: 'Implementada' }, { value: 'pending-verification', label: 'Pendiente de verificación' }, { value: 'effectiveness-verified', label: 'Efectividad verificada' }, { value: 'cancelled', label: 'Cancelada' }, { value: 'replaced', label: 'Reemplazada' }
          ], action.status, (item) => item)}</select></td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty-state"><h2>No hay acciones</h2><p>Las acciones se crean desde un riesgo o desde esta vista y luego se vinculan.</p></div>'}
      </div></section>`;

    const contextHtml = `<section class="panel"><div class="panel-header"><h3>Regla de cierre</h3></div><div class="panel-body"><p class="small muted">Una acción implementada no equivale todavía a una acción eficaz. El RPN solo debería llamarse residual verificado cuando existe evidencia de implementación y comprobación de efectividad.</p></div></section>`;

    workspaceShell(project, 'actions', {
      eyebrow: 'Paso 7',
      title: 'Plan de acciones',
      description: 'Seguimiento de mitigaciones, responsables, fechas y verificación de efectividad.',
      headerActions: `<button class="button primary" data-action="add-general-action">＋ Nueva acción</button>`,
      mainHtml,
      contextHtml
    });
  }

  function isActionOverdue(action) {
    return Boolean(action.targetDate && new Date(`${action.targetDate}T23:59:59`) < new Date() && !['effectiveness-verified', 'cancelled', 'replaced'].includes(action.status));
  }

  function renderReview(project) {
    const activeGate = project.metadata.status === 'final' ? 'final' : 'in-review';
    const issues = validateProject(project, activeGate);
    const reviewIssues = validateProject(project, 'in-review');
    const finalIssues = validateProject(project, 'final');
    const reviewErrors = reviewIssues.filter((issue) => issue.severity === 'error');
    const finalErrors = finalIssues.filter((issue) => issue.severity === 'error');
    const errors = issues.filter((issue) => issue.severity === 'error');
    const warnings = issues.filter((issue) => issue.severity === 'warning');
    const metrics = PFMEA_MODEL.projectMetrics(project);
    const topRisks = [...project.risks].sort((a, b) => Number(b.current?.rpn || 0) - Number(a.current?.rpn || 0)).slice(0, 8);
    const mainHtml = `
      <div class="kpi-grid">
        ${kpi('Bloqueos del hito', errors.length, activeGate === 'final' ? 'Necesarios para cerrar la revisión' : 'Necesarios para enviar a revisión')}
        ${kpi('Advertencias', warnings.length, 'No bloquean, pero requieren criterio')}
        ${kpi('Riesgos prioritarios', metrics.criticalRisks, 'Por gravedad o umbral de RPN')}
        ${kpi('Acciones vencidas', metrics.overdueActions, 'Pendientes de regularización')}
      </div>
      <section class="panel"><div class="panel-header"><div><h2>Integridad y coherencia</h2><p class="small muted" style="margin:3px 0 0">Las reglas cambian según el hito. Un borrador no necesita fingir que ya está terminado.</p></div>${badge(errors.length ? 'error' : warnings.length ? 'in-progress' : 'complete', errors.length ? 'No listo' : warnings.length ? 'Revisar' : 'Sin bloqueos')}</div><div class="panel-body">
        <div class="alert-list">${issues.length ? issues.map((issue) => alertItem(issue.severity, issue.title, issue.detail, issue.route)).join('') : alertItem('info', 'Proyecto completo para este hito', 'No se detectaron errores ni advertencias con las reglas actuales.')}</div>
      </div></section>
      <section class="panel"><div class="panel-header"><h2>Ranking de riesgo actual</h2><button class="button secondary small" data-route="${projectRoute(project.id, 'matrix')}">Abrir matriz</button></div><div class="panel-body">
        ${topRisks.length ? `<div class="table-wrap"><table><thead><tr><th>Riesgo</th><th>Etapa</th><th>Modo de falla</th><th>Causa</th><th class="numeric">G</th><th class="numeric">RPN</th><th>Decisión</th></tr></thead><tbody>${topRisks.map((risk) => {
          const context = PFMEA_MODEL.riskContext(project, risk);
          return `<tr class="clickable" data-route="${context.stage ? projectRoute(project.id, 'analysis', context.stage.id, 'chain') : projectRoute(project.id, 'matrix')}" data-select-risk="${attr(risk.id)}"><td><strong>${esc(risk.code)}</strong></td><td>${esc(context.stage?.name || '')}</td><td>${esc(context.failureMode?.description || '')}</td><td>${esc(context.cause?.description || '')}</td><td class="numeric">${esc(risk.current?.severity ?? '—')}</td><td class="numeric ${rpnClass(risk.current?.rpn, project)}">${esc(risk.current?.rpn ?? '—')}</td><td>${badge(risk.decision)}</td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="muted">No existen riesgos evaluados.</p>'}
      </div></section>`;

    const contextHtml = `<section class="panel"><div class="panel-header"><h3>Cambio de estado</h3></div><div class="panel-body">
      <p class="small muted">Estado actual: ${statusLabel(project.metadata.status)}</p>
      <div class="card-list">
        <button class="button secondary" data-action="set-project-status" data-status="draft">Mantener como borrador</button>
        <button class="button primary" data-action="set-project-status" data-status="in-review" ${reviewErrors.length ? 'disabled' : ''}>Marcar En revisión</button>
        <button class="button primary" data-action="set-project-status" data-status="final" ${finalErrors.length ? 'disabled' : ''}>Marcar Final</button>
      </div>
      <div class="subtle-panel small" style="margin-top:12px"><strong>Para revisión:</strong> ${reviewErrors.length} bloqueos.<br><strong>Para cierre final:</strong> ${finalErrors.length} bloqueos.</div>
      ${warnings.length ? '<p class="small muted" style="margin-top:12px">Las advertencias no impiden avanzar, pero quedan visibles para que nadie pueda alegar sorpresa retrospectiva.</p>' : ''}
    </div></section>`;

    workspaceShell(project, 'review', {
      eyebrow: 'Paso 8',
      title: 'Revisión final',
      description: 'Comprobación gradual de integridad: trabajar, completar etapas, enviar a revisión y cerrar no exigen lo mismo.',
      headerActions: `<button class="button primary" data-route="${projectRoute(project.id, 'export')}">Continuar a exportación</button>`,
      mainHtml,
      contextHtml
    });
  }


  function renderExport(project) {
    const gate = project.metadata.status === 'final' ? 'final' : project.metadata.status === 'in-review' ? 'in-review' : 'working';
    const issues = validateProject(project, gate);
    const metrics = PFMEA_MODEL.projectMetrics(project);
    const mainHtml = `
      <section class="panel"><div class="panel-header"><h2>Resumen previo</h2>${badge(project.metadata.status)}</div><div class="panel-body">
        <div class="kpi-grid" style="margin-bottom:0">
          ${kpi('Etapas', metrics.stages, `${metrics.completedStages} completas`)}
          ${kpi('Riesgos', metrics.risks, `${metrics.criticalRisks} prioritarios`)}
          ${kpi('Acciones abiertas', metrics.openActions, `${metrics.overdueActions} vencidas`)}
          ${kpi('Pendientes del estado', issues.length, 'Bloqueos y advertencias aplicables')}
        </div>
        ${project.metadata.status === 'draft' ? '<div class="alert-item warning" style="margin-top:16px"><span>!</span><div><strong>El proyecto está en Borrador</strong><p>Puede exportarse, pero Excel y el informe identificarán claramente que el análisis sigue incompleto.</p></div></div>' : ''}
      </div></section>
      <div class="export-grid">
        <article class="export-card"><span class="badge brand export-tag">Editable</span><h3>Proyecto JSON</h3><p>Contiene el modelo completo y permite continuar en otro navegador o equipo.</p><button class="button primary" data-action="export-json">Descargar .pfmea.json</button></article>
        <article class="export-card"><span class="badge success export-tag">Nuevo en v0.4</span><h3>Libro Excel completo</h3><p>Genera un XLSX con resumen, proceso, PFMEA, rankings, acciones, escalas, pendientes, revisiones y referencias.</p><button class="button primary" data-action="export-xlsx">Generar Excel .xlsx</button></article>
        <article class="export-card"><span class="badge success export-tag">Nuevo en v0.4</span><h3>Informe PDF / impresión</h3><p>Abre un informe profesional listo para imprimir o guardar como PDF desde el diálogo del navegador.</p><div class="action-row" style="margin-top:auto"><button class="button primary" data-action="print-report">Abrir informe</button><button class="button secondary" data-action="download-report-html">Descargar HTML</button></div></article>
        <article class="export-card"><span class="badge success export-tag">Operativo</span><h3>Matriz CSV</h3><p>Salida tabular liviana compatible con Excel y otras herramientas de análisis.</p><button class="button primary" data-action="export-csv">Descargar CSV</button></article>
        <article class="export-card"><span class="badge success export-tag">Operativo</span><h3>Mapa de proceso SVG</h3><p>Diagrama vectorial completo, independiente del área visible en pantalla.</p><button class="button primary" data-action="export-map-svg">Descargar SVG</button></article>
        <article class="export-card"><span class="badge info export-tag">Recuperación</span><h3>Copias internas</h3><p>Creá y restaurá puntos de recuperación guardados dentro del navegador.</p><button class="button secondary" data-action="manage-snapshots" data-project-id="${attr(project.id)}">Administrar copias</button></article>
        <article class="export-card"><span class="badge info export-tag">Documentación</span><h3>Contrato de datos y reglas</h3><p>JSON Schema, reglas de completitud por hito e interfaces TypeScript.</p><div class="action-row" style="margin-top:auto"><a class="button secondary" href="pfmea-project.schema.json" download>JSON Schema</a><a class="button secondary" href="pfmea-completion-rules.json" download>Reglas</a><a class="button secondary" href="data-model.ts" download>TypeScript</a></div></article>
      </div>`;

    const storageMode = PFMEA_STORAGE.storageMode();
    const storageDescription = storageMode === 'indexeddb'
      ? 'La biblioteca se guarda en IndexedDB y mantiene una copia local auxiliar cuando el navegador lo permite.'
      : storageMode === 'localStorage'
        ? 'La biblioteca se guarda en el almacenamiento local del navegador. Conservá además una copia JSON externa.'
        : 'La sesión utiliza memoria temporal. Descargá una copia JSON antes de cerrar la página.';
    const contextHtml = `<section class="panel"><div class="panel-header"><h3>Persistencia y portabilidad</h3></div><div class="panel-body"><p class="small muted">Modo activo: <strong>${esc(PFMEA_STORAGE.storageLabel())}</strong>. ${esc(storageDescription)} El JSON sigue siendo la copia externa maestra para mover el proyecto entre dispositivos.</p><p class="small"><strong>Última copia externa</strong><br>${project.metadata.lastExternalBackupAt ? formatDate(project.metadata.lastExternalBackupAt, true) : 'Nunca'}</p><p class="small"><strong>Última exportación documental</strong><br>${project.metadata.lastExportAt ? formatDate(project.metadata.lastExportAt, true) : 'Nunca'}</p></div></section>`;

    workspaceShell(project, 'export', {
      eyebrow: 'Paso 9',
      title: 'Exportación',
      description: 'Generá el archivo editable y las salidas documentales del PFMEA.',
      mainHtml,
      contextHtml
    });
  }

  function validateStage(project, stageId, gate = 'working') {
    const issues = [];
    const stage = project.processMap.nodes.find((node) => node.id === stageId);
    if (!stage || stage.archived) return issues;
    if (project.workflow.stageStatus[stageId] === 'not-applicable') return issues;

    const strict = ['complete', 'in-review', 'final'].includes(gate);
    const missingSeverity = strict ? 'error' : 'warning';
    const stageRoute = projectRoute(project.id, 'analysis', stageId, 'chain');
    const addMissing = (title, detail) => issues.push({ severity: missingSeverity, title, detail, route: stageRoute });
    const functions = project.functions.filter((fn) => fn.stageId === stageId && fn.status !== 'archived');

    if (!functions.length) {
      addMissing(`${stage.code || ''} · ${stage.name} sin resultado esperado`, 'Definí al menos qué debe lograr la etapa o marcala como No aplica.');
      return issues;
    }

    functions.forEach((fn) => {
      if (!fn.description?.trim()) addMissing('Función sin descripción', `Completá el resultado esperado de ${stage.name}.`);
      if (!fn.requirement?.trim()) {
        issues.push({ severity: 'info', title: 'Criterio técnico no separado', detail: `${fn.description || 'Función'} puede conservar el requisito dentro de la misma frase. Separarlo es opcional.`, route: stageRoute });
      }

      const modes = project.failureModes.filter((mode) => mode.functionId === fn.id && mode.status === 'active');
      if (!modes.length) addMissing('Resultado esperado sin modos de falla', fn.description || stage.name);

      modes.forEach((mode) => {
        const effects = project.effects.filter((effect) => effect.failureModeId === mode.id && effect.active !== false);
        const causes = project.causes.filter((cause) => cause.failureModeId === mode.id && cause.status === 'active');
        if (!effects.length) addMissing('Modo de falla sin efecto', mode.description);
        if (!causes.length) addMissing('Modo de falla sin causa', mode.description);

        effects.forEach((effect) => {
          if (!(Number(effect.severity) >= 1 && Number(effect.severity) <= 10)) {
            addMissing('Efecto sin Gravedad válida', effect.description || mode.description);
          }
        });

        causes.forEach((cause) => {
          const risk = project.risks.find((item) => item.causeId === cause.id && item.status !== 'archived');
          if (!risk) {
            addMissing('Causa sin evaluación de riesgo', cause.description);
            return;
          }

          const ratingsComplete = [risk.current?.severity, risk.current?.occurrence, risk.current?.detection]
            .every((value) => Number(value) >= 1 && Number(value) <= 10);
          if (!ratingsComplete) addMissing(`${risk.code || 'Riesgo'} con G/O/D incompleto`, cause.description);

          const links = project.controlLinks.filter((link) => link.causeId === cause.id);
          const linkedControls = links
            .map((link) => project.controls.find((control) => control.id === link.controlId && control.status !== 'archived'))
            .filter(Boolean);
          const hasPreventive = linkedControls.some((control) => control.type === 'preventive');
          const hasDetection = linkedControls.some((control) => control.type === 'detection');
          const preventiveAbsenceConfirmed = Boolean(cause.controlAbsence?.preventiveConfirmed);
          const detectionAbsenceConfirmed = Boolean(cause.controlAbsence?.detectionConfirmed);

          if (!hasPreventive && !preventiveAbsenceConfirmed) {
            addMissing(`${risk.code || 'Riesgo'} sin definición preventiva`, 'Agregá un control preventivo o confirmá expresamente que no existe.');
          }
          if (!hasDetection && !detectionAbsenceConfirmed) {
            addMissing(`${risk.code || 'Riesgo'} sin definición de detección`, 'Agregá un control de detección o confirmá expresamente que no existe.');
          }
          if (!risk.decision || risk.decision === 'pending') {
            addMissing(`${risk.code || 'Riesgo'} sin decisión`, 'Indicá si el riesgo requiere acción, se acepta o queda temporalmente abierto.');
          }
        });
      });
    });

    return issues;
  }


  function validateProject(project, gate = 'working') {
    const issues = [];
    const reviewGate = ['in-review', 'final'].includes(gate);
    const finalGate = gate === 'final';
    const setupRoute = (tab) => projectRoute(project.id, 'setup', tab);
    const addRequired = (title, value, route, options = {}) => {
      if (String(value ?? '').trim()) return;
      if (options.finalOnly && gate === 'working') return;
      const severity = options.finalOnly && !finalGate
        ? 'warning'
        : reviewGate ? 'error' : 'warning';
      issues.push({ severity, title: `${title} sin completar`, detail: options.detail || 'Puede completarse durante el borrador; será requerido en el hito correspondiente.', route });
    };

    addRequired('Nombre del proyecto', project.metadata.name, setupRoute('identification'));
    addRequired('Nombre del proceso', project.metadata.processName, setupRoute('identification'));
    if (reviewGate) {
      addRequired('Código PFMEA', project.metadata.code, setupRoute('identification'), { detail: 'Es requerido para identificar la revisión formal.' });
      addRequired('Revisión', project.metadata.revision, setupRoute('identification'), { detail: 'Es requerida para identificar la revisión formal.' });
      addRequired('Inicio del alcance', project.scope.processStart, setupRoute('scope'));
      addRequired('Fin del alcance', project.scope.processEnd, setupRoute('scope'));
    }
    addRequired('Responsable del análisis', project.metadata.owner, setupRoute('identification'), { finalOnly: true, detail: 'Puede quedar pendiente durante la revisión, pero debe definirse para cerrar la versión.' });

    if (reviewGate && !project.scope.objective?.trim()) {
      issues.push({ severity: 'warning', title: 'Objetivo del análisis no documentado', detail: 'No bloquea la revisión, pero mejora el contexto del PFMEA.', route: setupRoute('scope') });
    }
    if (reviewGate && !(project.team || []).length) {
      issues.push({ severity: 'warning', title: 'Equipo PFMEA no registrado', detail: 'El análisis puede continuar, aunque conviene documentar quién participó.', route: setupRoute('team') });
    }

    const mapIssues = validateMap(project).filter((issue) => issue.severity !== 'info');
    mapIssues.forEach((issue) => {
      const severity = reviewGate && issue.severity === 'error' ? 'error' : 'warning';
      issues.push({ ...issue, severity, route: projectRoute(project.id, 'map') });
    });
    if (!project.processMap.confirmedAt) {
      issues.push({ severity: reviewGate ? 'error' : 'warning', title: 'Mapa todavía no confirmado', detail: 'Puede seguir cambiando durante el borrador; debe confirmarse antes de enviar el PFMEA a revisión.', route: projectRoute(project.id, 'map') });
    }

    const stages = project.processMap.nodes.filter((node) => !node.archived && !['start', 'end'].includes(node.type));
    stages.forEach((stage) => {
      const status = project.workflow.stageStatus[stage.id] || 'not-started';
      const hasContent = project.functions.some((fn) => fn.stageId === stage.id && fn.status !== 'archived');
      if (reviewGate && !['complete', 'not-applicable'].includes(status)) {
        issues.push({ severity: 'error', title: `${stage.code || ''} · ${stage.name} no está cerrada`, detail: hasContent ? 'El análisis está iniciado: resolvé sus faltantes y marcá la etapa Completa.' : 'La etapa todavía no fue analizada. Completala o marcala No aplica.', route: projectRoute(project.id, 'analysis', stage.id, 'chain') });
      }
      const shouldValidateContent = status !== 'not-applicable' && (
        status === 'complete'
        || hasContent
        || (!reviewGate && ['in-progress', 'review-required'].includes(status))
      );
      if (shouldValidateContent) {
        issues.push(...validateStage(project, stage.id, reviewGate ? 'complete' : 'working'));
      }
    });

    project.risks.filter((risk) => risk.status !== 'archived').forEach((risk) => {
      const context = PFMEA_MODEL.riskContext(project, risk);
      const route = context.stage ? projectRoute(project.id, 'analysis', context.stage.id, 'chain') : projectRoute(project.id, 'matrix');
      const severity = Number(risk.current?.severity || 0);
      const rpn = Number(risk.current?.rpn || 0);
      const isAccepted = ['accepted-currently', 'accepted-with-justification', 'accepted-temporarily'].includes(risk.decision);
      const needsAction = ['requires-action', 'accepted-temporarily'].includes(risk.decision);
      const linkedActions = project.actions.filter((action) => risk.actionIds?.includes(action.id) && !['cancelled', 'replaced'].includes(action.status));

      if (severity >= Number(project.methodology.thresholds.criticalSeverity || 9)) {
        issues.push({ severity: 'warning', title: `${risk.code} con Gravedad crítica`, detail: context.effect?.description || 'Revisar el efecto gobernante.', route });
      }
      if (rpn >= Number(project.methodology.thresholds.actionRpn || 180) && !linkedActions.length) {
        issues.push({ severity: 'warning', title: `${risk.code} supera el umbral sin acción`, detail: `RPN actual ${risk.current?.rpn ?? '—'}.`, route });
      }
      if (needsAction && !linkedActions.length) {
        issues.push({ severity: reviewGate ? 'error' : 'warning', title: `${risk.code} requiere acción pero no tiene una vinculada`, detail: context.cause?.description || 'Definí la acción antes del hito de revisión.', route });
      }

      const justificationRequired = ['accepted-with-justification', 'accepted-temporarily'].includes(risk.decision)
        || (isAccepted && severity >= Number(project.methodology.thresholds.criticalSeverity || 9));
      if (justificationRequired && !risk.acceptanceJustification?.trim()) {
        issues.push({ severity: finalGate ? 'error' : 'warning', title: `${risk.code} necesita justificación`, detail: 'Documentá por qué el equipo acepta temporalmente, acepta por excepción o mantiene un riesgo de Gravedad crítica.', route });
      }

      if (risk.residual && (!risk.actionIds?.length || !risk.residual.verifiedAt)) {
        issues.push({ severity: 'warning', title: `${risk.code} residual sin verificación completa`, detail: 'Mantenelo como objetivo hasta confirmar implementación y efectividad.', route });
      }
      if (risk.target) {
        if (Number(risk.target.severity) < Number(risk.current?.severity) && !project.actions.some((action) => risk.actionIds?.includes(action.id) && action.affects?.severity)) {
          issues.push({ severity: 'warning', title: `${risk.code}: baja Gravedad sin acción compatible`, detail: 'La Gravedad solo debería reducirse si cambia el efecto o el diseño.', route });
        }
        if (Number(risk.target.occurrence) < Number(risk.current?.occurrence) && !project.actions.some((action) => risk.actionIds?.includes(action.id) && action.affects?.occurrence)) {
          issues.push({ severity: 'warning', title: `${risk.code}: baja Ocurrencia sin prevención`, detail: 'Vinculá una acción preventiva.', route });
        }
        if (Number(risk.target.detection) < Number(risk.current?.detection) && !project.actions.some((action) => risk.actionIds?.includes(action.id) && action.affects?.detection)) {
          issues.push({ severity: 'warning', title: `${risk.code}: mejora Detección sin control asociado`, detail: 'Vinculá una acción que mejore la detección.', route });
        }
      }

      if (needsAction) {
        linkedActions.forEach((action) => {
          if (!action.responsible?.trim()) {
            issues.push({ severity: reviewGate ? 'error' : 'warning', title: `${action.code} sin responsable`, detail: `Acción vinculada a ${risk.code}: ${action.description}`, route: projectRoute(project.id, 'actions') });
          }
          if (!action.targetDate) {
            issues.push({ severity: reviewGate ? 'error' : 'warning', title: `${action.code} sin fecha objetivo`, detail: `Acción vinculada a ${risk.code}: ${action.description}`, route: projectRoute(project.id, 'actions') });
          }
        });
      }
    });

    project.actions.filter((action) => !['cancelled', 'replaced'].includes(action.status)).forEach((action) => {
      if (isActionOverdue(action)) issues.push({ severity: 'warning', title: `${action.code} vencida`, detail: `${action.description} · fecha ${formatDate(action.targetDate)}`, route: projectRoute(project.id, 'actions') });
      if (action.status === 'implemented' && action.effectiveness?.status !== 'effectiveness-verified') {
        issues.push({ severity: 'warning', title: `${action.code} implementada sin verificar efectividad`, detail: action.description, route: projectRoute(project.id, 'actions') });
      }
    });

    return issues;
  }


  function render() {
    const route = parseRoute();
    if (route.page === 'projects') {
      renderLibrary();
      return;
    }
    const project = PFMEA_STORAGE.getProject(route.projectId);
    if (!project) {
      toast('Proyecto no encontrado', 'Volviendo a la biblioteca local.');
      navigate('#projects');
      return;
    }
    const currentHash = window.location.hash || projectRoute(project.id, 'overview');
    if (project.clientState.lastRoute !== currentHash) {
      project.clientState.lastRoute = currentHash;
      PFMEA_STORAGE.saveProject(project);
    }
    switch (route.section) {
      case 'overview': renderOverview(project); break;
      case 'setup': renderSetup(project, route.arg1 || project.clientState.setupTab); break;
      case 'map': renderMap(project); break;
      case 'analysis': renderAnalysis(project, route.arg1, route.arg2 || project.clientState.analysisTab); break;
      case 'matrix': renderMatrix(project); break;
      case 'actions': renderActions(project); break;
      case 'review': renderReview(project); break;
      case 'export': renderExport(project); break;
      default: renderOverview(project);
    }
  }

  function currentProject() {
    const route = parseRoute();
    return route.page === 'project' ? PFMEA_STORAGE.getProject(route.projectId) : null;
  }

  document.addEventListener('click', (event) => {
    const actionEl = event.target.closest('[data-action]');
    const riskSelectEl = event.target.closest('[data-select-risk]');
    const routeEl = event.target.closest('[data-route]');

    if (riskSelectEl) {
      const project = currentProject();
      if (project) {
        project.clientState.selectedRiskId = riskSelectEl.dataset.selectRisk;
        const risk = project.risks.find((item) => item.id === project.clientState.selectedRiskId);
        if (risk) {
          const context = PFMEA_MODEL.riskContext(project, risk);
          project.clientState.selectedCauseId = context.cause?.id || null;
          project.clientState.selectedFailureModeId = context.failureMode?.id || null;
          project.clientState.selectedFunctionId = context.function?.id || null;
        }
        PFMEA_STORAGE.saveProject(project);
      }
    }

    if (actionEl) {
      event.preventDefault();
      handleAction(actionEl.dataset.action, actionEl);
      return;
    }

    if (routeEl) {
      event.preventDefault();
      navigate(routeEl.dataset.route);
    }
  });

  document.addEventListener('change', (event) => {
    const target = event.target;
    const project = currentProject();

    if (target.id === 'project-file-input') {
      importSelectedFile(target.files?.[0]);
      target.value = '';
      return;
    }
    if (!project) return;

    if (target.dataset.bind) {
      const value = target.type === 'number' ? (target.value === '' ? '' : Number(target.value)) : target.value;
      setByPath(project, target.dataset.bind, value);
      if (target.dataset.bind.startsWith('methodology.')) project.workflow.sectionStatus.review = 'review-required';
      persist(project);
      return;
    }

    if (target.dataset.stageStatus) {
      const stageId = target.dataset.stageStatus;
      const previousStatus = project.workflow.stageStatus[stageId] || 'not-started';
      if (target.value === 'complete') {
        const blockers = validateStage(project, stageId, 'complete').filter((issue) => issue.severity === 'error');
        if (blockers.length) {
          target.value = previousStatus;
          openIssuesDialog('La etapa todavía no puede marcarse completa', blockers, 'Los borradores pueden quedar incompletos. Este control solo aparece porque elegiste cerrar formalmente la etapa.');
          return;
        }
      }
      project.workflow.stageStatus[stageId] = target.value;
      project.workflow.sectionStatus.analysis = Object.values(project.workflow.stageStatus).every((status) => ['complete', 'not-applicable'].includes(status)) ? 'complete' : 'in-progress';
      persist(project, { message: target.value === 'complete' ? 'Etapa completada' : 'Estado de etapa actualizado' });
      return;
    }

    if (target.dataset.riskRating) {
      const risk = project.risks.find((item) => item.id === target.dataset.riskId);
      if (!risk) return;
      risk.current[target.dataset.riskRating] = target.value ? Number(target.value) : null;
      risk.current.rpn = PFMEA_MODEL.calculateRpn(risk.current.severity, risk.current.occurrence, risk.current.detection);
      risk.status = risk.current.rpn ? (risk.actionIds?.length ? 'action-open' : 'evaluated') : 'pending';
      persist(project, { message: 'RPN recalculado' });
      return;
    }

    if (target.dataset.riskDecision) {
      const risk = project.risks.find((item) => item.id === target.dataset.riskId);
      if (!risk) return;
      risk.decision = target.value;
      persist(project);
      return;
    }

    if (target.dataset.riskJustification) {
      const risk = project.risks.find((item) => item.id === target.dataset.riskJustification);
      if (!risk) return;
      risk.acceptanceJustification = target.value;
      persist(project, { rerender: false });
      return;
    }

    if (target.dataset.actionStatus) {
      const action = project.actions.find((item) => item.id === target.dataset.actionStatus);
      if (!action) return;
      action.status = target.value;
      if (target.value === 'implemented' && !action.implementedDate) action.implementedDate = new Date().toISOString().slice(0, 10);
      if (target.value === 'pending-verification') action.effectiveness.status = 'pending-verification';
      if (target.value === 'effectiveness-verified') {
        action.effectiveness.status = 'effectiveness-verified';
        action.effectiveness.verifiedAt = PFMEA_MODEL.nowIso();
      }
      persist(project, { message: 'Estado de acción actualizado' });
      return;
    }

    if (target.dataset.actionSelectFailure) {
      project.clientState.selectedFailureModeId = target.value;
      const cause = project.causes.find((item) => item.failureModeId === target.value && item.status === 'active');
      project.clientState.selectedCauseId = cause?.id || null;
      persist(project);
      return;
    }

    if (target.dataset.actionSelectCause) {
      project.clientState.selectedCauseId = target.value;
      persist(project);
    }
  });

  function handleAction(action, element) {
    const project = currentProject();
    switch (action) {
      case 'back-library': navigate('#projects'); break;
      case 'new-project': openNewProjectForm(); break;
      case 'import-project': document.getElementById('project-file-input')?.click(); break;
      case 'reset-demo': {
        const sample = PFMEA_STORAGE.resetDemo();
        toast('Proyecto demo restaurado', sample.metadata.name);
        renderLibrary();
        break;
      }
      case 'library-filter': {
        UI.libraryFilter = element.dataset.value;
        PFMEA_STORAGE.saveSettings({ ...PFMEA_STORAGE.readSettings(), libraryFilter: UI.libraryFilter });
        renderLibrary();
        break;
      }
      case 'open-project': navigate(projectRoute(element.dataset.projectId, 'overview')); break;
      case 'duplicate-project': duplicateProjectAction(element.dataset.projectId); break;
      case 'project-more': openProjectMenu(element.dataset.projectId); break;
      case 'manage-snapshots': closeModal(); openSnapshotsDialog(element.dataset.projectId || project?.id); break;
      case 'create-snapshot': createManualSnapshot(element.dataset.projectId || project?.id); break;
      case 'restore-snapshot': restoreSnapshotAction(element.dataset.projectId || project?.id, element.dataset.snapshotId); break;
      case 'delete-snapshot': deleteSnapshotAction(element.dataset.projectId || project?.id, element.dataset.snapshotId); break;
      case 'new-revision': closeModal(); openRevisionForm(element.dataset.projectId); break;
      case 'archive-project': closeModal(); archiveProjectAction(element.dataset.projectId); break;
      case 'delete-project': closeModal(); deleteProjectAction(element.dataset.projectId); break;
      case 'export-backup': exportProjectJson(PFMEA_STORAGE.getProject(element.dataset.projectId)); break;
      case 'add-team-member': if (project) openTeamForm(project); break;
      case 'delete-team-member': if (project) deleteTeamMember(project, element.dataset.id); break;
      case 'add-reference': if (project) openReferenceForm(project); break;
      case 'delete-reference': if (project) deleteReference(project, element.dataset.id); break;
      case 'view-scale': if (project) openScaleDialog(project, element.dataset.scaleId); break;
      case 'add-stage': if (project) openStageForm(project, { type: element.dataset.nodeType || 'operation' }); break;
      case 'add-edge': if (project) openEdgeForm(project); break;
      case 'select-map-node': if (project) selectMapNode(project, element.dataset.nodeId); break;
      case 'edit-stage': if (project) openStageForm(project, { nodeId: element.dataset.nodeId }); break;
      case 'archive-stage': if (project) archiveStage(project, element.dataset.nodeId); break;
      case 'validate-map': if (project) openMapValidation(project); break;
      case 'confirm-map': if (project) confirmMap(project); break;
      case 'add-function': if (project) openFunctionForm(project, element.dataset.stageId); break;
      case 'select-function': if (project) selectFunction(project, element.dataset.id); break;
      case 'delete-function': if (project) deleteFunction(project, element.dataset.id); break;
      case 'add-failure': if (project) openFailureForm(project, { stageId: element.dataset.stageId, functionId: element.dataset.functionId }); break;
      case 'add-failure-suggestion': if (project) openFailureForm(project, { stageId: element.dataset.stageId, description: element.dataset.suggestion, category: element.dataset.suggestion }); break;
      case 'select-failure': if (project) selectFailure(project, element.dataset.id); break;
      case 'delete-failure': if (project) deleteFailure(project, element.dataset.id); break;
      case 'add-effect': if (project) openEffectForm(project, element.dataset.failureId); break;
      case 'delete-effect': if (project) deleteEffect(project, element.dataset.id); break;
      case 'add-cause': if (project) openCauseForm(project, element.dataset.failureId); break;
      case 'select-cause': if (project) selectCause(project, element.dataset.id); break;
      case 'delete-cause': if (project) deleteCause(project, element.dataset.id); break;
      case 'add-control': if (project) openControlForm(project, element.dataset.causeId, element.dataset.controlType); break;
      case 'confirm-no-control': if (project) confirmNoControl(project, element.dataset.causeId, element.dataset.controlType); break;
      case 'add-reaction': if (project) openReactionForm(project, element.dataset.causeId); break;
      case 'create-risk': if (project) createRisk(project, element.dataset.causeId); break;
      case 'add-action': if (project) openActionForm(project, element.dataset.riskId); break;
      case 'add-general-action': if (project) openActionForm(project, null); break;
      case 'set-project-status': if (project) setProjectStatus(project, element.dataset.status); break;
      case 'export-json': if (project) exportProjectJson(project); break;
      case 'export-csv': if (project) exportProjectCsv(project); break;
      case 'export-map-svg': if (project) exportMapSvg(project); break;
      case 'export-xlsx': if (project) exportProjectXlsx(project); break;
      case 'print-report': if (project) exportPrintableReport(project); break;
      case 'download-report-html': if (project) downloadPrintableReport(project); break;
      case 'toggle-advanced-fields': if (project) {
        project.clientState.showAdvancedFields = !project.clientState.showAdvancedFields;
        persist(project, { message: project.clientState.showAdvancedFields ? 'Detalles avanzados visibles' : 'Modo estándar activado' });
      } break;
      case 'mobile-menu': toast('Menú compacto', 'En el prototipo móvil, la navegación se mantiene mediante la barra del navegador y las rutas internas.'); break;
      default: break;
    }
  }

  function openNewProjectForm() {
    openForm({
      eyebrow: 'Nuevo proyecto',
      title: 'Crear PFMEA',
      submitLabel: 'Crear proyecto',
      fields: [
        { name: 'name', label: 'Nombre del proyecto', required: true, value: '', help: 'Podés cambiarlo después.' },
        { name: 'processName', label: 'Nombre del proceso', required: true, value: '', full: true },
        { name: 'owner', label: 'Responsable', value: '', advanced: true },
        { name: 'site', label: 'Sitio / planta', value: '', advanced: true },
        { name: 'areaLine', label: 'Área o línea', value: '', advanced: true },
        { name: 'code', label: 'Código PFMEA', value: '', placeholder: 'Se genera automáticamente si queda vacío', advanced: true },
        { name: 'revision', label: 'Revisión', value: '00', advanced: true }
      ],
      onSubmit: (data) => {
        const project = PFMEA_STORAGE.createProject(data);
        toast('Proyecto creado', project.metadata.name);
        navigate(projectRoute(project.id, 'setup', 'identification'));
      }
    });
  }

  function importSelectedFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result));
        const existing = raw.id ? PFMEA_STORAGE.getProject(raw.id) : null;
        const asCopy = existing ? !window.confirm(`Ya existe un proyecto con el identificador ${raw.id}.\n\nAceptar: reemplazar el proyecto local.\nCancelar: importar como copia nueva.`) : false;
        const imported = PFMEA_STORAGE.importProject(raw, { asCopy });
        toast('Proyecto importado', `${imported.metadata.code} · Rev. ${imported.metadata.revision}`);
        navigate(projectRoute(imported.id, 'overview'));
      } catch (error) {
        console.error(error);
        window.alert(`No fue posible importar el archivo.\n\n${error.message}`);
      }
    };
    reader.onerror = () => window.alert('No fue posible leer el archivo seleccionado.');
    reader.readAsText(file);
  }

  function duplicateProjectAction(id) {
    try {
      const copy = PFMEA_STORAGE.duplicateProject(id);
      toast('Proyecto duplicado', copy.metadata.name);
      navigate(projectRoute(copy.id, 'overview'));
    } catch (error) {
      window.alert(error.message);
    }
  }

  function openProjectMenu(id) {
    const project = PFMEA_STORAGE.getProject(id);
    if (!project) return;
    openForm({
      eyebrow: project.metadata.code,
      title: project.metadata.name,
      submitLabel: 'Cerrar',
      fields: [],
      afterHtml: `<div class="card-list">
        <button type="button" class="button secondary" data-action="new-revision" data-project-id="${attr(id)}">Crear nueva revisión</button>
        <button type="button" class="button secondary" data-action="manage-snapshots" data-project-id="${attr(id)}">Copias internas y restauración</button>
        <button type="button" class="button secondary" data-action="export-backup" data-project-id="${attr(id)}">Descargar copia JSON</button>
        <button type="button" class="button secondary" data-action="archive-project" data-project-id="${attr(id)}">Archivar proyecto</button>
        <button type="button" class="button danger" data-action="delete-project" data-project-id="${attr(id)}">Eliminar proyecto</button>
      </div>`,
      onSubmit: () => {}
    });
  }

  async function openSnapshotsDialog(id) {
    const project = PFMEA_STORAGE.getProject(id);
    if (!project) return;
    try {
      const snapshots = await PFMEA_STORAGE.listSnapshots(id);
      openForm({
        eyebrow: `${project.metadata.code} · Rev. ${project.metadata.revision}`,
        title: 'Copias internas',
        submitLabel: 'Cerrar',
        columns: 1,
        fields: [],
        afterHtml: `<div class="snapshot-toolbar"><p class="small muted">Se conservan hasta 12 puntos de recuperación por proyecto. No reemplazan la copia JSON externa, porque poner todos los huevos en el mismo navegador sigue siendo una mala estrategia avícola.</p><button type="button" class="button primary" data-action="create-snapshot" data-project-id="${attr(id)}">Crear copia ahora</button></div>
          <div class="snapshot-list">${snapshots.length ? snapshots.map((snapshot) => `<article class="snapshot-item"><div><strong>${esc(formatDate(snapshot.createdAt, true))}</strong><p>${esc(snapshot.reason || 'Copia interna')} · Rev. ${esc(snapshot.revision || '')}</p></div><div class="action-row"><button type="button" class="button secondary small" data-action="restore-snapshot" data-project-id="${attr(id)}" data-snapshot-id="${attr(snapshot.id)}">Restaurar</button><button type="button" class="button ghost small" data-action="delete-snapshot" data-project-id="${attr(id)}" data-snapshot-id="${attr(snapshot.id)}">Eliminar</button></div></article>`).join('') : '<div class="empty-state compact"><p>No hay copias internas disponibles.</p></div>'}</div>`,
        onSubmit: () => {}
      });
    } catch (error) {
      window.alert(`No fue posible leer las copias internas.\n\n${error.message}`);
    }
  }

  async function createManualSnapshot(id) {
    if (!id) return;
    try {
      await PFMEA_STORAGE.createSnapshot(id, 'Copia manual');
      toast('Copia interna creada');
      closeModal();
      openSnapshotsDialog(id);
    } catch (error) {
      window.alert(`No fue posible crear la copia.\n\n${error.message}`);
    }
  }

  async function restoreSnapshotAction(projectId, snapshotId) {
    if (!projectId || !snapshotId) return;
    if (!window.confirm('Se reemplazará el estado actual por esta copia interna. Antes de hacerlo se guardará automáticamente otra copia del estado presente.\n\n¿Continuar?')) return;
    try {
      await PFMEA_STORAGE.restoreSnapshot(projectId, snapshotId);
      closeModal();
      toast('Copia interna restaurada');
      navigate(projectRoute(projectId, 'overview'));
    } catch (error) {
      window.alert(`No fue posible restaurar la copia.\n\n${error.message}`);
    }
  }

  async function deleteSnapshotAction(projectId, snapshotId) {
    if (!projectId || !snapshotId) return;
    if (!window.confirm('¿Eliminar esta copia interna?')) return;
    try {
      await PFMEA_STORAGE.deleteSnapshot(projectId, snapshotId);
      toast('Copia interna eliminada');
      closeModal();
      openSnapshotsDialog(projectId);
    } catch (error) {
      window.alert(`No fue posible eliminar la copia.\n\n${error.message}`);
    }
  }

  function openRevisionForm(id) {
    const source = PFMEA_STORAGE.getProject(id);
    if (!source) return;
    openForm({
      eyebrow: `${source.metadata.code} · Rev. ${source.metadata.revision}`,
      title: 'Crear nueva revisión',
      submitLabel: 'Crear revisión',
      columns: 1,
      fields: [
        { name: 'revision', label: 'Nueva revisión', required: true, value: nextRevision(source.metadata.revision) },
        { name: 'summary', label: 'Resumen de cambios', type: 'textarea', required: true, value: '', full: true }
      ],
      onSubmit: (data) => {
        const copy = PFMEA_STORAGE.createRevision(id, data.revision, data.summary);
        toast('Nueva revisión creada', `Rev. ${copy.metadata.revision}`);
        navigate(projectRoute(copy.id, 'overview'));
      }
    });
  }

  function nextRevision(current) {
    const numeric = Number(current);
    if (Number.isFinite(numeric)) return String(numeric + 1).padStart(String(current).length, '0');
    const match = String(current).match(/^(.*?)(\d+)$/);
    if (match) return `${match[1]}${String(Number(match[2]) + 1).padStart(match[2].length, '0')}`;
    return `${current}-1`;
  }

  function archiveProjectAction(id) {
    const project = PFMEA_STORAGE.getProject(id);
    if (!project) return;
    project.metadata.status = 'archived';
    PFMEA_STORAGE.saveProject(project);
    toast('Proyecto archivado', project.metadata.name);
    renderLibrary();
  }

  function deleteProjectAction(id) {
    const project = PFMEA_STORAGE.getProject(id);
    if (!project) return;
    if (!window.confirm(`Se eliminará localmente “${project.metadata.name}”. Esta acción no puede deshacerse.\n\n¿Continuar?`)) return;
    PFMEA_STORAGE.deleteProject(id);
    toast('Proyecto eliminado', project.metadata.name);
    renderLibrary();
  }

  function openTeamForm(project) {
    openForm({
      eyebrow: 'Equipo PFMEA',
      title: 'Agregar participante',
      fields: [
        { name: 'name', label: 'Nombre', required: true },
        { name: 'role', label: 'Rol en el PFMEA' },
        { name: 'area', label: 'Área' },
        { name: 'specialty', label: 'Especialidad', advanced: true }
      ],
      onSubmit: (data) => {
        project.team.push({ id: PFMEA_MODEL.uuid(), ...data });
        persist(project, { message: 'Participante agregado' });
      }
    });
  }

  function deleteTeamMember(project, id) {
    project.team = project.team.filter((member) => member.id !== id);
    persist(project, { message: 'Participante eliminado' });
  }

  function openReferenceForm(project) {
    openForm({
      eyebrow: 'Referencia documental',
      title: 'Agregar documento',
      fields: [
        { name: 'title', label: 'Título', required: true },
        { name: 'code', label: 'Código', advanced: true },
        { name: 'revision', label: 'Revisión', advanced: true },
        { name: 'type', label: 'Tipo', type: 'select', value: 'Especificación', advanced: true, options: ['Especificación', 'Plano', 'Procedimiento', 'Instrucción', 'Estándar', 'Plan de Control', 'Validación', 'Estudio de capacidad', 'Reclamo', 'Desvío', 'Análisis anterior', 'Otro'] },
        { name: 'location', label: 'Ubicación o vínculo textual', full: true, advanced: true },
        { name: 'comment', label: 'Comentario', type: 'textarea', full: true, advanced: true }
      ],
      onSubmit: (data) => {
        project.references.push({ id: PFMEA_MODEL.uuid(), ...data });
        persist(project, { message: 'Referencia agregada' });
      }
    });
  }

  function deleteReference(project, id) {
    project.references = project.references.filter((ref) => ref.id !== id);
    persist(project, { message: 'Referencia eliminada' });
  }

  function openScaleDialog(project, scaleId) {
    const scale = Object.values(project.methodology.scales).find((item) => item.id === scaleId);
    if (!scale) return;
    openForm({
      eyebrow: `${scale.name} · ${scale.revision}`,
      title: `Escala de ${scale.name}`,
      submitLabel: 'Cerrar',
      fields: [],
      afterHtml: `<div class="table-wrap"><table><thead><tr><th>Puntaje</th><th>Criterio</th><th>Descripción</th></tr></thead><tbody>${scale.values.map((item) => `<tr><td class="numeric"><strong>${item.score}</strong></td><td>${esc(item.title)}</td><td>${esc(item.description)}</td></tr>`).join('')}</tbody></table></div>`,
      onSubmit: () => {}
    });
  }

  function openStageForm(project, options = {}) {
    const existing = options.nodeId ? project.processMap.nodes.find((node) => node.id === options.nodeId) : null;
    const nodes = project.processMap.nodes.filter((node) => !node.archived);
    const selected = project.processMap.nodes.find((node) => node.id === project.clientState.selectedMapNodeId);
    const maxOrder = nodes.reduce((max, node) => Math.max(max, Number(node.analysisOrder || 0)), 0);
    const maxCode = nodes.reduce((max, node) => Math.max(max, Number(node.code || 0)), 0);
    openForm({
      eyebrow: existing ? 'Editar etapa' : 'Mapa de proceso',
      title: existing ? `${existing.code} · ${existing.name}` : 'Agregar etapa',
      submitLabel: existing ? 'Guardar cambios' : 'Agregar al mapa',
      advancedOpen: project.clientState.showAdvancedFields,
      fields: [
        { name: 'name', label: 'Nombre de la etapa', required: true, value: existing?.name || '' },
        { name: 'type', label: 'Tipo', type: 'select', value: existing?.type || options.type || 'operation', options: Object.entries(NODE_TYPES).map(([value, label]) => ({ value, label })) },
        ...(!existing ? [{ name: 'connectFrom', label: 'Conectar desde', type: 'select', value: selected?.id || '', options: [{ value: '', label: 'Sin conexión automática' }, ...nodes.map((node) => ({ value: node.id, label: `${node.code} · ${node.name}` }))] }] : []),
        { name: 'code', label: 'Código', required: true, value: existing?.code || String(maxCode + 10).padStart(2, '0'), advanced: true },
        { name: 'analysisOrder', label: 'Orden de análisis', type: 'number', value: existing?.analysisOrder ?? maxOrder + 10, advanced: true },
        { name: 'area', label: 'Área o sector', value: existing?.area || '', advanced: true },
        { name: 'responsible', label: 'Responsable funcional', value: existing?.responsible || '', advanced: true },
        { name: 'description', label: 'Descripción', type: 'textarea', value: existing?.description || '', full: true, advanced: true }
      ],
      onSubmit: (data) => {
        if (project.processMap.nodes.some((node) => node.code === data.code && node.id !== existing?.id && !node.archived)) {
          window.alert(`Ya existe una etapa activa con el código ${data.code}.`);
          return;
        }
        if (existing) {
          const structuralChange = existing.type !== data.type || existing.description !== data.description;
          Object.assign(existing, { code: data.code, name: data.name, type: data.type, analysisOrder: Number(data.analysisOrder), area: data.area, responsible: data.responsible, description: data.description });
          if (structuralChange && !project.workflow.reviewRequiredStageIds.includes(existing.id)) project.workflow.reviewRequiredStageIds.push(existing.id);
        } else {
          const source = project.processMap.nodes.find((node) => node.id === data.connectFrom);
          const node = {
            id: PFMEA_MODEL.uuid(), code: data.code, name: data.name, type: data.type, description: data.description, area: data.area, station: '', inputs: [], outputs: [], equipment: [], materials: [], parameters: [], responsible: data.responsible, analysisOrder: Number(data.analysisOrder), position: {
              x: source ? Math.min(1200, Number(source.position.x) + 220) : 120 + (nodes.length % 5) * 220,
              y: source ? Number(source.position.y) : 120 + Math.floor(nodes.length / 5) * 180
            }, status: 'active', archived: false
          };
          project.processMap.nodes.push(node);
          project.clientState.selectedMapNodeId = node.id;
          if (!['start', 'end'].includes(node.type)) project.workflow.stageStatus[node.id] = 'not-started';
          if (source) project.processMap.edges.push({ id: PFMEA_MODEL.uuid(), sourceNodeId: source.id, targetNodeId: node.id, flowType: 'normal', condition: '', label: '', archived: false });
        }
        project.processMap.confirmedAt = null;
        project.workflow.sectionStatus.map = 'in-progress';
        UI.mapValidation = null;
        persist(project, { message: existing ? 'Etapa actualizada' : 'Etapa agregada' });
      }
    });
  }

  function openEdgeForm(project) {
    const nodes = project.processMap.nodes.filter((node) => !node.archived);
    if (nodes.length < 2) {
      window.alert('Se necesitan al menos dos etapas para crear una conexión.');
      return;
    }
    openForm({
      eyebrow: 'Mapa de proceso',
      title: 'Nueva conexión',
      fields: [
        { name: 'sourceNodeId', label: 'Etapa de origen', type: 'select', required: true, value: project.clientState.selectedMapNodeId || nodes[0].id, options: nodes.map((node) => ({ value: node.id, label: `${node.code} · ${node.name}` })) },
        { name: 'targetNodeId', label: 'Etapa de destino', type: 'select', required: true, value: nodes[1].id, options: nodes.map((node) => ({ value: node.id, label: `${node.code} · ${node.name}` })) },
        { name: 'flowType', label: 'Tipo de flujo', type: 'select', value: 'normal', options: [
          { value: 'normal', label: 'Normal' }, { value: 'alternative', label: 'Alternativo' }, { value: 'reject', label: 'Rechazo' }, { value: 'rework', label: 'Retrabajo' }, { value: 'exception', label: 'Excepción' }, { value: 'return', label: 'Retorno' }, { value: 'parallel', label: 'Paralelo' }
        ] },
        { name: 'label', label: 'Etiqueta' },
        { name: 'condition', label: 'Condición', full: true }
      ],
      onSubmit: (data) => {
        if (data.sourceNodeId === data.targetNodeId) {
          window.alert('La etapa de origen y destino deben ser distintas.');
          return;
        }
        project.processMap.edges.push({ id: PFMEA_MODEL.uuid(), ...data, archived: false });
        project.processMap.confirmedAt = null;
        project.workflow.sectionStatus.map = 'in-progress';
        UI.mapValidation = null;
        persist(project, { message: 'Conexión agregada' });
      }
    });
  }

  function selectMapNode(project, nodeId) {
    project.clientState.selectedMapNodeId = nodeId;
    persist(project);
  }

  function archiveStage(project, nodeId) {
    const node = project.processMap.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    const functions = project.functions.filter((fn) => fn.stageId === nodeId && fn.status !== 'archived');
    const functionIds = functions.map((fn) => fn.id);
    const modes = project.failureModes.filter((mode) => functionIds.includes(mode.functionId) && mode.status === 'active');
    const modeIds = modes.map((mode) => mode.id);
    const causes = project.causes.filter((cause) => modeIds.includes(cause.failureModeId) && cause.status === 'active');
    const riskCount = project.risks.filter((risk) => causes.some((cause) => cause.id === risk.causeId)).length;
    if (!window.confirm(`Archivar ${node.code} · ${node.name}?\n\nContiene ${functions.length} funciones, ${modes.length} modos de falla y ${riskCount} riesgos. La información se conservará, pero quedará fuera del flujo activo.`)) return;
    node.archived = true;
    node.status = 'archived';
    project.processMap.edges.forEach((edge) => {
      if (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId) edge.archived = true;
    });
    project.processMap.confirmedAt = null;
    project.workflow.sectionStatus.map = 'review-required';
    persist(project, { message: 'Etapa archivada' });
  }

  function openMapValidation(project) {
    const issues = validateMap(project);
    UI.mapValidation = issues;
    openForm({
      eyebrow: 'Validación estructural',
      title: 'Resultados del mapa',
      submitLabel: 'Cerrar',
      fields: [],
      afterHtml: `<div class="alert-list">${issues.map((issue) => alertItem(issue.severity, issue.title, issue.detail)).join('')}</div>`,
      onSubmit: () => {}
    });
  }

  function confirmMap(project) {
    const issues = validateMap(project);
    const errors = issues.filter((issue) => issue.severity === 'error');
    const warnings = issues.filter((issue) => issue.severity === 'warning');
    if (errors.length) {
      UI.mapValidation = issues;
      openMapValidation(project);
      return;
    }
    if (warnings.length && !window.confirm(`El mapa tiene ${warnings.length} advertencias no bloqueantes.\n\n¿Confirmarlo igualmente para análisis?`)) return;
    project.processMap.confirmedAt = PFMEA_MODEL.nowIso();
    project.processMap.confirmedBy = project.metadata.owner || 'Equipo PFMEA';
    project.workflow.sectionStatus.map = 'complete';
    UI.mapValidation = issues;
    persist(project, { message: 'Mapa confirmado para análisis' });
  }

  function openFunctionForm(project, stageId) {
    const stage = project.processMap.nodes.find((node) => node.id === stageId);
    if (!stage) return;
    openForm({
      eyebrow: `${stage.code} · ${stage.name}`,
      title: 'Agregar resultado esperado',
      columns: 1,
      advancedOpen: project.clientState.showAdvancedFields,
      fields: [
        { name: 'description', label: '¿Qué debe lograr esta etapa y con qué criterio?', type: 'textarea', required: true, placeholder: 'Ej.: Dosificar 500 mL ± 5 mL de producto en cada botella.', full: true },
        { name: 'requirement', label: 'Requisito separado', type: 'textarea', placeholder: 'Solo si necesitás separar función y requisito en el informe.', full: true, advanced: true },
        { name: 'specification', label: 'Especificación o criterio', full: true, advanced: true },
        { name: 'unit', label: 'Unidad de medida', advanced: true },
        { name: 'tolerance', label: 'Tolerancia', advanced: true },
        { name: 'customer', label: 'Cliente interno o externo', full: true, advanced: true }
      ],
      onSubmit: (data) => {
        const fn = { id: PFMEA_MODEL.uuid(), stageId, ...data, inputs: [], outputs: [], specialCharacteristicIds: [], referenceIds: [], status: 'active', notes: '' };
        project.functions.push(fn);
        project.clientState.selectedFunctionId = fn.id;
        project.workflow.stageStatus[stageId] = 'in-progress';
        project.workflow.sectionStatus.analysis = 'in-progress';
        persist(project, { message: 'Función agregada' });
      }
    });
  }

  function selectFunction(project, id) {
    project.clientState.selectedFunctionId = id;
    persist(project);
  }

  function deleteFunction(project, id) {
    const fn = project.functions.find((item) => item.id === id);
    if (!fn) return;
    const modes = project.failureModes.filter((mode) => mode.functionId === id && mode.status === 'active');
    if (!window.confirm(`Archivar la función “${fn.description}”?\n\nTambién quedarán archivados ${modes.length} modos de falla relacionados.`)) return;
    fn.status = 'archived';
    modes.forEach((mode) => {
      mode.status = 'archived';
      project.effects.filter((effect) => effect.failureModeId === mode.id).forEach((effect) => { effect.active = false; });
      project.causes.filter((cause) => cause.failureModeId === mode.id).forEach((cause) => { cause.status = 'archived'; });
    });
    persist(project, { message: 'Función archivada' });
  }

  function openFailureForm(project, options = {}) {
    const functions = project.functions.filter((fn) => (!options.stageId || fn.stageId === options.stageId) && fn.status !== 'archived');
    const functionId = options.functionId || project.clientState.selectedFunctionId || functions[0]?.id;
    if (!functionId) {
      window.alert('La etapa no tiene funciones disponibles.');
      return;
    }
    openForm({
      eyebrow: 'Cadena de falla',
      title: 'Agregar modo de falla',
      advancedOpen: project.clientState.showAdvancedFields,
      fields: [
        { name: 'functionId', label: 'Resultado esperado relacionado', type: 'select', required: true, value: functionId, options: functions.map((fn) => ({ value: fn.id, label: fn.description })) , full: true },
        { name: 'description', label: '¿Cómo puede fallar?', type: 'textarea', required: true, value: options.description || '', placeholder: 'Ej.: Llena de menos.', full: true },
        { name: 'category', label: 'Categoría', value: options.category || '', placeholder: 'No ocurre, insuficiente, exceso...', advanced: true },
        { name: 'source', label: 'Origen', type: 'select', value: options.description ? 'library' : 'team', options: [
          { value: 'team', label: 'Equipo PFMEA' }, { value: 'library', label: 'Biblioteca sugerida' }, { value: 'historical', label: 'Histórico / reclamo' }, { value: 'standard', label: 'Estándar o requisito' }
        ], advanced: true }
      ],
      onSubmit: (data) => {
        const mode = { id: PFMEA_MODEL.uuid(), ...data, status: 'active', dispositionReason: '' };
        project.failureModes.push(mode);
        project.clientState.selectedFailureModeId = mode.id;
        project.clientState.selectedFunctionId = data.functionId;
        const fn = project.functions.find((item) => item.id === data.functionId);
        if (fn) project.workflow.stageStatus[fn.stageId] = 'in-progress';
        persist(project, { message: 'Modo de falla agregado' });
      }
    });
  }

  function selectFailure(project, id) {
    project.clientState.selectedFailureModeId = id;
    const cause = project.causes.find((item) => item.failureModeId === id && item.status === 'active');
    project.clientState.selectedCauseId = cause?.id || null;
    persist(project);
  }

  function deleteFailure(project, id) {
    const mode = project.failureModes.find((item) => item.id === id);
    if (!mode) return;
    const effects = project.effects.filter((effect) => effect.failureModeId === id && effect.active !== false);
    const causes = project.causes.filter((cause) => cause.failureModeId === id && cause.status === 'active');
    if (!window.confirm(`Archivar el modo de falla “${mode.description}”?\n\nSe conservarán, pero desactivarán, ${effects.length} efectos y ${causes.length} causas.`)) return;
    mode.status = 'archived';
    effects.forEach((effect) => { effect.active = false; });
    causes.forEach((cause) => { cause.status = 'archived'; });
    persist(project, { message: 'Modo de falla archivado' });
  }

  function openEffectForm(project, failureModeId) {
    const mode = project.failureModes.find((item) => item.id === failureModeId);
    if (!mode) return;
    openForm({
      eyebrow: 'Efecto potencial',
      title: mode.description,
      advancedOpen: project.clientState.showAdvancedFields,
      fields: [
        { name: 'description', label: '¿Qué ocurre si aparece la falla?', type: 'textarea', required: true, placeholder: 'Ej.: Producto con menor cantidad declarada.', full: true },
        { name: 'severity', label: 'Gravedad', type: 'number', required: true, value: 5, min: 1, max: 10, help: 'Seleccioná según la escala del proyecto.' },
        { name: 'level', label: 'Nivel', type: 'select', value: 'product', options: [
          { value: 'local', label: 'Local' }, { value: 'next-process', label: 'Proceso siguiente' }, { value: 'product', label: 'Producto final' }, { value: 'customer', label: 'Cliente / consumidor' }, { value: 'safety', label: 'Seguridad' }, { value: 'regulatory', label: 'Regulatorio' }, { value: 'environmental', label: 'Ambiental' }, { value: 'business', label: 'Negocio' }
        ], advanced: true },
        { name: 'affectedParty', label: 'Parte afectada', advanced: true },
        { name: 'classification', label: 'Clasificación', type: 'select', value: 'quality', options: ['quality', 'safety', 'regulatory', 'environmental', 'business'], advanced: true },
        { name: 'severityRationale', label: 'Justificación de Gravedad', type: 'textarea', full: true, advanced: true, help: 'Se exigirá al cierre solo para gravedad crítica o excepciones.' }
      ],
      onSubmit: (data) => {
        const effect = { id: PFMEA_MODEL.uuid(), failureModeId, ...data, severity: Number(data.severity), specialCharacteristicIds: [], referenceIds: [], active: true };
        project.effects.push(effect);
        const risks = project.risks.filter((risk) => {
          const cause = project.causes.find((item) => item.id === risk.causeId);
          return cause?.failureModeId === failureModeId;
        });
        const governing = PFMEA_MODEL.governingSeverity(project, failureModeId);
        risks.forEach((risk) => {
          risk.governingEffectId = governing.effectId;
          risk.current.severity = governing.severity;
          risk.current.rpn = PFMEA_MODEL.calculateRpn(risk.current.severity, risk.current.occurrence, risk.current.detection);
        });
        persist(project, { message: 'Efecto agregado' });
      }
    });
  }

  function deleteEffect(project, id) {
    const effect = project.effects.find((item) => item.id === id);
    if (!effect) return;
    effect.active = false;
    const governing = PFMEA_MODEL.governingSeverity(project, effect.failureModeId);
    project.risks.forEach((risk) => {
      const cause = project.causes.find((item) => item.id === risk.causeId);
      if (cause?.failureModeId === effect.failureModeId) {
        risk.governingEffectId = governing.effectId;
        risk.current.severity = governing.severity;
        risk.current.rpn = PFMEA_MODEL.calculateRpn(risk.current.severity, risk.current.occurrence, risk.current.detection);
      }
    });
    persist(project, { message: 'Efecto archivado' });
  }

  function openCauseForm(project, failureModeId) {
    const mode = project.failureModes.find((item) => item.id === failureModeId);
    if (!mode) return;
    openForm({
      eyebrow: 'Causa potencial',
      title: mode.description,
      advancedOpen: project.clientState.showAdvancedFields,
      fields: [
        { name: 'description', label: '¿Por qué puede ocurrir?', type: 'textarea', required: true, placeholder: 'Ej.: Variación de presión de alimentación.', full: true },
        { name: 'category', label: 'Categoría 6M / origen', type: 'select', value: 'machine', options: [
          { value: 'person', label: 'Persona' }, { value: 'machine', label: 'Máquina' }, { value: 'method', label: 'Método' }, { value: 'material', label: 'Material' }, { value: 'measurement', label: 'Medición' }, { value: 'environment', label: 'Medio ambiente' }, { value: 'process-design', label: 'Diseño del proceso' }, { value: 'software', label: 'Sistema / software' }, { value: 'supplier', label: 'Proveedor' }, { value: 'other', label: 'Otra' }
        ], advanced: true },
        { name: 'mechanism', label: 'Mecanismo', type: 'textarea', full: true, advanced: true },
        { name: 'trigger', label: 'Condición desencadenante', type: 'textarea', full: true, advanced: true },
        { name: 'evidence', label: 'Evidencia o fundamento', type: 'textarea', full: true, advanced: true },
        { name: 'dataSource', label: 'Fuente de datos', full: true, advanced: true }
      ],
      onSubmit: (data) => {
        const cause = { id: PFMEA_MODEL.uuid(), failureModeId, ...data, status: 'active', notes: '', controlAbsence: { preventiveConfirmed: false, detectionConfirmed: false } };
        project.causes.push(cause);
        const risk = buildRiskForCause(project, cause.id);
        project.clientState.selectedCauseId = cause.id;
        project.clientState.selectedRiskId = risk?.id || null;
        persist(project, { message: 'Causa y evaluación base agregadas' });
      }
    });
  }

  function selectCause(project, id) {
    project.clientState.selectedCauseId = id;
    persist(project);
  }

  function deleteCause(project, id) {
    const cause = project.causes.find((item) => item.id === id);
    if (!cause) return;
    const risk = project.risks.find((item) => item.causeId === id);
    if (!window.confirm(`Archivar la causa “${cause.description}”?${risk ? `\n\nLa evaluación ${risk.code} quedará fuera del análisis activo.` : ''}`)) return;
    cause.status = 'archived';
    if (risk) risk.status = 'archived';
    persist(project, { message: 'Causa archivada' });
  }

  function openControlForm(project, causeId, type) {
    const cause = project.causes.find((item) => item.id === causeId);
    if (!cause) return;
    const existing = project.controls.filter((control) => control.type === type);
    openForm({
      eyebrow: type === 'preventive' ? 'Control preventivo' : 'Control de detección',
      title: cause.description,
      advancedOpen: project.clientState.showAdvancedFields,
      fields: [
        { name: 'existingControlId', label: 'Reutilizar control existente', type: 'select', value: '', options: [
          { value: '', label: 'Crear un control nuevo' }, ...existing.map((control) => ({ value: control.id, label: `${control.code} · ${control.description}` }))
        ], full: true },
        { name: 'description', label: type === 'preventive' ? '¿Qué evita o reduce esta causa?' : '¿Cómo se detecta antes de que avance?', type: 'textarea', full: true, placeholder: type === 'preventive' ? 'Ej.: Regulador automático de presión.' : 'Ej.: Controladora de peso al 100 %.' },
        { name: 'subtype', label: 'Subtipo', value: type === 'preventive' ? 'process-parameter' : 'inspection', advanced: true },
        { name: 'method', label: 'Método', full: true, advanced: true },
        { name: 'frequency', label: 'Frecuencia', advanced: true },
        { name: 'acceptanceCriteria', label: 'Criterio de aceptación', advanced: true },
        { name: 'responsible', label: 'Responsable', advanced: true },
        { name: 'record', label: 'Registro generado', advanced: true },
        { name: 'automatic', label: 'Automático', type: 'checkbox', checkboxLabel: 'El control opera automáticamente', value: false, advanced: true },
        { name: 'validated', label: 'Validado', type: 'checkbox', checkboxLabel: 'El control fue validado', value: false, advanced: true },
        { name: 'challengeTestRequired', label: 'Challenge test', type: 'checkbox', checkboxLabel: 'Requiere challenge testing', value: false, advanced: true },
        { name: 'challengeTestCompleted', label: 'Challenge completo', type: 'checkbox', checkboxLabel: 'Challenge testing realizado', value: false, advanced: true }
      ],
      onSubmit: (data) => {
        let controlId = data.existingControlId;
        if (!controlId) {
          if (!data.description?.trim()) {
            window.alert('Describí el nuevo control o seleccioná uno existente.');
            return;
          }
          const control = {
            id: PFMEA_MODEL.uuid(),
            code: PFMEA_MODEL.nextCode(project.controls, 'CTRL-'),
            type,
            subtype: data.subtype,
            description: data.description,
            status: 'current',
            method: data.method,
            frequency: data.frequency,
            sampleSize: '',
            acceptanceCriteria: data.acceptanceCriteria,
            responsible: data.responsible,
            record: data.record,
            automatic: Boolean(data.automatic),
            automaticReject: false,
            alarm: false,
            interlock: false,
            validated: Boolean(data.validated),
            challengeTestRequired: Boolean(data.challengeTestRequired),
            challengeTestCompleted: Boolean(data.challengeTestCompleted),
            evidence: '',
            referenceIds: [],
            notes: ''
          };
          project.controls.push(control);
          controlId = control.id;
        }
        if (!project.controlLinks.some((link) => link.controlId === controlId && link.causeId === causeId)) {
          const mode = project.failureModes.find((item) => item.id === cause.failureModeId);
          const fn = project.functions.find((item) => item.id === mode?.functionId);
          project.controlLinks.push({ id: PFMEA_MODEL.uuid(), controlId, causeId, failureModeId: mode?.id || null, stageId: fn?.stageId || null, relationship: type === 'preventive' ? 'prevents' : 'detects' });
        }
        cause.controlAbsence = cause.controlAbsence || {};
        cause.controlAbsence[type === 'preventive' ? 'preventiveConfirmed' : 'detectionConfirmed'] = false;
        persist(project, { message: 'Control vinculado' });
      }
    });
  }

  function confirmNoControl(project, causeId, type) {
    const cause = project.causes.find((item) => item.id === causeId);
    if (!cause) return;
    cause.controlAbsence = cause.controlAbsence || {};
    cause.controlAbsence[type === 'preventive' ? 'preventiveConfirmed' : 'detectionConfirmed'] = true;
    toast('Ausencia de control confirmada', type === 'preventive' ? 'Preventivo' : 'Detección');
    persist(project);
  }

  function openReactionForm(project, causeId) {
    const cause = project.causes.find((item) => item.id === causeId);
    if (!cause) return;
    const linkedControlIds = project.controlLinks.filter((link) => link.causeId === causeId).map((link) => link.controlId);
    openForm({
      eyebrow: 'Plan de reacción',
      title: cause.description,
      columns: 1,
      advancedOpen: project.clientState.showAdvancedFields,
      fields: [
        { name: 'trigger', label: '¿Qué evento activa la reacción?', type: 'textarea', required: true, full: true },
        { name: 'immediateAction', label: '¿Qué debe hacerse inmediatamente?', type: 'textarea', required: true, full: true },
        { name: 'responsible', label: 'Responsable', help: 'Puede completarse después; será requerido al cierre si el plan queda activo.' },
        { name: 'stopLine', label: 'Detención', type: 'checkbox', checkboxLabel: 'Requiere detener la línea', value: false, advanced: true },
        { name: 'segregationRequired', label: 'Segregación', type: 'checkbox', checkboxLabel: 'Requiere segregar producto', value: true, advanced: true },
        { name: 'segregationScope', label: 'Alcance de segregación', type: 'textarea', full: true, advanced: true },
        { name: 'cutoffPoint', label: 'Punto de corte', type: 'textarea', full: true, advanced: true },
        { name: 'additionalInspection', label: 'Inspección adicional', type: 'textarea', full: true, advanced: true },
        { name: 'adjustmentCorrection', label: 'Ajuste o corrección', type: 'textarea', full: true, advanced: true },
        { name: 'restartCriteria', label: 'Criterio de reinicio', type: 'textarea', full: true, advanced: true },
        { name: 'escalation', label: 'Escalamiento', type: 'textarea', full: true, advanced: true },
        { name: 'record', label: 'Registro generado', advanced: true },
        { name: 'notification', label: 'Notificación', advanced: true }
      ],
      onSubmit: (data) => {
        project.reactionPlans.push({
          id: PFMEA_MODEL.uuid(),
          code: PFMEA_MODEL.nextCode(project.reactionPlans, 'RP-'),
          ...data,
          materialDisposition: '',
          linkedControlIds,
          linkedCauseIds: [causeId],
          notes: ''
        });
        persist(project, { message: 'Plan de reacción agregado' });
      }
    });
  }

  function buildRiskForCause(project, causeId) {
    const cause = project.causes.find((item) => item.id === causeId);
    if (!cause) return null;
    const existing = project.risks.find((risk) => risk.causeId === causeId && risk.status !== 'archived');
    if (existing) return existing;
    const governing = PFMEA_MODEL.governingSeverity(project, cause.failureModeId);
    const risk = {
      id: PFMEA_MODEL.uuid(),
      code: PFMEA_MODEL.nextCode(project.risks, 'R-'),
      causeId,
      governingEffectId: governing.effectId,
      current: {
        severity: governing.severity,
        occurrence: null,
        detection: null,
        rpn: null,
        severityRationale: '',
        occurrenceRationale: '',
        detectionRationale: ''
      },
      decision: 'pending',
      acceptanceJustification: '',
      target: null,
      residual: null,
      actionIds: [],
      status: 'pending',
      notes: ''
    };
    project.risks.push(risk);
    return risk;
  }

  function createRisk(project, causeId) {
    const before = project.risks.length;
    const risk = buildRiskForCause(project, causeId);
    if (!risk) return;
    project.clientState.selectedRiskId = risk.id;
    persist(project, { message: project.risks.length === before ? 'La causa ya tenía una evaluación' : 'Evaluación creada' });
  }

  function openActionForm(project, riskId) {
    const risk = riskId ? project.risks.find((item) => item.id === riskId) : null;
    const riskOptions = project.risks.map((item) => {
      const context = PFMEA_MODEL.riskContext(project, item);
      return { value: item.id, label: `${item.code} · ${context.stage?.name || ''} · ${context.cause?.description || ''}` };
    });
    openForm({
      eyebrow: risk ? `${risk.code} · Mitigación` : 'Plan de acciones',
      title: 'Agregar acción',
      advancedOpen: project.clientState.showAdvancedFields,
      fields: [
        { name: 'riskId', label: 'Riesgo vinculado', type: 'select', required: Boolean(riskOptions.length), value: riskId || riskOptions[0]?.value || '', options: riskOptions.length ? riskOptions : [{ value: '', label: 'Sin riesgos disponibles' }], full: true },
        { name: 'description', label: '¿Qué acción se propone?', type: 'textarea', required: true, full: true },
        { name: 'responsible', label: 'Responsable', help: 'Puede quedar pendiente en borrador.' },
        { name: 'targetDate', label: 'Fecha objetivo', type: 'date', help: 'Se exigirá antes de enviar a revisión si el riesgo requiere acción.' },
        { name: 'type', label: 'Tipo', type: 'select', value: 'prevention', options: [
          { value: 'cause-elimination', label: 'Eliminación de causa' }, { value: 'prevention', label: 'Prevención' }, { value: 'poka-yoke', label: 'Poka-yoke' }, { value: 'interlock', label: 'Interlock' }, { value: 'automation', label: 'Automatización' }, { value: 'detection-improvement', label: 'Mejora de detección' }, { value: 'equipment-change', label: 'Modificación de equipo' }, { value: 'method-change', label: 'Modificación de método' }, { value: 'validation', label: 'Validación' }, { value: 'challenge-testing', label: 'Challenge testing' }, { value: 'capability-study', label: 'Estudio de capacidad' }, { value: 'training', label: 'Capacitación' }, { value: 'documentation', label: 'Actualización documental' }, { value: 'other', label: 'Otra' }
        ], advanced: true },
        { name: 'area', label: 'Área', advanced: true },
        { name: 'priority', label: 'Prioridad', type: 'select', value: 'medium', options: [
          { value: 'critical', label: 'Crítica' }, { value: 'high', label: 'Alta' }, { value: 'medium', label: 'Media' }, { value: 'low', label: 'Baja' }
        ], advanced: true },
        { name: 'affectsOccurrence', label: 'Impacto O', type: 'checkbox', checkboxLabel: 'La acción reduce Ocurrencia', value: true, advanced: true },
        { name: 'affectsDetection', label: 'Impacto D', type: 'checkbox', checkboxLabel: 'La acción mejora Detección', value: false, advanced: true },
        { name: 'affectsSeverity', label: 'Impacto G', type: 'checkbox', checkboxLabel: 'La acción modifica Gravedad', value: false, advanced: true },
        { name: 'targetOccurrence', label: 'Ocurrencia objetivo', type: 'number', min: 1, max: 10, value: '', advanced: true },
        { name: 'targetDetection', label: 'Detección objetivo', type: 'number', min: 1, max: 10, value: '', advanced: true }
      ],
      onSubmit: (data) => {
        const linkedRiskId = data.riskId || riskId;
        const linkedRisk = project.risks.find((item) => item.id === linkedRiskId);
        const action = {
          id: PFMEA_MODEL.uuid(),
          code: PFMEA_MODEL.nextCode(project.actions, 'A-'),
          description: data.description,
          type: data.type,
          linkedRiskIds: linkedRiskId ? [linkedRiskId] : [],
          responsible: data.responsible,
          area: data.area,
          targetDate: data.targetDate,
          priority: data.priority,
          status: 'proposed',
          implementedDate: '',
          evidence: [],
          result: '',
          effectiveness: { status: 'not-started', result: '', verifiedBy: '', verifiedAt: null, notes: '' },
          affects: { severity: Boolean(data.affectsSeverity), occurrence: Boolean(data.affectsOccurrence), detection: Boolean(data.affectsDetection) },
          createdControlIds: [],
          modifiedControlIds: [],
          notes: ''
        };
        project.actions.push(action);
        if (linkedRisk) {
          linkedRisk.actionIds = [...new Set([...(linkedRisk.actionIds || []), action.id])];
          linkedRisk.status = 'action-open';
          linkedRisk.decision = linkedRisk.decision === 'pending' ? 'requires-action' : linkedRisk.decision;
          const targetWasDefined = Boolean(data.targetOccurrence || data.targetDetection);
          if (targetWasDefined) {
            const targetSeverity = linkedRisk.current?.severity;
            const targetOccurrence = data.targetOccurrence ? Number(data.targetOccurrence) : linkedRisk.current?.occurrence;
            const targetDetection = data.targetDetection ? Number(data.targetDetection) : linkedRisk.current?.detection;
            linkedRisk.target = {
              severity: targetSeverity,
              occurrence: targetOccurrence,
              detection: targetDetection,
              rpn: PFMEA_MODEL.calculateRpn(targetSeverity, targetOccurrence, targetDetection),
              rationale: `Objetivo asociado a ${action.code}`
            };
          }
        }
        project.workflow.sectionStatus.actions = 'in-progress';
        persist(project, { message: 'Acción agregada' });
      }
    });
  }

  function setProjectStatus(project, status) {
    const gate = status === 'final' ? 'final' : status === 'in-review' ? 'in-review' : 'working';
    const blockers = validateProject(project, gate).filter((issue) => issue.severity === 'error');
    if (['in-review', 'final'].includes(status) && blockers.length) {
      openIssuesDialog(
        `No es posible marcar el proyecto ${statusLabel(status)}`,
        blockers,
        'El borrador sigue guardado y puede continuar editándose. Solo se bloquea el cambio formal de estado.'
      );
      return;
    }
    if (status === 'final' && !window.confirm('Marcar esta revisión como Final no constituye una firma electrónica, pero indica cierre funcional del análisis.\n\n¿Continuar?')) return;
    project.metadata.status = status;
    if (status === 'in-review') project.workflow.sectionStatus.review = 'in-progress';
    if (status === 'final') {
      project.workflow.sectionStatus.review = 'complete';
      project.workflow.closure.confirmedBy = project.metadata.owner;
      project.workflow.closure.confirmedAt = PFMEA_MODEL.nowIso();
    }
    persist(project, { message: `Proyecto marcado ${statusLabel(status)}` });
  }


  function exportProjectJson(project) {
    if (!project) return;
    project.metadata.lastExternalBackupAt = PFMEA_MODEL.nowIso();
    project.exportHistory.push({ id: PFMEA_MODEL.uuid(), type: 'project-json', generatedAt: project.metadata.lastExternalBackupAt, projectStatus: project.metadata.status, revision: project.metadata.revision, filename: '' });
    const exportCopy = JSON.parse(JSON.stringify(project));
    delete exportCopy.clientState;
    const filename = `${safeFilename(project.metadata.code)}_Rev${safeFilename(project.metadata.revision)}.pfmea.json`;
    project.exportHistory[project.exportHistory.length - 1].filename = filename;
    PFMEA_STORAGE.saveProject(project);
    downloadBlob(JSON.stringify(exportCopy, null, 2), filename, 'application/json;charset=utf-8');
    toast('Copia JSON descargada', filename);
    render();
  }

  function exportProjectCsv(project) {
    const headers = [
      'ID riesgo', 'Código etapa', 'Etapa', 'Función', 'Requisito', 'Modo de falla', 'Efecto gobernante', 'Gravedad', 'Causa', 'Categoría de causa', 'Ocurrencia', 'Controles preventivos', 'Controles de detección', 'Detección', 'RPN actual', 'Decisión', 'Acciones', 'Responsables', 'Fechas objetivo', 'Estado acciones', 'G objetivo', 'O objetivo', 'D objetivo', 'RPN objetivo'
    ];
    const rows = project.risks
      .filter((risk) => risk.status !== 'archived')
      .sort((a, b) => Number(b.current?.rpn || 0) - Number(a.current?.rpn || 0))
      .map((risk) => {
        const context = PFMEA_MODEL.riskContext(project, risk);
        const links = project.controlLinks.filter((link) => link.causeId === context.cause?.id);
        const controls = links.map((link) => project.controls.find((control) => control.id === link.controlId)).filter(Boolean);
        const preventive = controls.filter((control) => control.type === 'preventive').map((control) => `${control.code}: ${control.description}`).join(' | ');
        const detection = controls.filter((control) => control.type === 'detection').map((control) => `${control.code}: ${control.description}`).join(' | ');
        const actions = project.actions.filter((action) => action.linkedRiskIds?.includes(risk.id));
        return [
          risk.code,
          context.stage?.code || '',
          context.stage?.name || '',
          context.function?.description || '',
          context.function?.requirement || '',
          context.failureMode?.description || '',
          context.effect?.description || '',
          risk.current?.severity ?? '',
          context.cause?.description || '',
          context.cause?.category || '',
          risk.current?.occurrence ?? '',
          preventive,
          detection,
          risk.current?.detection ?? '',
          risk.current?.rpn ?? '',
          statusLabel(risk.decision),
          actions.map((action) => `${action.code}: ${action.description}`).join(' | '),
          actions.map((action) => action.responsible).join(' | '),
          actions.map((action) => action.targetDate).join(' | '),
          actions.map((action) => statusLabel(action.status)).join(' | '),
          risk.target?.severity ?? '',
          risk.target?.occurrence ?? '',
          risk.target?.detection ?? '',
          risk.target?.rpn ?? ''
        ];
      });
    const csv = '\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
    const filename = `${safeFilename(project.metadata.code)}_Rev${safeFilename(project.metadata.revision)}_PFMEA.csv`;
    project.metadata.lastExportAt = PFMEA_MODEL.nowIso();
    project.exportHistory.push({ id: PFMEA_MODEL.uuid(), type: 'csv', generatedAt: project.metadata.lastExportAt, projectStatus: project.metadata.status, revision: project.metadata.revision, filename });
    PFMEA_STORAGE.saveProject(project);
    downloadBlob(csv, filename, 'text/csv;charset=utf-8');
    toast('CSV descargado', filename);
    render();
  }

  function csvCell(value) {
    let text = String(value ?? '');
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }

  function registerDocumentExport(project, type, filename) {
    project.metadata.lastExportAt = PFMEA_MODEL.nowIso();
    project.exportHistory.push({
      id: PFMEA_MODEL.uuid(),
      type,
      generatedAt: project.metadata.lastExportAt,
      projectStatus: project.metadata.status,
      revision: project.metadata.revision,
      filename
    });
    PFMEA_STORAGE.saveProject(project);
  }

  function exportProjectXlsx(project) {
    try {
      const filename = PFMEA_EXPORTERS.downloadXlsx(project);
      registerDocumentExport(project, 'xlsx', filename);
      toast('Libro Excel generado', filename);
      render();
    } catch (error) {
      console.error(error);
      window.alert(`No fue posible generar el libro Excel.\n\n${error.message}`);
    }
  }

  function exportPrintableReport(project) {
    try {
      const filename = PFMEA_EXPORTERS.openPrintableReport(project);
      registerDocumentExport(project, 'pdf-print', filename);
      toast('Informe abierto', 'Elegí “Guardar como PDF” en el diálogo de impresión.');
      render();
    } catch (error) {
      console.error(error);
      window.alert(`No fue posible abrir el informe.\n\n${error.message}`);
    }
  }

  function downloadPrintableReport(project) {
    try {
      const filename = PFMEA_EXPORTERS.downloadReportHtml(project);
      registerDocumentExport(project, 'report-html', filename);
      toast('Informe HTML descargado', filename);
      render();
    } catch (error) {
      console.error(error);
      window.alert(`No fue posible descargar el informe.\n\n${error.message}`);
    }
  }

  function exportMapSvg(project) {
    const nodes = project.processMap.nodes.filter((node) => !node.archived);
    const edges = project.processMap.edges.filter((edge) => !edge.archived);
    if (!nodes.length) {
      window.alert('El mapa no contiene etapas activas.');
      return;
    }
    const minX = Math.min(...nodes.map((node) => Number(node.position?.x || 0))) - 45;
    const minY = Math.min(...nodes.map((node) => Number(node.position?.y || 0))) - 70;
    const maxX = Math.max(...nodes.map((node) => Number(node.position?.x || 0) + 162)) + 45;
    const maxY = Math.max(...nodes.map((node) => Number(node.position?.y || 0) + 80)) + 70;
    const width = maxX - minX;
    const height = maxY - minY;
    const edgeSvg = edges.map((edge) => {
      const source = nodes.find((node) => node.id === edge.sourceNodeId);
      const target = nodes.find((node) => node.id === edge.targetNodeId);
      if (!source || !target) return '';
      const sx = Number(source.position.x) + 81;
      const sy = Number(source.position.y) + 38;
      const tx = Number(target.position.x) + 81;
      const ty = Number(target.position.y) + 38;
      const dx = tx - sx;
      const curve = Math.max(50, Math.abs(dx) * 0.35);
      const c1x = sx + (dx >= 0 ? curve : -curve);
      const c2x = tx - (dx >= 0 ? curve : -curve);
      const label = edge.label || edge.condition || '';
      return `<path d="M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ty}, ${tx} ${ty}" fill="none" stroke="#7b8b9c" stroke-width="2" ${edge.flowType !== 'normal' ? 'stroke-dasharray="6 5"' : ''} marker-end="url(#arrow)"/>${label ? `<text x="${(sx + tx) / 2}" y="${(sy + ty) / 2 - 7}" font-size="11" text-anchor="middle" fill="#475467">${xmlEsc(label)}</text>` : ''}`;
    }).join('');
    const nodeSvg = nodes.map((node) => {
      const x = Number(node.position.x);
      const y = Number(node.position.y);
      const risks = PFMEA_MODEL.stageRisks(project, node.id);
      const maxRpn = risks.reduce((max, risk) => Math.max(max, Number(risk.current?.rpn || 0)), 0);
      const round = ['start', 'end'].includes(node.type) ? 30 : 10;
      const fill = node.type === 'decision' ? '#fffaf0' : node.type === 'inspection' ? '#f1fbf9' : node.type === 'rework' ? '#fff7ed' : '#ffffff';
      return `<g><rect x="${x}" y="${y}" width="162" height="76" rx="${round}" fill="${fill}" stroke="#718096"/><text x="${x + 12}" y="${y + 19}" font-size="10" font-weight="700" fill="#667085">${xmlEsc(`${node.code} · ${NODE_TYPES[node.type] || node.type}`)}</text><text x="${x + 12}" y="${y + 39}" font-size="12" font-weight="700" fill="#182230">${xmlEsc(truncate(node.name, 23))}</text><text x="${x + 12}" y="${y + 59}" font-size="10" fill="#667085">${xmlEsc(`${risks.length} riesgos${maxRpn ? ` · RPN ${maxRpn}` : ''}`)}</text></g>`;
    }).join('');
    const titleY = minY + 24;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}"><defs><marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="#7b8b9c"/></marker></defs><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#f9fbfc"/><text x="${minX + 12}" y="${titleY}" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#182230">${xmlEsc(project.metadata.name)}</text><text x="${minX + 12}" y="${titleY + 18}" font-family="Arial, sans-serif" font-size="11" fill="#667085">${xmlEsc(`${project.metadata.code} · Rev. ${project.metadata.revision}`)}</text><g font-family="Arial, sans-serif">${edgeSvg}${nodeSvg}</g></svg>`;
    const filename = `${safeFilename(project.metadata.code)}_Rev${safeFilename(project.metadata.revision)}_Mapa.svg`;
    project.metadata.lastExportAt = PFMEA_MODEL.nowIso();
    project.exportHistory.push({ id: PFMEA_MODEL.uuid(), type: 'map-svg', generatedAt: project.metadata.lastExportAt, projectStatus: project.metadata.status, revision: project.metadata.revision, filename });
    PFMEA_STORAGE.saveProject(project);
    downloadBlob(svg, filename, 'image/svg+xml;charset=utf-8');
    toast('Mapa SVG descargado', filename);
    render();
  }

  function xmlEsc(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
  }

  function truncate(value, max) {
    const text = String(value || '');
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  window.addEventListener('hashchange', render);
  window.addEventListener('storage', (event) => {
    if (event.key === 'pfmea-flow.projects.v1') {
      toast('Datos locales actualizados', 'Otra pestaña modificó la biblioteca de proyectos.');
      render();
    }
  });
  PFMEA_STORAGE.onExternalChange((detail) => {
    if (!detail.external) return;
    toast('Proyecto actualizado en otra pestaña', 'Se recargó la versión más reciente de la base local.');
    render();
  });

  app.innerHTML = '<div class="app-loader"><div><strong>PFMEA Flow</strong><p>Cargando la biblioteca local…</p></div></div>';
  PFMEA_STORAGE.ready().then(() => {
    if (!window.location.hash) window.location.hash = '#projects';
    else render();
  }).catch((error) => {
    console.error(error);
    app.innerHTML = `<div class="app-loader"><div><strong>No fue posible iniciar PFMEA Flow</strong><p>${esc(error.message)}</p></div></div>`;
  });
})();