/**
 * @vitest-environment happy-dom
 *
 * Three business importers: unreadable xlsx shows a file error, a readable
 * sheet that lacks required columns still shows the missing-column message,
 * and a real xlsx/csv still imports.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import * as sheetIo from '../src/data/sheet-io.js';

const realReadSheet = sheetIo.readSheet;

const FILE_ERROR = '文件无法解析，请检查格式';

function fileInput() {
  const input = document.querySelector('input[type="file"][accept=".xlsx,.csv"]');
  if (!input) throw new Error('import input missing');
  return input;
}

const readSheet = vi.spyOn(sheetIo, 'readSheet');

function importFile(file) {
  const input = fileInput();
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function importAndWait(file, assertFn) {
  let settle;
  const done = new Promise((resolve) => { settle = resolve; });
  readSheet.mockImplementationOnce(async (value) => {
    try {
      return await realReadSheet(value);
    } finally {
      settle();
    }
  });
  importFile(file);
  const timed = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('import did not call readSheet')), 2000);
  });
  await Promise.race([done, timed]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await vi.waitFor(assertFn);
}

function clickTab(label) {
  const button = [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === label);
  if (!button) throw new Error(`tab missing: ${label}`);
  button.click();
}

function messages() {
  return [...document.querySelectorAll('.admin-msg')].map((node) => node.textContent);
}

async function xlsxFile(rows, name) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('数据');
  const keys = Object.keys(rows[0] || {});
  sheet.addRow(keys);
  for (const row of rows) sheet.addRow(keys.map((key) => row[key]));
  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer], name);
}

describe('后台三个导入器的错误文案', () => {
  beforeAll(async () => {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    window.history.replaceState({}, '', '/admin');
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no backend'))));
    await import('../src/app.jsx');
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('人员与组织（');
    });
  });

  it('0 字节和文本冒充的 xlsx 在三个子页都提示文件无法解析，合法缺列仍提示缺列', async () => {
    const peopleBefore = document.body.textContent;
    const empty = new File([new Uint8Array(0)], 'empty.xlsx');
    const fake = new File(['not a workbook'], 'notes.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    await importAndWait(empty, () => {
      expect(messages()).toContain(FILE_ERROR);
      expect(messages().some((text) => text.includes('需包含'))).toBe(false);
    });
    expect(document.body.textContent.match(/人员与组织（\d+）/)?.[0]).toBe(peopleBefore.match(/人员与组织（\d+）/)?.[0]);

    await importAndWait(fake, () => {
      expect(messages()).toContain(FILE_ERROR);
      expect(messages().some((text) => text.includes('需包含'))).toBe(false);
    });
    expect(document.body.textContent.match(/人员与组织（\d+）/)?.[0]).toBe(peopleBefore.match(/人员与组织（\d+）/)?.[0]);

    await importAndWait(
      new File(['工号,岗位\nE-9,总装工\n'], 'missing.csv', { type: 'text/csv' }),
      () => expect(messages()).toContain('未解析到有效行：需包含“姓名”列'),
    );

    clickTab('产出记录');
    await vi.waitFor(() => expect(document.body.textContent).toContain('产出记录（'));
    const recordsBefore = document.body.textContent.match(/产出记录（\d+）/)?.[0];
    await importAndWait(empty, () => {
      expect(messages()).toContain(FILE_ERROR);
      expect(messages().some((text) => text.includes('需包含'))).toBe(false);
    });
    expect(document.body.textContent).toContain(recordsBefore);

    await importAndWait(fake, () => {
      expect(messages()).toContain(FILE_ERROR);
      expect(messages().some((text) => text.includes('需包含'))).toBe(false);
    });
    expect(document.body.textContent).toContain(recordsBefore);

    clickTab('月度计划');
    await vi.waitFor(() => expect(document.body.textContent).toContain('月度计划'));
    await importAndWait(empty, () => {
      expect(messages()).toContain(FILE_ERROR);
      expect(messages().some((text) => text.includes('需包含'))).toBe(false);
    });

    await importAndWait(fake, () => {
      expect(messages()).toContain(FILE_ERROR);
      expect(messages().some((text) => text.includes('需包含'))).toBe(false);
    });
    clickTab('人员与组织');
    await vi.waitFor(() => expect(document.body.textContent).toContain('人员与组织（'));
  });

  it('合法 xlsx 与 CSV 仍能导入人员', async () => {
    clickTab('人员与组织');
    await vi.waitFor(() => expect(fileInput()).toBeTruthy());
    const before = Number(document.body.textContent.match(/人员与组织（(\d+)）/)?.[1]);
    await importAndWait(
      await xlsxFile([{ 工号: 'E-9101', 姓名: '复测甲' }], 'people.xlsx'),
      () => expect(messages()).toContain('已导入 1 名人员（同工号覆盖更新）'),
    );
    expect(Number(document.body.textContent.match(/人员与组织（(\d+)）/)?.[1])).toBe(before + 1);

    await importAndWait(
      new File(['工号,姓名\nE-9102,复测乙\n'], 'people.csv', { type: 'text/csv' }),
      () => expect(document.body.textContent).toContain('复测乙'),
    );
    expect(Number(document.body.textContent.match(/人员与组织（(\d+)）/)?.[1])).toBe(before + 2);
  });
});
