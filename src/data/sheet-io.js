/**
 * Excel 读写。从 app.jsx 迁出一次，Admin 导入/导出共用，不复制第二份。
 */
import * as XLSX from 'xlsx';

export function readSheet(file){return new Promise((resolve,reject)=>{const rd=new FileReader();rd.onload=e=>{try{const wb=XLSX.read(e.target.result,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];resolve(XLSX.utils.sheet_to_json(ws,{defval:''}))}catch(err){reject(err)}};rd.onerror=reject;rd.readAsArrayBuffer(file)})}
export function downloadSheet(rows,sheetName,fileName){const ws=XLSX.utils.json_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,sheetName);XLSX.writeFile(wb,fileName)}
