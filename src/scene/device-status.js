/**
 * 设备拾取与状态着色的纯函数。
 * 状态色与详情侧栏共用 selectors.statusColor。
 * 改色前 clone 材质，记在 userData._statusOrig；clear 时恢复并释放 clone，避免共享材质串色。
 * 外载 GLB：节点 name 含设备 id 或中文名时写入 userData.equipmentId；对不上则不着色。
 * 默认工厂场景在 createFactoryModel 里已经打标。
 * 射线命中必须忽略自身或任一祖先 visible === false 的节点，拾取复用 firstVisibleHit。
 */
import { statusColor } from '../data/selectors.js';

/**
 * 按下到 click 的位移超过该像素视为拖轨道。拖轨道也会冒出 click，不拾取。
 * 与双击归位的触屏双击位移同为 30px；等于阈值仍算点击。
 */
export const EQUIPMENT_PICK_DRAG_PX = 30;
/**
 * 单击提交前的等待。双击的第二次 click（detail > 1）会在这段时间内到来，
 * 取消尚未提交的拾取，侧栏不会闪一下。
 */
export const EQUIPMENT_CLICK_SETTLE_MS = 600;
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
 * detail > 1 是双击的第二次，不改变选择。位移超过 dragPx 是拖轨道。
 * isDoubleTap 留给触屏：触屏没有 dblclick，click.detail 不会变成 2。
 * #23 的 isViewResetDoubleTap 尚未作为依赖接入，合入后把判定结果传给 isDoubleTap。
 */
export function shouldPickEquipmentClick({
  detail = 1,
  distancePx = 0,
  dragPx = EQUIPMENT_PICK_DRAG_PX,
  isDoubleTap = false,
} = {}) {
  if (isDoubleTap) return false;
  if (detail > 1) return false;
  return distancePx <= dragPx;
}

/**
 * 从命中网格向上找最近一个带 equipmentId 的祖先（含自身）。
 * skipHidden：拾取射线向上走时跳过 visible === false 的节点，不采用其 equipmentId。
 */
export function equipmentIdOf(object, { skipHidden = false } = {}) {
  let node = object;
  while (node) {
    if (skipHidden && node.visible === false) {
      node = node.parent;
      continue;
    }
    const id = node.userData?.equipmentId;
    if (id) return id;
    node = node.parent;
  }
  return null;
}

/**
 * 把单击推迟到 settle 窗口结束。click.detail > 1 时取消，不调用 pick。
 */
export function createEquipmentPickGate(settleMs = EQUIPMENT_CLICK_SETTLE_MS) {
  let timer = null;
  const cancel = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return {
    cancel,
    click(event, pick) {
      if (event?.detail > 1) {
        cancel();
        return;
      }
      cancel();
      timer = setTimeout(() => {
        timer = null;
        pick();
      }, settleMs);
    },
    dispose: cancel,
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

/**
 * 给单个网格套上状态色。已有备份时先丢掉上一份 clone，再从原材质重新 clone，避免叠乘 albedo。
 * 返回是否着色。未知状态不改材质。
 */
export function applyMeshStatus(mesh, status, { selected = false } = {}) {
  if (!mesh?.isMesh) return false;
  const spec = statusColor(status);
  if (!spec) return false;
  const original = mesh.userData[ORIG] || mesh.material;
  if (mesh.userData[ORIG]) disposeClones(mesh.material, original);
  mesh.userData[ORIG] = original;
  mesh.material = cloneMaterial(original);
  for (const material of materialsOf(mesh.material)) tintMaterial(material, spec, selected);
  return true;
}

/** 恢复 _statusOrig 并释放 clone。没有备份时不动。 */
export function clearMeshStatus(mesh) {
  if (!mesh?.isMesh || !mesh.userData?.[ORIG]) return false;
  const original = mesh.userData[ORIG];
  const current = mesh.material;
  mesh.material = original;
  delete mesh.userData[ORIG];
  disposeClones(current, original);
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

/**
 * 在画布上登记拾取监听，返回卸下函数。pointercancel 只清掉按下状态，不拾取。
 */
export function bindEquipmentPick(target, handlers) {
  const down = (event) => handlers.onDown(event);
  const up = (event) => handlers.onUp?.(event);
  const cancel = (event) => handlers.onCancel?.(event);
  const click = (event) => handlers.onClick?.(event);
  target.addEventListener('pointerdown', down);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', cancel);
  target.addEventListener('click', click);
  return () => {
    target.removeEventListener('pointerdown', down);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', cancel);
    target.removeEventListener('click', click);
  };
}
