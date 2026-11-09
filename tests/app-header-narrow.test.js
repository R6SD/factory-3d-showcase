/**
 * happy-dom 的 getBoundingClientRect 恒为 0，所以用本机 Chrome 量铭牌和时钟的间隙。
 * 没有 Chrome 时跳过。GitHub ubuntu 镜像现在自带 google-chrome，这个用例会在 CI 里真的跑。
 *
 * 包装脚本会把 stdout/stderr 转给 cat，调试端口的 fetch 又没有超时；页面还要再等一次
 * Page.loadEventFired。这两处在 runner 上会一直挂着，直到撞上 Vitest 默认的 5s。
 * 这里直接启动 chrome 二进制，等它自己打印 DevTools 地址，用 document.readyState 判断页面，
 * 并且在删除用户目录前先杀掉整棵进程树（否则子进程还占着目录，rmSync 会 ENOTEMPTY）。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
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

function waitForDevtools(proc) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      finish(reject, new Error(`Chrome 调试端口没有起来\n${stderr.slice(-400)}`));
    }, 3000);
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) finish(resolve, match[1].replace(/^ws:\/\/localhost\b/, 'ws://127.0.0.1'));
    });
    proc.once('exit', (code) => finish(reject, new Error(`Chrome 退出 ${code}\n${stderr.slice(-400)}`)));
  });
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
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true,
    env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: 'disabled:' },
  });
  let ws;
  try {
    const browserUrl = await waitForDevtools(proc);
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
