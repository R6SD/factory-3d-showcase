import { describe, expect, it, vi } from 'vitest';

vi.mock('exceljs', () => {
  throw new Error('Failed to fetch dynamically imported module: exceljs');
});

import { downloadSheet, readSheet } from '../src/data/sheet-io.js';

describe('exceljs chunk load failure', () => {
  it('readSheet rejects with a readable message and no unhandled rejection', async () => {
    const unhandled = [];
    const onUnhandled = (reason) => { unhandled.push(reason); };
    process.on('unhandledRejection', onUnhandled);
    try {
      const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'people.xlsx');
      await expect(readSheet(file)).rejects.toThrow('表格组件加载失败，请刷新页面后重试');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('downloadSheet rejects with the same readable message', async () => {
    vi.stubGlobal('document', {
      body: { appendChild() {}, removeChild() {} },
      createElement() {
        return { href: '', download: '', click() {} };
      },
    });
    vi.stubGlobal('URL', { createObjectURL() { return 'blob:sheet'; }, revokeObjectURL() {} });
    await expect(downloadSheet([{ 姓名: '甲' }], '人员', '人员.xlsx')).rejects.toThrow('表格组件加载失败，请刷新页面后重试');
  });
});
