import React, { useState } from 'react';
import { Download, FileSpreadsheet, Search } from 'lucide-react';
import { useBusiness } from '../../data/DataProvider.jsx';
import { filterPeople, suggestEmployeeId } from '../../data/selectors.js';
import { downloadSheet, readSheet } from '../../data/sheet-io.js';
import { PersonPhoto } from '../../app.jsx';
import { Card } from '../shared.jsx';
import { EmployeeForm, sval } from './forms.jsx';

export function AdminPeople(){
  const {data,patchCollection}=useBusiness();
  const [q,setQ]=useState(''),[editing,setEditing]=useState(null),[msg,setMsg]=useState('');
  if(!data)return <div className="dashboard-loading">加载中…</div>;
  const people=data.people;const list=filterPeople(people,q);
  const blank=()=>({id:suggestEmployeeId(people),name:'',role:'',dept:'',section:'',line:'',site:'厂区 A',manager:'—',status:'在岗'});
  const upsert=emp=>patchCollection('people',prev=>{const clean={id:emp.id||suggestEmployeeId(prev),name:emp.name.trim(),role:sval(emp.role)||'员工',dept:sval(emp.dept)||'未分配',section:sval(emp.section),line:sval(emp.line),site:sval(emp.site)||'厂区 A',manager:emp.manager||'—',status:emp.status||'在岗',photo:emp.photo||'',photoHalf:emp.photoHalf||''};return prev.some(p=>p.id===clean.id)?prev.map(p=>p.id===clean.id?clean:p):[...prev,clean]});
  const remove=id=>patchCollection('people',prev=>prev.filter(p=>p.id!==id));
  const importExcel=async file=>{
    const rows=await readSheet(file);
    const imported=rows.map(r=>({id:sval(r['工号']||r.id),name:sval(r['姓名']||r.name),role:sval(r['岗位']||r.role),dept:sval(r['部门']||r.dept),section:sval(r['工段']||r.section),line:sval(r['线体']||r.line),site:sval(r['场地']||r.site)||'厂区 A',manager:sval(r['直属上级']||r.manager)||'—',status:sval(r['状态']||r.status)||'在岗'})).filter(p=>p.name);
    if(!imported.length){setMsg('未解析到有效行：需包含“姓名”列');return}
    patchCollection('people',prev=>{const byId=new Map(prev.map(p=>[p.id,p]));for(const p of imported){if(!p.id)p.id=suggestEmployeeId([...byId.values()]);const old=byId.get(p.id)||{};byId.set(p.id,{...old,...p})}return[...byId.values()]});
    setMsg(`已导入 ${imported.length} 名人员（同工号覆盖更新）`);
  };
  return <Card title={`人员与组织（${people.length}）`} action={<div className="filter"><Search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="姓名 / 工号 / 部门"/><button className="primary" onClick={()=>setEditing(blank())}>新增人员</button></div>}>
    <div className="admin-tools"><button className="secondary" onClick={()=>downloadSheet([{工号:'E-1100',姓名:'示例员工',岗位:'总装工',部门:'制造一部',工段:'总装工段',线体:'总装线 A',场地:'厂区 A',直属上级:'周敏',状态:'在岗'}],'人员模板','人员导入模板.xlsx')}><Download size={14}/>下载导入模板</button><label className="secondary file-btn"><FileSpreadsheet size={14}/>导入 Excel<input type="file" accept=".xlsx,.xls,.csv" onChange={e=>{const f=e.target.files?.[0];if(f)importExcel(f);e.target.value=''}}/></label><button className="secondary" onClick={()=>downloadSheet(people.map(p=>({工号:p.id,姓名:p.name,岗位:p.role,部门:p.dept,工段:p.section,线体:p.line,场地:p.site,直属上级:p.manager,状态:p.status})),'人员','人员导出.xlsx')}><Download size={14}/>导出当前</button>{msg&&<small className="admin-msg">{msg}</small>}</div>
    <div className="table-scroll"><table className="admin-table"><thead><tr><th>照片</th><th>姓名</th><th>工号</th><th>部门 / 岗位</th><th>工段 / 线体</th><th>场地</th><th>状态</th><th>直属上级</th><th>操作</th></tr></thead><tbody>{list.map(x=><tr key={x.id}><td><PersonPhoto person={x} size={30}/></td><td><b>{x.name}</b></td><td>{x.id}</td><td>{x.dept}<small>{x.role}</small></td><td>{[x.section,x.line].filter(Boolean).join(' / ')||'—'}</td><td>{x.site}</td><td><span className={x.status==='在岗'?'active-state':''}>{x.status}</span></td><td>{x.manager}</td><td className="row-ops"><button className="text" onClick={()=>setEditing({...x})}>编辑</button><button className="text danger-text" onClick={()=>remove(x.id)}>删除</button></td></tr>)}{list.length===0&&<tr><td colSpan={9} className="empty-hint">未找到匹配人员</td></tr>}</tbody></table></div>
    {editing&&<EmployeeForm initial={editing} managers={people.filter(p=>p.id!==editing.id)} onCancel={()=>setEditing(null)} onSave={e=>{upsert(e);setEditing(null)}}/>}
  </Card>;
}
