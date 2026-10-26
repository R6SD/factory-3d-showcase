/**
 * 设备拾取与状态着色的纯函数。
 * 状态色与详情侧栏共用 selectors.statusColor。
 * 改色前 clone 材质，记在 userData._statusOrig；clear 时恢复并释放 clone，避免共享材质串色。
 * 外载 GLB：节点 name 含设备 id 或中文名时写入 userData.equipmentId；对不上则不着色。
 * 默认工厂场景在 createFactoryModel 里已经打标。
 * 射线命中必须忽略自身或任一祖先 visible === false 的节点，拾取复用 firstVisibleHit。
 */
import { statusColor } from '../data/selectors.js';
import { VIEW_RESET_DOUBLE_TAP_PX } from './pointer-slop.js';

/** 选中时在状态色 emissiveIntensity 上略抬，关闭侧栏后回到状态色本身。 */
export const SELECTED_EMISSIVE_GAIN = 1.65;
const ORIG = '_statusOrig';

/** 对象以及每个祖先都可见才参与射线命中。 */
export function isHierarchyVisible(object) {
  let node = object;
  while (node) {
    if (node.visible === false) return false;
    node = node.parent;
  }
  return !!object;
}

/** 按距离顺序取第一个可见交点。不可见节点（含祖先隐藏）跳过。 */
export function firstVisibleHit(intersections) {
  if (!intersections) return null;
  for (const hit of intersections) {
    if (hit?.object && isHierarchyVisible(hit.object)) return hit;
  }
  return null;
}

/**
 * 是否把这次 click 当成设备拾取。
 * detail > 1 是双击的第二次，不改变选择，也不当成点空白清掉选择。
 * 位移超过 dragPx 是拖轨道。dragPx 默认就是双击归位的 VIEW_RESET_DOUBLE_TAP_PX。
 * 触屏没有 dblclick，两次点击的 detail 都是 1，这里不另做双击过滤。
 */
export function shouldPickEquipmentClick({
  detail = 1,
  distancePx = 0,
  dragPx = VIEW_RESET_DOUBLE_TAP_PX,
} = {}) {
  if (detail > 1) return false;
  return distancePx <= dragPx;
}

/** 从命中网格向上找最近一个带 equipmentId 的祖先（含自身）。 */
export function equipmentIdOf(object) {
  let node = object;
  while (node) {
    const id = node.userData?.equipmentId;
    if (id) return id;
    node = node.parent;
  }
  return null;
}

/**
 * 在 click 上拾取。pointer 事件的 detail 按规范恒为 0，不拿来计点击次数。
 * 鼠标双击的顺序是 pointerdown、pointerup、click(detail=1)，再来一轮后是 click(detail=2)、dblclick。
 * detail > 1 或拖过阈值时不调用 onSelect，因此不会改选择，也不会派发 null。
 * dblclick 本身不在这里监听。
 */
export function bindEquipmentClickGuard(target, {
  pick,
  onSelect,
  dragPx = VIEW_RESET_DOUBLE_TAP_PX,
} = {}) {
  let down = null;
  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    down = { x: event.clientX, y: event.clientY };
  };
  const onPointerCancel = () => {
    down = null;
  };
  const onClick = (event) => {
    const start = down;
    down = null;
    const distancePx = start ? Math.hypot(event.clientX - start.x, event.clientY - start.y) : Infinity;
    if (!shouldPickEquipmentClick({
      detail: event.detail,
      distancePx,
      dragPx,
    })) return;
    if (event.button !== 0) return;
    onSelect(pick(event));
  };
  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointercancel', onPointerCancel);
  target.addEventListener('click', onClick);
  return () => {
    target.removeEventListener('pointerdown', onPointerDown);
    target.removeEventListener('pointercancel', onPointerCancel);
    target.removeEventListener('click', onClick);
  };
}

/** setDeviceStatuses 的值可以是状态字符串，或 { status, name } 以便按中文名绑定外载模型。 */
export function normalizeStatusEntry(id, value) {
  if (value && typeof value === 'object') {
    return { id, status: value.status, name: value.name || '' };
  }
  return { id, status: value, name: '' };
}

/** 节点名模糊匹配设备 id（优先）或中文名。匹配不到返回 null。 */
export function matchEquipmentId(name, catalog) {
  const n = String(name || '').trim().toLowerCase();
  if (!n || !catalog?.length) return null;
  let nameHit = null;
  for (const device of catalog) {
    const id = String(device.id || '').trim().toLowerCase();
    if (id && (n === id || n.includes(id))) return device.id;
    const label = String(device.name || '').trim().toLowerCase();
    if (label.length >= 2 && (n === label || n.includes(label))) nameHit = nameHit || device.id;
  }
  return nameHit;
}

