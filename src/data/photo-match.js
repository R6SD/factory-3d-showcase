/**
 * photo-match.js — 照片库按文件名匹配人员的纯函数（组织关系、产能看板共用）。
 * 命名约定：
 *   大头照 「姓名.jpg」或「工号.jpg」，如 赵磊.jpg / E-1022.jpg
 *   半身照 「姓名-半身.jpg」「姓名-half.jpg」（工号同理），如 赵磊-半身.jpg
 * 人员记录也可用 photo / photoHalf 字段显式指定文件名（优先级最高）。
 */
export const HALF_SUFFIX = /-(半身|half)$/i;

/**
 * @param {Array<{name:string}>} list 照片库列表
 * @param {{name?:string,id?:string,photo?:string,photoHalf?:string}} person 人员
 * @param {'head'|'half'} mode 大头照 / 半身照
 * @returns {string} 命中的文件名，未命中返回 ''
 */
export function photoFileOf(list, person, mode) {
  if (!person) return '';
  const explicit = mode === 'half' ? person.photoHalf : person.photo;
  if (explicit) return explicit;
  if (!Array.isArray(list)) return '';
  const keys = [person.name, person.id].filter(Boolean);
  const hit = list.find((f) => {
    const base = String(f.name || '').replace(/\.[^.]+$/, '');
    const isHalf = HALF_SUFFIX.test(base);
    const stem = base.replace(HALF_SUFFIX, '');
    if (mode === 'half') return isHalf && keys.includes(stem);
    return !isHalf && keys.includes(stem);
  });
  return hit?.name || '';
}
