import React, { useEffect, useRef, useState } from 'react';
import { SERIES, STAMPS, getFocus, getHome } from './config.js';
import { createStampGallery } from './rendering/StampGallery.js';
import { createStampArtwork, prepareStampArtwork } from './artwork.js';
import ParameterPanel from './ParameterPanel.jsx';
import { DEFAULT_PARAMETERS, normalizeParameters, readParameters, serializeParameters, STORAGE_KEY } from './parameters.js';
import './styles.css';

export default function App() {
  const host = useRef(null);
  const buttons = useRef({});
  const label = useRef(null);
  const focusUi = useRef(null);
  const chrome = useRef(null);
  const galleryRef = useRef(null);
  const [parameters, setParameters] = useState(() => { try { return readParameters(window.localStorage); } catch { return { ...DEFAULT_PARAMETERS }; } });
  const latestParameters = useRef(parameters);
  latestParameters.current = parameters;
  const [storageError, setStorageError] = useState('');
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [state, setState] = useState({ phase: 'idle', activeId: null, hoverId: null });
  const [selectedSeries, setSelectedSeries] = useState('all');
  const [error, setError] = useState(null);
  const [fallbackActive, setFallbackActive] = useState(null);
  const [fallbackArt, setFallbackArt] = useState({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    let gallery;
    prepareStampArtwork().then(() => {
      if (cancelled) return;
      gallery = createStampGallery({
        host: host.current, buttons: buttons.current, label: label.current,
        focusUi: focusUi.current, chrome: chrome.current, onState: setState,
        onError: (reason) => setError(reason.message),
        parameters: latestParameters.current, series: selectedSeries,
      });
      galleryRef.current = gallery;
      setLoading(false);
    }).catch(reason => {
      if (!cancelled) { setError(reason.message); setLoading(false); }
    });
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(media.matches);
    media.addEventListener('change', updateMotion);
    return () => { cancelled = true; galleryRef.current = null; media.removeEventListener('change', updateMotion); gallery?.dispose(); };
  }, []);
  useEffect(() => {
    galleryRef.current?.configure?.(parameters);
    try { localStorage.setItem(STORAGE_KEY, serializeParameters(parameters)); setStorageError(''); }
    catch { setStorageError('当前浏览器无法保存；参数仍可实时应用并导出。'); }
  }, [parameters]);
  useEffect(() => { galleryRef.current?.setSeries?.(selectedSeries); }, [selectedSeries]);
  useEffect(() => {
    if (!error) return;
    setFallbackArt(Object.fromEntries(STAMPS.map((stamp) => {
      try { return [stamp.id, createStampArtwork(stamp.id, 500, Math.round(500 / stamp.ratio)).toDataURL()]; }
      catch { return [stamp.id, stamp.image]; }
    })));
    const escape = (event) => { if (event.key === 'Escape') setFallbackActive(null); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [error]);
  const hovered = STAMPS.find((stamp) => stamp.id === state.hoverId);
  const focused = STAMPS.find((stamp) => stamp.id === state.activeId);
  const activeSeries = SERIES.find(series => series.id === selectedSeries) ?? SERIES[0];
  const focusedSeries = SERIES.find(series => series.id === focused?.series) ?? activeSeries;
  const fallbackStyle = stamp => {
    const isFocused = fallbackActive === stamp.id;
    const home = isFocused ? getFocus(stamp, innerWidth, innerHeight, parameters) : getHome(stamp, innerWidth, innerHeight, selectedSeries);
    const visible = selectedSeries === 'all' || stamp.series === selectedSeries;
    return {
      left: `${home.x}px`, top: `${home.y}px`, width: `${home.width}px`, height: `${home.height}px`,
      zIndex: isFocused ? 30 : home.z, transform: `translate(-50%, -50%) rotate(${isFocused ? 0 : home.angle}deg)`,
      opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none',
    };
  };
  return (
    <main className={`exhibition ${error ? 'has-fallback' : ''}`} ref={host} aria-busy={loading} role={focused ? 'dialog' : undefined} aria-modal={focused ? true : undefined} aria-label={focused ? `${focused.name}，邮票聚焦` : '狮行万里，十二枚地域狮舞邮票展览'}>
      <div className="gallery-chrome" ref={chrome} aria-hidden={Boolean(focused)}>
        <header className="masthead">
          <div className="wordmark"><span className="wordmark-icon" aria-hidden="true">✳</span><span>POSTAL STUDIES<small>狮行万里 · FROM LINGNAN TO THE WORLD</small></span></div>
          <span className="edition">{activeSeries.edition}<span>{selectedSeries === 'all' ? `${STAMPS.length} REGIONAL STAMP ARTWORKS` : `${STAMPS.filter(stamp => stamp.series === selectedSeries).length} STAMPS`}</span></span>
        </header>
        <div className="gallery-note"><span className="note-dot" aria-hidden="true" /> <span>Small things, closely observed.<br /><span className="desktop-instruction">HOVER A STAMP TO BRING IT INTO THE LIGHT</span><span className="mobile-instruction">TOUCH A STAMP TO LOOK CLOSER</span></span></div>
        <span className="folio" aria-hidden="true">PAPER / LIGHT / MOTION</span>
      </div>
      <nav className="series-switcher" aria-label="选择邮票系列" data-series-nav>
        {SERIES.map(series => <button key={series.id} type="button" aria-pressed={selectedSeries === series.id} onClick={event => { event.stopPropagation(); setSelectedSeries(series.id); }}>{series.label}</button>)}
      </nav>
      <div className="stamp-controls" aria-label="The collection">
        {STAMPS.map((stamp) => <button key={stamp.id} ref={(node) => { buttons.current[stamp.id] = node; }} className="stamp-hit" disabled={loading} data-stamp={stamp.id} aria-label={`View ${stamp.name}, stamp ${stamp.number} of ${STAMPS.length}`} aria-pressed={state.activeId === stamp.id} aria-hidden={Boolean(focused) && state.activeId !== stamp.id ? true : undefined}><span className="sr-only">{stamp.name}</span></button>)}
      </div>
      <div className="hover-label" aria-hidden="true" ref={label}>{hovered?.name ?? ''}</div>
      <div className="focus-ui" ref={focusUi}>
        <button className="close-focus" aria-label="Return to the stamp collection"><span aria-hidden="true">×</span><span>BACK TO COLLECTION</span></button>
        <p className="focus-instruction">CLICK ANYWHERE OR PRESS ESC.</p>
        {focused && <section className="focus-detail" aria-label={`${focused.place}邮票介绍`}>
          <p className="focus-series">{focusedSeries.edition} · {focused.place}</p>
          <h2>{focused.title}</h2>
          <p>{focused.story}</p>
          <p className="focus-design">设计说明：{focused.design}</p>
        </section>}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{focused ? `${focused.name}。聚焦查看。按Escape返回。` : `画廊视图。使用Tab浏览${selectedSeries === 'all' ? STAMPS.length : STAMPS.filter(stamp => stamp.series === selectedSeries).length}枚${activeSeries.label}邮票。`}</p>
      {loading && <p className="artwork-loading" role="status">正在装裱地域狮舞邮票…</p>}
      <ParameterPanel parameters={parameters} onChange={(key, value) => setParameters(previous => normalizeParameters({ ...previous, [key]: value }))} onReplace={values => setParameters(normalizeParameters(values))} onFocus={() => { const stamp = STAMPS.find(item => selectedSeries === 'all' || item.series === selectedSeries) ?? STAMPS[0]; galleryRef.current?.focus?.(stamp.id); }} onClose={() => galleryRef.current?.close?.()} focused={Boolean(focused)} unavailable={Boolean(error) || loading} storageError={storageError} reducedMotion={reducedMotion} />
      {error && <div className={`fallback-gallery ${fallbackActive ? 'is-focused' : ''}`} onClick={() => setFallbackActive(null)}>
        <p className="fallback-note">POSTAL STUDIES · 狮行万里 · PAPER EDITION</p>
        {STAMPS.map((stamp) => <button key={stamp.id} className={`fallback-stamp ${fallbackActive === stamp.id ? 'is-active' : ''}`} style={fallbackStyle(stamp)} hidden={selectedSeries !== 'all' && stamp.series !== selectedSeries} aria-label={`查看${stamp.name}`} aria-pressed={fallbackActive === stamp.id} tabIndex={fallbackActive && fallbackActive !== stamp.id ? -1 : 0} onClick={(event) => { event.stopPropagation(); setFallbackActive(fallbackActive === stamp.id ? null : stamp.id); }}><img src={fallbackArt[stamp.id]} alt={stamp.name} /></button>)}
        {fallbackActive && <button className="fallback-close" onClick={() => setFallbackActive(null)}>Return to collection · ESC</button>}
      </div>}
    </main>
  );
}

