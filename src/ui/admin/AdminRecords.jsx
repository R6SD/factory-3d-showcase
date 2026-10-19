import React, { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useBusiness } from '../../data/DataProvider.jsx';
import { downloadSheet, readSheet } from '../../data/sheet-io.js';
import { Card } from '../shared.jsx';
import { RecordForm, sval } from './forms.jsx';

export function AdminRecords(){
  const {data,patchCollection}=useBusiness();
  const [editing,setEditing]=useState(null),[msg,setMsg]=useState('');
  if(!data)return <div className="dashboard-loading">加载中…</div>;
  const records=data.outputRecords||[];
  const blank=()=>({date:new Date().toISOString().slice(0,10),dept:'',section:'',line:'',person:'',qty:0});
  const upsert=row=>patchCollection('outputRecords',prev=>{const clean={date:sval(row.date),dept:sval(row.dept),section:sval(row.section),line:sval(row.line),person:sval(row.person),qty:Number(row.qty)||0};const key=r=>`${r.date}|${r.person}|${r.line}`;const i=prev.findIndex(r=>key(r)===key(clean)&&r!==clean);if(i>=0){const next=[...prev];next[i]=clean;return next}return[...prev,clean]});
  const remove=(date,person,line)=>patchCollection('outputRecords',prev=>prev.filter(r=>!(r.date===date&&r.person===person&&r.line===line)));
  const importExcel=async file=>{
    const rows=await readSheet(file);
    const imported=rows.map(r=>({date:sval(r['日期']||r.date),dept:sval(r['部门']||r.dept),section:sval(r['工段']||r.section),line:sval(r['线体']||r.line),person:sval(r['姓名']||r.person),qty:Number(r['产量']??r.qty)||0})).filter(r=>r.date&&r.person);
    if(!imported.length){setMsg('未解析到有效行：需包含“日期、姓名、产量”列');return}
    patchCollection('outputRecords',prev=>{const map=new Map(prev.map(r=>[`${r.date}|${r.person}|${r.line}`,r]));for(const r of imported)map.set(`${r.date}|${r.person}|${r.line}`,r);return[...map.values()]});
    setMsg(`已导入 ${imported.length} 条产出记录（同日同人同线覆盖）`);
  };
  const sorted=[...records].sort((a,b)=>b.date.localeCompare(a.date)||a.person.localeCompare(b.person));
  return <Card title={`产出记录（${records.length}）`} action={<button className="primary" onClick={()=>setEditing(blank())}>新增记录</button>}>
    <div className="admin-tools"><button className="secondary" onClick={()=>downloadSheet([{日期:'2026-09-01',部门:'制造一部',工段:'总装工段',线体:'总装线 A',姓名:'赵磊',产量:280}],'产出模板','产出记录导入模板.xlsx')}><Download size={14}/>下载导入模板</button><label className="secondary file-btn"><FileSpreadsheet size={14}/>导入 Excel<input type="file" accept=".xlsx,.xls,.csv" onChange={e=>{const f=e.target.files?.[0];if(f)importExcel(f);e.target.value=''}}/></label><button className="secondary" onClick={()=>downloadSheet(records.map(r=>({日期:r.date,部门:r.dept,工段:r.section,线体:r.line,姓名:r.person,产量:r.qty})),'产出记录','产出记录导出.xlsx')}><Download size={14}/>导出当前</button>{msg&&<small className="admin-msg">{msg}</small>}</div>
    <div className="table-scroll"><table className="admin-table"><thead><tr><th>日期</th><th>部门</th><th>工段</th><th>线体</th><th>姓名</th><th>产量</th><th>操作</th></tr></thead><tbody>{sorted.slice(0,300).map((r,i)=><tr key={`${r.date}-${r.person}-${r.line}-${i}`}><td>{r.date}</td><td>{r.dept}</td><td>{r.section}</td><td>{r.line}</td><td>{r.person}</td><td><b>{r.qty}</b></td><td className="row-ops"><button className="text" onClick={()=>setEditing({...r})}>编辑</button><button className="text danger-text" onClick={()=>remove(r.date,r.person,r.line)}>删除</button></td></tr>)}{sorted.length===0&&<tr><td colSpan={7} className="empty-hint">暂无产出记录</td></tr>}</tbody></table></div>
    {sorted.length>300&&<p className="admin-msg">仅显示最近 300 条，可用导出查看全部。</p>}
    {editing&&<RecordForm initial={editing} people={data.people} onCancel={()=>setEditing(null)} onSave={r=>{upsert(r);setEditing(null)}}/>}
  </Card>;
}
