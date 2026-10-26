import React, { useEffect, useRef, useState } from 'react';
import { STAMPS } from './config.js';
import { createStampGallery } from './rendering/StampGallery.js';
import { createStampArtwork } from './artwork.js';
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
  const [storageError, setStorageError] = useState('');
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [state, setState] = useState({ phase: 'idle', activeId: null, hoverId: null });
  const [error, setError] = useState(null);
  const [fallbackActive, setFallbackActive] = useState(null);
  const [fallbackArt, setFallbackArt] = useState({});
  useEffect(() => {
    const gallery = createStampGallery({
      host: host.current, buttons: buttons.current, label: label.current,
      focusUi: focusUi.current, chrome: chrome.current, onState: setState,
      onError: (reason) => setError(reason.message),
      parameters,
    });
    galleryRef.current = gallery;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(media.matches);
    media.addEventListener('change', updateMotion);
    return () => { galleryRef.current = null; media.removeEventListener('change', updateMotion); gallery.dispose(); };
  }, []);
  useEffect(() => {
    galleryRef.current?.configure?.(parameters);
    try { localStorage.setItem(STORAGE_KEY, serializeParameters(parameters)); setStorageError(''); }
    catch { setStorageError('当前浏览器无法保存；参数仍可实时应用并导出。'); }
  }, [parameters]);
  useEffect(() => {
    if (!error) return;
    setFallbackArt(Object.fromEntries(STAMPS.map((stamp) => [stamp.id, createStampArtwork(stamp.id, 500, Math.round(500 / stamp.ratio)).toDataURL()])));
    const escape = (event) => { if (event.key === 'Escape') setFallbackActive(null); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [error]);
  const hovered = STAMPS.find((stamp) => stamp.id === state.hoverId);
  const focused = STAMPS.find((stamp) => stamp.id === state.activeId);
  return (
    <main className={`exhibition ${error ? 'has-fallback' : ''}`} ref={host} role={focused ? 'dialog' : undefined} aria-modal={focused ? true : undefined} aria-label={focused ? `${focused.name}, focused stamp` : 'Postal Studies, interactive stamp exhibition'}>
      <div className="gallery-chrome" ref={chrome} aria-hidden={Boolean(focused)}>
        <header className="masthead">
          <div className="wordmark"><span className="wordmark-icon" aria-hidden="true">✳</span><span>POSTAL STUDIES<small>AN EXHIBITION IN PAPER & LIGHT</small></span></div>
          <span className="edition">COLLECTION 001<span>6 DIGITAL ORIGINALS</span></span>
        </header>
        <div className="gallery-note"><span className="note-dot" aria-hidden="true" /> <span>Small things, closely observed.<br /><span className="desktop-instruction">HOVER A STAMP TO BRING IT INTO THE LIGHT</span><span className="mobile-instruction">TOUCH A STAMP TO LOOK CLOSER</span></span></div>
        <span className="folio" aria-hidden="true">PAPER / LIGHT / MOTION</span>
      </div>
      <div className="stamp-controls" aria-label="The collection">
        {STAMPS.map((stamp) => <button key={stamp.id} ref={(node) => { buttons.current[stamp.id] = node; }} className="stamp-hit" data-stamp={stamp.id} aria-label={`View ${stamp.name}, stamp ${stamp.number} of 6`} aria-pressed={state.activeId === stamp.id} aria-hidden={Boolean(focused) && state.activeId !== stamp.id ? true : undefined}><span className="sr-only">{stamp.name}</span></button>)}
      </div>
      <div className="hover-label" aria-hidden="true" ref={label}>{hovered?.name ?? ''}</div>
      <div className="focus-ui" ref={focusUi}>
        <button className="close-focus" aria-label="Return to the stamp collection"><span aria-hidden="true">×</span><span>BACK TO COLLECTION</span></button>
        <p className="focus-instruction">CLICK ANYWHERE OR PRESS ESC.</p>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{focused ? `${focused.name}. Focused view. Press Escape to return.` : 'Collection view. Use Tab to explore six stamps.'}</p>
      <ParameterPanel parameters={parameters} onChange={(key, value) => setParameters(previous => normalizeParameters({ ...previous, [key]: value }))} onReplace={values => setParameters(normalizeParameters(values))} onFocus={() => galleryRef.current?.focus?.('craft')} onClose={() => galleryRef.current?.close?.()} focused={Boolean(focused)} unavailable={Boolean(error)} storageError={storageError} reducedMotion={reducedMotion} />
      {error && <div className={`fallback-gallery ${fallbackActive ? 'is-focused' : ''}`} onClick={() => setFallbackActive(null)}>
        <p className="fallback-note">POSTAL STUDIES · PAPER EDITION</p>
        {STAMPS.map((stamp) => <button key={stamp.id} className={`fallback-stamp fallback-${stamp.id} ${fallbackActive === stamp.id ? 'is-active' : ''}`} aria-label={`View ${stamp.name}`} aria-pressed={fallbackActive === stamp.id} tabIndex={fallbackActive && fallbackActive !== stamp.id ? -1 : 0} onClick={(event) => { event.stopPropagation(); setFallbackActive(fallbackActive === stamp.id ? null : stamp.id); }}><img src={fallbackArt[stamp.id]} alt={stamp.name} /></button>)}
        {fallbackActive && <button className="fallback-close" onClick={() => setFallbackActive(null)}>Return to collection · ESC</button>}
      </div>}
    </main>
  );
}

