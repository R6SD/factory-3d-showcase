const STORE_KEY = 'factory-workbench-v4';

function storedConfig() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; }
}

function viewerTitle() {
  return storedConfig().viewer || {};
}

// 存在“真实活动模型”时，居中 h2 应由 React 显示模型名（见 src/scene/viewer-title.js 的 pickHomeTitle）。
// 此时命令式写 h2 会把模型名覆盖成自定义标题，造成“模型名称没有同步显示”，故这些标识之外才允许脚本写标题。
function activeModelName() {
  const name = localStorage.getItem('factory-active-model');
  return name && name !== '__factory_default__' && name !== 'Factory Campus A.glb' ? name : null;
}

function updateTitle(viewer = viewerTitle()) {
  const bar = document.querySelector('.viewer-top');
  if (!bar) return;
  const eyebrow = bar.querySelector('small');
  const title = bar.querySelector('h2');
  if (eyebrow && viewer.eyebrow && eyebrow.textContent !== viewer.eyebrow) eyebrow.textContent = viewer.eyebrow;
  // 加载着真实模型时，h2 显示模型名，脚本不得覆盖（切换回默认模型后 React 会渲染自定义标题）
  if (activeModelName()) return;
  const nextTitle = storedConfig().language === 'en' ? (viewer.titleEn || viewer.title || title?.textContent) : (viewer.title || title?.textContent);
  if (title && nextTitle && title.textContent !== nextTitle) title.textContent = nextTitle;
}

function createField(label, key, fallback) {
  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  const input = document.createElement('input');
  input.value = viewerTitle()[key] || fallback;
  input.addEventListener('input', () => {
    const next = { ...viewerTitle(), [key]: input.value };
    window.dispatchEvent(new CustomEvent('factory-viewer-title-change', { detail: next }));
    updateTitle(next);
  });
  labelEl.append(input);
  return labelEl;
}

function installSettingsTitleEditor() {
  const settings = document.querySelector('.settings');
  const brandTab = [...document.querySelectorAll('.settings nav button')].find((button) => button.textContent.includes('品牌') || button.textContent.includes('Brand'));
  const form = settings?.querySelector('.form');
  if (!settings || !brandTab?.classList.contains('active') || !form) return false;
  // 已安装视为完成（返回 true），观察器才能在设置页就绪后断开
  if (form.querySelector('.viewer-title-settings')) return true;
  const group = document.createElement('section');
  group.className = 'viewer-title-settings';
  group.innerHTML = '<h3>工作台居中标题</h3><p>修改后会立即应用到三维工作台，并保存在当前浏览器。</p>';
  group.append(createField('英文副标题', 'eyebrow', 'FACTORY DIGITAL TWIN'), createField('中文标题', 'title', '厂区三维工作台'), createField('英文标题', 'titleEn', '3D Campus Workbench'));
  form.querySelector('label:last-of-type')?.before(group);
  return true;
}

let _titleObserver = null;
function _tryInitAndDisconnect() {
  updateTitle();
  const settingsDone = installSettingsTitleEditor() !== false;
  if (settingsDone && _titleObserver) { _titleObserver.disconnect(); _titleObserver = null; }
}
_titleObserver = new MutationObserver(_tryInitAndDisconnect);
_titleObserver.observe(document.documentElement, { childList: true, subtree: true });
updateTitle();
installSettingsTitleEditor();
