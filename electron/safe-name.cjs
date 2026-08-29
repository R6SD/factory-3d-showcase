// 模型文件名净化：剥离路径、替换 Windows 非法字符。供 HTTP API 与单元测试共用。
const path = require('node:path');

function safeModelName(value) {
  const name = path.basename(String(value || '')).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  return name && name !== '.' && name !== '..' ? name : null;
}

module.exports = { safeModelName };