/** 给尚未打标的节点写入 equipmentId。返回新绑定数量。 */
export function bindEquipmentIds(root, catalog) {
  if (!root || !catalog?.length) return 0;
  let bound = 0;
  root.traverse((node) => {
    if (node.userData?.equipmentId) return;
    const id = matchEquipmentId(node.name, catalog);
    if (!id) return;
    node.userData.equipmentId = id;
    bound += 1;
  });
  return bound;
}

function materialsOf(material) {
  if (!material) return [];
  return Array.isArray(material) ? material.slice() : [material];
}

function disposeClones(current, original) {
  const keep = new Set(materialsOf(original));
  for (const material of materialsOf(current)) {
    if (material && !keep.has(material)) material.dispose?.();
  }
}

function cloneMaterial(material) {
  if (Array.isArray(material)) return material.map((m) => (m?.clone ? m.clone() : m));
  return material?.clone ? material.clone() : material;
}

function tintMaterial(material, spec, selected) {
  if (!material) return;
  if (spec.albedoScale !== 1 && material.color?.multiplyScalar) {
    material.color.multiplyScalar(spec.albedoScale);
  }
  if (material.emissive?.set) {
    material.emissive.set(spec.emissive);
    material.emissiveIntensity = spec.emissiveIntensity * (selected ? SELECTED_EMISSIVE_GAIN : 1);
  }
}

/** 线框时实体色在 origMat，mesh.material 是线框临时代质。点云时实体色在 origMat。 */
function underlyingSolid(mesh) {
  if (mesh.userData._pointsProxy && mesh.userData.origMat) return mesh.userData.origMat;
  if (mesh.userData.origMat && mesh.material !== mesh.userData.origMat) return mesh.userData.origMat;
  return mesh.material;
}

/**
 * 把实体材质写回去，保留当前显示模式。
 * 线框：不动线框材质，只换 origMat。
 * 点云：代理留着。还原到共享原材质时另做一份隐藏副本，避免把 visible=false 写进共享材质。
 */
function assignSolid(mesh, material, { pristine = false } = {}) {
  if (mesh.userData._pointsProxy) {
    const standIn = mesh.material && mesh.material !== mesh.userData.origMat ? mesh.material : null;
    if (pristine) {
      const hidden = cloneMaterial(material);
      for (const item of materialsOf(hidden)) if (item) item.visible = false;
      mesh.userData.origMat = material;
      mesh.material = hidden;
    } else {
      for (const item of materialsOf(material)) if (item) item.visible = false;
      mesh.userData.origMat = material;
      mesh.material = material;
    }
    if (standIn && standIn !== mesh.material) disposeClones(standIn, material);
    return;
  }
  if (mesh.userData.origMat && mesh.material !== mesh.userData.origMat) {
    mesh.userData.origMat = material;
    return;
  }
  mesh.material = material;
}

/**
 * 给单个网格套上状态色。已有备份时先丢掉上一份 clone，再从原材质重新 clone，避免叠乘 albedo。
 * 线框 / 点云模式下改的是实体材质，显示模式用的临时代质和点云代理保持不动。
 * 返回是否着色。未知状态不改材质。
 */
export function applyMeshStatus(mesh, status, { selected = false } = {}) {
  if (!mesh?.isMesh) return false;
  const spec = statusColor(status);
  if (!spec) return false;
  const solid = underlyingSolid(mesh);
  const original = mesh.userData[ORIG] || solid;
  if (mesh.userData[ORIG]) disposeClones(solid, original);
  mesh.userData[ORIG] = original;
  const next = cloneMaterial(original);
  for (const material of materialsOf(next)) {
    if (material) material.visible = true;
    tintMaterial(material, spec, selected);
  }
  assignSolid(mesh, next);
  return true;
}

/** 恢复 _statusOrig 并释放 clone。没有备份时不动。线框材质和点云代理不释放。 */
export function clearMeshStatus(mesh) {
  if (!mesh?.isMesh || !mesh.userData?.[ORIG]) return false;
  const original = mesh.userData[ORIG];
  const solid = underlyingSolid(mesh);
  delete mesh.userData[ORIG];
  assignSolid(mesh, original, { pristine: true });
  disposeClones(solid, original);
  return true;
}

export function restoreStatusMaterials(root) {
  if (!root?.traverse) return;
  root.traverse((node) => {
    if (node.isMesh) clearMeshStatus(node);
  });
}

/**
 * 先恢复整棵树上的状态材质，再按 equipmentId 重新着色。
 * 只给“最近设备 id 落在 catalog 里”的网格着色，未登记的网格保持原材质。
 */
export function paintEquipmentStatuses(root, catalog, selectedId) {
  restoreStatusMaterials(root);
  if (!root?.traverse || !catalog?.length) return;
  const byId = new Map(catalog.map((device) => [device.id, device.status]));
  root.traverse((node) => {
    if (!node.isMesh) return;
    const id = equipmentIdOf(node);
    if (!id || !byId.has(id)) return;
    applyMeshStatus(node, byId.get(id), { selected: id === selectedId });
  });
}
