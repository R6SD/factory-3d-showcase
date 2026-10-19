import React, { useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { useBusiness } from '../../data/DataProvider.jsx';
import { HALF_SUFFIX } from '../../data/photo-match.js';
import { removePhoto, uploadPhoto, usePhotoList } from '../../app.jsx';
import { Card } from '../shared.jsx';

export function AdminPhotos(){
  const photos=usePhotoList();
  const [msg,setMsg]=useState('');const {data}=useBusiness();
  const people=data?.people||[];
  const matchOf=name=>{const base=name.replace(/\.[^.]+$/,'');const half=HALF_SUFFIX.test(base);const stem=base.replace(HALF_SUFFIX,'');const p=people.find(x=>x.name===stem||x.id===stem);return{half,p:stem,matched:p};};
  const upload=async files=>{let ok=0;for(const file of files){try{await uploadPhoto(file);ok++}catch(err){setMsg(String(err.message||err))}}if(ok)setMsg(`已上传 ${ok} 张照片`)};
  return <Card title="照片库" action={<label className="primary file-btn"><Upload size={14}/>上传照片（可多选）<input type="file" accept="image/*" multiple onChange={e=>{upload([...(e.target.files||[])]);e.target.value=''}}/></label>}>
    <div className="photo-rules"><b>命名约定（按文件名自动匹配，全站通用）</b><ul><li>大头照：<code>姓名.jpg</code> 或 <code>工号.jpg</code>，如 <code>赵磊.jpg</code></li><li>半身照：<code>姓名-半身.jpg</code> 或 <code>工号-half.jpg</code>，如 <code>赵磊-半身.jpg</code></li><li>支持 jpg / png / webp，单张 ≤ 20MB；产能排行榜可在大头照与半身照间切换。</li></ul>{msg&&<small className="admin-msg">{msg}</small>}</div>
    <div className="photo-grid">{photos.map(f=>{const m=matchOf(f.name);return <figure key={f.name} className={m.matched?'':'unmatched'}><img src={`/api/photos?name=${encodeURIComponent(f.name)}`} alt={f.name}/><figcaption><b>{f.name}</b><small>{m.matched?`匹配：${m.matched.name} · ${m.half?'半身照':'大头照'}`:'未匹配到人员'}</small><button className="text danger-text" onClick={()=>removePhoto(f.name)}><Trash2 size={13}/>删除</button></figcaption></figure>})}{photos.length===0&&<p className="empty-hint">还没有照片，按上面的命名上传即可自动匹配。</p>}</div>
  </Card>;
}
