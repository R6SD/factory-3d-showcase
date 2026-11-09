/**
 * happy-dom 的 getBoundingClientRect 恒为 0，所以用本机 Chrome 量铭牌和时钟的间隙。
 * 没有 Chrome 时跳过。GitHub ubuntu 镜像现在自带 google-chrome，这个用例会在 CI 里真的跑。
 *
 * 包装脚本会把 stdout/stderr 转给 cat，调试端口的 fetch 又没有超时；页面还要再等一次
 * Page.loadEventFired。这两处在 runner 上会一直挂着，直到撞上 Vitest 默认的 5s。
 * 指定 --remote-debugging-port 时，127.0.0.1 和 ::1 都绑不上就不会开调试服务，进程也不退出。
 * CI 上那个随机端口经常绑不上，于是只能干等。端口写 0 让系统分配，真正的端口记在
 * 用户目录的 DevToolsActivePort 里。stderr 落到文件，起不来时把 Chrome 的日志和退出码带出来。
 */
import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { reserveActionsWidth } from '../src/ui/AppHeader.jsx';

const chrome = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  .find((path) => existsSync(path));

function chromeBinary(path) {
  const real = realpathSync(path);
  const sibling = ['chrome', 'chromium'].map((name) => join(dirname(real), name)).find((candidate) => existsSync(candidate));
  return sibling || real;
}

function page(title, icon) {
  const logo = icon
    ? '<img class="custom-brand-icon" alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"/>'
    : '';
  return `<!doctype html><html><head><meta charset="utf-8">
<style>${readCss()}</style></head><body>
<div class="app dark" style="width:100vw">
<header class="app-header">
  <div class="header-left" aria-hidden="true"></div>
  <div class="plaque">${logo}<div class="plaque-text"><b class="plaque-title">${title}</b></div></div>
  <div class="actions">
    <span class="route-chip">场地总览</span>
    <div class="viewer-clock" aria-label="场地总览">17:13:23</div>
    <button class="lang-toggle" type="button"><svg width="18" height="18"></svg><span>EN</span></button>
  </div>
</header>
<script>
${reserveActionsWidth.toString()}
const header = document.querySelector('.app-header');
const actions = document.querySelector('.actions');
reserveActionsWidth(header, actions);
</script></body></html>`;
}

let cssCache = '';
function readCss() {
  if (!cssCache) {
    cssCache = `${readFileSync(new URL('../src/overrides.css', import.meta.url), 'utf8')}\n${readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')}`;
  }
  return cssCache;
}

function measureExpr(title, icon) {
  return `(() => {
    document.querySelector('.plaque-title').textContent = ${JSON.stringify(title)};
    const plaque = document.querySelector('.plaque');
    const img = plaque.querySelector('.custom-brand-icon');
    if (${icon ? 'true' : 'false'}) {
      if (!img) {
        const el = document.createElement('img');
        el.className = 'custom-brand-icon';
        el.alt = '';
        el.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        plaque.prepend(el);
      }
    } else if (img) img.remove();
    const header = document.querySelector('.app-header');
    const actions = document.querySelector('.actions');
    reserveActionsWidth(header, actions);
    const titleBox = document.querySelector('.plaque-title').getBoundingClientRect();
    const clock = document.querySelector('.viewer-clock').getBoundingClientRect();
    const plaqueBox = plaque.getBoundingClientRect();
    const head = header.getBoundingClientRect();
    return {
      gap: clock.left - titleBox.right,
      center: (plaqueBox.left + plaqueBox.width / 2) - (head.left + head.width / 2),
      innerWidth: window.innerWidth,
      actionsW: header.style.getPropertyValue('--actions-w'),
      titleW: titleBox.width,
    };
  })()`;
}

function childPids(pid) {
  try {
    const raw = readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim();
    if (!raw) return [];
    return raw.split(/\s+/).flatMap((child) => {
      const id = Number(child);
      return [id, ...childPids(id)];
    });
  } catch {
    return [];
  }
}

function killChrome(proc) {
  if (!proc?.pid) return;
  const pids = [proc.pid, ...childPids(proc.pid)];
  for (const pid of pids.reverse()) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }
  try { process.kill(-proc.pid, 'SIGKILL'); } catch { /* group already gone */ }
}

async function removeProfile(dir) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 7) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

function chromeLog(logPath) {
  try {
    return readFileSync(logPath, 'utf8').slice(-800);
  } catch {
    return '';
  }
}

function readActivePort(dir) {
  try {
    const [portLine, pathLine = ''] = readFileSync(join(dir, 'DevToolsActivePort'), 'utf8').split('\n');
    const port = Number(portLine.trim());
    if (!port) return null;
    return { port, path: pathLine.trim() };
  } catch {
    return null;
  }
}

