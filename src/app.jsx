import React, { createContext, useContext, useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Boxes, ChevronLeft, ChevronRight, CircleUserRound, Cog, Factory, FileBox, FileUp, Gauge, GitBranch, Globe2, LayoutDashboard, Maximize2, Menu, Moon, PanelLeftClose, PanelLeftOpen, Search, Settings2, Sun, Upload, X, Database, FileSpreadsheet, Download, Trash2, ArrowLeft, Image as ImageIcon } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';
import { SceneRuntime, createFactoryModel } from './scene/SceneRuntime.js';
import { loadModelByName } from './scene/ModelLoader.js';
import { defaults, loadConfig, STORE_KEY as STORE } from './scene/scene-config.js';
import { pickHomeTitle } from './scene/viewer-title.js';
import { upsertModel, mergeModelRecord } from './scene/model-record.js';
import { DataProvider, useBusiness } from './data/DataProvider.jsx';
import { filterPeople, buildManagerGraph, suggestEmployeeId, directReportCount, sumQty, personRanking, lineDaily, distinctValues, recentMonths, prevMonth, monthTrend, monthStats, groupSumWithDelta, recordsOfDept, monthPlanAttainment } from './data/selectors.js';
import { buildPlanRows, applyPlanUpdates, parsePlanImport, mergePlanImport, buildPlanExportRows } from './data/admin-plans.js';
import { Meteors, NumberTicker } from './ui/effects.jsx';
import * as XLSX from 'xlsx';
import { configRepository } from './data/configRepository.js';
import { photoFileOf as matchPhotoFile, HALF_SUFFIX } from './data/photo-match.js';
const strings = { zh:{workbench:'场地总览',capacity:'产能看板',sites:'场地管理',people:'人员管理',organization:'组织关系',models:'模型库',settings:'设置中心',search:'搜索员工、场地、产线或模型',import:'导入模型',overview:'场地总览',reset:'重置视角',fullscreen:'全屏',scene:'模型与场景',general:'常规',brand:'品牌与外观',nav:'导航',performance:'性能与渲染',system:'数据与集成',display:'展示模式',standard:'标准',showcase:'展示',static:'静态',environment:'环境预设',factory:'工厂',studio:'工作室',dusk:'黄昏',speed:'旋转速度',camera:'镜头交互',render:'渲染质量',grid:'显示网格',shadows:'启用阴影',fov:'镜头 FOV',dpr:'渲染像素比',exposure:'曝光度',ambient:'环境光强度',sunlight:'主光强度',shadowSoftness:'阴影柔化',shadowQuality:'阴影质量',shadowLow:'基础',shadowMedium:'标准',shadowHigh:'增强',rotate:'旋转',zoom:'缩放',pan:'平移',low:'节能',balanced:'均衡',quality:'高质量',auto:'自动',restore:'恢复默认',today:'今日生产',target:'目标达成',oee:'综合效率 OEE',online:'设备在线',onlineScene:'在线场景',openOnlineScene:'打开在线场景',onlineSceneUrl:'在线场景链接',onlineSceneHint:'粘贴 Spline 等外部 3D 场景链接（https://…），在项目内浮层中打开展示。',carousel:'模型轮播',carouselEnable:'启用轮播',carouselInterval:'轮播间隔',carouselModels:'选择轮播模型',stereo3d:'裸眼 3D',stereoMode:'立体模式',stereoOff:'关闭',stereoParallax:'运动视差',stereoBarrier:'视差屏障',stereoSbs:'并排立体',stereoAnaglyph:'红蓝立体',parallaxStrength:'视差强度',parallaxAuto:'自动微摆',fxMeteors:'流星氛围背景',refreshData:'刷新数据',resetBusiness:'重置为默认数据',addEmployee:'新增员工',editEmployee:'编辑',deleteEmployee:'删除',save:'保存',cancel:'取消',dataSource:'数据来源',sourceBackend:'本地后端服务（已落盘）',sourceLocal:'浏览器本地存储',employeeName:'姓名',employeeRole:'岗位',employeeDept:'部门',employeeSite:'所属场地',employeeManager:'直属上级',employeeStatus:'状态',atWork:'在岗',resting:'休息',closeOnline:'关闭',capTitle:'部门产能总览',monthSuffix:'月',kpiOutput:'本月总产出',kpiOutputHint:'全部门合计产出',kpiDaily:'日均产出',kpiWorkingDays:'有效工作日',kpiPerCapita:'人均产出',kpiContributors:'参与产出',kpiFocus:'重点关注',kpiFocusOk:'各部门环比均未下滑',kpiFocusDeclined:'环比下滑：',kpiPlan:'计划达成',kpiPlanHint:'月计划',kpiPlanNone:'本月暂无计划',unitPcs:'件',unitPcsPerDay:'件/日',unitPcsPerPerson:'件/人',unitDepts:'个部门',momTitle:'与上月环比',momLabel:'环比',drillAll:'全部部门',drillHint:'下钻中：工段与个人排名仅统计该部门',capDeptsCard:'整月部门总产能（点击行下钻）',capTrendCard:'近 6 个月产出趋势',capTrendClick:'点击柱体切换月份。',capCurrent:'当前',capMoMUp:'环比增长',capMoMDown:'环比下降',capSectionsCard:'分工段产出',capLineDaily:'线体日产能',capMonthTotal:'月合计',capWorkingDays:'工作日',capDailyAvg:'日均',capRankTitle:'个人产出排名',photoHead:'大头照',photoHalf:'半身照',plansTitle:'月度计划',plansMonth:'月份',plansActual:'实际产出',plansPlan:'计划产量',plansAttainment:'达成率',plansSave:'保存计划',plansSaved:'月度计划已保存',plansHint:'近 6 个月的月度计划总量；留空视为无计划。',emptyNoOutput:'本月暂无产出',emptyNoSection:'本月暂无工段产出',emptyNoLine:'该线体本月暂无记录',emptyNoPerson:'本月暂无个人产出'}, en:{workbench:'Site overview',capacity:'Capacity',sites:'Sites',people:'People',organization:'Organization',models:'Models',settings:'Settings',search:'Search people, sites, lines, or models',import:'Import model',overview:'Site Overview',reset:'Reset view',fullscreen:'Fullscreen',scene:'Models & scene',general:'General',brand:'Brand & appearance',nav:'Navigation',performance:'Performance & render',system:'Data & integrations',display:'Display mode',standard:'Standard',showcase:'Showcase',static:'Static',environment:'Environment',factory:'Factory',studio:'Studio',dusk:'Dusk',speed:'Rotation speed',camera:'Camera controls',render:'Render quality',grid:'Show grid',shadows:'Enable shadows',fov:'Camera FOV',dpr:'Pixel ratio',exposure:'Exposure',ambient:'Ambient light',sunlight:'Main light',shadowSoftness:'Shadow softness',shadowQuality:'Shadow quality',shadowLow:'Basic',shadowMedium:'Standard',shadowHigh:'Enhanced',rotate:'Rotate',zoom:'Zoom',pan:'Pan',low:'Power saver',balanced:'Balanced',quality:'High quality',auto:'Auto',restore:'Restore defaults',today:"Today's output",target:'Target progress',oee:'OEE',online:'Equipment online',onlineScene:'Online scene',openOnlineScene:'Open online scene',onlineSceneUrl:'Online scene URL',onlineSceneHint:'Paste an external 3D scene link (https://...) to view it in an in-app overlay.',carousel:'Model Carousel',carouselEnable:'Enable Carousel',carouselInterval:'Carousel Interval',carouselModels:'Select Models',stereo3d:'Glasses-free 3D',stereoMode:'Stereo mode',stereoOff:'Off',stereoParallax:'Motion parallax',stereoBarrier:'Parallax barrier',stereoSbs:'Side by side',stereoAnaglyph:'Anaglyph',parallaxStrength:'Parallax',parallaxAuto:'Auto sway',fxMeteors:'Meteor ambient',refreshData:'Refresh',resetBusiness:'Reset to defaults',addEmployee:'Add employee',editEmployee:'Edit',deleteEmployee:'Delete',save:'Save',cancel:'Cancel',dataSource:'Data source',sourceBackend:'Local backend (persisted)',sourceLocal:'Browser local storage',employeeName:'Name',employeeRole:'Role',employeeDept:'Department',employeeSite:'Site',employeeManager:'Manager',employeeStatus:'Status',atWork:'On duty',resting:'Off',closeOnline:'Close',capTitle:'Department Capacity Overview',monthSuffix:'',kpiOutput:'Monthly Output',kpiOutputHint:'Total output, all departments',kpiDaily:'Daily Average',kpiWorkingDays:'Working days',kpiPerCapita:'Per-capita Output',kpiContributors:'Contributors',kpiFocus:'Needs Attention',kpiFocusOk:'No department declined MoM',kpiFocusDeclined:'Declined MoM: ',kpiPlan:'Plan Attainment',kpiPlanHint:'Monthly plan',kpiPlanNone:'No plan this month',unitPcs:'pcs',unitPcsPerDay:'pcs/day',unitPcsPerPerson:'pcs/person',unitDepts:' depts',momTitle:'vs last month',momLabel:'MoM',drillAll:'All departments',drillHint:'Drill-down: sections and ranking filtered to this department',capDeptsCard:'Monthly Output by Department (click to drill down)',capTrendCard:'Output Trend · Last 6 Months',capTrendClick:'Click a bar to switch month. ',capCurrent:'Current',capMoMUp:'up',capMoMDown:'down',capSectionsCard:'Output by Section',capLineDaily:'Daily Output by Line',capMonthTotal:'Month total',capWorkingDays:'working days',capDailyAvg:'daily avg',capRankTitle:'Individual Output Ranking',photoHead:'Headshot',photoHalf:'Half-body',plansTitle:'Monthly Plans',plansMonth:'Month',plansActual:'Actual Output',plansPlan:'Planned Output',plansAttainment:'Attainment',plansSave:'Save Plans',plansSaved:'Monthly plans saved',plansHint:'Monthly planned totals for the last 6 months; leave blank for no plan.',emptyNoOutput:'No output this month',emptyNoSection:'No section output this month',emptyNoLine:'No records for this line this month',emptyNoPerson:'No individual output this month'} };
const Ctx = createContext();
const useApp = () => useContext(Ctx);
class ErrorBoundary extends React.Component{constructor(p){super(p);this.state={hasError:false}}static getDerivedStateFromError(){return{hasError:true}}componentDidCatch(e){console.error('[Factory3D] render error:',e)}render(){if(this.state.hasError)return <div style={{display:'grid',placeItems:'center',height:'100vh',background:'#020715',color:'#93a8c8',fontFamily:'Noto Sans SC'}}><div style={{textAlign:'center'}}><h2 style={{color:'#6B9FFF',marginBottom:8}}>渲染异常</h2><p>页面组件发生错误，请刷新页面重试。</p><button onClick={()=>location.reload()} style={{marginTop:16,padding:'8px 20px',background:'#6B9FFF',border:0,borderRadius:4,cursor:'pointer',color:'#04101f',fontWeight:600}}>刷新页面</button></div></div>;return this.props.children}}
function load(){return loadConfig()}
function Provider({children}){const [config,setConfig]=useState(load);useEffect(()=>{localStorage.setItem(STORE,JSON.stringify(config));configRepository.push(config);window.__carouselConfig=config.carousel||{}},[config]);useEffect(()=>{configRepository.init().then(remote=>{if(remote)setConfig(()=>remote)}).catch(()=>{})},[]);useEffect(()=>{const sync=e=>setConfig(x=>({...x,viewer:{...x.viewer,...e.detail}}));const syncIcon=e=>setConfig(x=>({...x,branding:{...x.branding,icon:e.detail}}));const removeModel=e=>setConfig(x=>({...x,models:x.models.filter(m=>m.name!==e.detail)}));const markModelMissing=e=>setConfig(x=>({...x,models:x.models.map(m=>m.name===e.detail?{...m,available:false}:m)}));const restoreLibrary=async()=>{const saved=await window.factoryModelStorage?.listModels();if(!saved?.length)return;setConfig(x=>{const byName=new Map(x.models.map(m=>[m.name,m]));const savedNames=new Set(saved.map(f=>f.name));const merged=saved.map(f=>mergeModelRecord(byName.get(f.name),f));const extra=x.models.filter(m=>!savedNames.has(m.name));return {...x,models:[...extra,...merged]};})};restoreLibrary();window.addEventListener('factory-viewer-title-change',sync);window.addEventListener('factory-brand-icon-change',syncIcon);window.addEventListener('factory-model-delete',removeModel);window.addEventListener('factory-model-missing',markModelMissing);return()=>{window.removeEventListener('factory-viewer-title-change',sync);window.removeEventListener('factory-brand-icon-change',syncIcon);window.removeEventListener('factory-model-delete',removeModel);window.removeEventListener('factory-model-missing',markModelMissing)}},[]);return <Ctx.Provider value={{config,setConfig,t:strings[config.language]}}>{children}</Ctx.Provider>}
const routes=[['/',LayoutDashboard,'workbench'],['/capacity',Gauge,'capacity'],['/organization',GitBranch,'organization']];
// 员工 / 场地 / 产能等业务数据统一来自数据层 src/data，由 DataProvider 经 useBusiness() 提供

