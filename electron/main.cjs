const { app, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Keep imported assets outside the temporary portable-app extraction folder.
if (app && typeof app.setPath === 'function') {
  app.setPath('userData', path.join(app.getPath('appData'), 'Factory Web3D Workbench'));
}

const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon', '.woff2':'font/woff2' };
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const MAX_MODEL_BYTES = 200 * 1024 * 1024;
const MAX_LABEL_BYTES = 512 * 1024;
const MAX_BUSINESS_BYTES = 2 * 1024 * 1024;
const MAX_CONFIG_BYTES = 1 * 1024 * 1024;
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
const LOCAL_PORT = 43891;
const MAX_PORT_RETRIES = 10;

const { safeModelName } = require('./safe-name.cjs');

// 图片文件名同样需要防目录穿越，复用 safe-name 的清洗规则并限制为图片扩展名
function safeImageName(raw) {
  const name = safeModelName(raw);
  if (!name) return '';
  return IMAGE_EXT.has(path.extname(name).toLowerCase()) ? name : '';
}

function handleModelApi(request, response, url, modelsDirectory) {
  const name = safeModelName(url.searchParams.get('name'));
  if (!name) {
    if (request.method !== 'GET') { response.writeHead(400); response.end('Invalid model name'); return; }
    fs.readdir(modelsDirectory, { withFileTypes: true }, (error, entries) => {
      if (error) { response.writeHead(500); response.end('Could not read model library'); return; }
      const models = entries.filter((entry) => entry.isFile() && ['.glb', '.gltf', '.fbx', '.obj'].includes(path.extname(entry.name).toLowerCase())).map((entry) => {
        const stat = fs.statSync(path.join(modelsDirectory, entry.name));
        return { name: entry.name, format: path.extname(entry.name).slice(1).toUpperCase(), size: stat.size, updated: stat.mtime.toLocaleDateString(), tag: '本地导入', available: true };
      });
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'X-Factory-Model-Store': '1' }); response.end(JSON.stringify(models));
    });
    return;
  }
  const target = path.join(modelsDirectory, name);
  if (request.method === 'GET') {
    fs.readFile(target, (error, content) => {
      if (error) { response.writeHead(404); response.end('Model not found'); return; }
      response.writeHead(200, { 'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Content-Disposition': `attachment; filename="${name}"`, 'X-Factory-Model-Store': '1' }); response.end(content);
    });
    return;
  }
  if (request.method === 'DELETE') {
    fs.unlink(target, (error) => { response.writeHead(error && error.code !== 'ENOENT' ? 500 : 204); response.end(); });
    return;
  }
  if (request.method !== 'POST' || Number(request.headers['content-length'] || 0) > MAX_MODEL_BYTES) { response.writeHead(413); response.end('Model is too large'); return; }
  let bytes = 0; let failed = false;
  const output = fs.createWriteStream(target);
  request.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > MAX_MODEL_BYTES && !failed) { failed = true; output.destroy(); request.destroy(); fs.unlink(target, () => {}); }
  });
  output.on('error', () => { if (!failed) { failed = true; response.writeHead(500); response.end('Could not save model'); } });
  output.on('finish', () => { if (!failed) { response.writeHead(201, { 'X-Factory-Model-Store': '1' }); response.end(); } });
  request.pipe(output);
}

// 照片库：GET 列表 / GET ?name 读取 / POST ?name 上传 / DELETE ?name 删除。
// 文件名即匹配键（前端按“姓名/工号 + 可选 -半身”在各处通用引用）。
function handlePhotoApi(request, response, url, photosDirectory) {
  const name = safeImageName(url.searchParams.get('name'));
  if (!name) {
    if (request.method !== 'GET') { response.writeHead(400); response.end('Invalid photo name'); return; }
    fs.readdir(photosDirectory, { withFileTypes: true }, (error, entries) => {
      if (error) { response.writeHead(500); response.end('Could not read photos'); return; }
      const photos = entries.filter((e) => e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase())).map((e) => {
        const stat = fs.statSync(path.join(photosDirectory, e.name));
        return { name: e.name, size: stat.size, updated: stat.mtime.toLocaleDateString() };
      });
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'X-Factory-Photo-Store': '1' });
      response.end(JSON.stringify(photos));
    });
    return;
  }
  const target = path.join(photosDirectory, name);
  if (request.method === 'GET') {
    fs.readFile(target, (error, content) => {
      if (error) { response.writeHead(404); response.end('Photo not found'); return; }
      response.writeHead(200, { 'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Factory-Photo-Store': '1' });
      response.end(content);
    });
    return;
  }
  if (request.method === 'DELETE') {
    fs.unlink(target, (error) => { response.writeHead(error && error.code !== 'ENOENT' ? 500 : 204); response.end(); });
    return;
  }
  if (request.method !== 'POST' || Number(request.headers['content-length'] || 0) > MAX_PHOTO_BYTES) { response.writeHead(413); response.end('Photo is too large'); return; }
  let bytes = 0; let failed = false;
  const output = fs.createWriteStream(target);
  request.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > MAX_PHOTO_BYTES && !failed) { failed = true; output.destroy(); request.destroy(); fs.unlink(target, () => {}); }
  });
  output.on('error', () => { if (!failed) { failed = true; response.writeHead(500); response.end('Could not save photo'); } });
  output.on('finish', () => { if (!failed) { response.writeHead(201, { 'X-Factory-Photo-Store': '1' }); response.end(); } });
  request.pipe(output);
}

