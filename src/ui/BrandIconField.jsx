import React, { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useApp } from '../app-context.jsx';
import {
  ICON_DATA_URL_MAX,
  assertBrandImage,
  brandAssetRef,
  deleteBrandAsset,
  forgetSessionUrl,
  isIdbRef,
  objectUrlFromBlob,
  putBrandAsset,
  rememberSessionUrl,
} from '../data/brand-assets.js';
import { useBrandUrls } from './useBrandUrls.js';

const ACCEPT = 'image/png,image/jpeg,image/webp';

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

async function saveBlob(key, file) {
  try {
    await putBrandAsset(key, file);
    forgetSessionUrl(key);
  } catch {
    rememberSessionUrl(key, objectUrlFromBlob(file));
  }
}

export function ImageSlot({
  slot, label, hint, value, previewUrl, missing, error, clearLabel, onPick, onClear,
}) {
  return (
    <section className={`brand-icon-settings${slot === 'icon' ? '' : ' brand-slot-wide'}`}>
      <h3>{label}</h3>
      <p className="config-hint">{hint}</p>
      <div className="brand-icon-preview">
        {previewUrl ? <img alt="" src={previewUrl} /> : null}
      </div>
      {missing ? <p className="config-hint">{missing}</p> : null}
      {error ? <p className="config-hint" role="alert">{error}</p> : null}
      <input
        data-slot={slot}
        type="file"
        accept={ACCEPT}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onPick(file);
        }}
      />
      {(value || previewUrl) ? (
        <button type="button" onClick={onClear}>{clearLabel}</button>
      ) : null}
    </section>
  );
}

/** 品牌与外观：大标题、Logo、标题背景、主题背景。 */
export function BrandFields() {
  const { config, setConfig, t } = useApp();
  const branding = config.branding || {};
  const urls = useBrandUrls(branding);
  const [errors, setErrors] = useState({});

  const setBranding = (patch) => setConfig((x) => ({ ...x, branding: { ...x.branding, ...patch } }));

  const onPick = async (key, file) => {
    const check = assertBrandImage(file);
    if (!check.ok) {
      setErrors((prev) => ({
        ...prev,
        [key]: check.code === 'tooLarge' ? t.brandAssetTooLarge : t.brandAssetBadType,
      }));
      return;
    }
    setErrors((prev) => ({ ...prev, [key]: '' }));
    try {
      if (key === 'icon') {
        const dataUrl = await readAsDataUrl(file);
        if (dataUrl.length <= ICON_DATA_URL_MAX) {
          await deleteBrandAsset('icon');
          setBranding({ icon: dataUrl });
          return;
        }
      }
      await saveBlob(key, file);
      setBranding({ [key]: brandAssetRef(key, file) });
    } catch {
      setErrors((prev) => ({ ...prev, [key]: t.brandAssetBadType }));
    }
  };

  const onClear = async (key) => {
    await deleteBrandAsset(key);
    setErrors((prev) => ({ ...prev, [key]: '' }));
    setBranding({ [key]: key === 'icon' ? '' : null });
  };

  const missingText = (key, value, previewUrl) => (
    urls.ready && isIdbRef(value) && !previewUrl ? t.brandAssetMissing : ''
  );

  return (
    <div className="form">
      <label>
        {t.appTitle}
        <input
          value={branding.title || ''}
          onChange={(e) => setBranding({ title: e.target.value })}
        />
      </label>
      <p className="config-hint">{t.appTitleHint}</p>
      <ImageSlot
        slot="icon"
        label={t.brandLogo}
        hint={t.brandLogoHint}
        value={branding.icon}
        previewUrl={urls.logoUrl}
        missing={missingText('icon', branding.icon, urls.logoUrl)}
        error={errors.icon}
        clearLabel={t.clearImage}
        onPick={(file) => onPick('icon', file)}
        onClear={() => onClear('icon')}
      />
      <ImageSlot
        slot="titleBg"
        label={t.titleBg}
        hint={t.titleBgHint}
        value={branding.titleBg}
        previewUrl={urls.titleBgUrl}
        missing={missingText('titleBg', branding.titleBg, urls.titleBgUrl)}
        error={errors.titleBg}
        clearLabel={t.clearImage}
        onPick={(file) => onPick('titleBg', file)}
        onClear={() => onClear('titleBg')}
      />
      <ImageSlot
        slot="themeBg"
        label={t.themeBg}
        hint={t.themeBgHint}
        value={branding.themeBg}
        previewUrl={urls.themeBgUrl}
        missing={missingText('themeBg', branding.themeBg, urls.themeBgUrl)}
        error={errors.themeBg}
        clearLabel={t.clearImage}
        onPick={(file) => onPick('themeBg', file)}
        onClear={() => onClear('themeBg')}
      />
      <label>
        {t.theme}
        <div className="choice">
          <button type="button" className={config.theme === 'dark' ? 'active' : ''} onClick={() => setConfig((x) => ({ ...x, theme: 'dark' }))}><Moon />{t.themeDark}</button>
          <button type="button" className={config.theme === 'light' ? 'active' : ''} onClick={() => setConfig((x) => ({ ...x, theme: 'light' }))}><Sun />{t.themeLight}</button>
        </div>
      </label>
    </div>
  );
}
