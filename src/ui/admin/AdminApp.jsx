import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowLeft, Boxes, Cog, Database, Factory, Image as ImageIcon } from 'lucide-react';
import { useApp } from '../../app-context.jsx';
import { Models, Settings } from '../../app.jsx';
import { AdminBusiness } from './AdminBusiness.jsx';
import { AdminPhotos } from './AdminPhotos.jsx';

export function AdminApp(){
  const {config}=useApp();
  const [tab,setTab]=useState('business');
  const tabs=[['business',Database,'业务数据'],['photos',ImageIcon,'照片库'],['models',Boxes,'模型库'],['settings',Cog,'设置中心']];
  return <div className={`admin ${config.theme==='light'?'light':''}`}>
    <header className="admin-header"><div className="admin-header-inner"><div className="brand"><Factory/><b>后端数据管理</b></div><nav>{tabs.map(([k,I,label])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}><I size={15}/>{label}</button>)}</nav><NavLink to="/" className="admin-back"><ArrowLeft size={15}/>返回展示端</NavLink></div></header>
    <main className="admin-main">{tab==='business'&&<AdminBusiness/>}{tab==='photos'&&<AdminPhotos/>}{tab==='models'&&<Models/>}{tab==='settings'&&<Settings/>}</main>
  </div>;
}