async function browserVersion(port) {
  const hosts = [`127.0.0.1:${port}`, `[::1]:${port}`];
  let lastError = '';
  for (const host of hosts) {
    try {
      const version = await fetch(`http://${host}/json/version`, {
        signal: AbortSignal.timeout(500),
      }).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      });
      if (version.webSocketDebuggerUrl) {
        return String(version.webSocketDebuggerUrl).replace(/^ws:\/\/localhost\b/, 'ws://127.0.0.1');
      }
    } catch (error) {
      lastError = error?.cause?.code || error?.name || String(error);
    }
  }
  return { error: lastError };
}

async function waitForBrowser(dir, proc, logPath) {
  const deadline = Date.now() + 4000;
  let exitCode = null;
  proc.once('exit', (code) => { exitCode = code; });
  let active = null;
  while (Date.now() < deadline) {
    if (exitCode !== null) throw new Error(`Chrome 退出 ${exitCode}\n${chromeLog(logPath)}`);
    active = readActivePort(dir);
    if (active) {
      const wsUrl = await browserVersion(active.port);
      if (typeof wsUrl === 'string') return wsUrl;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const where = active ? `DevToolsActivePort=${active.port} ${active.path}` : '没有 DevToolsActivePort';
  throw new Error(`Chrome 调试端口没有起来 (${where})\n${chromeLog(logPath)}`);
}

function connectWebSocket(url) {
  const ws = new WebSocket(url);
  const opened = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => finish(reject, new Error('DevTools websocket 没有连上')), 2000);
    ws.addEventListener('open', () => finish(resolve));
    ws.addEventListener('error', () => finish(reject, new Error('DevTools websocket 失败')));
  });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const data = typeof event.data === 'string' ? event.data : event.data.toString();
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => reject(new Error(`CDP 超时: ${method}`)), 1500);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
      else resolve(msg.result);
    });
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    ws.send(JSON.stringify(payload));
  });
  return { ws, opened, send };
}

async function withChrome(run) {
  const dir = mkdtempSync(join(tmpdir(), 'plaque-chrome-'));
  const logPath = join(dir, 'chrome-stderr.log');
  const logFd = openSync(logPath, 'w');
  const proc = spawn(chromeBinary(chrome), [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--disable-component-extensions-with-background-pages',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-default-apps',
    '--disable-breakpad',
    '--no-first-run',
    '--no-default-browser-check',
    '--mute-audio',
    '--disable-features=Translate,MediaRouter,DialMediaRouteProvider',
    '--remote-debugging-port=0',
    '--user-data-dir=' + dir,
    'about:blank',
  ], {
    stdio: ['ignore', 'ignore', logFd],
    detached: true,
    env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: 'disabled:' },
  });
  closeSync(logFd);
  let ws;
  try {
    const browserUrl = await waitForBrowser(dir, proc, logPath);
    const browser = connectWebSocket(browserUrl);
    ws = browser.ws;
    await browser.opened;
    const { targetInfos } = await browser.send('Target.getTargets');
    const pageTarget = targetInfos.find((target) => target.type === 'page');
    if (!pageTarget) throw new Error('Chrome 没有页面目标');
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });
    const call = (method, params) => browser.send(method, params, sessionId);
    await call('Page.enable');
    await call('Runtime.enable');
    const written = await call('Runtime.evaluate', {
      expression: `document.open(); document.write(${JSON.stringify(page('工厂智能可视化', true))}); document.close(); document.readyState`,
      returnByValue: true,
    });
    if (written.exceptionDetails) throw new Error(JSON.stringify(written.exceptionDetails));
    const ready = written.result?.value;
    if (ready !== 'interactive' && ready !== 'complete') throw new Error(`document not ready: ${ready}`);
    const measure = async (width, title, icon) => {
      await call('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      const evaluated = await call('Runtime.evaluate', {
        expression: measureExpr(title, icon),
        returnByValue: true,
      });
      if (evaluated.exceptionDetails) throw new Error(JSON.stringify(evaluated.exceptionDetails));
      return evaluated.result.value;
    };
    await run(measure);
  } finally {
    try { ws?.close(); } catch { /* socket already closed */ }
    killChrome(proc);
    await removeProfile(dir);
  }
}

describe.skipIf(!chrome)('390 宽品牌图标不挡时钟', () => {
  it('默认标题和短标题与时钟的间隙都 ≥ 0，无图标时铭牌仍居中', async () => {
    await withChrome(async (measure) => {
      const long = await measure(390, '工厂智能可视化', true);
      const short = await measure(390, '验收铭牌XYZ', true);
      const plain = await measure(390, '工厂智能可视化', false);
      expect(long.innerWidth).toBe(390);
      expect(long.gap).toBeGreaterThanOrEqual(0);
      expect(short.gap).toBeGreaterThanOrEqual(0);
      expect(Math.abs(plain.center)).toBeLessThanOrEqual(1);
      for (const width of [640, 768, 1280]) {
        const wide = await measure(width, '工厂智能可视化', true);
        expect(wide.gap, `width ${width} ${JSON.stringify(wide)}`).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
