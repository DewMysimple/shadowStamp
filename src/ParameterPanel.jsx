import React, { useRef, useState } from 'react';
import { DEFAULT_PARAMETERS, PARAMETER_GROUPS, PRESETS, parseParameters, serializeParameters } from './parameters.js';

function ParameterField({ field, value, onChange }) {
  const id = `parameter-${field.key}`;
  if (field.type === 'boolean') return <label className="parameter-toggle" htmlFor={id} title={field.hint}>
    <span>{field.label}</span><input id={id} data-parameter={field.key} type="checkbox" checked={value} onChange={event => onChange(field.key, event.target.checked)} /><span className="toggle-track" aria-hidden="true" />
  </label>;
  if (field.type === 'color') return <label className="parameter-color" htmlFor={id}><span>{field.label}</span><span className="color-value">{value}</span><input id={id} data-parameter={field.key} type="color" value={value} onChange={event => onChange(field.key, event.target.value)} /></label>;
  return <div className="parameter-number" title={field.hint}>
    <label htmlFor={id}>{field.label}<span>{field.unit}</span></label>
    <div className="parameter-number-inputs"><input id={id} data-parameter={field.key} type="range" min={field.min} max={field.max} step={field.step} value={value} onChange={event => onChange(field.key, Number(event.target.value))} aria-label={field.label} /><input type="number" aria-label={`${field.label}数值`} min={field.min} max={field.max} step={field.step} value={value} onChange={event => { if (event.target.value !== '' && Number.isFinite(event.target.valueAsNumber)) onChange(field.key, event.target.valueAsNumber); }} /></div>
  </div>;
}

export default function ParameterPanel({ parameters, onChange, onReplace, onFocus, onClose, focused, unavailable, storageError, reducedMotion }) {
  const [open, setOpen] = useState(() => innerWidth >= 1050);
  const [message, setMessage] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [json, setJson] = useState('');
  const fileInput = useRef(null);
  const toggle = useRef(null);
  const selectedPreset = Object.entries(PRESETS).find(([, preset]) => JSON.stringify(preset.values) === JSON.stringify(parameters))?.[0] ?? 'custom';
  const applyJson = text => {
    try { onReplace(parseParameters(text)); setMessage('已导入参数并应用。'); setImportOpen(false); }
    catch (error) { setMessage(error.message); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([serializeParameters(parameters)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'postal-studies-parameters.json'; anchor.click(); URL.revokeObjectURL(url); setMessage('参数已导出为 JSON。');
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(serializeParameters(parameters)); setMessage('参数 JSON 已复制。'); }
    catch { setJson(serializeParameters(parameters)); setImportOpen(true); setMessage('可在文本框中手动复制参数。'); }
  };
  return <aside className={`parameter-workbench ${open ? 'is-open' : ''}`} data-parameter-panel onClick={event => event.stopPropagation()} onPointerMove={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); toggle.current?.focus({ preventScroll: true }); }
  }} aria-label="邮票效果参数控件">
    <button ref={toggle} className="parameter-launcher" aria-expanded={open} aria-controls="parameter-panel" onClick={() => setOpen(value => !value)}><svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14M7 3v4M13 8v4M8 13v4" stroke="currentColor" strokeWidth="1.3" /></svg><span>参数控件</span><span className="launcher-sign" aria-hidden="true">{open ? '−' : '+'}</span></button>
    {open && <div id="parameter-panel" className="parameter-panel">
      <div className="parameter-heading"><span className="parameter-kicker">PAPER / LIGHT / MOTION</span><h1>光与纸，随手调节。</h1><p>实时应用于邮票 · 自动保存在本机</p></div>
      {unavailable && <p className="parameter-notice">当前为纸面回退模式，光影与偏转需要 WebGL。</p>}
      {reducedMotion && <p className="parameter-notice">系统已开启减少动态：偏转和光影流动暂停，颜色与形态仍可调节。</p>}
      <div className="parameter-scroll">
        <div className="parameter-presets"><label htmlFor="parameter-preset">效果预设</label><select id="parameter-preset" value={selectedPreset} onChange={event => { if (PRESETS[event.target.value]) { onReplace(PRESETS[event.target.value].values); setMessage(PRESETS[event.target.value].description); } }}><option value="custom" disabled>自定义</option>{Object.entries(PRESETS).map(([key, preset]) => <option value={key} key={key}>{preset.name}</option>)}</select></div>
        <div className="parameter-preview"><button disabled={unavailable} onClick={focused ? onClose : onFocus}>{focused ? '返回画廊' : '聚焦主邮票'}<span aria-hidden="true">↗</span></button><label><input type="checkbox" checked={parameters.pinLight} onChange={event => onChange('pinLight', event.target.checked)} />固定光影预览</label></div>
        {PARAMETER_GROUPS.map((group, index) => <details key={group.id} open={index === 0 || index === 2} className="parameter-group">
          <summary><span>{group.title}</span><span className="group-count">{group.fields.length.toString().padStart(2, '0')}</span></summary>
          <p className="parameter-group-note">{group.note}</p>
          {group.fields.map(field => <ParameterField key={field.key} field={field} value={parameters[field.key]} onChange={onChange} />)}
          <button className="group-reset" onClick={() => { onReplace({ ...parameters, ...Object.fromEntries(group.fields.map(field => [field.key, DEFAULT_PARAMETERS[field.key]])) }); setMessage(`已重置${group.title}。`); }}>重置这一组</button>
        </details>)}
        {importOpen && <div className="parameter-import"><label htmlFor="parameter-json">参数 JSON</label><textarea id="parameter-json" value={json} onChange={event => setJson(event.target.value)} placeholder="粘贴本面板导出的 JSON" spellCheck={false} /><div><button onClick={() => applyJson(json)}>应用 JSON</button><button onClick={() => setImportOpen(false)}>收起</button></div></div>}
        <p className="parameter-footnote">先调“聚焦偏转 / 透视距离”，再调光影。参数无法消除原图案与材质算法本身的差异。</p>
      </div>
      <footer className="parameter-footer"><div><button onClick={copy}>复制</button><button onClick={download}>导出</button><button onClick={() => fileInput.current?.click()}>导入</button><button onClick={() => { setImportOpen(value => !value); setJson(''); }}>粘贴</button><button onClick={() => { onReplace(DEFAULT_PARAMETERS); setMessage('全部参数已恢复。'); }}>全部重置</button></div><input ref={fileInput} className="sr-only" tabIndex={-1} type="file" accept=".json,application/json" aria-label="导入参数 JSON 文件" onChange={async event => { const file = event.target.files?.[0]; if (file) { if (file.size > 100000) setMessage('参数文件过大，请选择本面板导出的 JSON。'); else applyJson(await file.text()); } event.target.value = ''; }} /><p role="status" aria-live="polite">{storageError || message || '悬停看光影，点击看聚焦。'}</p></footer>
    </div>}
  </aside>;
}
