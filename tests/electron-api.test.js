import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createWorkbenchServer } = require('../electron/main.cjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-api-'));
fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'dist', 'index.html'), '<!doctype html><title>ok</title>');
const server = createWorkbenchServer({ appRoot: path.join(tmp, 'dist'), userDataDir: tmp });

function listen() {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}
const portP = listen();
const base = async () => `http://127.0.0.1:${await portP}`;

afterAll(() => new Promise((r) => server.close(r)));

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082', 'hex');

describe('照片库 /api/photos', () => {
  it('空库返回空列表', async () => {
    const r = await fetch(`${await base()}/api/photos`);
    expect(r.headers.get('X-Factory-Photo-Store')).toBe('1');
    expect(await r.json()).toEqual([]);
  });

  it('上传后可按名读取并出现在列表，删除后 404', async () => {
    const b = await base();
    const up = await fetch(`${b}/api/photos?name=${encodeURIComponent('赵磊.png')}`, { method: 'POST', body: PNG });
    expect(up.status).toBe(201);
    const got = await fetch(`${b}/api/photos?name=${encodeURIComponent('赵磊.png')}`);
    expect(got.status).toBe(200);
    expect(Buffer.from(await got.arrayBuffer())).toEqual(PNG);
    const list = await (await fetch(`${b}/api/photos`)).json();
    expect(list.map((x) => x.name)).toContain('赵磊.png');
    const del = await fetch(`${b}/api/photos?name=${encodeURIComponent('赵磊.png')}`, { method: 'DELETE' });
    expect(del.status).toBe(204);
    expect((await fetch(`${b}/api/photos?name=${encodeURIComponent('赵磊.png')}`)).status).toBe(404);
  });

  it('目录穿越被中和、非图片文件名被拒绝', async () => {
    const b = await base();
    // ../ 被清洗为普通文件名，仍落在 photos 目录内，无法逃逸到上级
    const r1 = await fetch(`${b}/api/photos?name=${encodeURIComponent('../evil.png')}`, { method: 'POST', body: PNG });
    expect([201, 400]).toContain(r1.status);
    expect(fs.existsSync(path.join(tmp, 'evil.png'))).toBe(false); // 没有逃逸到 userData 根
    const r2 = await fetch(`${b}/api/photos?name=${encodeURIComponent('a.exe')}`, { method: 'POST', body: PNG });
    expect(r2.status).toBe(400);
    // 清理可能落在 photos 目录内的中和结果
    if (r1.status === 201) await fetch(`${b}/api/photos?name=evil.png`, { method: 'DELETE' });
  });
});

describe('配置 /api/config', () => {
  it('空库返回 null，PUT 后 GET 原样返回', async () => {
    const b = await base();
    expect(await (await fetch(`${b}/api/config`)).text()).toBe('null');
    const payload = JSON.stringify({ version: 4, scene: { exposure: 1.2 } });
    const put = await fetch(`${b}/api/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: payload });
    expect(put.status).toBe(200);
    const got = await (await fetch(`${b}/api/config`)).json();
    expect(got.scene.exposure).toBe(1.2);
  });

  it('非法 JSON 拒绝', async () => {
    const r = await fetch(`${await base()}/api/config`, { method: 'PUT', body: '{bad' });
    expect(r.status).toBe(400);
  });
});

describe('静态与业务数据', () => {
  it('未知路径回退 index.html', async () => {
    const r = await fetch(`${await base()}/anything`);
    expect((await r.text()).includes('ok</title>')).toBe(true);
  });
  it('业务数据空库返回字符串 null', async () => {
    expect(await (await fetch(`${await base()}/api/data/business`)).text()).toBe('null');
  });
});
