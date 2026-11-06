(() => {
  'use strict';

  if (new URLSearchParams(location.search).get('mode') === 'player') return;

  const DB_NAME = 'woa-vtt-asset-library';
  const DB_VERSION = 1;
  const STORE_NAME = 'items';
  const FORMAT = 'wings-of-atreia-vtt-asset-library-item';
  const $ = id => document.getElementById(id);
  const host = $('asset-library-list');
  const count = $('asset-library-count');
  const status = $('asset-library-status');
  const search = $('asset-library-search');
  const filter = $('asset-library-filter');
  const saveButton = $('asset-library-save-selected');
  let dbPromise = null;
  let items = [];

  const clone = value => JSON.parse(JSON.stringify(value));
  const makeId = () => 'library-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB is unavailable in this browser.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('kind', 'kind', { unique: false });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => reject(request.error || new Error('Could not open the Asset Library.'));
      request.onblocked = () => reject(new Error('Asset Library upgrade is blocked by another open tab. Close other VTT tabs and reload.'));
    });
    return dbPromise;
  }

  async function readAll() {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error || new Error('Could not read the Asset Library.'));
    });
  }

  async function writeItem(item) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(item);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not save this library item.'));
      transaction.onabort = () => reject(transaction.error || new Error('The library save was cancelled.'));
    });
  }

  async function removeItem(id) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not delete this library item.'));
      transaction.onabort = () => reject(transaction.error || new Error('The library deletion was cancelled.'));
    });
  }

  function selectedObject() {
    const asset = state.assets.find(item => item.id === state.selectedAsset);
    if (asset) return { kind: 'asset', object: asset };
    const token = state.tokens.find(item => item.id === state.selected);
    if (token) return { kind: 'token', object: token };
    return null;
  }

  function makeTemplate(kind, object) {
    const payload = clone(object);
    delete payload.id;
    delete payload.x;
    delete payload.y;
    delete payload.z;
    delete payload._screen;
    delete payload._dragX;
    delete payload._dragY;
    payload.locked = false;
    payload.hidden = false;
    return payload;
  }

  function imageFor(item) {
    const payload = item.payload || {};
    if (typeof payload.image === 'string' && payload.image.startsWith('data:image/')) return payload.image;
    if (Array.isArray(payload.imageSlots)) {
      const saved = payload.imageSlots.find(value => typeof value === 'string' && value.startsWith('data:image/'));
      if (saved) return saved;
    }
    return '';
  }

  function setStatus(message, isError = false) {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = isError ? 'error' : 'normal';
  }

  function render() {
    if (!host || !count) return;
    const query = (search?.value || '').trim().toLocaleLowerCase();
    const kind = filter?.value || 'all';
    const visible = items
      .filter(item => (kind === 'all' || item.kind === kind) && String(item.name || '').toLocaleLowerCase().includes(query))
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

    count.textContent = visible.length + ' of ' + items.length + ' saved item' + (items.length === 1 ? '' : 's');
    host.replaceChildren();

    if (!visible.length) {
      const empty = document.createElement('p');
      empty.className = 'note';
      empty.textContent = items.length ? 'No library items match this search.' : 'Your Asset Library is empty. Select a token or prop in the scene, then save it here for reuse.';
      host.append(empty);
      if (saveButton) saveButton.disabled = !selectedObject();
      return;
    }

    for (const item of visible) {
      const entry = document.createElement('article');
      entry.className = 'asset-library-entry';

      const thumb = document.createElement('div');
      thumb.className = 'asset-library-thumb';
      const image = imageFor(item);
      if (image) {
        const img = document.createElement('img');
        img.src = image;
        img.alt = '';
        thumb.append(img);
      } else {
        const glyph = document.createElement('span');
        glyph.textContent = item.payload?.glyph || (item.kind === 'token' ? '●' : '◇');
        thumb.append(glyph);
      }

      const details = document.createElement('div');
      details.className = 'asset-library-details';
      const name = document.createElement('strong');
      name.textContent = item.name || (item.kind === 'token' ? 'Unnamed Token' : 'Unnamed Asset');
      const meta = document.createElement('small');
      meta.textContent = item.kind === 'token' ? 'Token template' : 'Prop / asset template';
      const actions = document.createElement('div');
      actions.className = 'asset-library-actions';

      const add = document.createElement('button');
      add.type = 'button';
      add.textContent = 'Add to Scene';
      add.addEventListener('click', () => addToScene(item.id));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'danger';
      remove.textContent = 'Delete';
      remove.addEventListener('click', () => deleteFromLibrary(item.id));

      actions.append(add, remove);
      details.append(name, meta, actions);
      entry.append(thumb, details);
      host.append(entry);
    }

    if (saveButton) saveButton.disabled = !selectedObject();
  }

  async function refresh() {
    try {
      items = await readAll();
      render();
      if (status && !status.textContent) setStatus('Library ready. Items are stored locally on this device.');
    } catch (error) {
      setStatus(error.message || 'Could not load the Asset Library.', true);
      if (host) {
        host.replaceChildren();
        const message = document.createElement('p');
        message.className = 'note';
        message.textContent = 'Local library storage could not be opened. Your scene data has not been changed.';
        host.append(message);
      }
    }
  }

  async function saveSelectedToLibrary() {
    if (!isGM()) return;
    const selected = selectedObject();
    if (!selected) {
      setStatus('Select one token or prop on the battlefield before saving it to the library.', true);
      return;
    }
    try {
      const payload = makeTemplate(selected.kind, selected.object);
      const name = String(selected.object.name || (selected.kind === 'token' ? 'Unnamed Token' : 'Unnamed Asset')).slice(0, 120);
      const now = new Date().toISOString();
      const item = {
        format: FORMAT,
        version: 1,
        id: makeId(),
        kind: selected.kind,
        name,
        createdAt: now,
        updatedAt: now,
        payload
      };
      await writeItem(item);
      await refresh();
      setStatus('Saved "' + name + '" to the local Asset Library. It is available independently of this scene.');
    } catch (error) {
      setStatus(error.message || 'Could not save the selected object.', true);
    }
  }

  async function addToScene(id) {
    if (!isGM()) return;
    const item = items.find(entry => entry.id === id);
    if (!item || !item.payload || !['token', 'asset'].includes(item.kind)) return;
    try {
      const copy = clone(item.payload);
      copy.id = (item.kind === 'token' ? 'token-library-' : 'asset-library-') + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
      copy.x = 0;
      copy.y = 0;
      copy.z = 0;
      copy.locked = false;
      copy.hidden = false;

      if (item.kind === 'token') {
        state.tokens.push(copy);
        state.selectedAsset = null;
        state.selectedAssetIds = [];
        select(copy.id);
        list();
      } else {
        state.assets.push(copy);
        state.selected = null;
        state.selectedTokenIds = [];
        state.selectedAsset = copy.id;
        state.selectedAssetIds = [copy.id];
        updateClassResourcePanel(null);
        syncAssetEditor(copy);
        refreshAttachmentControls();
      }

      render();
      saveSceneToBrowser();
      setStatus('Added "' + (item.name || 'library item') + '" to the active scene at the map origin. Drag it into position.');
    } catch (error) {
      setStatus(error.message || 'Could not add this item to the scene.', true);
    }
  }

  async function deleteFromLibrary(id) {
    if (!isGM()) return;
    const item = items.find(entry => entry.id === id);
    if (!item) return;
    if (!window.confirm('Delete "' + (item.name || 'library item') + '" from the Asset Library? Existing scene objects will not be affected.')) return;
    try {
      await removeItem(id);
      await refresh();
      setStatus('Deleted "' + (item.name || 'library item') + '" from the Asset Library. Existing scene objects were not affected.');
    } catch (error) {
      setStatus(error.message || 'Could not delete this library item.', true);
    }
  }

  function updateAccess() {
    const section = $('asset-library-panel');
    if (section) section.hidden = playerScreenMode || !isGM();
    if (saveButton) saveButton.disabled = !isGM() || !selectedObject();
  }

  saveButton?.addEventListener('click', saveSelectedToLibrary);
  search?.addEventListener('input', render);
  filter?.addEventListener('change', render);
  sessionRoleEl?.addEventListener('change', updateAccess);

  updateAccess();
  refresh();
})();