function handleLabelsApi(request, response, labelsFile) {
  if (request.method === 'GET') {
    fs.readFile(labelsFile, 'utf8', (error, content) => {
      if (error) {
        if (error.code === 'ENOENT') { response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'X-Factory-Label-Store': '1' }); response.end('[]'); return; }
        response.writeHead(500); response.end('Could not read labels'); return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'X-Factory-Label-Store': '1' }); response.end(content);
    });
    return;
  }
  if (request.method !== 'POST') { response.writeHead(405); response.end('Method not allowed'); return; }
  if (Number(request.headers['content-length'] || 0) > MAX_LABEL_BYTES) { response.writeHead(413); response.end('Labels data too large'); return; }
  let body = '';
  request.on('data', (chunk) => { body += chunk; if (body.length > MAX_LABEL_BYTES) { request.destroy(); } });
  request.on('end', () => {
    try { JSON.parse(body); } catch { response.writeHead(400); response.end('Invalid JSON'); return; }
    fs.writeFile(labelsFile, body, 'utf8', (error) => {
      if (error) { response.writeHead(500); response.end('Could not save labels'); return; }
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'X-Factory-Label-Store': '1' }); response.end('{"ok":true}');
    });
  });
}

// 业务数据（产能/场地/人员/组织）整库读写：GET 读取，PUT 整份落盘。
// 前端首次访问空库时会用内置种子回填；数据模型由前端掌握，后端只做通用持久化，便于日后替换为 MES/IoT/HR。
function handleBusinessApi(request, response, businessFile) {
  if (request.method === 'GET') {
    fs.readFile(businessFile, 'utf8', (error, content) => {
      if (error) {
        if (error.code === 'ENOENT') {
          response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'X-Factory-Data-Store': '1' });
          response.end('null');
          return;
        }
        response.writeHead(500); response.end('Could not read business data'); return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'X-Factory-Data-Store': '1' });
      response.end(content);
    });
    return;
  }
  if (request.method !== 'PUT') { response.writeHead(405); response.end('Method not allowed'); return; }
  if (Number(request.headers['content-length'] || 0) > MAX_BUSINESS_BYTES) {
    response.writeHead(413); response.end('Business data too large'); return;
  }
  let body = '';
  request.on('data', (chunk) => { body += chunk; if (body.length > MAX_BUSINESS_BYTES) request.destroy(); });
  request.on('end', () => {
    try { JSON.parse(body); } catch { response.writeHead(400); response.end('Invalid JSON'); return; }
    fs.writeFile(businessFile, body, 'utf8', (error) => {
      if (error) { response.writeHead(500); response.end('Could not save business data'); return; }
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'X-Factory-Data-Store': '1' });
      response.end('{"ok":true}');
    });
  });
}

