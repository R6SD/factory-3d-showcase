// 模型文件名净化：剥离路径、替换 Windows 非法字符。供 HTTP API 与单元测试共用。
const path = require('node:path');

function safeModelName(value) {
  // POSIX basename 不把 \ 当分隔符；先统一成 /，Windows 路径只保留文件名且不改变 win32 剥离结果。
  const name = path.basename(String(value || '').replace(/\\/g, '/')).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  return name && name !== '.' && name !== '..' ? name : null;
}

module.exports = { safeModelName };
