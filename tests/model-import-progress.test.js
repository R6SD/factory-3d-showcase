import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { sheetErrorMessage } from '../src/data/sheet-io.js';
import { MODEL_READ_CHUNK, loadModelFile, progressPercent } from '../src/scene/ModelLoader.js';
import { SceneRuntime } from '../src/scene/SceneRuntime.js';

describe('模型读取进度', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('按 256KB 分片上报真实百分比，读完后先进入解析再交给 GLTFLoader', async () => {
    expect(MODEL_READ_CHUNK).toBe(256 * 1024);
    const size = 4 * 1024 * 1024;
    const bytes = new Uint8Array(size);
    bytes[0] = 0x67;
    bytes[100] = 0x41;
    bytes[size - 1] = 0x7a;
    const file = new File([bytes], 'campus-bulk.glb', { type: 'model/gltf-binary' });
    const seen = [];
    const parseAsync = vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(async function (data) {
      expect(seen.at(-1)).toBeNull();
      expect(data).toBeInstanceOf(ArrayBuffer);
      expect(data.byteLength).toBe(size);
      const view = new Uint8Array(data);
      expect(view[0]).toBe(0x67);
      expect(view[100]).toBe(0x41);
      expect(view[size - 1]).toBe(0x7a);
      return { scene: new THREE.Group(), animations: [] };
    });

    const loaded = await loadModelFile(file, { onProgress: (value) => seen.push(value) });

    const expected = [];
    for (let offset = MODEL_READ_CHUNK; offset < size; offset += MODEL_READ_CHUNK) {
      expected.push(progressPercent({ loaded: offset, total: size, lengthComputable: true }));
    }
    expect(expected.length).toBeGreaterThan(2);
    expect(expected.every((value, index) => value < 100 && (index === 0 || value > expected[index - 1]))).toBe(true);
    expect(seen).toEqual([...expected, null]);
    expect(parseAsync).toHaveBeenCalledTimes(1);
    expect(loaded.format).toBe('glb');
    expect(loaded.object).toBeInstanceOf(THREE.Object3D);
  });
});

describe('损坏模型的失败提示', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('复用 sheetErrorMessage，不另写一份文案', async () => {
    const broken = new Uint8Array(65 * 1024);
    for (let i = 0; i < broken.length; i += 1) broken[i] = (i * 17) & 255;
    const file = new File([broken], 'broken.glb');
    const notices = [];
    const runtime = Object.create(SceneRuntime.prototype);
    runtime._importSeq = 0;
    runtime._cb = {
      onNotice: (message) => notices.push(message),
      onLoading() {},
      onLoadProgress() {},
    };

    await runtime._importFile(file, false);

    const failure = notices.at(-1);
    expect(failure).toBe(sheetErrorMessage(new Error('corrupt glb')));
    const source = readFileSync(new URL('../src/scene/SceneRuntime.js', import.meta.url), 'utf8');
    expect(source).toContain('sheetErrorMessage');
    expect(source).not.toContain('文件无法解析，请检查格式');
    expect(source).not.toContain('模型载入失败：请检查格式、资源引用和文件完整性');
  });
});
