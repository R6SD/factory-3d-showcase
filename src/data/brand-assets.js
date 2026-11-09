/**
 * 品牌图片（Logo / 标题背景 / 主题背景）存 IndexedDB，不进 localStorage。
 * 描述对象写在配置里；像素只在本库。
 */

export const BRAND_DB = 'factory-brand-assets';
export const BRAND_STORE = 'blobs';
export const BRAND_KEYS = ['icon', 'titleBg', 'themeBg'];
export const BRAND_MAX_BYTES = 2 * 1024 * 1024;
export const ICON_DATA_URL_MAX = 100 * 1024;
export const BRAND_UNAVAILABLE = '本地素材库不可用';

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const sessionUrls = new Map();
let idbQueue = Promise.resolve();

/** 同一库上的开关库串行，避免两个槽同时写入时读到空结果。 */
function enqueue(task) {
  const run = idbQueue.then(task, task);
  idbQueue = run.then(() => undefined, () => undefined);
  return run;
}

function normalizeType(file) {
  const raw = String(file?.type || '').toLowerCase();
  if (raw === 'image/jpg') return 'image/jpeg';
  if (ALLOWED_TYPES.has(raw)) return raw;
  const ext = String(file?.name || '').toLowerCase().split('.').pop();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return '';
}

/** 设置页上传前的纯校验。不写存储。 */
export function assertBrandImage(file) {
  if (!normalizeType(file)) return { ok: false, code: 'badType' };
  if (Number(file.size) > BRAND_MAX_BYTES) return { ok: false, code: 'tooLarge' };
  return { ok: true };
}

export function isIdbRef(value) {
  return !!value && typeof value === 'object' && value.store === 'idb';
}

export function brandAssetRef(key, file) {
  return {
    store: 'idb',
    key,
    name: file?.name || key,
    type: normalizeType(file) || file?.type || '',
    size: Number(file?.size) || 0,
  };
}

export function rememberSessionUrl(key, url) {
  const prev = sessionUrls.get(key);
  if (prev && prev !== url) URL.revokeObjectURL(prev);
  sessionUrls.set(key, url);
}

export function sessionUrl(key) {
  return sessionUrls.get(key) || '';
}

export function forgetSessionUrl(key) {
  const prev = sessionUrls.get(key);
  if (prev) URL.revokeObjectURL(prev);
  sessionUrls.delete(key);
}

export function objectUrlFromBlob(blob) {
  return URL.createObjectURL(blob);
}

function reportBrandStorageUnavailable() {
  if (typeof window === 'undefined') return;
  if (window.__factoryBrandStorageUnavailable === BRAND_UNAVAILABLE) return;
  window.__factoryBrandStorageUnavailable = BRAND_UNAVAILABLE;
  window.dispatchEvent(new CustomEvent('factory-brand-storage-unavailable', { detail: BRAND_UNAVAILABLE }));
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === 'undefined') throw new Error('indexedDB missing');
      const request = indexedDB.open(BRAND_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(BRAND_STORE)) db.createObjectStore(BRAND_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('indexedDB open failed'));
    } catch (err) {
      reject(err);
    }
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('indexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('indexedDB transaction aborted'));
  });
}

async function blobBytes(blob) {
  if (blob && typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsArrayBuffer(blob);
  });
}

function blobFromRecord(record) {
  if (!record) return null;
  if (typeof Blob !== 'undefined' && record instanceof Blob) return record;
  const buffer = record.buffer || record;
  if (!(buffer instanceof ArrayBuffer) && !ArrayBuffer.isView(buffer)) return null;
  return new Blob([buffer], { type: record.type || '' });
}

export function putBrandAsset(key, blob) {
  if (!BRAND_KEYS.includes(key)) return Promise.reject(new Error('bad brand key'));
  return enqueue(() => putBrandAssetNow(key, blob));
}

async function putBrandAssetNow(key, blob) {
  try {
    const buffer = await blobBytes(blob);
    const db = await openDatabase();
    const tx = db.transaction(BRAND_STORE, 'readwrite');
    tx.objectStore(BRAND_STORE).put({ type: blob?.type || '', buffer }, key);
    await txDone(tx);
    db.close();
  } catch (err) {
    reportBrandStorageUnavailable();
    throw err;
  }
}

export function getBrandAsset(key) {
  if (!BRAND_KEYS.includes(key)) return Promise.resolve(null);
  return enqueue(() => getBrandAssetNow(key));
}

async function getBrandAssetNow(key) {
  try {
    const db = await openDatabase();
    const record = await new Promise((resolve, reject) => {
      const request = db.transaction(BRAND_STORE).objectStore(BRAND_STORE).get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return blobFromRecord(record);
  } catch {
    reportBrandStorageUnavailable();
    return null;
  }
}

export function deleteBrandAsset(key) {
  forgetSessionUrl(key);
  if (!BRAND_KEYS.includes(key)) return Promise.resolve();
  return enqueue(() => deleteBrandAssetNow(key));
}

async function deleteBrandAssetNow(key) {
  try {
    const db = await openDatabase();
    const tx = db.transaction(BRAND_STORE, 'readwrite');
    tx.objectStore(BRAND_STORE).delete(key);
    await txDone(tx);
    db.close();
  } catch {
    reportBrandStorageUnavailable();
  }
}
