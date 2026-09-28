(function () {
  'use strict';

  const LEGACY_STORAGE_KEY = 'pfmea-flow.projects.v1';
  const SETTINGS_KEY = 'pfmea-flow.settings.v1';
  const SNAPSHOT_FALLBACK_KEY = 'pfmea-flow.snapshots.v1';
  const DB_NAME = 'pfmea-flow';
  const DB_VERSION = 1;
  const PROJECT_STORE = 'projects';
  const SNAPSHOT_STORE = 'snapshots';
  const MAX_SNAPSHOTS_PER_PROJECT = 12;
  const AUTO_SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000;

  const memoryFallback = new Map();
  const listeners = new Set();
  const lastAutoSnapshotAt = new Map();
  let projectCache = [];
  let database = null;
  let storageMode = 'memory';
  let localStorageAvailable = true;
  let writeQueue = Promise.resolve();
  let readyResolved = false;

  const channel = typeof document !== 'undefined' && typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('pfmea-flow-updates')
    : null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function localGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      localStorageAvailable = false;
      return memoryFallback.has(key) ? memoryFallback.get(key) : null;
    }
  }

  function localSet(key, value) {
    const text = String(value);
    try {
      localStorage.setItem(key, text);
      if (storageMode === 'memory') storageMode = 'localStorage';
    } catch (error) {
      localStorageAvailable = false;
      memoryFallback.set(key, text);
    }
  }

  function localRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      memoryFallback.delete(key);
    }
  }

  function readLegacyProjects() {
    try {
      const raw = localGet(LEGACY_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('No fue posible leer la copia local de proyectos.', error);
      return [];
    }
  }

  function writeLocalMirror() {
    localSet(LEGACY_STORAGE_KEY, JSON.stringify(projectCache));
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB no está disponible.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROJECT_STORE)) {
          db.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
          const store = db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' });
          store.createIndex('projectId', 'projectId', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('No fue posible abrir IndexedDB.'));
      request.onblocked = () => reject(new Error('La base local está bloqueada por otra pestaña.'));
    });
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Falló una operación de almacenamiento.'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Falló la transacción local.'));
      transaction.onabort = () => reject(transaction.error || new Error('La transacción local fue cancelada.'));
    });
  }

  async function getAllFromStore(storeName) {
    const tx = database.transaction(storeName, 'readonly');
    const done = transactionDone(tx);
    const request = tx.objectStore(storeName).getAll();
    const result = await requestToPromise(request);
    await done;
    return result || [];
  }

  async function persistAllToDatabase() {
    if (!database) return;
    const tx = database.transaction(PROJECT_STORE, 'readwrite');
    const done = transactionDone(tx);
    const store = tx.objectStore(PROJECT_STORE);
    store.clear();
    projectCache.forEach((project) => store.put(clone(project)));
    await done;
  }

  function enqueue(task) {
    writeQueue = writeQueue
      .then(task)
      .catch((error) => {
        console.error('No fue posible persistir los datos en IndexedDB.', error);
        if (storageMode === 'indexeddb') storageMode = localStorageAvailable ? 'localStorage' : 'memory';
      });
    return writeQueue;
  }

  function notify(type, projectId = null) {
    const detail = { type, projectId, at: new Date().toISOString() };
    listeners.forEach((listener) => {
      try { listener(detail); } catch (error) { console.error(error); }
    });
    if (channel) channel.postMessage(detail);
  }

  if (channel) {
    channel.addEventListener('message', async (event) => {
      const detail = event.data || {};
      if (database) {
        try {
          projectCache = (await getAllFromStore(PROJECT_STORE)).map(PFMEA_MODEL.normalizeProject);
          writeLocalMirror();
        } catch (error) {
          console.error('No fue posible sincronizar los cambios de otra pestaña.', error);
        }
      } else {
        projectCache = readLegacyProjects().map(PFMEA_MODEL.normalizeProject);
      }
      listeners.forEach((listener) => listener({ ...detail, external: true }));
    });
  }

  async function initialize() {
    const legacy = readLegacyProjects();
    try {
      database = await openDatabase();
      storageMode = 'indexeddb';
      const stored = await getAllFromStore(PROJECT_STORE);
      const source = stored.length ? stored : legacy;
      projectCache = source.map(PFMEA_MODEL.normalizeProject);
      if (!projectCache.length) projectCache = [PFMEA_MODEL.sampleProject()];
      await persistAllToDatabase();
      writeLocalMirror();
      if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
        navigator.storage.persist().catch(() => false);
      }
    } catch (error) {
      if (typeof document !== 'undefined') {
        console.warn('IndexedDB no está disponible; se utilizará la copia local.', error);
      }
      projectCache = legacy.map(PFMEA_MODEL.normalizeProject);
      if (!projectCache.length) projectCache = [PFMEA_MODEL.sampleProject()];
      writeLocalMirror();
      storageMode = localStorageAvailable ? 'localStorage' : 'memory';
    }
    readyResolved = true;
    return true;
  }

  const readyPromise = initialize();

  function listProjects() {
    if (!projectCache.length && readyResolved) {
      projectCache = [PFMEA_MODEL.sampleProject()];
      writeLocalMirror();
      enqueue(persistAllToDatabase);
    }
    return [...projectCache].sort((a, b) => new Date(b.metadata.updatedAt) - new Date(a.metadata.updatedAt));
  }

  function getProject(id) {
    return projectCache.find((project) => project.id === id) || null;
  }

  function persistSingleProject(project) {
    if (!database) return Promise.resolve();
    const tx = database.transaction(PROJECT_STORE, 'readwrite');
    const done = transactionDone(tx);
    tx.objectStore(PROJECT_STORE).put(clone(project));
    return done;
  }

  function maybeCreateAutomaticSnapshot(project) {
    const previous = lastAutoSnapshotAt.get(project.id) || 0;
    const now = Date.now();
    if (now - previous < AUTO_SNAPSHOT_INTERVAL_MS) return;
    lastAutoSnapshotAt.set(project.id, now);
    createSnapshot(project, 'Autoguardado periódico').catch((error) => console.error(error));
  }

  function saveProject(project, options = {}) {
    const normalized = PFMEA_MODEL.normalizeProject(project);
    normalized.metadata.updatedAt = PFMEA_MODEL.nowIso();
    const index = projectCache.findIndex((item) => item.id === normalized.id);
    if (index >= 0) projectCache[index] = normalized;
    else projectCache.push(normalized);
    writeLocalMirror();
    enqueue(() => persistSingleProject(normalized));
    if (options.snapshot !== false) maybeCreateAutomaticSnapshot(normalized);
    notify('project-saved', normalized.id);
    return normalized;
  }

  function createProject(input) {
    const project = PFMEA_MODEL.createProject(input);
    const saved = saveProject(project, { snapshot: false });
    createSnapshot(saved, 'Creación del proyecto').catch((error) => console.error(error));
    return saved;
  }

  function deleteProject(id) {
    projectCache = projectCache.filter((project) => project.id !== id);
    writeLocalMirror();
    enqueue(async () => {
      if (!database) return;
      const tx = database.transaction([PROJECT_STORE, SNAPSHOT_STORE], 'readwrite');
      const done = transactionDone(tx);
      tx.objectStore(PROJECT_STORE).delete(id);
      const index = tx.objectStore(SNAPSHOT_STORE).index('projectId');
      const request = index.openCursor(IDBKeyRange.only(id));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      await done;
    });
    notify('project-deleted', id);
  }

  function duplicateProject(id) {
    const source = getProject(id);
    if (!source) throw new Error('Proyecto no encontrado.');
    const copy = PFMEA_MODEL.normalizeProject(clone(source));
    copy.id = PFMEA_MODEL.uuid();
    copy.metadata.name = `${source.metadata.name} - Copia`;
    copy.metadata.code = `${source.metadata.code}-COPY`;
    copy.metadata.status = 'draft';
    copy.metadata.sourceProjectId = source.id;
    copy.metadata.previousRevisionId = null;
    copy.metadata.createdAt = PFMEA_MODEL.nowIso();
    copy.metadata.updatedAt = PFMEA_MODEL.nowIso();
    copy.metadata.lastExternalBackupAt = null;
    copy.metadata.lastExportAt = null;
    copy.exportHistory = [];
    copy.revisionHistory = [{
      id: PFMEA_MODEL.uuid(),
      revision: copy.metadata.revision,
      date: copy.metadata.createdAt.slice(0, 10),
      description: `Copia creada desde ${source.metadata.code} Rev. ${source.metadata.revision}`,
      responsible: copy.metadata.owner,
      status: 'draft',
      sourceProjectId: source.id
    }];
    const saved = saveProject(copy, { snapshot: false });
    createSnapshot(saved, 'Copia inicial').catch((error) => console.error(error));
    return saved;
  }

  function createRevision(id, revision, summary) {
    const source = getProject(id);
    if (!source) throw new Error('Proyecto no encontrado.');
    createSnapshot(source, `Antes de crear revisión ${revision}`).catch((error) => console.error(error));
    const copy = PFMEA_MODEL.normalizeProject(clone(source));
    copy.id = PFMEA_MODEL.uuid();
    copy.metadata.revision = revision;
    copy.metadata.status = 'draft';
    copy.metadata.previousRevisionId = source.id;
    copy.metadata.sourceProjectId = source.metadata.sourceProjectId || source.id;
    copy.metadata.summaryOfChanges = summary || '';
    copy.metadata.createdAt = PFMEA_MODEL.nowIso();
    copy.metadata.updatedAt = PFMEA_MODEL.nowIso();
    copy.metadata.lastExternalBackupAt = null;
    copy.metadata.lastExportAt = null;
    copy.processMap.confirmedAt = null;
    copy.processMap.confirmedBy = '';
    copy.workflow.reviewRequiredStageIds = copy.processMap.nodes
      .filter((node) => !node.archived && !['start', 'end'].includes(node.type))
      .map((node) => node.id);
    copy.workflow.sectionStatus.review = 'not-started';
    copy.exportHistory = [];
    copy.revisionHistory = [
      ...source.revisionHistory,
      {
        id: PFMEA_MODEL.uuid(),
        revision,
        date: copy.metadata.createdAt.slice(0, 10),
        description: summary || `Nueva revisión creada desde Rev. ${source.metadata.revision}`,
        responsible: copy.metadata.owner,
        status: 'draft',
        sourceProjectId: source.id
      }
    ];
    source.metadata.status = 'replaced';
    saveProject(source, { snapshot: false });
    const saved = saveProject(copy, { snapshot: false });
    createSnapshot(saved, `Inicio de revisión ${revision}`).catch((error) => console.error(error));
    return saved;
  }

  function importProject(raw, options = {}) {
    const normalized = PFMEA_MODEL.normalizeProject(raw);
    const existing = getProject(normalized.id);
    if (existing && options.asCopy) {
      normalized.id = PFMEA_MODEL.uuid();
      normalized.metadata.name = `${normalized.metadata.name} - Importado`;
      normalized.metadata.sourceProjectId = raw.id;
      normalized.metadata.createdAt = PFMEA_MODEL.nowIso();
    } else if (existing) {
      createSnapshot(existing, 'Antes de reemplazar por importación').catch((error) => console.error(error));
    }
    const saved = saveProject(normalized, { snapshot: false });
    createSnapshot(saved, 'Proyecto importado').catch((error) => console.error(error));
    return saved;
  }

  function resetDemo() {
    projectCache = projectCache.filter((project) => project.id !== 'pfmea-demo-llenado');
    const sample = PFMEA_MODEL.sampleProject();
    projectCache.unshift(sample);
    writeLocalMirror();
    enqueue(persistAllToDatabase);
    createSnapshot(sample, 'Restauración del proyecto demo').catch((error) => console.error(error));
    notify('demo-reset', sample.id);
    return sample;
  }

  function readFallbackSnapshots() {
    try {
      const raw = localGet(SNAPSHOT_FALLBACK_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeFallbackSnapshots(snapshots) {
    localSet(SNAPSHOT_FALLBACK_KEY, JSON.stringify(snapshots));
  }

  async function cleanupSnapshots(projectId) {
    const snapshots = await listSnapshots(projectId);
    const remove = snapshots.slice(MAX_SNAPSHOTS_PER_PROJECT);
    if (!remove.length) return;
    if (database) {
      const tx = database.transaction(SNAPSHOT_STORE, 'readwrite');
      const done = transactionDone(tx);
      const store = tx.objectStore(SNAPSHOT_STORE);
      remove.forEach((snapshot) => store.delete(snapshot.id));
      await done;
    } else {
      const removeIds = new Set(remove.map((item) => item.id));
      writeFallbackSnapshots(readFallbackSnapshots().filter((item) => !removeIds.has(item.id)));
    }
  }

  async function createSnapshot(projectOrId, reason = 'Copia manual') {
    await readyPromise;
    const project = typeof projectOrId === 'string' ? getProject(projectOrId) : projectOrId;
    if (!project) throw new Error('Proyecto no encontrado.');
    const snapshot = {
      id: PFMEA_MODEL.uuid(),
      projectId: project.id,
      projectName: project.metadata.name,
      projectCode: project.metadata.code,
      revision: project.metadata.revision,
      createdAt: PFMEA_MODEL.nowIso(),
      reason,
      data: clone(project)
    };
    if (database) {
      const tx = database.transaction(SNAPSHOT_STORE, 'readwrite');
      const done = transactionDone(tx);
      tx.objectStore(SNAPSHOT_STORE).put(snapshot);
      await done;
    } else {
      const snapshots = readFallbackSnapshots();
      snapshots.push(snapshot);
      writeFallbackSnapshots(snapshots);
    }
    await cleanupSnapshots(project.id);
    return snapshot;
  }

  async function listSnapshots(projectId) {
    await readyPromise;
    let snapshots;
    if (database) {
      const tx = database.transaction(SNAPSHOT_STORE, 'readonly');
      const done = transactionDone(tx);
      snapshots = await requestToPromise(tx.objectStore(SNAPSHOT_STORE).index('projectId').getAll(projectId));
      await done;
    } else {
      snapshots = readFallbackSnapshots().filter((item) => item.projectId === projectId);
    }
    return (snapshots || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async function restoreSnapshot(projectId, snapshotId) {
    await readyPromise;
    let snapshot = null;
    if (database) {
      const tx = database.transaction(SNAPSHOT_STORE, 'readonly');
      const done = transactionDone(tx);
      snapshot = await requestToPromise(tx.objectStore(SNAPSHOT_STORE).get(snapshotId));
      await done;
    } else {
      snapshot = readFallbackSnapshots().find((item) => item.id === snapshotId) || null;
    }
    if (!snapshot || snapshot.projectId !== projectId) throw new Error('La copia interna no está disponible.');
    const current = getProject(projectId);
    if (current) await createSnapshot(current, 'Antes de restaurar otra copia');
    const restored = PFMEA_MODEL.normalizeProject(clone(snapshot.data));
    restored.metadata.updatedAt = PFMEA_MODEL.nowIso();
    return saveProject(restored, { snapshot: false });
  }

  async function deleteSnapshot(projectId, snapshotId) {
    await readyPromise;
    if (database) {
      const tx = database.transaction(SNAPSHOT_STORE, 'readwrite');
      const done = transactionDone(tx);
      tx.objectStore(SNAPSHOT_STORE).delete(snapshotId);
      await done;
    } else {
      writeFallbackSnapshots(readFallbackSnapshots().filter((item) => !(item.projectId === projectId && item.id === snapshotId)));
    }
  }

  function readSettings() {
    try {
      const raw = localGet(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : { libraryFilter: 'all', sidebarCollapsed: false };
    } catch {
      return { libraryFilter: 'all', sidebarCollapsed: false };
    }
  }

  function saveSettings(settings) {
    localSet(SETTINGS_KEY, JSON.stringify(settings));
  }

  function storageLabel() {
    if (storageMode === 'indexeddb') return localStorageAvailable ? 'IndexedDB + copia local' : 'IndexedDB';
    if (storageMode === 'localStorage') return 'Almacenamiento local';
    return 'Memoria temporal';
  }

  function onExternalChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function flush() {
    return writeQueue;
  }

  window.PFMEA_STORAGE = {
    ready: () => readyPromise,
    flush,
    listProjects,
    getProject,
    saveProject,
    createProject,
    deleteProject,
    duplicateProject,
    createRevision,
    importProject,
    resetDemo,
    createSnapshot,
    listSnapshots,
    restoreSnapshot,
    deleteSnapshot,
    readSettings,
    saveSettings,
    onExternalChange,
    storageLabel,
    isPersistent: () => storageMode === 'indexeddb' || (storageMode === 'localStorage' && localStorageAvailable),
    storageMode: () => storageMode,
    clearLegacyMirror: () => localRemove(LEGACY_STORAGE_KEY)
  };
})();
