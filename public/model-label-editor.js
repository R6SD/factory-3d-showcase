const LABEL_STORE = 'factory-model-floating-labels-v4';
const LABEL_DEFAULT_MODEL = '__factory_default__';
const DEFAULT_OFFSET = { x: 58, y: -48 };
const SVG_NS = 'http://www.w3.org/2000/svg';

function activeModel() { return localStorage.getItem('factory-active-model') || LABEL_DEFAULT_MODEL; }

function migrateLegacyLabels() {
  try {
    const v3 = JSON.parse(localStorage.getItem('factory-model-floating-labels-v3') || '[]');
    if (Array.isArray(v3) && v3.length) {
      const migrated = v3.map((item) => ({
        id: item.id,
        model: item.model || activeModel(),
        text: item.text || '未命名标签',
        local: item.local,
        offset: item.offset || { ...DEFAULT_OFFSET },
      })).filter((item) => item.local);
      if (migrated.length) {
        localStorage.setItem(LABEL_STORE, JSON.stringify(migrated));
        localStorage.removeItem('factory-model-floating-labels-v3');
      }
      return migrated;
    }
  } catch {}
  try {
    const v2 = JSON.parse(localStorage.getItem('factory-model-floating-labels-v2') || '[]');
    if (Array.isArray(v2) && v2.length) {
      const migrated = v2.filter((item) => item?.world).map((item) => ({
        id: item.id,
        model: activeModel(),
        text: item.text || '未命名标签',
        local: item.world,
        offset: { ...DEFAULT_OFFSET },
      }));
      if (migrated.length) {
        localStorage.setItem(LABEL_STORE, JSON.stringify(migrated));
        localStorage.removeItem('factory-model-floating-labels-v2');
      }
      return migrated;
    }
  } catch {}
  return [];
}

function readLabels() {
  try {
    const saved = localStorage.getItem(LABEL_STORE);
    if (saved) {
      const value = JSON.parse(saved);
      if (Array.isArray(value) && value.every((item) => item && item.model && item.local)) {
        return value.map((item) => ({ ...item, offset: item.offset || { ...DEFAULT_OFFSET } }));
      }
    }
    return migrateLegacyLabels();
  } catch { return []; }
}
function writeLabels(labels) {
  localStorage.setItem(LABEL_STORE, JSON.stringify(labels));
  scheduleBackendSync(labels);
}

let syncTimer = null;
function scheduleBackendSync(labels) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    fetch('/api/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(labels),
    }).catch(() => {});
  }, 400);
}

async function loadLabelsFromBackend() {
  try {
    const response = await fetch('/api/labels');
    if (response.ok && response.headers.get('X-Factory-Label-Store') === '1') {
      const data = await response.json();
      if (Array.isArray(data) && data.length) {
        return data.map((item) => ({ ...item, offset: item.offset || { ...DEFAULT_OFFSET } }));
      }
    }
  } catch {}
  return null;
}

