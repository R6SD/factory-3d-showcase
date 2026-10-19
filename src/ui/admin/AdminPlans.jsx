import React, { useEffect, useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useApp } from '../../app-context.jsx';
import { buildPlanExportRows, buildPlanRows, applyPlanUpdates, mergePlanImport, parsePlanImport } from '../../data/admin-plans.js';
import { useBusiness } from '../../data/DataProvider.jsx';
import { recentMonths } from '../../data/selectors.js';
import { downloadSheet, readSheet } from '../../data/sheet-io.js';
import { Card } from '../shared.jsx';

export function AdminPlans(){
  const {data,patchCollection}=useBusiness();
  const {t}=useApp();
  const [msg,setMsg]=useState('');
  if(!data)return <div className="dashboard-loading">加载中…</div>;
  const records=data.outputRecords||[];
  const months=recentMonths(6);
  const plans=(data.monthlyPlans)||{};
  const fmt=n=>new Intl.NumberFormat('en-US').format(n);
  const rows=React.useMemo(()=>buildPlanRows(records,plans,months),[records,plans,months]);
  const [draft,setDraft]=useState(()=>Object.fromEntries(rows.map(r=>[r.ym,r.plan])));
  useEffect(()=>{setDraft(Object.fromEntries(rows.map(r=>[r.ym,r.plan])))},[rows]);
  const set=(ym,v)=>setDraft(s=>({...s,[ym]:v}));
  const save=()=>{patchCollection('monthlyPlans', prev=>applyPlanUpdates(prev,draft,months));setMsg(t.plansSaved);};
  const importExcel=async file=>{
    const imported=await readSheet(file).then(parsePlanImport);
    if(!imported.length){setMsg('未解析到有效行：需包含“月份、计划产量”列');return}
    patchCollection('monthlyPlans', prev=>mergePlanImport(prev,imported));
    setMsg(`已导入 ${imported.length} 个月度计划（覆盖更新）`);
  };
  return <Card title={t.plansTitle} action={<button className="primary" onClick={save}>{t.plansSave}</button>}>
    <p className="admin-hint">{t.plansHint}</p>
    <div className="admin-tools"><button className="secondary" onClick={()=>downloadSheet([{月份:'2026-09',计划产量:2294}],'月度计划','月度计划导入模板.xlsx')}><Download size={14}/>下载导入模板</button><label className="secondary file-btn"><FileSpreadsheet size={14}/>导入 Excel<input type="file" accept=".xlsx,.xls,.csv" onChange={e=>{const f=e.target.files?.[0];if(f)importExcel(f);e.target.value=''}}/></label><button className="secondary" onClick={()=>downloadSheet(buildPlanExportRows(records,plans,months),'月度计划','月度计划导出.xlsx')}><Download size={14}/>导出当前</button>{msg&&<small className="admin-msg">{msg}</small>}</div>
    <div className="table-scroll"><table className="admin-table plan-table"><thead><tr><th>{t.plansMonth}</th><th>{t.plansActual}</th><th>{t.plansPlan}</th><th>{t.plansAttainment}</th></tr></thead><tbody>{rows.map(r=>{
      const val=draft[r.ym]===undefined?'':draft[r.ym];
      const cls=r.attainment==null?'':r.attainment>=100?'ok':r.attainment>=90?'warn':'low';
      return <tr key={r.ym}><td><b>{r.ym}</b></td><td>{fmt(r.actual)} {t.unitPcs}</td><td><input type="number" min={0} value={val} onChange={e=>set(r.ym,e.target.value)} placeholder="—"/></td><td>{r.attainment!=null?<span className={`delta ${cls}`}>{r.attainment}%</span>:'—'}</td></tr>;
    })}</tbody></table></div>
  </Card>;
}
