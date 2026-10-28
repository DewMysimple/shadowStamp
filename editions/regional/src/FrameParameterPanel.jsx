import React, { useRef, useState } from 'react';
import { FRAME_DEFAULTS, FRAME_ENVIRONMENT_URL, FRAME_LIGHT_LABELS, normalizeFrameParameters, parseFrameParameters, serializeFrameParameters } from './frameParameters.js';

function NumberField({ name, label, value, min, max, step, unit, onChange }) {
  return <label className="frame-number"><span>{label}<small>{unit}</small></span><span className="frame-number-inputs">
    <input data-frame-parameter={name} type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={event => onChange(Number(event.target.value))} />
    <input type="number" min={min} max={max} step={step} value={Number(value.toFixed(5))} aria-label={`${label}数值`} onChange={event => { if (event.target.value !== '' && Number.isFinite(event.target.valueAsNumber)) onChange(event.target.valueAsNumber); }} />
  </span></label>;
}
const linearToHex = values => '#' + values.map(v => Math.round((v <= .0031308 ? v * 12.92 : 1.055 * v ** (1/2.4) - .055) * 255).toString(16).padStart(2, '0')).join('');
const hexToLinear = value => [1,3,5].map(i => { const v = parseInt(value.slice(i, i+2),16)/255; return v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4; });

function RigPlan({ lights }) {
  return <figure className="frame-rig"><svg viewBox="0 0 276 130" role="img" aria-label="相框与三盏圆盘面光的位置示意，正面投影">
    <path d="M16 104H260M138 10V118" stroke="#cabcaa" strokeDasharray="2 4" />
    <rect x="93" y="80" width="90" height="45" rx="1" fill="#e0d4bf" stroke="#a58c66" />
    {lights.map((light,i) => { const x=138+light.position[0]*90,y=102-light.position[2]*75; return <g key={i} opacity={light.enabled?1:.3}><path d={`M${x} ${y}L138 98`} stroke={['#b6754a','#7f9fa5','#b59369'][i]} strokeDasharray="3 3" /><ellipse cx={x} cy={y} rx={light.diameter*19} ry="7" fill="#fff9ec" stroke={['#b6754a','#7f9fa5','#b59369'][i]} /><text x={x} y={y-12} textAnchor="middle">{['KEY','FILL','RIM'][i]}</text></g>; })}
  </svg><figcaption>当前三灯位置 · 正面示意</figcaption></figure>;
}

