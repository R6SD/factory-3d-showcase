import ExcelJS from 'exceljs';

const Workbook = ExcelJS.Workbook || ExcelJS.default?.Workbook;

function plainCell(value) {
  if (value == null) return '';
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part?.text || '').join('');
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return plainCell(value.result);
    if (typeof value.text === 'string') return value.text;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

function rowsFromMatrix(matrix) {
  if (!matrix.length) return [];
  const headers = matrix[0].map((cell) => String(plainCell(cell)).trim());
  const rows = [];
  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r] || [];
    if (line.every((cell) => String(plainCell(cell)).trim() === '')) continue;
    const record = Object.create(null);
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      const value = c < line.length ? plainCell(line[c]) : '';
      record[key] = value;
    }
    if (Object.keys(record).some((key) => String(record[key]).trim() !== '')) rows.push(record);
  }
  return rows;
}

function parseCsv(text) {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const matrix = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      matrix.push(row);
      row = [];
      field = '';
      continue;
    }
    field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    matrix.push(row);
  }
  return matrix;
}

function worksheetMatrix(worksheet) {
  const matrix = [];
  const lastRow = worksheet.actualRowCount || worksheet.rowCount || 0;
  let lastCol = 0;
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const values = row.values || [];
    if (values.length - 1 > lastCol) lastCol = values.length - 1;
  });
  for (let r = 1; r <= lastRow; r++) {
    const row = worksheet.getRow(r);
    const line = [];
    for (let c = 1; c <= lastCol; c++) line.push(row.getCell(c).value);
    matrix.push(line);
  }
  return matrix;
}

function isCsv(file) {
  const name = String(file?.name || '');
  const type = String(file?.type || '');
  return /\.csv$/i.test(name) || type === 'text/csv' || type === 'application/csv';
}

/** 读取上传的 xlsx/csv，返回首表表头映射的纯对象（null prototype）。 */
export async function readSheet(file) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new TypeError('readSheet expects a File');
  }
  const buffer = await file.arrayBuffer();
  if (isCsv(file)) {
    return rowsFromMatrix(parseCsv(new TextDecoder('utf-8').decode(buffer)));
  }
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  return rowsFromMatrix(worksheetMatrix(sheet));
}

function collectKeys(rows) {
  const keys = [];
  const seen = new Set();
  for (const row of rows || []) {
    if (!row || typeof row !== 'object') continue;
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

function triggerDownload(buffer, fileName) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName || 'export.xlsx';
  document.body?.appendChild(anchor);
  anchor.click();
  anchor.remove?.();
  URL.revokeObjectURL(url);
}

/** 把行写成 xlsx 并触发浏览器下载（与原先 writeFile 的点击下载一致）。 */
export function downloadSheet(rows, sheetName, fileName) {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(sheetName || 'Sheet1');
  const keys = collectKeys(rows);
  if (keys.length) {
    sheet.addRow(keys);
    for (const row of rows) {
      sheet.addRow(keys.map((key) => {
        const value = row?.[key];
        return value == null ? '' : value;
      }));
    }
  }
  workbook.xlsx.writeBuffer().then((buffer) => {
    triggerDownload(buffer, fileName);
  }).catch((err) => {
    console.error('[sheet-io] download failed', err);
  });
}
