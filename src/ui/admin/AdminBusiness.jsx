import React, { useState } from 'react';
import { AdminPeople } from './AdminPeople.jsx';
import { AdminPlans } from './AdminPlans.jsx';
import { AdminRecords } from './AdminRecords.jsx';

export function AdminBusiness(){const [tab,setTab]=useState('people');return <div><div className="admin-subtabs"><button className={tab==='people'?'active':''} onClick={()=>setTab('people')}>人员与组织</button><button className={tab==='records'?'active':''} onClick={()=>setTab('records')}>产出记录</button><button className={tab==='plans'?'active':''} onClick={()=>setTab('plans')}>月度计划</button></div>{tab==='people'?<AdminPeople/>:tab==='records'?<AdminRecords/>:<AdminPlans/>}</div>}