function Shell(){const {config,setConfig,t}=useApp(),loc=useLocation();const current=routes.find(x=>x[0]===loc.pathname)||routes[0];const next=()=>setConfig(x=>({...x,nav:x.nav==='open'?'mini':x.nav==='mini'?'overlay':'open'}));return <div className={`app ${config.theme} nav-${config.nav}`}><header><div className="brand"><Factory/><div><b>{config.branding.title}</b></div></div><h1>{t[current[2]]}</h1><div className="actions"><ViewerClock/><button className="lang-toggle" onClick={()=>setConfig(x=>({...x,language:x.language==='zh'?'en':'zh'}))} title={config.language==='zh'?'Switch to English':'切换到中文'}><Globe2 size={18}/><span>{config.language==='zh'?'EN':'中'}</span></button></div></header><aside><button className="nav-mode" onClick={next} title="切换导航模式">{config.nav==='open'?<PanelLeftClose/>:config.nav==='mini'?<PanelLeftOpen/>:<Menu/>}</button>{routes.map(([to,Icon,key])=><NavLink to={to} end={to==='/' } key={to} title={t[key]}><Icon size={19}/><span>{t[key]}</span></NavLink>)}</aside><main><Routes><Route path="/" element={<Home/>}/><Route path="/capacity" element={<Capacity/>}/><Route path="/organization" element={<Organization/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></main><OnlineSceneOverlay/></div>}
function OnlineSceneOverlay(){const{config,setConfig,t}=useApp();if(!config.onlineScene?.enabled||!config.onlineScene?.url)return null;const close=()=>setConfig(x=>({...x,onlineScene:{...x.onlineScene,enabled:false}}));return <div className="online-scene-overlay" onClick={e=>{if(e.target===e.currentTarget)close()}}><div className="online-scene-panel"><div className="online-scene-head"><b>{t.onlineScene}</b><button onClick={close}><X size={16}/>{t.closeOnline}</button></div><iframe src={config.onlineScene.url} title="online-scene" allow="fullscreen; webgpu; xr-spatial-tracking; autoplay; clipboard-read; clipboard-write"/></div></div>}
function Card({title,action,children}){return <section className="card"><div className="card-head"><h2>{title}</h2>{action}</div>{children}</section>}
function Home(){const {config}=useApp();const [activeModel,setActiveModel]=useState(()=>localStorage.getItem('factory-active-model')||'');useEffect(()=>{const h=e=>setActiveModel(e.detail||'');window.addEventListener('factory-active-model-change',h);return()=>window.removeEventListener('factory-active-model-change',h)},[]);const activeAlias=config.models.find(m=>m.name===activeModel)?.alias||'';return <div className="viewer-page"><div className="viewer-top"><div><small>{config.viewer.eyebrow}</small><h2>{pickHomeTitle(activeModel,config.viewer,config.language,activeAlias)}</h2></div></div><Scene/><footer><span>拖动旋转 · 滚轮缩放 · 双击归位</span><span>WEBGL 2.0</span></footer></div>}
function Importer(){const {t}=useApp(),[open,setOpen]=useState(false);return <div className="importer"><button className="primary" onClick={()=>setOpen(v=>!v)}><Upload size={15}/>{t.import}</button>{open&&<div className="import-menu"><b>{t.import}</b><p>GLB / glTF / FBX / OBJ</p><label><FileUp size={18}/>选择本地模型<input type="file" accept=".glb,.gltf,.fbx,.obj" onChange={e=>{const f=e.target.files?.[0];if(f)window.dispatchEvent(new CustomEvent('factory-import',{detail:{file:f,silent:false}}));setOpen(false)}}/></label><small>最大 200MB；OBJ 的材质与纹理须与模型同目录。</small></div>}</div>}
function Scene(){const host=useRef(),rt=useRef(null),{config,setConfig,t}=useApp(),[notice,setNotice]=useState(''),[loading,setLoading]=useState(false),[dragOver,setDragOver]=useState(false);useEffect(()=>{const runtime=new SceneRuntime(host.current,{onNotice:setNotice,onLoading:setLoading,onDragOver:setDragOver,onModelLoaded:file=>setConfig(x=>({...x,models:upsertModel(x.models,{name:file.name,format:file.name.split('.').pop().toUpperCase(),size:file.size,updated:new Date().toLocaleDateString(),tag:'本地导入'})}))});rt.current=runtime;runtime.updateConfig(config.scene);return()=>runtime.dispose()},[]);useEffect(()=>{rt.current?.updateConfig(config.scene)},[config.scene]);return <div className={`viewer${dragOver?' drag-over':''}`}><div className="three" ref={host}/>{config.scene.fxMeteors!==false&&<Meteors/>}{loading&&<div className="loading-overlay"><div className="loading-spinner"/><p>正在解析三维模型…</p></div>}{dragOver&&<div className="drop-zone"><div className="drop-icon">⬆</div><p>释放以导入模型</p><small>支持 GLB / glTF / FBX / OBJ</small></div>}{notice&&<div className="notice">{notice}<button onClick={()=>setNotice('')}><X size={14}/></button></div>}<ModelSwitcher/><Compass3D/><div className="view-actions"><div className="view-presets"><button onClick={()=>window.__factorySceneRuntime?.setView('top')} title="顶视图">T</button><button onClick={()=>window.__factorySceneRuntime?.setView('front')} title="前视图">F</button><button onClick={()=>window.__factorySceneRuntime?.setView('side')} title="侧视图">S</button><button onClick={()=>window.__factorySceneRuntime?.setView('default')} title="默认视角"><Settings2 size={13}/></button></div><StereoToggle/><DisplayModeToggle/><Outliner/><PerformanceMonitor/><button onClick={()=>window.dispatchEvent(new Event('factory-reset'))}><Settings2 size={15}/>{t.reset}</button><button onClick={()=>window.__factorySceneRuntime?.screenshot()}><Maximize2 size={15}/>截图</button><button onClick={()=>document.querySelector('.viewer-page').requestFullscreen?.()}><Maximize2 size={15}/>{t.fullscreen}</button>{config.onlineScene?.url&&<button onClick={()=>setConfig(x=>({...x,onlineScene:{...x.onlineScene,enabled:true}}))}><Globe2 size={15}/>{t.onlineScene}</button>}</div><ModelInfoBadge/></div>}
function ModelInfoBadge(){const [info,setInfo]=useState(null);useEffect(()=>{const update=()=>{const fn=window.__factorySceneRuntime&&window.__factorySceneRuntime.getModelInfo;if(fn){const i=fn();setInfo(i)}};update();const h=setInterval(update,1500);window.addEventListener('factory-active-model-change',update);window.addEventListener('factory-scene-ready',update);return()=>{clearInterval(h);window.removeEventListener('factory-active-model-change',update);window.removeEventListener('factory-scene-ready',update)}},[]);if(!info)return null;return <div className="model-info-badge"><span>{info.meshes} 网格</span><i/><span>{(info.tris/1000).toFixed(1)}k 三角面</span><i/><span>{info.materials} 材质</span></div>}
function ViewerClock(){const [time,setTime]=useState('');useEffect(()=>{const update=()=>{const d=new Date();setTime(d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}))};update();const h=setInterval(update,1000);return()=>clearInterval(h)},[]);return <div className="viewer-clock">{time}</div>}
function ModelSwitcher() {
  const { config } = useApp();
  const [active, setActive] = useState(() => localStorage.getItem('factory-active-model') || '__factory_default__');
  const [switchMode, setSwitchMode] = useState(false);
  const [pressing, setPressing] = useState(false);

  useEffect(() => {
    const h = e => setActive(e.detail || '__factory_default__');
    window.addEventListener('factory-active-model-change', h);
    return () => window.removeEventListener('factory-active-model-change', h);
  }, []);

  const modelList = ['__factory_default__', ...(config.models || []).map(m => m.name)];
  const idx = modelList.indexOf(active);

  const switchTo = (name) => {
    if (name === active) return;
    localStorage.setItem('factory-active-model', name);
    window.dispatchEvent(new CustomEvent('factory-active-model-change', { detail: name }));
    if (name === '__factory_default__' || name === 'Factory Campus A.glb') {
      window.dispatchEvent(new Event('factory-show-default'));
    } else {
      window.dispatchEvent(new CustomEvent('factory-show-model', { detail: { name, silent: true } }));
    }
  };
  const prev = () => {
    if (modelList.length <= 1) return;
    switchTo(modelList[(idx - 1 + modelList.length) % modelList.length]);
  };
  const next = () => {
    if (modelList.length <= 1) return;
    switchTo(modelList[(idx + 1) % modelList.length]);
  };
  const confirmSelection = () => setSwitchMode(false);

  useEffect(() => {
    const viewer = document.querySelector('.viewer');
    if (!viewer) return;
    let touchStartX = 0, touchStartY = 0, longPressTimer = null, pressStartPos = null;

    const raycastModel = (clientX, clientY) => {
      const rt = window.__factorySceneRuntime;
      if (!rt || !rt.camera || !rt.getModel()) return false;
      const bounds = viewer.getBoundingClientRect();
      const pointer = new rt.THREE.Vector2(
        (clientX - bounds.left) / bounds.width * 2 - 1,
        -(clientY - bounds.top) / bounds.height * 2 + 1
      );
      const raycaster = new rt.THREE.Raycaster();
      raycaster.setFromCamera(pointer, rt.camera);
      return !!raycaster.intersectObject(rt.getModel(), true)[0];
    };

    const setViewerPress = (pressed) => {
      // 调用 SceneRuntime 的 3D 空间按压回弹（相机 zoom + 模型 scale 联动）
      window.__factorySceneRuntime?.pressBounce(pressed);
    };

    const onTouchStart = e => {
      if (e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    };
    const onTouchEnd = e => {
      if (!e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) next(); else prev();
      }
    };
    const onPointerDown = e => {
      if (e.button !== 0) return;
      if (!raycastModel(e.clientX, e.clientY)) return;
      pressStartPos = { x: e.clientX, y: e.clientY };
      setPressing(true);
      longPressTimer = setTimeout(() => {
        setPressing(false);
        // 长按激活：果冻按压回弹后进入切换模式
        setViewerPress(true);
        setTimeout(() => setViewerPress(false), 140);
        setSwitchMode(true);
      }, 500);
    };
    const onPointerMove = e => {
      if (!pressStartPos || !longPressTimer) return;
      const dx = e.clientX - pressStartPos.x;
      const dy = e.clientY - pressStartPos.y;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        setPressing(false);
      }
    };
    const onPointerUp = () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      setPressing(false);
    };
    const onContextMenu = e => e.preventDefault();

    const onKeyDown = e => {
      if (!switchMode) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); confirmSelection(); }
    };

    viewer.addEventListener('touchstart', onTouchStart, { passive: true });
    viewer.addEventListener('touchend', onTouchEnd, { passive: true });
    viewer.addEventListener('pointerdown', onPointerDown);
    viewer.addEventListener('pointermove', onPointerMove);
    viewer.addEventListener('pointerup', onPointerUp);
    viewer.addEventListener('pointerleave', onPointerUp);
    viewer.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      viewer.removeEventListener('touchstart', onTouchStart);
      viewer.removeEventListener('touchend', onTouchEnd);
      viewer.removeEventListener('pointerdown', onPointerDown);
      viewer.removeEventListener('pointermove', onPointerMove);
      viewer.removeEventListener('pointerup', onPointerUp);
      viewer.removeEventListener('pointerleave', onPointerUp);
      viewer.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [idx, modelList.length, switchMode]);

  if (modelList.length <= 1) return null;

  return (
    <>
      <button className={`model-switch-btn model-switch-prev${switchMode ? ' show' : ''}`} onClick={prev} title="上一个模型 (←)">
        <ChevronLeft size={24} />
      </button>
      <button className={`model-switch-btn model-switch-next${switchMode ? ' show' : ''}`} onClick={next} title="下一个模型 (→)">
        <ChevronRight size={24} />
      </button>
      {switchMode && (
        <div className="model-switch-hint">
          模型切换模式 · ← → 切换 · Enter 确认
          <button className="model-switch-confirm" onClick={confirmSelection}>确认</button>
        </div>
      )}
      {pressing && <div className="model-press-ring" />}
    </>
  );
}
function SunControl({config,onChange}){const ringRef=useRef(null),[drag,setDrag]=useState(false),[hover,setHover]=useState(false);const phi=((config.scene.sunAzimuth??45)%360+360)%360;const apply=a=>{const az=Math.round(((a%360)+360)%360),rad=az*Math.PI/180,elev=Math.round(12+66*Math.max(0,Math.cos(rad)));onChange({sunAzimuth:az,sunElevation:elev})};const fromEvent=e=>{const el=ringRef.current;if(!el)return;const rc=el.getBoundingClientRect(),dx=e.clientX-(rc.left+rc.width/2),dy=e.clientY-(rc.top+rc.height/2);let a=Math.atan2(dx,-dy)*180/Math.PI;if(a<0)a+=360;apply(a)};const down=e=>{e.preventDefault();setDrag(true);fromEvent(e);ringRef.current?.setPointerCapture(e.pointerId)};const move=e=>{if(drag)fromEvent(e)};const up=e=>{setDrag(false);ringRef.current?.releasePointerCapture?.(e.pointerId)};const C=60,R=46,rad=phi*Math.PI/180,sx=C+Math.sin(rad)*R,sy=C-Math.cos(rad)*R,trackPt=th=>(C+R*Math.sin(th)).toFixed(2)+" "+(C-R*Math.cos(th)).toFixed(2),gap=30*Math.PI/180,trackD=`M ${trackPt(rad+gap)} A ${R} ${R} 0 1 1 ${trackPt(rad-gap)}`,rays=[0,45,90,135,180,225,270,315];return <div className="sun-control"><div className="sun-control-head"><b>太阳环绕</b></div><div className={`sun-ring${drag||hover?' is-active':''}`} ref={ringRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerEnter={()=>setHover(true)} onPointerLeave={()=>setHover(false)}><svg viewBox="0 0 120 120" width="100%" height="100%"><defs><radialGradient id="sunHaloGrad" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="rgba(255,196,104,.42)"/><stop offset="70%" stopColor="rgba(255,176,80,.14)"/><stop offset="100%" stopColor="rgba(255,176,80,0)"/></radialGradient></defs><circle className="sun-core" cx="60" cy="60" r="34"/><path className="sun-track" d={trackD}/><g transform={`translate(${sx} ${sy})`}><circle className="sun-halo" r="18" fill="url(#sunHaloGrad)"/><g className="sun-glyph" fill="none">{rays.map(a=>{const rr=a*Math.PI/180,x1=Math.sin(rr)*8.5,y1=-Math.cos(rr)*8.5,x2=Math.sin(rr)*12,y2=-Math.cos(rr)*12;return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2}/>})}<circle r="5.6"/></g></g></svg></div></div>}
function Compass3D(){const ref=useRef(null),gRef=useRef(null);useEffect(()=>{let raf;const tick=()=>{const rt=window.__factorySceneRuntime;if(rt&&rt.camera&&gRef.current){const dir=rt.camera.getWorldDirection(new rt.THREE.Vector3());const yaw=Math.atan2(dir.x,dir.z)*180/Math.PI;gRef.current.setAttribute('transform',`rotate(${yaw} 40 40)`)}raf=requestAnimationFrame(tick)};tick();return()=>cancelAnimationFrame(raf)},[]);const setView=(dir)=>window.__factorySceneRuntime?.setView(dir);return <div className="compass-3d" ref={ref}><svg viewBox="0 0 80 80" width="88" height="88"><defs><radialGradient id="compassBg" cx="50%" cy="40%" r="60%"><stop offset="0%" stopColor="rgba(30,50,80,.9)"/><stop offset="100%" stopColor="rgba(8,16,32,.95)"/></radialGradient><filter id="compassGlow"><feGaussianBlur stdDeviation="1.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><circle cx="40" cy="40" r="37" fill="url(#compassBg)" stroke="rgba(120,170,255,.35)" strokeWidth="1.5"/><circle cx="40" cy="40" r="32" fill="none" stroke="rgba(120,170,255,.12)" strokeWidth=".5"/>{[0,45,90,135,180,225,270,315].map((a,i)=>{const isMain=i%2===0;const r1=isMain?26:29;const r2=32;const x1=40+Math.sin(a*Math.PI/180)*r1;const y1=40-Math.cos(a*Math.PI/180)*r1;const x2=40+Math.sin(a*Math.PI/180)*r2;const y2=40-Math.cos(a*Math.PI/180)*r2;return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={isMain?'rgba(180,210,255,.7)':'rgba(120,150,200,.35)'} strokeWidth={isMain?1.5:.8}/>})}<g onClick={()=>setView('front')} style={{cursor:'pointer'}}><text x="40" y="18" dominantBaseline="central" textAnchor="middle" fill="#ff7b6b" fontSize="12" fontWeight="700" fontFamily="JetBrains Mono,monospace">N</text></g><g onClick={()=>setView('side')} style={{cursor:'pointer'}}><text x="62" y="40" dominantBaseline="central" textAnchor="middle" fill="rgba(205,225,255,.92)" fontSize="10" fontWeight="700" fontFamily="JetBrains Mono,monospace">E</text></g><text x="40" y="62" dominantBaseline="central" textAnchor="middle" fill="rgba(205,225,255,.92)" fontSize="10" fontWeight="700" fontFamily="JetBrains Mono,monospace">S</text><text x="18" y="40" dominantBaseline="central" textAnchor="middle" fill="rgba(205,225,255,.92)" fontSize="10" fontWeight="700" fontFamily="JetBrains Mono,monospace">W</text><g ref={gRef}><polygon points="40,24 37,33 43,33" fill="#ff7b6b" filter="url(#compassGlow)"/><polygon points="40,56 37,47 43,47" fill="rgba(120,170,255,.5)"/></g><circle cx="40" cy="40" r="3" fill="rgba(180,210,255,.9)"/><circle cx="40" cy="40" r="1.5" fill="#fff"/></svg></div>}
function DisplayModeToggle(){const [mode,setMode]=useState('solid');const modes=[{key:'solid',label:'实体',icon:'■'},{key:'wireframe',label:'线框',icon:'▦'},{key:'points',label:'点云',icon:'⋯'}];const cycle=()=>{const idx=modes.findIndex(m=>m.key===mode);const next=modes[(idx+1)%modes.length];setMode(next.key);window.__factorySceneRuntime?.setDisplayMode(next.key)};const cur=modes.find(m=>m.key===mode);return <button onClick={cycle} title={`显示模式：${cur.label}`} className="display-mode-btn"><span>{cur.icon}</span>{cur.label}</button>}
function StereoToggle(){const {config,setConfig,t}=useApp();const order=['off','parallax','barrier','sbs','anaglyph'];const labels={off:t.stereoOff,parallax:t.stereoParallax,barrier:t.stereoBarrier,sbs:t.stereoSbs,anaglyph:t.stereoAnaglyph};const cur=config.scene.stereoMode||'off';const cycle=()=>{const i=order.indexOf(cur);setConfig(x=>({...x,scene:{...x.scene,stereoMode:order[(i+1)%order.length]}}))};return <button onClick={cycle} className={`stereo-toggle${cur!=='off'?' active':''}`} title={`${t.stereoMode}（点击切换）：${labels[cur]}`}>3D · {labels[cur]}</button>}
function PerformanceMonitor(){const [show,setShow]=useState(false),[fps,setFps]=useState(0),[perf,setPerf]=useState(null);useEffect(()=>{if(!show)return;const tick=()=>{setFps(window.__factorySceneRuntime?.getFps()||0);setPerf(window.__factorySceneRuntime?.getPerf()||null)};tick();const h=setInterval(tick,500);return()=>clearInterval(h)},[show]);return <><button onClick={()=>setShow(s=>!s)} className={`perf-toggle${show?' active':''}`} title="性能监控">FPS</button>{show&&<div className="perf-overlay"><div className="perf-row"><span>帧率</span><b className={fps>=50?'good':fps>=30?'warn':'bad'}>{fps} FPS</b></div><div className="perf-row"><span>渲染/秒</span><b className={perf&&perf.sfs>0?'good':''}>{perf?perf.rfs:'—'}</b></div><div className="perf-row"><span>跳过/秒</span><b>{perf?perf.sfs:'—'}</b></div><div className="perf-row"><span>GL调用/帧</span><b>{perf?perf.calls:'—'}</b></div><div className="perf-row"><span>三角面/帧</span><b>{perf?((perf.tris/1000).toFixed(1))+'k':'—'}</b></div><div className="perf-row"><span>立体模式</span><b>{perf?perf.mode:'—'}</b></div></div>}</>}
function Outliner(){const [show,setShow]=useState(false),[tree,setTree]=useState(null),[expanded,setExpanded]=useState(new Set());useEffect(()=>{if(!show)return;const refresh=()=>{const t=window.__factorySceneRuntime?.getModelTree?.();setTree(t)};refresh();const h=setInterval(refresh,2000);window.addEventListener('factory-active-model-change',refresh);window.addEventListener('factory-scene-ready',refresh);return()=>{clearInterval(h);window.removeEventListener('factory-active-model-change',refresh);window.removeEventListener('factory-scene-ready',refresh)}},[show]);const toggleExpand=(uuid)=>{setExpanded(prev=>{const next=new Set(prev);if(next.has(uuid))next.delete(uuid);else next.add(uuid);return next})};const renderNode=(node,depth=0)=>{const hasChildren=node.children&&node.children.length>0;const isExpanded=expanded.has(node.uuid);return <div key={node.uuid} className="outliner-node" style={{paddingLeft:depth*14+6}}><div className="outliner-row" onClick={()=>window.__factorySceneRuntime?.focusNode(node.uuid)}>{hasChildren?<button className="outliner-expand" onClick={e=>{e.stopPropagation();toggleExpand(node.uuid)}}>{isExpanded?'▾':'▸'}</button>:<span className="outliner-expand-placeholder"/>}<span className={`outliner-vis${node.visible?'':' hidden'}`} onClick={e=>{e.stopPropagation();window.__factorySceneRuntime?.toggleNodeVisible(node.uuid)}}>{node.visible?'👁':'◌'}</span><span className="outliner-name">{node.name}</span><small className="outliner-type">{node.type}</small></div>{hasChildren&&isExpanded&&node.children.map(c=>renderNode(c,depth+1))}</div>};return <><button onClick={()=>setShow(s=>!s)} className={`outliner-toggle${show?' active':''}`} title="模型层次结构">层级</button>{show&&<div className="outliner-panel"><div className="outliner-head"><b>模型层次结构</b><button onClick={()=>setShow(false)}><X size={14}/></button></div><div className="outliner-body">{tree?renderNode(tree):<div className="outliner-empty">加载中…</div>}</div></div>}</>}
/* ===================== 照片库（大头照 / 半身照，按文件名全站通用） ===================== */
let _photoList = null;
async function refreshPhotoList(){const r=await fetch('/api/photos');if(!r.ok)throw new Error('photos status '+r.status);_photoList=await r.json();window.dispatchEvent(new Event('factory-photos-changed'));return _photoList}
async function uploadPhoto(file){const r=await fetch(`/api/photos?name=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});if(!r.ok)throw new Error('照片上传失败');return refreshPhotoList()}
async function removePhoto(name){await fetch(`/api/photos?name=${encodeURIComponent(name)}`,{method:'DELETE'});return refreshPhotoList()}
function usePhotoList(){const [,force]=useState(0);useEffect(()=>{refreshPhotoList().catch(()=>{});const h=()=>force(x=>x+1);window.addEventListener('factory-photos-changed',h);return()=>window.removeEventListener('factory-photos-changed',h)},[]);return _photoList||[]}
function PersonPhoto({person,mode='head',size=38}){
  usePhotoList();
  const [bad,setBad]=useState(false);
  useEffect(()=>setBad(false),[person?.id,person?.name,mode]);
  const file=matchPhotoFile(_photoList,person,mode);
  const style=mode==='half'?{width:Math.round(size*0.82),height:Math.round(size*1.5)}:{width:size,height:size};
  if(!file||bad)return <span className={`person-photo fallback ${mode==='half'?'half':''}`} style={style}><CircleUserRound size={Math.round(size*0.62)}/></span>;
  return <img className={`person-photo ${mode==='half'?'half':''}`} src={`/api/photos?name=${encodeURIComponent(file)}`} onError={()=>setBad(true)} style={style} alt={person?.name||''}/>;
}

/* ===================== 产能看板（展示端只读） ===================== */
/* 环比徽标：涨红跌绿（国内习惯），上期为 0 或无数据时显示占位 */
function DeltaBadge({pct,label}){
  if(pct==null||!Number.isFinite(pct))return <span className="delta muted" title={label}>{label??'MoM'} —</span>;
  const cls=pct>0?'up':pct<0?'down':'flat',arrow=pct>0?'▲':pct<0?'▼':'—';
  return <span className={`delta ${cls}`} title={label}>{arrow} {Math.abs(pct)}%</span>;
}
function KpiCard({label,value,num,unit,hint,badge,fmt}){
  return <div className="kpi-card"><div className="kpi-head"><span>{label}</span>{badge}</div><b className="kpi-value">{num!=null&&fmt?<NumberTicker value={num} format={fmt}/>:value}<small>{unit}</small></b><p>{hint}</p></div>;
}
const MONTH_EN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function Capacity(){
  const {data}=useBusiness();
  const {config,t}=useApp();
  const zh=config.language==='zh';
  const months=recentMonths(6);
  const [ym,setYm]=useState(months[0]),[pickLine,setPickLine]=useState(''),[photoMode,setPhotoMode]=useState('head'),[drillDept,setDrillDept]=useState('');
  if(!data)return <div className="dashboard-loading">加载中…</div>;
  const recs=data.outputRecords||[];
  const fmt=n=>(Number(n)||0).toLocaleString();
  const stats=monthStats(recs,ym),prevStats=monthStats(recs,prevMonth(ym));
  const momPct=prevStats.qty?Math.round((stats.qty-prevStats.qty)/prevStats.qty*1000)/10:null;
  const planPct=monthPlanAttainment(recs,data.monthlyPlans,ym);
  const planQty=(data.monthlyPlans||{})[ym]||0;
  const attainmentNum=planPct!=null?Math.round(planPct*10)/10:null;
  const attainmentCls=planPct==null?'':planPct>=100?'ok':planPct>=90?'warn':'low';
  const depts=groupSumWithDelta(recs,'dept',ym);
  const drilled=recordsOfDept(recs,drillDept);
  const sections=groupSumWithDelta(drilled,'section',ym).filter(x=>x.key!=='未分配');
  const ranking=personRanking(drilled,ym,data.people);
  const trend=monthTrend(recs,months);
  const lines=distinctValues(recs,'line');
  const activeLine=pickLine||lines[0]||'';
  const daily=lineDaily(recs,activeLine,ym);
  const lineTotal=sumQty(daily);
  const maxDept=Math.max(1,...depts.map(x=>x.qty)),maxSec=Math.max(1,...sections.map(x=>x.qty)),maxDay=Math.max(1,...daily.map(x=>x.qty)),maxRank=ranking[0]?.qty||1,maxTrend=Math.max(1,...trend.map(x=>x.qty));
  const dropDepts=depts.filter(d=>(d.pct??0)<0);
  const monthLabel=m=>zh?`${m.slice(5)}${t.monthSuffix}`:MONTH_EN[+m.slice(5)-1];
  const pickMonth=m=>{setYm(m);setDrillDept('')};
  return <div className="capacity-board">
    <div className="board-toolbar"><b>{ym} {t.capTitle}{drillDept?` · ${drillDept}`:''}</b><div className="month-tabs">{months.map(m=><button key={m} className={m===ym?'active':''} onClick={()=>pickMonth(m)}>{monthLabel(m)}</button>)}</div></div>
    {drillDept&&<div className="drill-crumbs"><button onClick={()=>setDrillDept('')}>{t.drillAll}</button><ChevronRight size={13}/><span>{drillDept}</span><small>{t.drillHint}</small></div>}
    <div className="kpi-strip">
      <KpiCard label={t.kpiOutput} num={stats.qty} fmt={fmt} unit={t.unitPcs} hint={`${ym} ${t.kpiOutputHint}`} badge={<DeltaBadge pct={momPct} label={t.momTitle}/>}/>
      <KpiCard label={t.kpiDaily} num={stats.avgPerDay} fmt={fmt} unit={t.unitPcsPerDay} hint={`${t.kpiWorkingDays} ${stats.days} ${zh?'天':''}`.trim()}/>
      <KpiCard label={t.kpiPerCapita} num={stats.avgPerPerson} fmt={fmt} unit={t.unitPcsPerPerson} hint={`${t.kpiContributors} ${stats.people}${zh?' 人':''}`}/>
      <KpiCard label={t.kpiPlan} num={attainmentNum} fmt={n=>n.toFixed(1)} unit="%" hint={planQty?`${t.kpiPlanHint} ${fmt(planQty)} ${t.unitPcs}`:t.kpiPlanNone} value="—" badge={planPct!=null&&<span className={`delta ${attainmentCls}`} title={`${fmt(stats.qty)} / ${fmt(planQty)}`}>{attainmentCls==='ok'?'✓':attainmentCls==='warn'?'!':'⚠'}</span>}/>
      <KpiCard label={t.kpiFocus} num={dropDepts.length} fmt={fmt} unit={t.unitDepts} hint={dropDepts.length?`${t.kpiFocusDeclined}${dropDepts.map(d=>d.key).join(zh?'、':', ')}`:t.kpiFocusOk}/>
    </div>
    <div className="metric-row">
      <Card title={t.capDeptsCard}><div className="bar-list drillable">{depts.map(d=><div className={`bar-row has-delta ${drillDept===d.key?'selected':''}`} key={d.key} onClick={()=>setDrillDept(drillDept===d.key?'':d.key)} title={t.drillHint} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setDrillDept(drillDept===d.key?'':d.key)}}}><span>{d.key}</span><div className="bar-track"><i style={{width:`${d.qty/maxDept*100}%`}}/></div><div className="bar-val"><b>{fmt(d.qty)}</b><DeltaBadge pct={d.pct} label={t.momTitle}/></div></div>)}{depts.length===0&&<p className="empty-hint">{t.emptyNoOutput}</p>}</div></Card>
      <Card title={t.capTrendCard}><div className="trend-chart">{trend.map(m=><div key={m.ym} className={`trend-col ${m.ym===ym?'active':''}`} onClick={()=>pickMonth(m.ym)} title={`${m.ym}：${fmt(m.qty)} ${t.unitPcs}`} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pickMonth(m.ym)}}}><b>{m.qty?fmt(m.qty):'—'}</b><i style={{height:`${Math.max(3,m.qty/maxTrend*100)}%`}}/><small>{monthLabel(m.ym)}</small></div>)}</div><p className="trend-hint">{t.capTrendClick}{zh?<>当前 <b>{ym}</b>{momPct!=null?<>，{momPct>0?t.capMoMUp:t.capMoMDown} <b>{Math.abs(momPct)}%</b></>:null}</>:<>{t.capCurrent}: <b>{ym}</b>{momPct!=null?<> ({momPct>0?t.capMoMUp:t.capMoMDown} <b>{Math.abs(momPct)}%</b>)</>:null}</>}</p></Card>
    </div>
    <Card title={drillDept?`${t.capSectionsCard} · ${drillDept}`:t.capSectionsCard}><div className="bar-list">{sections.map(d=><div className="bar-row has-delta" key={d.key}><span>{d.key}</span><div className="bar-track"><i className="alt" style={{width:`${d.qty/maxSec*100}%`}}/></div><div className="bar-val"><b>{fmt(d.qty)}</b><DeltaBadge pct={d.pct} label={t.momTitle}/></div></div>)}{sections.length===0&&<p className="empty-hint">{t.emptyNoSection}</p>}</div></Card>
    <Card title={`${t.capLineDaily} · ${activeLine||'—'}`} action={<select value={activeLine} onChange={e=>setPickLine(e.target.value)}>{lines.map(l=><option key={l}>{l}</option>)}</select>}><div className="line-daily"><b>{t.capMonthTotal} {fmt(lineTotal)} {t.unitPcs}（{t.capWorkingDays} {daily.length} {zh?'天':''}，{t.capDailyAvg} {daily.length?Math.round(lineTotal/daily.length):0} {t.unitPcs}）</b><div className="daily-chart">{daily.map(d=><div key={d.date} title={`${d.date}：${d.qty} ${t.unitPcs}`}><i style={{height:`${d.qty/maxDay*100}%`}}/><small>{d.date.slice(-2)}</small></div>)}{daily.length===0&&<p className="empty-hint">{t.emptyNoLine}</p>}</div></div></Card>
    <Card title={`${t.capRankTitle} · ${photoMode==='head'?t.photoHead:t.photoHalf}`} action={<div className="choice"><button className={photoMode==='head'?'active':''} onClick={()=>setPhotoMode('head')}>{t.photoHead}</button><button className={photoMode==='half'?'active':''} onClick={()=>setPhotoMode('half')}>{t.photoHalf}</button></div>}><ol className="rank-list">{ranking.map((r,i)=><li key={r.name}><span className={`rank-no c${i%3}`}>{i+1}</span><PersonPhoto person={r.person||{name:r.name}} mode={photoMode}/><div className="rank-meta"><b>{r.name}</b><small>{[r.dept,r.section].filter(Boolean).join(' · ')||'—'}</small><div className="bar-track"><i style={{width:`${r.qty/maxRank*100}%`}}/></div></div><strong>{fmt(r.qty)}</strong></li>)}{ranking.length===0&&<p className="empty-hint">{t.emptyNoPerson}</p>}</ol></Card>
  </div>;
}


function Drawer({close,children}){return <div className="drawer"><button onClick={close}><X/></button>{children}</div>}
function EmployeeForm(props){const {initial,managers,onSave,onCancel}=props;const {t}=useApp();const [f,setF]=useState({...initial});const set=(k,v)=>setF(s=>({...s,[k]:v}));const canSave=f.name.trim().length>0;return <Drawer close={onCancel}><small>{initial.name?'编辑员工':'新增员工'}</small><h2>{f.id}</h2><div className="form employee-form"><label>{t.employeeName}<input value={f.name} onChange={e=>set('name',e.target.value)} placeholder="员工姓名"/></label><label>{t.employeeRole}<input value={f.role} onChange={e=>set('role',e.target.value)} placeholder="岗位"/></label><label>{t.employeeDept}<input value={f.dept} onChange={e=>set('dept',e.target.value)} placeholder="部门"/></label><label>工段<input value={f.section||''} onChange={e=>set('section',e.target.value)} placeholder="工段"/></label><label>线体<input value={f.line||''} onChange={e=>set('line',e.target.value)} placeholder="线体"/></label><label>{t.employeeSite}<input value={f.site} onChange={e=>set('site',e.target.value)} placeholder="所属场地"/></label><label>{t.employeeManager}<select value={f.manager} onChange={e=>set('manager',e.target.value)}><option value="—">—</option>{managers.map(m=><option key={m.id} value={m.name}>{m.name} · {m.role}</option>)}</select></label><label>{t.employeeStatus}<select value={f.status} onChange={e=>set('status',e.target.value)}><option value="在岗">{t.atWork}</option><option value="休息">{t.resting}</option></select></label><div className="form-row-actions"><button className="primary" disabled={!canSave} onClick={()=>onSave(f)}>{t.save}</button><button className="secondary" onClick={onCancel}>{t.cancel}</button></div></div></Drawer>}
function Organization(){const {data}=useBusiness();const [focus,setFocus]=useState(null),[query,setQuery]=useState('');if(!data)return <div className="dashboard-loading">加载中…</div>;const people=data.people;const {graph,roots,byName}=buildManagerGraph(people);const focusName=(focus&&byName.has(focus))?focus:(roots[0]||people[0]?.name);const matches=filterPeople(people,query);const tree=(name,ancestors=new Set())=>{const p=byName.get(name)||people[0];const chain=new Set(ancestors);chain.add(name);return <div className="branch" key={name}><button className={focusName===name?'focus':''} onClick={()=>setFocus(name)}><PersonPhoto person={p} size={26}/><b>{name}</b><small>{p.role}</small></button>{graph[name]?.length>0&&<div className="children">{graph[name].map(child=>chain.has(child)?null:tree(child,chain))}</div>}</div>};const p=byName.get(focusName)||people[0];return <div className="org"><Card title="组织关系（按直属上级自动生成）"><div className="org-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索员工、岗位或部门"/>{query&&<div className="org-results">{matches.length?matches.map(x=><button key={x.id} onClick={()=>{setFocus(x.name);setQuery('')}}><b>{x.name}</b><small>{x.role} · {x.dept}</small></button>):<small>未找到匹配员工</small>}</div>}</div><div className="org-map">{roots.map(name=>tree(name))}</div></Card><Card title="聚焦详情"><div className="profile"><PersonPhoto person={p} size={56}/><h2>{p?.name}</h2><p>{p?.role} · {p?.dept}</p><dl><dt>直属上级</dt><dd>{p?.manager}</dd><dt>直属下属</dt><dd>{directReportCount(graph,focusName)} 人</dd><dt>所在场地</dt><dd>{p?.site}</dd><dt>状态</dt><dd>{p?.status}</dd></dl></div></Card></div>}
function Models(){const {config,t,setConfig}=useApp();const [type,setType]=useState('全部'),[kw,setKw]=useState(''),[active,setActive]=useState(()=>localStorage.getItem('factory-active-model')||'Factory Campus A.glb'),[aliasEdit,setAliasEdit]=useState(null),[aliasDraft,setAliasDraft]=useState('');const startAlias=x=>{setAliasEdit(x.name);setAliasDraft(x.alias||'');};const saveAlias=name=>{const v=aliasDraft.trim();setConfig(c=>({...c,models:c.models.map(m=>m.name===name?{...m,alias:v||undefined}:m)}));setAliasEdit(null);};const fmt=s=>s>=1024*1024*1024?(s/1024/1024/1024).toFixed(2)+' GB':(s/1024/1024).toFixed(1)+' MB';const data=[{name:'Factory Campus A.glb',format:'GLB',size:12682000,tag:'默认场景',updated:'2026/08/22',default:true},...config.models];const show=x=>{if(x.available===false)return;setActive(x.name);localStorage.setItem('factory-active-model',x.name);window.dispatchEvent(x.default?new Event('factory-show-default'):new CustomEvent('factory-show-model',{detail:x.name}))};const remove=x=>{if(x.default)return;window.dispatchEvent(new CustomEvent('factory-model-delete-file',{detail:x.name}));window.dispatchEvent(new CustomEvent('factory-model-delete',{detail:x.name}));if(active===x.name)show(data[0])};return <Card title={t.models} action={<Importer/>}><div className="model-filter">{['全部','GLB','GLTF','FBX','OBJ'].map(x=><button key={x} className={type===x?'active':''} onClick={()=>setType(x)}>{x}</button>)}<span className="model-search"><Search size={13}/><input value={kw} onChange={e=>setKw(e.target.value)} placeholder="搜索模型"/></span><small>选择“展示模型”可切换场景；删除后不可恢复。</small></div>{data.length<=1&&<div className="model-empty-hint"><Boxes size={28}/><div><b>还没有导入模型</b><p>点击右上角导入模型按钮，或将 GLB/glTF/FBX/OBJ 文件拖到三维场景中。</p></div></div>}<div className="model-grid">{data.filter(x=>(type==='全部'||x.format===type)&&x.name.toLowerCase().includes(kw.toLowerCase())).map(x=><article className={active===x.name?'selected':''} key={x.name}><div className="thumb"><FileBox size={42}/><span>{x.format}</span></div>{aliasEdit===x.name?<input className="alias-input" autoFocus value={aliasDraft} placeholder="输入别名后回车保存" onChange={e=>setAliasDraft(e.target.value)} onBlur={()=>saveAlias(x.name)} onKeyDown={e=>{if(e.key==='Enter')saveAlias(x.name);if(e.key==='Escape')setAliasEdit(null);}}/>:<h3 title={x.alias?('文件名：'+x.name):'可通过下方“别名”按钮设置显示名'}>{x.alias||x.name}</h3>}<p>{x.alias?x.name+' · ':''}{x.tag} · {fmt(x.size)}</p><footer><small className={x.available===false?'model-missing':''}>{x.available===false?'需要重新导入':active===x.name?'当前展示':x.updated}</small><div><button disabled={x.available===false} onClick={()=>show(x)}>{x.available===false?'重新导入后展示':active===x.name?'正在展示':'展示模型'}</button>{!x.default&&<button className="alias-model" onClick={()=>startAlias(x)}>别名</button>}{!x.default&&<button className="remove-model" onClick={()=>remove(x)}>删除</button>}</div></footer></article>)}</div></Card>}
function Toggle({label,value,onChange}){return <label className="toggle"><span>{label}</span><input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/><i/></label>}
function ScenePreview({config}){const host=useRef();useEffect(()=>{let renderer,scene,camera,control,grid,model,mixer,frame,previewModel=null;const root=host.current;renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.setClearColor(0x000000,0);root.append(renderer.domElement);scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(45,1,.1,100);camera.position.set(4.2,3.2,5.2);control=new OrbitControls(camera,renderer.domElement);control.enableDamping=true;control.dampingFactor=.08;control.target.set(0,.9,0);const hemi=new THREE.HemisphereLight(0x88bbff,0x1a2a4a,.85),sun=new THREE.DirectionalLight(0xe8f0ff,1.4),rim=new THREE.PointLight(0x88aaff,.8,40);sun.position.set(-4,7,5);sun.castShadow=true;sun.shadow.camera.left=-6;sun.shadow.camera.right=6;sun.shadow.camera.top=6;sun.shadow.camera.bottom=-6;sun.shadow.camera.near=.5;sun.shadow.camera.far=30;rim.position.set(5,3,-4);scene.add(hemi,sun,rim);grid=new THREE.GridHelper(12,12,0x2a5a9a,0x1a3058);grid.position.y=0;scene.add(grid);const fit=obj=>{const bounds=new THREE.Box3().setFromObject(obj),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),f=THREE.MathUtils.degToRad(camera.fov),distance=Math.max(size.y/(2*Math.tan(f/2)),size.x/(2*Math.tan(f/2)*camera.aspect),size.z*.6)*1.6;control.target.copy(center);camera.position.copy(center).addScaledVector(new THREE.Vector3(.72,.52,.78).normalize(),distance);camera.near=Math.max(.01,distance/1200);camera.far=Math.max(1000,distance*80);camera.updateProjectionMatrix();control.minDistance=Math.max(.1,distance*.12);control.maxDistance=Math.max(40,distance*5);grid.scale.setScalar(Math.max(1,Math.max(size.x,size.y,size.z)/12*1.25));grid.position.set(center.x,bounds.min.y-.04,center.z);control.update()};const disposeModel=m=>{if(!m)return;m.traverse(o=>{o.geometry?.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(mm=>mm.dispose())})};const loadDefault=()=>{if(previewModel){disposeModel(previewModel);scene.remove(previewModel)}const g=createFactoryModel();previewModel=g;scene.add(g);fit(g)};const loadModelFile=async name=>{try{const {object,mixer:m}=await loadModelByName(name);mixer=m;if(previewModel){disposeModel(previewModel);scene.remove(previewModel)}previewModel=object;scene.add(object);fit(object)}catch{loadDefault()}};loadDefault();const activeModel=localStorage.getItem('factory-active-model');if(activeModel&&activeModel!=='__factory_default__'&&activeModel!=='Factory Campus A.glb'){loadModelFile(activeModel)}const onModelChange=e=>{const name=e.detail;if(!name||name==='__factory_default__'||name==='Factory Campus A.glb'){mixer=null;loadDefault()}else{loadModelFile(name)}};window.addEventListener('factory-active-model-change',onModelChange);const resize=()=>{const r=root.getBoundingClientRect();if(r.width<10||r.height<10)return;renderer.setSize(r.width,r.height);camera.aspect=r.width/r.height;camera.updateProjectionMatrix()};const obs=new ResizeObserver(resize);obs.observe(root);setTimeout(resize,50);const loop=()=>{mixer?.update(.016);control.update();renderer.render(scene,camera);frame=requestAnimationFrame(loop)};loop();root._pw={renderer,scene,camera,control,grid,hemi,sun,rim,model:previewModel,cleanup:()=>{cancelAnimationFrame(frame);obs.disconnect();window.removeEventListener('factory-active-model-change',onModelChange);disposeModel(previewModel);renderer.dispose();root.replaceChildren()}};return()=>root._pw?.cleanup()},[]);useEffect(()=>{const p=host.current?._pw;if(!p)return;const env={factory:[0x000000,0xa6c8ff,0x071128,2.2,0xd8e8ff,3,0x4488ff,22],studio:[0x172440,0xffffff,0x4b5561,3.1,0xffffff,3.8,0x9fc0ff,13],dusk:[0x251625,0x8b87c9,0x241625,1.9,0xffa96d,3.3,0xe266b8,18]}[config.scene.environment];p.hemi.color.setHex(env[1]);p.hemi.groundColor.setHex(env[2]);p.hemi.intensity=env[3]*config.scene.ambientIntensity;p.sun.color.setHex(env[4]);p.sun.intensity=env[5]*config.scene.sunIntensity;
      // PCFSoft 不支持 shadow.radius（仅 VSM 生效），用正交阴影范围等效柔化，与主场景一致
      {const sp=1+Math.max(0,config.scene.shadowSoftness||0)*0.18,sr=6*sp;Object.assign(p.sun.shadow.camera,{left:-sr,right:sr,top:sr,bottom:-sr});p.sun.shadow.camera.updateProjectionMatrix()}
      p.rim.color.setHex(env[6]);p.rim.intensity=env[7];p.camera.fov=config.scene.fov;p.camera.updateProjectionMatrix();p.control.enableRotate=config.scene.rotate;p.control.enableZoom=config.scene.zoom;p.control.enablePan=config.scene.pan;p.control.autoRotate=config.scene.display!=='static';p.control.autoRotateSpeed=config.scene.rotationSpeed*(config.scene.display==='showcase'?1.65:1);p.grid.visible=config.scene.grid;p.renderer.shadowMap.enabled=config.scene.shadows;const ss={low:512,medium:1024,high:2048}[config.scene.shadowQuality]||1024;p.sun.shadow.mapSize.set(ss,ss);p.sun.shadow.needsUpdate=true;p.renderer.toneMappingExposure=config.scene.exposure;p.renderer.setPixelRatio(config.scene.dpr==='auto'?Math.min(devicePixelRatio,2):Number(config.scene.dpr));{const az=(config.scene.sunAzimuth??45)*Math.PI/180,el=(config.scene.sunElevation??60)*Math.PI/180,r=18;p.sun.position.set(Math.cos(el)*Math.sin(az)*r,Math.sin(el)*r,Math.cos(el)*Math.cos(az)*r)}},[config.scene]);return <div className="scene-preview" ref={host}><div className="preview-badge">实时预览</div><div className="preview-hint">拖动旋转 · 滚轮缩放</div></div>}
function Settings(){const {config,setConfig,t}=useApp(),[tab,setTab]=useState('scene');const biz=useBusiness();const changeScene=patch=>setConfig(x=>({...x,scene:{...x.scene,...patch}}));const tabs=[['general',t.general],['brand',t.brand],['nav',t.nav],['scene',t.scene],['system',t.system]];return <div className="settings"><nav>{tabs.map(x=><button className={tab===x[0]?'active':''} onClick={()=>setTab(x[0])} key={x[0]}>{x[1]}<ChevronRight size={15}/></button>)}</nav><Card title={tabs.find(x=>x[0]===tab)[1]}>{tab==='general'&&<div className="form"><label>默认语言<select value={config.language} onChange={e=>setConfig(x=>({...x,language:e.target.value}))}><option value="zh">简体中文</option><option value="en">English</option></select></label></div>}{tab==='brand'&&<div className="form"><label>应用名称<input value={config.branding.title} onChange={e=>setConfig(x=>({...x,branding:{...x.branding,title:e.target.value}}))}/></label><label>主题<div className="choice"><button className={config.theme==='dark'?'active':''} onClick={()=>setConfig(x=>({...x,theme:'dark'}))}><Moon/>深色</button><button className={config.theme==='light'?'active':''} onClick={()=>setConfig(x=>({...x,theme:'light'}))}><Sun/>浅色</button></div></label></div>}{tab==='nav'&&<div className="form"><label>导航模式<div className="choice">{['open','mini','overlay'].map(x=><button key={x} className={config.nav===x?'active':''} onClick={()=>setConfig(v=>({...v,nav:x}))}>{x}</button>)}</div></label><p>展开：固定文字导航；Mini：图标导航；Overlay：悬停展开且不压缩工作区。</p></div>}{tab==='scene'&&<div className="scene-settings-layout"><div className="form scene-form"><label>{t.display}<div className="choice">{['standard','showcase','static'].map(x=><button key={x} className={config.scene.display===x?'active':''} onClick={()=>changeScene({display:x})}>{t[x]}</button>)}</div></label><label>{t.stereoMode}<div className="choice stereo-choice">{[['off',t.stereoOff],['parallax',t.stereoParallax],['barrier',t.stereoBarrier],['sbs',t.stereoSbs],['anaglyph',t.stereoAnaglyph]].map(([k,label])=><button key={k} className={config.scene.stereoMode===k?'active':''} onClick={()=>changeScene({stereoMode:k})}>{label}</button>)}</div></label><label>{t.parallaxStrength}<input type="range" min="0" max="1" step=".05" value={config.scene.parallaxStrength??.4} onChange={e=>changeScene({parallaxStrength:+e.target.value})}/><output>{Math.round((config.scene.parallaxStrength??.4)*100)}%</output></label><div className="toggle-grid"><Toggle label={t.parallaxAuto} value={config.scene.parallaxAuto===true} onChange={parallaxAuto=>changeScene({parallaxAuto})}/></div><p className="config-hint">运动视差：在画面上移动鼠标即产生裸眼出屏纵深，无需任何眼镜；视差屏障/并排供裸眼 3D 屏或平行眼，红蓝立体需红蓝眼镜。</p><div className="toggle-grid"><Toggle label={t.fxMeteors} value={config.scene.fxMeteors!==false} onChange={fxMeteors=>changeScene({fxMeteors})}/></div><label>{t.environment}<select value={config.scene.environment} onChange={e=>changeScene({environment:e.target.value})}>{['factory','studio','dusk'].map(x=><option value={x} key={x}>{t[x]}</option>)}</select></label><label>{t.render}<div className="choice">{['low','balanced','quality'].map(x=><button key={x} className={config.scene.preset===x?'active':''} onClick={()=>changeScene({preset:x,dpr:x==='low'?'1':x==='quality'?'2':'auto',shadows:x!=='low'})}>{t[x]}</button>)}</div></label><label>{t.dpr}<select value={config.scene.dpr} onChange={e=>changeScene({dpr:e.target.value})}><option value="auto">{t.auto} (≤ 2×)</option><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label><label>{t.fov}<input type="range" min="25" max="70" value={config.scene.fov} onChange={e=>changeScene({fov:+e.target.value})}/><output>{config.scene.fov}°</output></label><label>{t.speed}<input type="range" min=".1" max="1" step=".1" value={config.scene.rotationSpeed} onChange={e=>changeScene({rotationSpeed:+e.target.value})}/><output>{config.scene.rotationSpeed.toFixed(1)}</output></label><label>{t.exposure}<input type="range" min=".4" max="1.8" step=".1" value={config.scene.exposure} onChange={e=>changeScene({exposure:+e.target.value})}/><output>{config.scene.exposure.toFixed(1)}</output></label><label>{t.ambient}<input type="range" min="0" max="2" step=".1" value={config.scene.ambientIntensity} onChange={e=>changeScene({ambientIntensity:+e.target.value})}/><output>{config.scene.ambientIntensity.toFixed(1)}</output></label><label>{t.sunlight}<input type="range" min="0" max="2" step=".1" value={config.scene.sunIntensity} onChange={e=>changeScene({sunIntensity:+e.target.value})}/><output>{config.scene.sunIntensity.toFixed(1)}</output></label><SunControl config={config} onChange={patch=>changeScene(patch)}/><label>{t.shadowSoftness}<input type="range" min="0" max="8" step=".2" value={config.scene.shadowSoftness} onChange={e=>changeScene({shadowSoftness:+e.target.value})}/><output>{config.scene.shadowSoftness.toFixed(1)}</output></label><label>{t.shadowQuality}<select value={config.scene.shadowQuality} onChange={e=>changeScene({shadowQuality:e.target.value})}>{['low','medium','high'].map(x=><option value={x} key={x}>{t[`shadow${x[0].toUpperCase()}${x.slice(1)}`]}</option>)}</select></label><div className="toggle-grid"><Toggle label={t.rotate} value={config.scene.rotate} onChange={rotate=>changeScene({rotate})}/><Toggle label={t.zoom} value={config.scene.zoom} onChange={zoom=>changeScene({zoom})}/><Toggle label={t.pan} value={config.scene.pan} onChange={pan=>changeScene({pan})}/><Toggle label={t.grid} value={config.scene.grid} onChange={grid=>changeScene({grid})}/><Toggle label={t.shadows} value={config.scene.shadows} onChange={shadows=>changeScene({shadows})}/></div><div className="online-scene-setting"><b>{t.onlineScene}</b><label>{t.onlineSceneUrl}<input value={config.onlineScene?.url||''} onChange={e=>setConfig(x=>({...x,onlineScene:{...x.onlineScene,url:e.target.value}}))} placeholder="https://my.spline.design/..."/></label><p>{t.onlineSceneHint}</p></div><div className="online-scene-setting"><b>{t.carousel}</b><div className="toggle-grid" style={{gridTemplateColumns:"1fr"}}><Toggle label={t.carouselEnable} value={config.carousel?.enabled||false} onChange={enabled=>setConfig(x=>({...x,carousel:{...x.carousel,enabled}}))}/></div><label>{t.carouselInterval}<input type="range" min="3" max="30" value={config.carousel?.interval||8} onChange={e=>setConfig(x=>({...x,carousel:{...x.carousel,interval:+e.target.value}}))}/><output>{config.carousel?.interval||8}s</output></label><label>{t.carouselModels}<div style={{display:"grid",gap:"6px",maxHeight:"180px",overflow:"auto"}}>{[{name:'Factory Campus A.glb',default:true},...(config.models||[])].map(m=><label key={m.name} style={{display:"flex",gap:"8px",alignItems:"center",fontSize:"12px",color:"var(--muted)"}}><input type="checkbox" checked={(config.carousel?.modelNames||[]).includes(m.name)} onChange={e=>{const names=config.carousel?.modelNames||[];setConfig(x=>({...x,carousel:{...x.carousel,modelNames:e.target.checked?[...names,m.name]:names.filter(n=>n!==m.name)}}))}}/>{m.name.replace(/\.(glb|gltf|fbx|obj|stl)$/i,'')}</label>)}</div></label></div></div><ScenePreview config={config}/></div>}{tab==='system'&&<div className="system-panel"><div className="data-note"><BarChart3 size={36}/><h3>业务数据服务</h3><p>产能、人员、场地及组织关系由本地数据层统一提供并持久化，当前来源：{biz.source==='backend'?t.sourceBackend:t.sourceLocal}。该数据层可整体替换为 MES、IoT、HR 接口。</p><div className="config-buttons"><button className="secondary" onClick={()=>{if(window.confirm('确定把业务数据恢复为默认？当前修改会被覆盖。'))biz.reset()}}>{t.resetBusiness}</button><button className="secondary" onClick={biz.refreshCapacity}>{t.refreshData}</button></div></div><div className="config-actions"><h3>配置管理</h3><div className="config-buttons"><button className="secondary" onClick={()=>{const blob=new Blob([JSON.stringify(config,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='factory-config.json';a.click();URL.revokeObjectURL(a.href)}}>导出配置</button><label className="secondary config-import"><input type="file" accept=".json" onChange={e=>{const f=e.target.files?.[0];if(!f)return;const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result);if(data.version&&data.scene){setConfig({...defaults,...data,version:4});alert('配置已导入')}else alert('配置文件格式不正确')}catch{alert('配置文件解析失败')}};reader.readAsText(f);e.target.value=''}}/>导入配置</label></div><p className="config-hint">导出文件包含场景设置、品牌配置、导航偏好和模型列表。导入将覆盖当前配置。</p></div><div className="storage-info"><h3>本地存储</h3><div className="storage-grid"><div><b>{(new Blob([localStorage.getItem(STORE)||'']).size/1024).toFixed(1)} KB</b><small>配置数据</small></div><div><b>{config.models?.length||0}</b><small>已登记模型</small></div><div><b>{config.language==='zh'?'中文':'English'}</b><small>当前语言</small></div><div><b>v{__APP_VERSION__}</b><small>应用版本</small></div></div></div></div>}<div className="settings-actions"><button className="danger" onClick={()=>setConfig(defaults)}>{t.restore}</button></div></Card></div>}
/* ===================== Excel 导入/导出工具 ===================== */
function readSheet(file){return new Promise((resolve,reject)=>{const rd=new FileReader();rd.onload=e=>{try{const wb=XLSX.read(e.target.result,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];resolve(XLSX.utils.sheet_to_json(ws,{defval:''}))}catch(err){reject(err)}};rd.onerror=reject;rd.readAsArrayBuffer(file)})}
function downloadSheet(rows,sheetName,fileName){const ws=XLSX.utils.json_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,sheetName);XLSX.writeFile(wb,fileName)}
const sval=v=>String(v??'').trim();

/* ===================== 后端数据管理 /admin ===================== */
function useAdminModelSync(){
  const {setConfig}=useApp();
  useEffect(()=>{
    const h=async e=>{
      const f=e.detail?.file;
      if(f?.name)await window.factoryModelStorage?.waitForSave?.(f.name);
      const saved=await window.factoryModelStorage?.listModels?.();
      if(!saved?.length)return;
      setConfig(x=>{const byName=new Map(x.models.map(m=>[m.name,m]));const savedNames=new Set(saved.map(f=>f.name));const merged=saved.map(f=>mergeModelRecord(byName.get(f.name),f));const extra=x.models.filter(m=>!savedNames.has(m.name));return{...x,models:[...extra,...merged]}});
    };
    window.addEventListener('factory-import',h);
    return()=>window.removeEventListener('factory-import',h);
  },[]);
}
function AdminApp(){
  const {config}=useApp();
  const [tab,setTab]=useState('business');
  useAdminModelSync();
  const tabs=[['business',Database,'业务数据'],['photos',ImageIcon,'照片库'],['models',Boxes,'模型库'],['settings',Cog,'设置中心']];
  return <div className={`admin ${config.theme==='light'?'light':''}`}>
    <header className="admin-header"><div className="admin-header-inner"><div className="brand"><Factory/><b>后端数据管理</b></div><nav>{tabs.map(([k,I,label])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}><I size={15}/>{label}</button>)}</nav><NavLink to="/" className="admin-back"><ArrowLeft size={15}/>返回展示端</NavLink></div></header>
    <main className="admin-main">{tab==='business'&&<AdminBusiness/>}{tab==='photos'&&<AdminPhotos/>}{tab==='models'&&<Models/>}{tab==='settings'&&<Settings/>}</main>
  </div>;
}
function AdminBusiness(){const [tab,setTab]=useState('people');return <div><div className="admin-subtabs"><button className={tab==='people'?'active':''} onClick={()=>setTab('people')}>人员与组织</button><button className={tab==='records'?'active':''} onClick={()=>setTab('records')}>产出记录</button><button className={tab==='plans'?'active':''} onClick={()=>setTab('plans')}>月度计划</button></div>{tab==='people'?<AdminPeople/>:tab==='records'?<AdminRecords/>:<AdminPlans/>}</div>}
function AdminPeople(){
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
function AdminRecords(){
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
function RecordForm({initial,people,onSave,onCancel}){
  const [f,setF]=useState({...initial});const set=(k,v)=>setF(s=>({...s,[k]:v}));
  return <Drawer close={onCancel}><small>产出记录</small><h2>{f.date||'新记录'}</h2><div className="form"><label>日期<input type="date" value={f.date} onChange={e=>set('date',e.target.value)}/></label><label>姓名<input list="record-people" value={f.person} onChange={e=>set('person',e.target.value)} placeholder="员工姓名"/><datalist id="record-people">{people.map(p=><option key={p.id} value={p.name}>{p.dept}</option>)}</datalist></label><label>部门<input value={f.dept} onChange={e=>set('dept',e.target.value)}/></label><label>工段<input value={f.section} onChange={e=>set('section',e.target.value)}/></label><label>线体<input value={f.line} onChange={e=>set('line',e.target.value)}/></label><label>产量（件）<input type="number" value={f.qty} onChange={e=>set('qty',e.target.value)}/></label><div className="form-row-actions"><button className="primary" disabled={!f.date||!f.person} onClick={()=>onSave(f)}>保存</button><button className="secondary" onClick={onCancel}>取消</button></div></div></Drawer>;
}
function AdminPlans(){
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
function AdminPhotos(){
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

createRoot(document.querySelector('#app')).render(<ErrorBoundary><Provider><DataProvider><BrowserRouter><Routes><Route path="/admin" element={<AdminApp/>}/><Route path="/*" element={<Shell/>}/></Routes></BrowserRouter></DataProvider></Provider></ErrorBoundary>);
