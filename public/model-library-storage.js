const DB_NAME = 'factory-model-library';
const STORE_NAME = 'models';
const pendingSaves = new Map();

function reportStorageUnavailable() {
  const detail = '本地模型库不可用，已降级为本次会话';
  window.__factoryStorageUnavailable = detail;
  window.dispatchEvent(new CustomEvent('factory-storage-unavailable', { detail }));
}
function openDatabase() {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('indexedDB open failed'));
    } catch (err) {
      reject(err);
    }
  });
}
async function storeModel(file) {
  if (!file?.name) return;
  try {
    const response = await fetch(`/api/models?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
    if (response.ok && response.headers.get('X-Factory-Model-Store') === '1') return;
  } catch {}
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(file, file.name);
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
  } catch {
    reportStorageUnavailable();
  }
}
async function listIndexedModels() {
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME);
  const models = [];
  await new Promise((resolve, reject) => {
    const request = tx.objectStore(STORE_NAME).openCursor();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(); return; }
      const file = cursor.value;
      const name = file?.name || String(cursor.key);
      const ext = String(name).includes('.') ? String(name).split('.').pop() : '';
      models.push({ name, format: ext.toUpperCase(), size: file?.size || 0, updated: new Date(file?.lastModified || Date.now()).toLocaleDateString(), tag: '本地导入', available: true });
      cursor.continue();
    };
  });
  return models;
}
async function getModel(name) {
  try {
    const response = await fetch(`/api/models?name=${encodeURIComponent(name)}`);
    if (response.ok && response.headers.get('X-Factory-Model-Store') === '1') return new File([await response.blob()], name);
  } catch {}
  try { const db = await openDatabase(); return new Promise((resolve, reject) => { const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); } catch { return null; }
}
async function deleteModel(name) {
  try { await fetch(`/api/models?name=${encodeURIComponent(name)}`, { method: 'DELETE' }); } catch {}
  try { const db = await openDatabase(); db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(name); } catch {}
}

window.factoryModelStorage = {
  // 供 ES 模块（ModelLoader.loadModelByName / 设置页实时预览）按名取回模型文件
  getModel,
  waitForSave(name) { return pendingSaves.get(name) || Promise.resolve(); },
  async listModels() {
    try {
      const response = await fetch('/api/models');
      if (response.ok && response.headers.get('X-Factory-Model-Store') === '1') return await response.json();
    } catch {}
    try { return await listIndexedModels(); } catch { reportStorageUnavailable(); return []; }
  }
};
window.addEventListener('factory-import', (event) => {
  const file = event.detail?.file || event.detail;
  if (!file?.name) return;
  const save = storeModel(file).finally(() => pendingSaves.delete(file.name));
  pendingSaves.set(file.name, save);
});
window.addEventListener('factory-show-model', async (event) => {
  const detail = event.detail;
  const name = typeof detail === 'string' ? detail : detail?.name;
  const silent = typeof detail === 'string' ? false : !!detail?.silent;
  try { const file = await getModel(name); if (!file) throw Error(); window.dispatchEvent(new CustomEvent('factory-import', { detail: { file, silent } })); }
  catch { window.dispatchEvent(new CustomEvent('factory-model-missing', { detail: name })); }
});
window.addEventListener('factory-model-delete-file', (event) => { deleteModel(event.detail); });
