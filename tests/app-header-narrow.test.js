/**
 * happy-dom 的 getBoundingClientRect 恒为 0。这里用本机 Chrome 量 390 宽铭牌和时钟的间隙。
 * 没有 Chrome 时跳过（GitHub CI 的 ubuntu 镜像不带浏览器）；本机和验收环境会跑到断言。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { reserveActionsWidth } from '../src/ui/AppHeader.jsx';

const chrome = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  .find((path) => existsSync(path));

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
const titleBox = document.querySelector('.plaque-title').getBoundingClientRect();
const clock = document.querySelector('.viewer-clock').getBoundingClientRect();
const plaque = document.querySelector('.plaque').getBoundingClientRect();
const head = header.getBoundingClientRect();
document.documentElement.dataset.result = JSON.stringify({
  gap: clock.left - titleBox.right,
  center: (plaque.left + plaque.width / 2) - (head.left + head.width / 2),
  innerWidth: window.innerWidth,
  actionsW: header.style.getPropertyValue('--actions-w'),
});
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

async function withChrome(run) {
  const dir = mkdtempSync(join(tmpdir(), 'plaque-chrome-'));
  const port = 9333 + Math.floor(Math.random() * 1000);
  const proc = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + dir,
    'about:blank',
  ], { stdio: 'ignore' });
  try {
    let version;
    for (let i = 0; i < 50; i += 1) {
      try {
        version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    if (!version) throw new Error('Chrome 调试端口没有起来');
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    });
    let seq = 0;
    const pending = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    });
    const send = (method, params = {}) => new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
    const file = join(dir, 'header.html');
    writeFileSync(file, page('工厂智能可视化', true));
    await send('Target.createTarget', { url: `file://${file}` });
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
    const pageTarget = targets.find((target) => target.type === 'page' && target.url.startsWith('file://'));
    const pageWs = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      pageWs.addEventListener('open', resolve);
      pageWs.addEventListener('error', reject);
    });
    let pageSeq = 0;
    const pagePending = new Map();
    pageWs.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pagePending.has(msg.id)) {
        pagePending.get(msg.id)(msg);
        pagePending.delete(msg.id);
      }
    });
    const call = (method, params = {}) => new Promise((resolve) => {
      const id = ++pageSeq;
      pagePending.set(id, resolve);
      pageWs.send(JSON.stringify({ id, method, params }));
    });
    await call('Page.enable');
    await call('Runtime.enable');
    const loaded = new Promise((resolve) => {
      pageWs.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data);
        if (msg.method === 'Page.loadEventFired') resolve();
      });
    });
    await call('Page.navigate', { url: `file://${file}` });
    await loaded;
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
      if (evaluated.result?.exceptionDetails) throw new Error(JSON.stringify(evaluated.result.exceptionDetails));
      return evaluated.result.result.value;
    };
    await run(measure);
    pageWs.close();
    ws.close();
  } finally {
    proc.kill('SIGKILL');
    rmSync(dir, { recursive: true, force: true });
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
