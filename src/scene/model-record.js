// 模型库记录的合并工具（纯函数，便于单测）。
// 修复缺陷：模型重新载入 / 从 IndexedDB 恢复时，若用文件元数据直接覆盖旧记录，
// 会丢掉用户在模型库设置的别名 alias。统一在此处“文件字段为准、用户字段保留”。

/**
 * 合并一条模型记录：以新的文件元数据 meta 为准，但保留旧记录 prev 上的用户自定义字段（alias）。
 * @param {object|null|undefined} prev 列表中同名的旧记录
 * @param {object} meta 新的文件元数据（至少含 name）
 * @returns {object}
 */
export function mergeModelRecord(prev, meta) {
  const merged = { ...(prev || {}), ...meta };
  if (prev && typeof prev.alias === 'string' && prev.alias.trim()) {
    merged.alias = prev.alias; // 用户别名有效：保留
  } else {
    delete merged.alias; // 无有效别名：移除残留（含空白字符串）
  }
  return merged;
}

/**
 * 在模型列表中按 name 做 upsert：同名记录用合并结果替换（保留别名），否则追加。返回新数组，不改原数组。
 * @param {Array<object>} models
 * @param {object} meta 至少含 name
 * @returns {Array<object>}
 */
export function upsertModel(models, meta) {
  const list = Array.isArray(models) ? models : [];
  const prev = list.find((m) => m.name === meta.name);
  const merged = mergeModelRecord(prev, meta);
  return [...list.filter((m) => m.name !== meta.name), merged];
}
