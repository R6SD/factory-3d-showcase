import { describe, it, expect, afterEach, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { readSheet, downloadSheet } from '../src/data/sheet-io.js';

function csvFile(text, name = 'people.csv') {
  return new File([text], name, { type: 'text/csv' });
}

describe('sheet-io', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads a csv header row into null-prototype objects and skips blank rows', async () => {
    const file = csvFile('工号,姓名,产量\nE-1100,示例员工,280\n,,\nE-1101,赵磊,12\n');
    const rows = await readSheet(file);
    expect(rows).toEqual([
      { 工号: 'E-1100', 姓名: '示例员工', 产量: '280' },
      { 工号: 'E-1101', 姓名: '赵磊', 产量: '12' },
    ]);
    expect(Object.getPrototypeOf(rows[0])).toBe(null);
  });

  it('keeps quoted commas and does not let a __proto__ header pollute Object.prototype', async () => {
    const before = Object.prototype.polluted;
    const file = csvFile('"__proto__","姓名"\n"polluted","张三, 总装"\n');
    const rows = await readSheet(file);
    expect(rows).toHaveLength(1);
    expect(rows[0]['__proto__']).toBe('polluted');
    expect(rows[0]['姓名']).toBe('张三, 总装');
    expect(Object.prototype.polluted).toBe(before);
    expect({}.polluted).toBeUndefined();
  });

  it('downloadSheet writes an xlsx the reader can load, including numbers and dates', async () => {
    let blob;
    vi.stubGlobal('document', {
      body: { appendChild() {}, removeChild() {} },
      createElement() {
        return { href: '', download: '', click() {} };
      },
    });
    vi.stubGlobal('URL', {
      createObjectURL(value) {
        blob = value;
        return 'blob:sheet';
      },
      revokeObjectURL() {},
    });

    downloadSheet(
      [{ 工号: 'E-1100', 姓名: '示例员工', 产量: 280, 日期: '2026-09-01' }],
      '人员',
      '人员导出.xlsx',
    );

    await vi.waitFor(() => {
      expect(blob).toBeTruthy();
    });

    const file = new File([await blob.arrayBuffer()], '人员导出.xlsx');
    const rows = await readSheet(file);
    expect(rows).toEqual([
      { 工号: 'E-1100', 姓名: '示例员工', 产量: 280, 日期: '2026-09-01' },
    ]);
    expect(Object.getPrototypeOf(rows[0])).toBe(null);
  });

  it('keeps xlsx data rows that follow a blank middle row', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('人员');
    sheet.getRow(1).values = ['工号', '姓名'];
    sheet.getRow(3).values = ['E-1', '甲'];
    sheet.getRow(4).values = ['E-2', '乙'];
    const buffer = await workbook.xlsx.writeBuffer();
    const rows = await readSheet(new File([buffer], 'gap.xlsx'));
    expect(rows).toEqual([
      { 工号: 'E-1', 姓名: '甲' },
      { 工号: 'E-2', 姓名: '乙' },
    ]);
  });

  it('reads only the first worksheet', async () => {
    let blob;
    vi.stubGlobal('document', {
      body: { appendChild() {}, removeChild() {} },
      createElement() {
        return { href: '', download: '', click() {} };
      },
    });
    vi.stubGlobal('URL', {
      createObjectURL(value) {
        blob = value;
        return 'blob:sheet';
      },
      revokeObjectURL() {},
    });
    downloadSheet([{ 月份: '2026-09', 计划产量: 2294 }], '月度计划', '计划.xlsx');
    await vi.waitFor(() => expect(blob).toBeTruthy());
    const rows = await readSheet(new File([await blob.arrayBuffer()], '计划.xlsx'));
    expect(rows).toEqual([{ 月份: '2026-09', 计划产量: 2294 }]);
  });
});
