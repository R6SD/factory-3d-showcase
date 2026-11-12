/**
 * happy-dom 的 getBoundingClientRect 恒为 0，所以用本机 Chrome 量铭牌和时钟的间隙。
 * 没有 Chrome 时跳过。GitHub ubuntu 镜像自带 google-chrome，这个用例会在 CI 里真的跑。
 *
 * puppeteer-core 用 pipe 启动，不读 DevToolsActivePort。pipe 没有单独的就绪信号，
 * 第一条 CDP（Target.setDiscoverTargets）就是探针，时限是 protocolTimeout。
 * #67 有一次整段用例 12.9s 仍成功；#73 的失败正好卡在当时的 15s 上限（15075ms）。
 * 探针给 20s，盖住已经看到的慢启动，并且只对这种启动超时再试一次。
 *
 * launch 抛错时还没有 Browser。puppeteer 失败路径是未等待的优雅关闭，临时目录要等
 * 浏览器进程退出才删。Vitest 的 fork 停不下来时会在 500ms 后 SIGKILL，exit 钩子不跑。
 * Chrome 是 detached，crashpad 在另一个进程组，命令行里也没有用户目录，所以两者和
 * 临时目录都会留下。这里按用户目录、子进程，以及启动前没有的 crashpad 杀掉再删目录。
 * 用例超时盖住两次启动加清理，避免 fork 在清理完成前被掐掉。
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { afterAll, describe, expect, it } from 'vitest';
import { reserveActionsWidth } from '../src/ui/AppHeader.jsx';

const chrome = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  .find((path) => existsSync(path));

const LAUNCH_MS = 20_000;
const ATTEMPTS = 2;
const PROFILE_PREFIX = 'narrow-chrome-';
// 两次探针加上停止浏览器和清进程的时间，要短于 Vitest 掐掉 fork 的时刻。
const TEST_TIMEOUT_MS = ATTEMPTS * LAUNCH_MS + 8_000;

function chromeBinary(path) {
  const real = realpathSync(path);
  const sibling = ['chrome', 'chromium'].map((name) => join(dirname(real), name)).find((candidate) => existsSync(candidate));
  return sibling || real;
}

function procPids() {
  if (!existsSync('/proc')) return [];
  const pids = [];
  for (const name of readdirSync('/proc')) {
    if (/^\d+$/.test(name)) pids.push(Number(name));
  }
  return pids;
}

function procCmdline(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`).toString('utf8');
  } catch {
    return '';
  }
}

function procInfo(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const after = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    if (after[0] === 'Z') return null;
    return { ppid: Number(after[1]), pgrp: Number(after[2]) };
  } catch {
    return null;
  }
}

function crashpadPids() {
  return procPids().filter((pid) => procCmdline(pid).includes('chrome_crashpad_handler'));
}

function profileProcesses() {
  return procPids().filter((pid) => procCmdline(pid).includes(`/${PROFILE_PREFIX}`));
}

function victims(userDataDir, crashpadsBefore) {
  const rows = [];
  for (const pid of procPids()) {
    const info = procInfo(pid);
    if (!info) continue;
    rows.push({ pid, ...info, cmd: procCmdline(pid) });
  }
  const marked = new Set();
  for (const row of rows) {
    const isProfile = row.cmd.includes(userDataDir);
    const isNewCrashpad = row.cmd.includes('chrome_crashpad_handler') && !crashpadsBefore.has(row.pid);
    if (isProfile || isNewCrashpad) marked.add(row.pid);
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of rows) {
      if (!marked.has(row.pid) && marked.has(row.ppid)) {
        marked.add(row.pid);
        grew = true;
      }
    }
  }
  return [...marked];
}

function killPids(pids) {
  const own = procInfo(process.pid)?.pgrp ?? -1;
  for (const pid of pids) {
    const info = procInfo(pid);
    if (info && info.pgrp > 1 && info.pgrp !== own) {
      try { process.kill(-info.pgrp, 'SIGKILL'); } catch { /* already gone */ }
    }
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