// 工作台配置（场景/品牌/导航/模型库登记等）：展示端只读，后台 /admin 编辑后整份落盘。
function handleConfigApi(request, response, configFile) {
  if (request.method === 'GET') {
    fs.readFile(configFile, 'utf8', (error, content) => {
      if (error) {
        if (error.code === 'ENOENT') {
          response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'X-Factory-Config-Store': '1' });
          response.end('null');
          return;
        }
        response.writeHead(500); response.end('Could not read config'); return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'X-Factory-Config-Store': '1' });
      response.end(content);
    });
    return;
  }
  if (request.method !== 'PUT') { response.writeHead(405); response.end('Method not allowed'); return; }
  if (Number(request.headers['content-length'] || 0) > MAX_CONFIG_BYTES) {
    response.writeHead(413); response.end('Config too large'); return;
  }
  let body = '';
  request.on('data', (chunk) => { body += chunk; if (body.length > MAX_CONFIG_BYTES) request.destroy(); });
  request.on('end', () => {
    try { JSON.parse(body); } catch { response.writeHead(400); response.end('Invalid JSON'); return; }
    fs.writeFile(configFile, body, 'utf8', (error) => {
      if (error) { response.writeHead(500); response.end('Could not save config'); return; }
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'X-Factory-Config-Store': '1' });
      response.end('{"ok":true}');
    });
  });
}

/**
 * 创建本地 HTTP 服务（不监听端口），目录可注入，便于纯 Node 自动化测试。
 * @param {{appRoot:string,userDataDir:string}} opts
 */
function createWorkbenchServer({ appRoot, userDataDir }) {
  const modelsDirectory = path.join(userDataDir, 'models');
  const photosDirectory = path.join(userDataDir, 'photos');
  const labelsFile = path.join(userDataDir, 'labels.json');
  const businessFile = path.join(userDataDir, 'business.json');
  const configFile = path.join(userDataDir, 'config.json');
  fs.mkdirSync(modelsDirectory, { recursive: true });
  fs.mkdirSync(photosDirectory, { recursive: true });
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/api/close' && request.method === 'POST') {
      response.writeHead(204); response.end();
      setTimeout(() => server.close(() => { try { app?.quit?.(); } catch { /* 测试环境无 app */ } }), 150);
      return;
    }
    if (url.pathname === '/api/models') { handleModelApi(request, response, url, modelsDirectory); return; }
    if (url.pathname === '/api/photos') { handlePhotoApi(request, response, url, photosDirectory); return; }
    if (url.pathname === '/api/labels') { handleLabelsApi(request, response, labelsFile); return; }
    if (url.pathname === '/api/data/business') { handleBusinessApi(request, response, businessFile); return; }
    if (url.pathname === '/api/config') { handleConfigApi(request, response, configFile); return; }
    // 畸形百分号编码（如 /%zz）会让 decodeURIComponent 抛 URIError，需兜住避免冲垮整个本地服务
    let rawPath;
    try {
      rawPath = decodeURIComponent(url.pathname);
    } catch {
      response.writeHead(400); response.end('Bad request'); return;
    }
    const relativePath = rawPath === '/' ? 'index.html' : rawPath.replace(/^[/\\]+/, '');
    const target = path.resolve(appRoot, relativePath);
    // 必须是 appRoot 本身或其直接子路径，防止 dist-evil 等同名前缀目录绕过
    if (target !== appRoot && !target.startsWith(appRoot + path.sep)) { response.writeHead(403); response.end(); return; }
    fs.readFile(target, (error, content) => {
      if (error) {
        fs.readFile(path.join(appRoot, 'index.html'), (fallbackError, fallback) => {
          if (fallbackError) { response.writeHead(404); response.end('Not found'); return; }
          response.writeHead(200, { 'Content-Type': mime['.html'], 'Cache-Control': 'no-store' }); response.end(fallback);
        });
        return;
      }
      response.writeHead(200, { 'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(content);
    });
  });
  return server;
}

function startLocalServer() {
  const appRoot = app.isPackaged ? path.join(app.getAppPath(), 'dist') : path.join(__dirname, '..', 'dist');
  const userDataDir = app.getPath('userData');
  let port = LOCAL_PORT;
  let retries = 0;
  const server = createWorkbenchServer({ appRoot, userDataDir });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && retries < MAX_PORT_RETRIES) {
      retries++;
      port++;
      server.listen(port, '127.0.0.1');
    } else {
      console.error('Failed to start local server:', err.message);
      app.quit();
    }
  });
  // A stable local origin is required for browser localStorage and IndexedDB.
  server.listen(port, '127.0.0.1', () => shell.openExternal(`http://127.0.0.1:${port}/`));
}

// 仅在作为 Electron 主进程入口时自动启动；被普通 Node require（自动化测试）时只导出工厂。
if (require.main === module && app && typeof app.whenReady === 'function') {
  app.whenReady().then(startLocalServer);
}

module.exports = { createWorkbenchServer, handlePhotoApi, handleConfigApi, LOCAL_PORT };
