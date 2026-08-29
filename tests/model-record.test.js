import { describe, it, expect } from 'vitest';
import { mergeModelRecord, upsertModel } from '../src/scene/model-record.js';

describe('mergeModelRecord 文件元数据与用户别名合并', () => {
  it('文件字段覆盖旧值，但保留用户设置的 alias（缺陷回归：重载模型后别名丢失）', () => {
    const prev = { name: 'a.glb', size: 100, tag: '本地导入', alias: '一号厂房' };
    const meta = { name: 'a.glb', size: 200, tag: '本地导入', updated: '2026/08/29' };
    const out = mergeModelRecord(prev, meta);
    expect(out.size).toBe(200); // 文件字段以新的为准
    expect(out.updated).toBe('2026/08/29');
    expect(out.alias).toBe('一号厂房'); // 别名必须保留
  });

  it('旧记录为空时等价于 meta 本身', () => {
    const meta = { name: 'b.glb', size: 1 };
    expect(mergeModelRecord(null, meta)).toEqual(meta);
    expect(mergeModelRecord(undefined, meta)).toEqual(meta);
  });

  it('旧记录别名是空白/缺失时不写入空 alias', () => {
    expect(mergeModelRecord({ name: 'c.glb', alias: '   ' }, { name: 'c.glb' }).alias).toBeUndefined();
    expect(mergeModelRecord({ name: 'c.glb' }, { name: 'c.glb' }).alias).toBeUndefined();
  });
});

describe('upsertModel 列表级合并', () => {
  it('新模型直接追加', () => {
    const out = upsertModel([{ name: 'x.glb' }], { name: 'y.glb', size: 2 });
    expect(out.map((m) => m.name)).toEqual(['x.glb', 'y.glb']);
  });

  it('同名模型只保留一条且别名不丢、文件信息更新', () => {
    const list = [{ name: 'a.glb', alias: '总装车间', size: 1 }];
    const out = upsertModel(list, { name: 'a.glb', size: 9 });
    expect(out).toHaveLength(1);
    expect(out[0].size).toBe(9);
    expect(out[0].alias).toBe('总装车间');
  });

  it('不修改原数组（不可变更新）', () => {
    const list = [{ name: 'a.glb', alias: 'A' }];
    const snapshot = JSON.stringify(list);
    upsertModel(list, { name: 'a.glb', size: 5 });
    expect(JSON.stringify(list)).toBe(snapshot);
  });

  it('models 为 null/undefined 时不崩，返回仅含新记录的数组', () => {
    expect(upsertModel(null, { name: 'z.glb' })).toEqual([{ name: 'z.glb' }]);
  });
});