async function cleanupLaunch(userDataDir, crashpadsBefore, { untilCrashpad = false } = {}) {
  const started = Date.now();
  const deadline = started + 1000;
  let quiet = 0;
  let sawProfile = false;
  let sawCrashpad = false;
  // crashpad 是独立进程组，可能比浏览器主进程晚一点出现。先至少看一会儿，再连续三次确认没有了。
  // 40ms 探针有时在 crashpad 拉起前就结束；那种清理要看满这 1 秒，避免晚到的进程漏掉。
  while (Date.now() < deadline) {
    const pids = victims(userDataDir, crashpadsBefore);
    if (pids.length === 0) {
      quiet += 1;
      if (quiet >= 3 && Date.now() - started >= 400 && (!untilCrashpad || sawCrashpad)) break;
    } else {
      quiet = 0;
      for (const pid of pids) {
        const cmd = procCmdline(pid);
        if (cmd.includes(userDataDir)) sawProfile = true;
        if (cmd.includes('chrome_crashpad_handler')) sawCrashpad = true;
      }
      killPids(pids);
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  killPids(victims(userDataDir, crashpadsBefore));
  return { sawProfile, sawCrashpad };
}

function isStartupTimeout(error) {
  return /timed out|timeout/i.test(`${error?.name || ''} ${error?.message || ''}`);
}

async function launchChrome(options = {}) {
  const userDataDir = await mkdtemp(join(tmpdir(), PROFILE_PREFIX));
  const crashpadsBefore = new Set(crashpadPids());
  try {
    const browser = await puppeteer.launch({
      executablePath: chromeBinary(chrome),
      headless: true,
      pipe: true,
      timeout: options.timeout ?? LAUNCH_MS,
      protocolTimeout: options.protocolTimeout ?? LAUNCH_MS,
      userDataDir,
      defaultViewport: null,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: 'disabled:' },
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });
    return { browser, userDataDir, crashpadsBefore };
  } catch (error) {
    error.launchCleanup = await cleanupLaunch(userDataDir, crashpadsBefore, {
      untilCrashpad: options.untilCrashpad === true,
    });
    throw error;
  }
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
  const giveUp = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await Promise.race([closed, giveUp(1000)]);
  try { proc?.kill('SIGKILL'); } catch { /* already gone */ }
  await Promise.race([closed, giveUp(500)]);
}

async function runPage(browser, run) {
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
}

async function withChrome(run) {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    let session;
    try {
      session = await launchChrome();
    } catch (error) {
      lastError = error;
      if (attempt === ATTEMPTS || !isStartupTimeout(error)) throw error;
      console.warn(`narrow Chrome 启动超时，清理后重试（${attempt}/${ATTEMPTS}）`);
      continue;
    }
    try {
      await runPage(session.browser, run);
      return;
    } finally {
      await stopBrowser(session.browser);
      await cleanupLaunch(session.userDataDir, session.crashpadsBefore);
    }
  }
  throw lastError;
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
  }, TEST_TIMEOUT_MS);
});

describe.skipIf(!chrome)('Chrome 启动失败时清理进程', () => {
  it('Target.setDiscoverTargets 超时后不留 Chrome、crashpad 和临时目录', async () => {
    // 短于一次真实的 CDP 握手，于是走和 CI 相同的 Target.setDiscoverTargets 超时。
    // 进程在探针发出时已经起来。新的 crashpad 可能来不及出现，或复用已有 handler。
    // 清理会多等满 1 秒；之后以「没有新的 chrome / crashpad / 临时目录」为准。
    const crashpadsBefore = new Set(crashpadPids());
    const dirsBefore = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith(PROFILE_PREFIX)));
    let session;
    try {
      session = await launchChrome({ protocolTimeout: 40, timeout: 3000, untilCrashpad: true });
    } catch (error) {
      expect(`${error?.name || ''} ${error?.message || ''}`).toMatch(/timed out/);
      expect(error.launchCleanup.sawProfile).toBe(true);
    }
    if (session) {
      await stopBrowser(session.browser);
      await cleanupLaunch(session.userDataDir, session.crashpadsBefore);
      throw new Error('40ms 内 Chrome 已应答，没有走到启动超时清理');
    }
    const dirsAfter = readdirSync(tmpdir()).filter((name) => name.startsWith(PROFILE_PREFIX) && !dirsBefore.has(name));
    const leftover = procPids().filter((pid) => {
      const cmd = procCmdline(pid);
      return cmd.includes(`/${PROFILE_PREFIX}`) || (cmd.includes('chrome_crashpad_handler') && !crashpadsBefore.has(pid));
    });
    expect(dirsAfter).toEqual([]);
    expect(leftover).toEqual([]);
  }, 10_000);
});

afterAll(() => {
  expect(profileProcesses()).toEqual([]);
});
