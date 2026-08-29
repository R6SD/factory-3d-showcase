import { describe, it, expect } from 'vitest';
import { pickHomeTitle } from '../src/scene/viewer-title.js';

const viewer = { title: '场地总览', titleEn: 'Site Overview' };

describe('pickHomeTitle 居中标题决策（模型名同步回归）', () => {
  it('加载真实活动模型时，显示去掉扩展名的模型名（缺陷回归：标题曾停留在自定义标题）', () => {
    expect(pickHomeTitle('factory_site_3d_model_fixed.glb', viewer, 'zh')).toBe('factory_site_3d_model_fixed');
  });

  it('扩展名大小写不敏感地去除（.GLB/.gltf/.fbx/.obj/.stl）', () => {
    expect(pickHomeTitle('My Line.GLB', viewer)).toBe('My Line');
    expect(pickHomeTitle('a.FBX', viewer)).toBe('a');
    expect(pickHomeTitle('b.stl', viewer)).toBe('b');
  });

  it('无扩展名的模型名原样显示', () => {
    expect(pickHomeTitle('custom-model', viewer)).toBe('custom-model');
  });

  it('模型库设置别名后，标题优先显示别名', () => {
    expect(pickHomeTitle('factory_site_3d_model_fixed.glb', viewer, 'zh', '一号厂房')).toBe('一号厂房');
    expect(pickHomeTitle('a b.glb', viewer, 'en', 'Workshop A')).toBe('Workshop A');
  });

  it('别名仅空白时回落到去扩展名的文件名', () => {
    expect(pickHomeTitle('plant.glb', viewer, 'zh', '   ')).toBe('plant');
    expect(pickHomeTitle('plant.glb', viewer, 'zh', '')).toBe('plant');
  });

  it('别名对默认/内置模型无效，仍显示自定义标题', () => {
    expect(pickHomeTitle('__factory_default__', viewer, 'zh', '不该出现')).toBe('场地总览');
    expect(pickHomeTitle('Factory Campus A.glb', viewer, 'zh', '不该出现')).toBe('场地总览');
  });

  it('空 / null / 默认标识回落到自定义标题', () => {
    expect(pickHomeTitle('', viewer, 'zh')).toBe('场地总览');
    expect(pickHomeTitle(null, viewer, 'zh')).toBe('场地总览');
    expect(pickHomeTitle(undefined, viewer, 'zh')).toBe('场地总览');
    expect(pickHomeTitle('__factory_default__', viewer, 'zh')).toBe('场地总览');
  });

  it('内置示例模型 Factory Campus A.glb 视为默认，显示自定义标题而非文件名', () => {
    expect(pickHomeTitle('Factory Campus A.glb', viewer, 'zh')).toBe('场地总览');
  });

  it('英文环境无活动模型时使用 titleEn', () => {
    expect(pickHomeTitle('', viewer, 'en')).toBe('Site Overview');
    expect(pickHomeTitle('__factory_default__', viewer, 'en')).toBe('Site Overview');
  });

  it('英文缺 titleEn 时回退 title，反之中文缺 title 回退 titleEn，都缺则空串不崩', () => {
    expect(pickHomeTitle('', { title: '只有中文' }, 'en')).toBe('只有中文');
    expect(pickHomeTitle('', { titleEn: 'English only' }, 'zh')).toBe('English only');
    expect(pickHomeTitle('', {}, 'zh')).toBe('');
  });

  it('活动模型名带空白时先 trim 再判断', () => {
    expect(pickHomeTitle('  plant.glb  ', viewer)).toBe('plant');
  });
});
