import { useEffect, useState } from 'react';
import { getBrandAsset, isIdbRef, objectUrlFromBlob, sessionUrl } from '../data/brand-assets.js';

export function cssImageUrl(url) {
  if (!url) return '';
  return `url("${String(url).replace(/"/g, '%22')}")`;
}

function directUrl(value) {
  return typeof value === 'string' ? value : '';
}

function needsIdb(branding) {
  return isIdbRef(branding?.icon) || isIdbRef(branding?.titleBg) || isIdbRef(branding?.themeBg);
}

function slotDep(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return `s:${value}`;
  return `o:${value.store || ''}:${value.key || ''}:${value.name || ''}:${value.size || 0}`;
}

async function resolveSlot(value, key, created) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (!isIdbRef(value)) return '';
  const blob = await getBrandAsset(value.key || key);
  if (blob) {
    const url = objectUrlFromBlob(blob);
    created.push(url);
    return url;
  }
  return sessionUrl(value.key || key);
}

function syncUrls(branding, ready) {
  return {
    logoUrl: directUrl(branding?.icon),
    titleBgUrl: directUrl(branding?.titleBg),
    themeBgUrl: directUrl(branding?.themeBg),
    ready,
  };
}

/**
 * branding → 可给 img / CSS 用的对象 URL。
 * dataURL 字符串当帧就用；IndexedDB 描述读出 blob 后 createObjectURL，更换或卸载时 revoke。
 */
export function useBrandUrls(branding) {
  const token = `${slotDep(branding?.icon)}|${slotDep(branding?.titleBg)}|${slotDep(branding?.themeBg)}`;
  const idb = needsIdb(branding);
  const [loaded, setLoaded] = useState(null);

  useEffect(() => {
    if (!idb) return undefined;
    let cancelled = false;
    const created = [];
    (async () => {
      try {
        const [logoUrl, titleBgUrl, themeBgUrl] = await Promise.all([
          resolveSlot(branding?.icon, 'icon', created),
          resolveSlot(branding?.titleBg, 'titleBg', created),
          resolveSlot(branding?.themeBg, 'themeBg', created),
        ]);
        if (cancelled) {
          created.forEach((url) => URL.revokeObjectURL(url));
          return;
        }
        setLoaded({ logoUrl, titleBgUrl, themeBgUrl, ready: true, token });
      } catch {
        if (!cancelled) {
          setLoaded({ ...syncUrls(branding, true), token });
        }
      }
    })();
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
    // token 已覆盖三个槽位；标题文字变化不应重读 IndexedDB。
  }, [idb, token]);

  if (!idb || !loaded || loaded.token !== token) return syncUrls(branding, !idb);
  return loaded;
}

/** 主题背景只挂在壳层 `.app`，不写到 `.three`。 */
export function themeBgShell(themeBgUrl) {
  if (!themeBgUrl) return { className: '', style: undefined };
  return {
    className: ' has-theme-bg',
    style: { '--theme-bg': cssImageUrl(themeBgUrl) },
  };
}