function mountLabelEditor() {
  const viewer = document.querySelector('.viewer');
  const runtime = window.__factorySceneRuntime;
  if (!viewer || !runtime || viewer.dataset.labelEditorReady) return;
  viewer.dataset.labelEditorReady = 'true';

  let labels = readLabels();
  let drag = null;
  let _raycaster = null, _pointer = null;

  const layer = document.createElement('div');
  layer.className = 'model-label-layer';

  const editor = document.createElement('section');
  editor.className = 'model-label-editor';
  editor.hidden = true;
  layer.append(editor);
  viewer.append(layer);

  const labelsForActiveModel = () => labels.filter((item) => item.model === activeModel());

  const closeEditor = () => { editor.hidden = true; };

  function placeEditor(point) {
    const box = viewer.getBoundingClientRect();
    editor.style.left = `${Math.min(box.width - 240, Math.max(12, point.x + 14))}px`;
    editor.style.top = `${Math.min(box.height - 190, Math.max(12, point.y + 14))}px`;
  }

  function openEditor(id, point) {
    const item = labels.find((label) => label.id === id);
    if (!item) return closeEditor();
    editor.hidden = false;
    editor.replaceChildren();
    placeEditor(point || { x: 24, y: 24 });

    const heading = document.createElement('b');
    heading.textContent = '编辑悬浮标签';
    const hint = document.createElement('small');
    hint.textContent = '地图钉固定在模型表面，拖动标签可调整高度，旋转模型时标签始终可见。';

    const field = document.createElement('label');
    field.textContent = '标签内容';
    const input = document.createElement('input');
    input.value = item.text;
    input.maxLength = 32;
    input.addEventListener('input', () => {
      item.text = input.value.trim() || '未命名标签';
      writeLabels(labels);
      const tag = layer.querySelector(`[data-id="${item.id}"]`);
      if (tag) tag.querySelector('.pin-text').textContent = item.text;
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); closeEditor(); }
    });
    field.append(input);

    const done = document.createElement('button');
    done.type = 'button';
    done.textContent = '完成';
    done.addEventListener('click', closeEditor);

    const resetPos = document.createElement('button');
    resetPos.type = 'button';
    resetPos.textContent = '复位位置';
    resetPos.addEventListener('click', () => {
      item.offset = { ...DEFAULT_OFFSET };
      writeLabels(labels);
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = '删除标签';
    remove.addEventListener('click', () => {
      labels = labels.filter((label) => label.id !== id);
      writeLabels(labels);
      closeEditor();
      renderLabels();
    });

    editor.append(heading, hint, field, done, resetPos, remove);
    input.focus();
    input.select();
  }

  editor.addEventListener('pointerdown', (event) => event.stopPropagation());
  editor.addEventListener('focusout', () => setTimeout(() => {
    if (!editor.contains(document.activeElement)) closeEditor();
  }, 0));

  function raycast(event) {
    const model = runtime.getModel();
    if (!model) return null;
    if (!_raycaster) { _raycaster = new runtime.THREE.Raycaster(); _pointer = new runtime.THREE.Vector2(); }
    const bounds = viewer.getBoundingClientRect();
    _pointer.set(
      (event.clientX - bounds.left) / bounds.width * 2 - 1,
      -(event.clientY - bounds.top) / bounds.height * 2 + 1
    );
    _raycaster.setFromCamera(_pointer, runtime.camera);
    const hit = _raycaster.intersectObject(model, true)[0];
    if (!hit) return null;
    model.updateWorldMatrix(true, false);
    const local = model.worldToLocal(hit.point.clone());
    return { local: { x: local.x, y: local.y, z: local.z } };
  }

  function projectAnchor(label) {
    const model = runtime.getModel();
    if (!model) return null;
    model.updateWorldMatrix(true, false);
    const world = model.localToWorld(
      new runtime.THREE.Vector3(label.local.x, label.local.y, label.local.z)
    );
    const point = world.project(runtime.camera);
    if (point.z < -1 || point.z > 1) return null;
    const box = viewer.getBoundingClientRect();
    return {
      x: (point.x + 1) * 0.5 * box.width,
      y: (1 - point.y) * 0.5 * box.height,
      world,
    };
  }

  function moveTag(tag, label) {
    const anchor = projectAnchor(label);
    if (!anchor) {
      tag.style.display = 'none';
      return { visible: false, anchor: null };
    }
    tag.style.display = '';
    // 地图钉：标签底部对齐锚点，圆点固定在模型表面
    tag.style.left = `${anchor.x}px`;
    tag.style.top = `${anchor.y}px`;
    return { visible: true, anchor };
  }

  function renderLabels() {
    [...layer.querySelectorAll('.model-map-pin')].forEach((node) => node.remove());

    labelsForActiveModel().forEach((label) => {
      const tag = document.createElement('button');
      tag.type = 'button';
      tag.className = 'model-map-pin';
      tag.dataset.id = label.id;
      tag.innerHTML = '<div class="pin-label"><span class="pin-text"></span></div><div class="pin-tail"></div><div class="pin-dot"></div>';
      tag.querySelector('.pin-text').textContent = label.text;

      tag.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        drag = { id: label.id, moved: false, startX: event.clientX, startY: event.clientY };
        tag.setPointerCapture(event.pointerId);
        tag.classList.add('dragging');
      });

      tag.addEventListener('pointermove', (event) => {
        if (!drag || drag.id !== label.id) return;
        const anchor = projectAnchor(label);
        if (!anchor) return;
        const box = viewer.getBoundingClientRect();
        const mouseX = event.clientX - box.left;
        const mouseY = event.clientY - box.top;
        // 地图钉模式下，拖动调整标签相对于锚点的垂直偏移
        label.offset = {
          x: 0,
          y: Math.round(anchor.y - mouseY),
        };
        drag.moved = true;
        moveTag(tag, label);
      });

      tag.addEventListener('pointerup', (event) => {
        if (!drag || drag.id !== label.id) return;
        tag.releasePointerCapture?.(event.pointerId);
        tag.classList.remove('dragging');
        const moved = drag.moved;
        drag = null;
        writeLabels(labels);
        if (!moved) {
          const box = viewer.getBoundingClientRect();
          openEditor(label.id, { x: event.clientX - box.left, y: event.clientY - box.top });
        }
      });

      tag.addEventListener('pointercancel', () => {
        if (drag && drag.id === label.id) {
          tag.classList.remove('dragging');
          drag = null;
        }
      });

      tag.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const box = viewer.getBoundingClientRect();
        openEditor(label.id, { x: event.clientX - box.left, y: event.clientY - box.top });
      });

      layer.append(tag);
      // 必须在元素加入 DOM 后再计算位置
      requestAnimationFrame(() => {
        moveTag(tag, label);
      });
    });
    scheduleFollow();
  }

  viewer.addEventListener('contextmenu', (event) => {
    if (event.target.closest('.model-label-editor, .view-actions, .importer, .model-map-pin')) return;
    event.preventDefault();
    const point = raycast(event);
    if (!point) return;
    const label = {
      id: `label-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      model: activeModel(),
      text: '新标签',
      local: point.local,
      offset: { ...DEFAULT_OFFSET },
    };
    labels.push(label);
    writeLabels(labels);
    renderLabels();
    const box = viewer.getBoundingClientRect();
    openEditor(label.id, { x: event.clientX - box.left, y: event.clientY - box.top });
  }, true);

  const refresh = () => {
    closeEditor();
    labels = readLabels();
    renderLabels();
  };
  window.addEventListener('factory-active-model-change', refresh);

  const follow = () => {
    const activeLabels = labelsForActiveModel();
    if (activeLabels.length > 0 && !document.hidden) {
      activeLabels.forEach((label) => {
        const tag = layer.querySelector(`[data-id="${label.id}"]`);
        if (tag && !drag) {
          moveTag(tag, label);
        }
      });
      requestAnimationFrame(follow);
    } else {
      // 无标签或页面隐藏时暂停循环，renderLabels/visibilitychange 时重启
      follow._scheduled = false;
    }
  };
  follow._scheduled = false;
  const scheduleFollow = () => { if (!follow._scheduled) { follow._scheduled = true; requestAnimationFrame(follow); } };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleFollow(); });

  renderLabels();
  scheduleFollow();

  const viewActions = viewer.querySelector('.view-actions');
  if (viewActions && !viewActions.querySelector('.label-toggle')) {
    const toggle = document.createElement('button');
    toggle.className = 'label-toggle';
    toggle.type = 'button';
    toggle.innerHTML = '<span class="label-toggle-icon"></span><span class="label-toggle-text">标注</span>';
    toggle.title = '显示/隐藏悬浮标签';
    toggle.addEventListener('click', () => {
      viewer.classList.toggle('labels-hidden');
      toggle.classList.toggle('inactive', viewer.classList.contains('labels-hidden'));
    });
    viewActions.insertBefore(toggle, viewActions.firstChild);
  }

  loadLabelsFromBackend().then((backendLabels) => {
    if (!backendLabels || !backendLabels.length) return;
    const byId = new Map();
    backendLabels.forEach((l) => byId.set(l.id, l));
    labels.forEach((l) => { if (!byId.has(l.id)) byId.set(l.id, l); });
    labels = Array.from(byId.values());
    localStorage.setItem(LABEL_STORE, JSON.stringify(labels));
    renderLabels();
  }).catch(() => {});
}

window.addEventListener('factory-scene-ready', mountLabelEditor);
new MutationObserver(mountLabelEditor).observe(document.documentElement, { childList: true, subtree: true });
mountLabelEditor();
