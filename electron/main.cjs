const { app, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Keep imported assets outside the temporary portable-app extraction folder.
app.setPath('userData', path.join(app.getPath('appData'), 'Factory Web3D Workbench'));

const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon', '.woff2':'font/woff2' };
const MAX_MODEL_BYTES = 200 * 1024 * 1024;
const MAX_LABEL_BYTES = 512 * 1024;
const LOCAL_PORT = 43891;
const MAX_PORT_RETRIES = 10;

function safeModelName(value) {
  const name = path.basename(String(value || '')).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  return name && name !== '.' && name !== '..' ? name : null;
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

function startLocalServer() {
  const appRoot = app.isPackaged ? path.join(app.getAppPath(), 'dist') : path.join(__dirname, '..', 'dist');
  const modelsDirectory = path.join(app.getPath('userData'), 'models');
  const labelsFile = path.join(app.getPath('userData'), 'labels.json');
  fs.mkdirSync(modelsDirectory, { recursive: true });
  let server;
  server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/api/close' && request.method === 'POST') {
      response.writeHead(204); response.end();
      setTimeout(() => server.close(() => app.quit()), 150);
      return;
    }
    if (url.pathname === '/api/models') { handleModelApi(request, response, url, modelsDirectory); return; }
    if (url.pathname === '/api/labels') { handleLabelsApi(request, response, labelsFile); return; }
    const rawPath = decodeURIComponent(url.pathname);
    const relativePath = rawPath === '/' ? 'index.html' : rawPath.replace(/^[/\\]+/, '');
    const target = path.resolve(appRoot, relativePath);
    if (!target.startsWith(appRoot)) { response.writeHead(403); response.end(); return; }
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
  // A stable local origin is required for browser localStorage and IndexedDB.
  // Random ports make each launch look like a different website and lose labels.
  let port = LOCAL_PORT;
  let retries = 0;
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
  server.listen(port, '127.0.0.1', () => shell.openExternal(`http://127.0.0.1:${port}/`));
}

app.whenReady().then(() => {
  startLocalServer();
});
