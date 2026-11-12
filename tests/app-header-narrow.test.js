/**
 * happy-dom 的 getBoundingClientRect 恒为 0，所以用本机 Chrome 量铭牌和时钟的间隙。
 * 没有 Chrome 时跳过。GitHub ubuntu 镜像自带 google-chrome，这个用例会在 CI 里真的跑。
 *
 * Chrome 只在 TCP 调试端口 bind 成功之后才把端口写进 DevToolsActivePort。
 * bind 失败，或浏览器还停在早期初始化时，进程不退出，文件也不会出现。
 * #59 和 #62 仍在等这个文件。这里改由 puppeteer-core 用 pipe 启动系统 Chrome，
 * CDP 走管道，不再读端口文件。管道在调试服务起来之前不会有响应，默认的
 * protocolTimeout 是 180 秒，Vitest 的 5 秒会先把用例掐掉，所以这里单独给出上限。
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import puppeteer from 'puppeteer-core';
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

async function stopBrowser(browser) {
  const proc = browser.process();
  const closed = browser.close().catch(() => {});
  await Promise.race([
    closed,
    new Promise((resolve) => setTimeout(resolve, 1000)),
  ]);
  try { proc?.kill('SIGKILL'); } catch { /* already gone */ }
  await closed;
}

async function withChrome(run) {
  const browser = await puppeteer.launch({
    executablePath: chromeBinary(chrome),
    headless: true,
    pipe: true,
    timeout: 15000,
    protocolTimeout: 15000,
    defaultViewport: null,
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: 'disabled:' },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  try {
    const [tab] = await browser.pages();
    if (!tab) throw new Error('Chrome 没有页面目标');
    const session = await tab.createCDPSession();
    const call = (method, params) => session.send(method, params);
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
    await stopBrowser(browser);
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
  }, 20000);
});