export default function FrameParameterPanel({ parameters, onReplace, unavailable, focused, storageError, reducedMotion }) {
  const [open, setOpen] = useState(false), [message, setMessage] = useState('');
  const [json, setJson] = useState(null);
  const toggle = useRef(null), file = useRef(null);
  const change = (key,value) => onReplace(normalizeFrameParameters({ ...parameters, [key]:value }));
  const changeLight = (i,key,value) => change('lights',parameters.lights.map((light,n)=>n===i?{...light,[key]:value}:light));
  const scalar = (key,label,min,max,step,unit) => <NumberField name={key} label={label} value={parameters[key]} min={min} max={max} step={step} unit={unit} onChange={value=>change(key,value)} />;
  const apply = text => { try { onReplace(parseFrameParameters(text)); setJson(null); setMessage('已载入相框参数。'); } catch (error) { setMessage(error.message); } };
  const download = () => { const url=URL.createObjectURL(new Blob([serializeFrameParameters(parameters)],{type:'application/json'})); const a=document.createElement('a');a.href=url;a.download='postal-frame-studio.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);setMessage('相框参数已导出。'); };
  return <aside className={`frame-workbench ${open?'is-open':''}`} data-frame-parameter-panel data-parameter-panel aria-label="相框模型参数控件" hidden={focused}
    onPointerMove={event=>event.stopPropagation()} onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}
    onKeyDown={event=>{if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);toggle.current?.focus();}}}>
    <button className="frame-launcher" ref={toggle} type="button" aria-expanded={open} aria-controls="frame-parameter-panel" onClick={()=>setOpen(v=>!v)}><svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="4" width="14" height="11" rx="1" stroke="currentColor" /><path d="M6 7h8v5H6zM10 1v2M18 10h2M1 10h2" stroke="currentColor" /></svg><span>相框光照</span><small>模型参数</small><span className="frame-launcher-sign">{open?'−':'+'}</span></button>
    {open&&<section id="frame-parameter-panel" className="frame-panel">
      <header className="frame-panel-heading"><span>FRAME / STUDIO</span><button type="button" aria-label="收起相框参数" onClick={()=>{setOpen(false);toggle.current?.focus();}}>×</button><h2>一框，一室光。</h2><p>三盏圆盘面光 · 源文件灯位与角度</p></header>
      <div className="frame-panel-scroll">
        {unavailable&&<p className="frame-panel-notice">相框正在加载或暂不可用，参数会在载入后应用。</p>}
        {reducedMotion&&<p className="frame-panel-notice">系统已开启减少动态，悬停微旋转暂停。</p>}
        <fieldset disabled={unavailable}>
          <details className="frame-panel-group" open><summary>环境与显示<span>01</span></summary>
            <a className="frame-hdri" href={FRAME_ENVIRONMENT_URL} download="citrus_orchard_road_puresky_4k.exr"><img src="/textures/frame-environment-preview.png" width="256" height="128" alt="柑橘果园道路晴空 HDRI 全景预览" /><span>Citrus Orchard Road<small>4K EXR · 下载原贴图 ↗</small></span></a>
            <label className="frame-toggle"><span>HDRI 照明</span><input data-frame-parameter="hdriEnabled" type="checkbox" checked={parameters.hdriEnabled} onChange={e=>change('hdriEnabled',e.target.checked)} /></label>
            {scalar('hdriIntensity','HDRI 强度',0,2,.01,'')}{scalar('hdriRotation','HDRI 水平旋转',-180,180,1,'°')}
            {scalar('worldStrength','原场景世界光',0,1,.01,'')}{scalar('exposure','相框曝光',-2,2,.05,'EV')}
            <p className="frame-panel-note">AgX · Medium High Contrast</p>
          </details>
          <details className="frame-panel-group" open><summary>三灯布光<span>02</span></summary><RigPlan lights={parameters.lights} />
            <p className="frame-panel-note">位置与角度沿用 Blender 坐标：X 左右、Y 前后、Z 上下。</p>
            {parameters.lights.map((light,i)=><details key={i} className="frame-light" open={i===0}><summary><i style={{background:linearToHex(light.color)}} />{FRAME_LIGHT_LABELS[i]}<small>{light.watts.toFixed(1)} W</small></summary>
              <label className="frame-toggle"><span>{['主光','补光','轮廓光'][i]}开启</span><input data-frame-parameter={`light-${i}-enabled`} type="checkbox" checked={light.enabled} onChange={e=>changeLight(i,'enabled',e.target.checked)} /></label>
              <NumberField name={`light-${i}-watts`} label={`${['主光','补光','轮廓光'][i]}功率`} value={light.watts} min={0} max={60} step={.5} unit="W" onChange={v=>changeLight(i,'watts',v)} />
              <NumberField name={`light-${i}-diameter`} label={`${['主光','补光','轮廓光'][i]}圆盘直径`} value={light.diameter} min={.1} max={2} step={.01} unit="m" onChange={v=>changeLight(i,'diameter',v)} />
              <label className="frame-light-color"><span>灯光颜色</span><input type="color" aria-label={`${['主光','补光','轮廓光'][i]}颜色`} value={linearToHex(light.color)} onChange={e=>changeLight(i,'color',hexToLinear(e.target.value))} /></label>
              {['position','rotation'].map(key=><div key={key} className="frame-vector"><span>{key==='position'?'位置 · m':'旋转 · °'}</span><div>{['X','Y','Z'].map((axis,n)=><label key={axis}>{axis}<input data-frame-parameter={`light-${i}-${key}-${n}`} type="number" min={key==='position'?-3:-180} max={key==='position'?3:180} step={key==='position'?.01:1} value={Number(light[key][n].toFixed(5))} aria-label={`${['主光','补光','轮廓光'][i]}${key==='position'?'位置':'旋转'}${axis}`} onChange={event=>{if(event.target.value!==''&&Number.isFinite(event.target.valueAsNumber))changeLight(i,key,light[key].map((v,j)=>j===n?event.target.valueAsNumber:v));}} /></label>)}</div></div>)}
              <button className="frame-link-button" type="button" onClick={()=>{change('lights',parameters.lights.map((l,n)=>n===i?normalizeFrameParameters().lights[i]:l));setMessage('这一盏灯已恢复源文件数值。');}}>恢复这一盏灯</button>
            </details>)}
          </details>
          <details className="frame-panel-group"><summary>纸木与投影<span>03</span></summary>
            {scalar('woodNormal','木纹法线强度',0,2,.05,'×')}{scalar('canvasNormal','画芯法线强度',0,2,.05,'×')}
            {scalar('shadowOpacity','墙面投影浓度',0,.8,.01,'')}{scalar('shadowSoftness','投影柔和度',.25,2,.05,'×')}
          </details>
          <details className="frame-panel-group"><summary>指针微旋转<span>04</span></summary>
            <label className="frame-toggle"><span>悬停微旋转</span><input data-frame-parameter="tiltEnabled" type="checkbox" checked={parameters.tiltEnabled} onChange={e=>change('tiltEnabled',e.target.checked)} /></label>
            {scalar('tiltDegrees','最大转角',0,5,.1,'°')}{scalar('tiltResponse','旋转响应时间',.06,.6,.01,'s')}
          </details>
        </fieldset>
        {json!==null&&<div className="frame-json"><label htmlFor="frame-parameters-json">相框参数 JSON</label><textarea id="frame-parameters-json" value={json} onChange={e=>setJson(e.target.value)} spellCheck={false}/><button type="button" onClick={()=>apply(json)}>应用 JSON</button></div>}
      </div>
      <footer className="frame-panel-footer"><div><button type="button" onClick={download}>导出</button><button type="button" onClick={()=>file.current?.click()}>导入</button><button type="button" onClick={()=>setJson(json===null?serializeFrameParameters(parameters):null)}>JSON</button><button type="button" onClick={()=>{onReplace(normalizeFrameParameters(FRAME_DEFAULTS));setMessage('已恢复原三灯、世界光与曝光，以及默认 HDRI 和交互。');}}>恢复默认</button></div><p role="status">{storageError||message||'实时应用 · 自动保存在本机'}</p></footer>
      <input ref={file} className="sr-only" type="file" accept=".json,application/json" aria-label="导入相框参数文件" tabIndex={-1} onChange={async e=>{const selected=e.target.files?.[0];if(selected){if(selected.size>100000)setMessage('参数文件过大。');else apply(await selected.text());}e.target.value='';}} />
    </section>}
  </aside>;
}
