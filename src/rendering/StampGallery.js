import * as THREE from 'three';
import { SERIES, STAMPS, EXHIBITION, getHome, getFocus } from '../config.js';
import { FocusMotion, clamp, lerp, damp } from '../motion.js';
import { createStampArtwork } from '../artwork.js';
import { createStampMaterial, createShadowTexture, createShadowMaterial } from './StampMaterial.js';
import { createDappledLight } from './DappledLight.js';
import { DEFAULT_PARAMETERS, normalizeParameters } from '../parameters.js';

/** Owns the one renderer, one clock, all persistent GPU assets, and input. */
export function createStampGallery({ host, buttons, label, focusUi, chrome, onState, onError, parameters = DEFAULT_PARAMETERS, series = 'all' }) {
  let settings = normalizeParameters(parameters);
  let currentSeries = SERIES.some(option => option.id === series) ? series : 'all';
  let disposed = false;
  let frame = 0;
  let lastTime = null;
  let width = 1;
  let height = 1;
  let selected = null;
  let hovered = null;
  let pendingSelection = null;
  let previousState = '';
  let elapsed = 0;
  let returnFocus = false;
  let previousButton = null;
  let lastHovered = STAMPS[0].id;
  let pointerValid = false;
  const motion = new FocusMotion();
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = media.matches;
  const pointer = new THREE.Vector2(0.5, 0.5);
  const pointerNdc = new THREE.Vector2(10, 10);
  const raycaster = new THREE.Raycaster();
  const topEdge = new THREE.Vector3();
  const corners = [[-0.5, -0.5], [-0.5, 0.5], [0.5, -0.5], [0.5, 0.5]];
  const uvTarget = new THREE.Vector2(0.5, 0.5);
  const viewportMatrix = new THREE.Matrix4();
  const projection = new THREE.Matrix4();
  const buttonMatrix = new THREE.Matrix4();
  const buttonLocal = new THREE.Matrix4();
  let lightPalette = '';
  function syncLightPalette() {
    const { light, color, intensity, enabled, contrast, grain } = background.parameters;
    const key = `${light}:${color}:${intensity}:${enabled}:${contrast}:${grain}:${settings.surfaceRelief}:${settings.surfaceShine}:${settings.textureScale}:${settings.shadowStrength}:${settings.contactShadowColor}:${settings.contactShadowSoftness}:${settings.contactShadowOpacity}`;
    if (key === lightPalette) return;
    lightPalette = key;
    const rgb = (hex) => {
      const n = Number.parseInt(hex.slice(1), 16);
      return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
    };
    for (const entry of entries) {
      entry.material.uniforms.uLightColor.value.fromArray(rgb(light));
      entry.material.uniforms.uLightStrength.value = enabled ? intensity : 0;
      entry.material.uniforms.uLightContrast.value = contrast;
      entry.material.uniforms.uLightGrain.value = grain;
      if (entry.material.uniforms.uSurfaceRelief) entry.material.uniforms.uSurfaceRelief.value = settings.surfaceRelief;
      if (entry.material.uniforms.uSurfaceShine) entry.material.uniforms.uSurfaceShine.value = settings.surfaceShine;
      entry.material.uniforms.uTextureScale.value = settings.textureScale;
      entry.material.uniforms.uShadowStrength.value = settings.shadowStrength;
      entry.shadowMaterial.uniforms.uColor.value.fromArray(rgb(settings.contactShadowColor));
      entry.shadowMaterial.uniforms.uSoftness.value = settings.contactShadowSoftness;
    }
  }
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  } catch (error) {
    onError(error);
    return { dispose() {} };
  }
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.className = 'exhibition-canvas';
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, EXHIBITION.maxDpr));
  renderer.autoClear = false;
  renderer.setClearColor(EXHIBITION.paper, 1);
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  // Match a CSS perspective in CSS pixels; the front-facing plane stays 1:1.
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 10000);
  camera.position.z = settings.perspective;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const background = createDappledLight(renderer, { background: EXHIBITION.paper, focusColor: EXHIBITION.dark });
  background.configure(settings);
  background.configure({ background: settings.backgroundColor, focusColor: settings.focusBackground });
  const entries = STAMPS.map((stamp) => {
    const artwork = createStampArtwork(stamp.id, 720, Math.round(720 / stamp.ratio));
    const texture = new THREE.CanvasTexture(artwork);
    texture.colorSpace = THREE.NoColorSpace;
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    const material = createStampMaterial(texture, background.texture);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = stamp.id;
    mesh.rotation.order = 'ZXY';
    mesh.frustumCulled = false;
    const shadowSource = createShadowTexture(artwork);
    const shadowMaterial = createShadowMaterial(shadowSource.texture);
    const shadow = new THREE.Mesh(geometry, shadowMaterial);
    shadow.frustumCulled = false;
    scene.add(shadow, mesh);
    return { stamp, artwork, texture, material, mesh, shadow, shadowSource, shadowMaterial, lightTarget: new THREE.Vector2(0.5, 0.5), hover: 0, light: 0, tiltX: 0, tiltY: 0, roll: 0, shiftX: 0, shiftY: 0, targetX: 0, targetY: 0, blur: 0, home: null, layoutFrom: null, displayHome: null, layoutT: 1, seriesOpacity: 1, focus: null };
  });

  function publish() {
    const phase = selected !== null ? (motion.target === 0 ? 'returning' : motion.settled ? 'focused' : 'focusing') : hovered !== null ? 'hovering' : 'idle';
    const key = `${phase}:${selected}:${hovered}:${currentSeries}`;
    host.dataset.phase = phase;
    if (key !== previousState) {
      previousState = key;
      onState({ phase, activeId: selected, hoverId: hovered });
    }
  }

  function wake() {
    if (!disposed && !frame && !document.hidden) frame = requestAnimationFrame(tick);
  }

  function startFocus(id) {
    if (disposed) return;
    if (selected !== null && selected !== id) {
      pendingSelection = id;
      motion.retarget(0, reducedMotion ? EXHIBITION.reducedDuration : settings.returnDuration);
    } else {
      selected = id;
      pendingSelection = null;
      previousButton = buttons[id];
      hovered = null;
      returnFocus = false;
      motion.retarget(1, reducedMotion ? EXHIBITION.reducedDuration : settings.enterDuration);
    }
    publish();
    wake();
  }

  function close({ restoreFocus = false } = {}) {
    if (selected === null) return;
    pendingSelection = null;
    hovered = null;
    returnFocus = restoreFocus;
    motion.retarget(0, reducedMotion ? EXHIBITION.reducedDuration : settings.returnDuration);
    publish();
    wake();
  }

  function setHover(id) {
    if (selected !== null && motion.target === 1) return;
    const stamp = STAMPS.find(item => item.id === id);
    if (stamp && currentSeries !== 'all' && stamp.series !== currentSeries) return;
    hovered = id;
    if (id) lastHovered = id;
    publish();
    wake();
  }

  function updateCamera(progress) {
    const distance = lerp(settings.hoverPerspective, settings.perspective, progress);
    camera.aspect = width / height;
    camera.position.z = distance;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(height / (2 * distance)));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    viewportMatrix.set(width / 2, 0, 0, width / 2, 0, -height / 2, 0, height / 2, 0, 0, 1, 0, 0, 0, 0, 1);
    projection.multiplyMatrices(viewportMatrix, camera.projectionMatrix).multiply(camera.matrixWorldInverse);
  }

  function resize() {
    width = host.clientWidth || innerWidth;
    height = host.clientHeight || innerHeight;
    updateCamera(motion.value);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, EXHIBITION.maxDpr));
    renderer.setSize(width, height, false);
    background.resize(width, height);
    for (const entry of entries) {
      entry.home = getHome(entry.stamp, width, height, currentSeries);
      entry.layoutFrom = entry.home;
      entry.displayHome = entry.home;
      entry.layoutT = 1;
      entry.seriesOpacity = currentSeries === 'all' || entry.stamp.series === currentSeries ? 1 : 0;
      entry.focus = getFocus(entry.stamp, width, height, settings);
    }
    wake();
  }

  function setSeries(next) {
    if (!SERIES.some(option => option.id === next) || next === currentSeries) return;
    if (selected !== null) close();
    currentSeries = next;
    hovered = null;
    lastHovered = STAMPS.find(stamp => next === 'all' || stamp.series === next)?.id ?? STAMPS[0].id;
    for (const entry of entries) {
      entry.layoutFrom = { ...(entry.displayHome ?? entry.home ?? getHome(entry.stamp, width, height, currentSeries)) };
      const visible = next === 'all' || entry.stamp.series === next;
      if (visible) entry.home = getHome(entry.stamp, width, height, next);
      entry.layoutT = 0;
    }
    publish();
    wake();
  }

  function move(event) {
    if (event.target.closest?.('[data-parameter-panel]')) return;
    const rect = host.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / width);
    const y = clamp((event.clientY - rect.top) / height);
    pointer.set(x, y);
    pointerNdc.set(x * 2 - 1, 1 - y * 2);
    pointerValid = true;
    wake();
  }

  function tick(timestamp) {
    frame = 0;
    if (disposed || document.hidden) return;
    const dt = lastTime === null ? 1 / 60 : clamp((timestamp - lastTime) / 1000, 0, 0.05);
    lastTime = timestamp;
    elapsed += dt;
    const progress = motion.update(dt);
    updateCamera(progress);
    if (selected !== null && motion.settled && motion.target === 0) {
      selected = null;
      if (pendingSelection !== null) {
        const next = pendingSelection;
        pendingSelection = null;
        startFocus(next);
      } else if (returnFocus && previousButton) {
        returnFocus = false;
        previousButton.focus({ preventScroll: true });
      }
    }
    const active = selected !== null ? selected : hovered ?? (settings.pinLight ? lastHovered : null);
    background.setActiveStamp(active);
    syncLightPalette();
    raycaster.setFromCamera(pointerNdc, camera);
    let stillMoving = !motion.settled;

    for (const entry of entries) {
      const { stamp, mesh, shadow, material, focus } = entry;
      const targetVisible = currentSeries === 'all' || stamp.series === currentSeries;
      const layoutTarget = reducedMotion ? 1 : damp(entry.layoutT, 1, dt, 0.18);
      entry.layoutT = Math.abs(layoutTarget - 1) < 0.001 ? 1 : layoutTarget;
      if (entry.layoutT < 1) stillMoving = true;
      const layoutEase = entry.layoutT * entry.layoutT * (3 - 2 * entry.layoutT);
      const home = {
        x: lerp(entry.layoutFrom?.x ?? entry.home.x, entry.home.x, layoutEase),
        y: lerp(entry.layoutFrom?.y ?? entry.home.y, entry.home.y, layoutEase),
        width: lerp(entry.layoutFrom?.width ?? entry.home.width, entry.home.width, layoutEase),
        height: lerp(entry.layoutFrom?.height ?? entry.home.height, entry.home.height, layoutEase),
        angle: lerp(entry.layoutFrom?.angle ?? entry.home.angle, entry.home.angle, layoutEase),
        z: entry.home.z,
      };
      entry.displayHome = home;
      const opacityTarget = targetVisible ? 1 : 0;
      entry.seriesOpacity = reducedMotion ? opacityTarget : damp(entry.seriesOpacity, opacityTarget, dt, 0.16);
      if (Math.abs(entry.seriesOpacity - opacityTarget) < 0.005) entry.seriesOpacity = opacityTarget;
      else stillMoving = true;
      const isSelected = selected === stamp.id;
      const isHovered = hovered === stamp.id && selected === null;
      const isActive = active === stamp.id;
      const p = isSelected ? progress : 0;
      const targetHover = isHovered || (isSelected && motion.target === 1) ? 1 : 0;
      entry.hover = damp(entry.hover, targetHover, dt, settings.hoverResponse);
      if (Math.abs(entry.hover - targetHover) < 0.001) entry.hover = targetHover;
      else stillMoving = true;
      const lift = reducedMotion ? 1 : 1 + entry.hover * (settings.hoverScale - 1) * (1 - p);
      const stampWidth = lerp(home.width, focus.width, p) * lift;
      const stampHeight = stampWidth / stamp.ratio;
      const baseX = lerp(home.x, focus.x, p);
      const baseY = lerp(home.y, focus.y, p) - (reducedMotion ? 0 : entry.hover * settings.hoverLift * (1 - p));
      const angle = lerp(home.angle, 0, p);
      const a = THREE.MathUtils.degToRad(angle);
      const dx = pointer.x * width - baseX, dy = pointer.y * height - baseY;
      // Tilt uses the neutral local paper plane, avoiding a moving-target feedback loop.
      const localX = (dx * Math.cos(a) + dy * Math.sin(a)) / stampWidth;
      const localY = (-dx * Math.sin(a) + dy * Math.cos(a)) / stampHeight;
      const inside = pointerValid && Math.abs(localX) <= 0.5 && Math.abs(localY) <= 0.5;
      const tracking = isActive && pointerValid && (isHovered || (isSelected && motion.target === 1 && (inside || settings.focusTrackOutside)));
      if (tracking) { entry.targetX = clamp(localX * 2, -1, 1); entry.targetY = clamp(localY * 2, -1, 1); }
      else if (!isSelected || settings.resetTiltOnLeave || motion.target === 0) { entry.targetX = 0; entry.targetY = 0; }
      const strength = settings.tiltEnabled && !reducedMotion ? lerp(settings.hoverTilt, settings.focusTilt, p) * entry.hover : 0;
      const targetTiltX = THREE.MathUtils.degToRad(entry.targetY * strength);
      const targetTiltY = THREE.MathUtils.degToRad(entry.targetX * strength);
      const smooth = (key, target, epsilon = 0.00001) => {
        entry[key] = reducedMotion ? target : damp(entry[key], target, dt, settings.tiltResponse);
        if (Math.abs(entry[key] - target) < epsilon) entry[key] = target;
        else stillMoving = true;
      };
      smooth('tiltX', targetTiltX);
      smooth('tiltY', targetTiltY);
      smooth('roll', !reducedMotion && settings.tiltEnabled ? entry.targetX * settings.focusRoll * p : 0);
      smooth('shiftX', !reducedMotion && settings.tiltEnabled ? entry.targetX * settings.focusShift * p : 0, 0.001);
      smooth('shiftY', !reducedMotion && settings.tiltEnabled ? entry.targetY * settings.focusShift * p : 0, 0.001);
      const x = baseX + entry.shiftX, y = baseY + entry.shiftY;
      const visible = (isSelected ? 1 : 1 - progress) * entry.seriesOpacity;
      const rank = isSelected || isHovered ? 20 : home.z;
      mesh.renderOrder = rank * 2 + 1;
      shadow.renderOrder = rank * 2;
      mesh.position.set(x - width / 2, height / 2 - y, 0);
      mesh.scale.set(stampWidth, stampHeight, 1);
      mesh.rotation.set(entry.tiltX, entry.tiltY, -THREE.MathUtils.degToRad(angle + entry.roll), 'ZXY');

      // Intersect the current persistent mesh, rather than unrotated screen UVs.
      mesh.updateMatrixWorld();
      const hit = isActive && pointerValid ? raycaster.intersectObject(mesh, false)[0] : null;
      if (hit?.uv) entry.lightTarget.copy(hit.uv);
      else if (!(isActive && (settings.pinLight || (isSelected && !settings.resetTiltOnLeave && !settings.focusTrackOutside)))) entry.lightTarget.set(0.5, 0.5);
      uvTarget.copy(entry.lightTarget);
      if (reducedMotion || !settings.lightFollowPointer) uvTarget.set(0.5, 0.5);
      if (isActive) {
        background.setPointer(uvTarget.x, uvTarget.y);
        background.setStampSize(stampWidth, stampHeight, Math.min(devicePixelRatio || 1, EXHIBITION.maxDpr));
      }
      const uniforms = material.uniforms;
      uvTarget.set(0.5 + (uvTarget.x - 0.5) * settings.pointerInfluence, 0.5 + (uvTarget.y - 0.5) * settings.pointerInfluence);
      if (reducedMotion) uniforms.uPointer.value.copy(uvTarget);
      else uniforms.uPointer.value.lerp(uvTarget, settings.lightResponse <= 0 ? 1 : -Math.expm1(-dt / settings.lightResponse));
      if (uniforms.uPointer.value.distanceToSquared(uvTarget) > 0.000001) stillMoving = true;
      else uniforms.uPointer.value.copy(uvTarget);
      const blurTarget = active !== null && !isActive ? settings.blur * (width < 700 ? 6 / 11 : 1) : 0;
      entry.blur = damp(entry.blur, blurTarget, dt, settings.blurResponse);
      if (Math.abs(entry.blur - blurTarget) < 0.005) entry.blur = blurTarget;
      else stillMoving = true;
      uniforms.uSize.value.set(stampWidth, stampHeight);
      uniforms.uOpacity.value = visible;
      uniforms.uBlur.value = entry.blur;
      const targetLight = settings.lightEnabled && (isHovered || (settings.pinLight && isActive) || (isSelected && motion.target === 1)) ? 1 : 0;
      entry.light = damp(entry.light, targetLight, dt, targetLight ? settings.lightFadeIn : settings.lightFadeOut);
      if (Math.abs(entry.light - targetLight) < 0.001) entry.light = targetLight;
      else stillMoving = true;
      uniforms.uActivity.value = entry.light;
      uniforms.uTime.value = elapsed;
      mesh.visible = visible > 0.001;

      shadow.position.copy(mesh.position);
      shadow.position.z -= 0.1;
      shadow.rotation.copy(mesh.rotation);
      shadow.scale.set(stampWidth * entry.shadowSource.scaleX, stampHeight * entry.shadowSource.scaleY, 1);
      entry.shadowMaterial.uniforms.uOpacity.value = visible * (1 - p * 0.86) * settings.contactShadowOpacity * (0.9 + entry.hover * 0.1);
      shadow.visible = mesh.visible;

      const button = buttons[stamp.id];
      button.style.width = `${stampWidth}px`;
      button.style.height = `${stampHeight}px`;
      // Project the exact same four corners as WebGL. CSS and raycast stay aligned even at 20°.
      buttonLocal.set(1 / stampWidth, 0, 0, -0.5, 0, -1 / stampHeight, 0, 0.5, 0, 0, 1, 0, 0, 0, 0, 1);
      buttonMatrix.multiplyMatrices(projection, mesh.matrixWorld).multiply(buttonLocal);
      const divisor = buttonMatrix.elements[15];
      button.style.transformOrigin = '0 0';
      button.style.transform = `matrix3d(${buttonMatrix.elements.map(value => value / divisor).join(',')})`;
      button.style.zIndex = rank + 5;
      button.style.visibility = visible < 0.05 ? 'hidden' : 'visible';
      button.style.pointerEvents = (!targetVisible || entry.seriesOpacity < 0.995 || (selected !== null && !isSelected && motion.target === 1)) ? 'none' : 'auto';
      button.tabIndex = !targetVisible || (selected !== null && !isSelected) ? -1 : 0;
      button.dataset.selected = String(isSelected);
      if (isHovered) {
        mesh.updateMatrixWorld();
        let highest = height;
        for (const [cx, cy] of corners) {
          topEdge.set(cx, cy, 0).applyMatrix4(mesh.matrixWorld).project(camera);
          highest = Math.min(highest, (1 - topEdge.y) * height / 2);
        }
        const labelX = clamp(x, 105, width - 105);
        const labelY = highest - 16;
        label.style.left = `${labelX}px`;
        label.style.top = `${labelY}px`;
      }
    }

    chrome.style.opacity = `${1 - progress}`;
    chrome.style.pointerEvents = progress > 0.1 ? 'none' : '';
    const seriesNav = host.querySelector('[data-series-nav]');
    if (seriesNav) {
      seriesNav.style.pointerEvents = selected !== null || progress > 0.1 ? 'none' : 'auto';
      seriesNav.setAttribute('aria-hidden', String(selected !== null));
    }
    focusUi.style.opacity = `${clamp((progress - 0.12) / 0.6)}`;
    focusUi.style.pointerEvents = 'none';
    focusUi.querySelector('button').style.pointerEvents = selected !== null && progress > 0.15 ? 'auto' : 'none';
    focusUi.style.visibility = selected === null ? 'hidden' : 'visible';
    label.style.opacity = selected === null && hovered !== null ? '1' : '0';
    host.dataset.progress = progress.toFixed(4);
    const lightActive = entries.some((entry) => entry.light > 0.001);
    background.render(elapsed, progress, reducedMotion, lightActive);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(scene, camera);
    publish();
    if (background.needsFrame || stillMoving) wake();
    else lastTime = null;
  }

  const listeners = [];
  function listen(target, type, callback, options) {
    target.addEventListener(type, callback, options);
    listeners.push(() => target.removeEventListener(type, callback, options));
  }
  for (const entry of entries) {
    const id = entry.stamp.id;
    const button = buttons[id];
    listen(button, 'pointerenter', (event) => { if (event.pointerType !== 'touch') setHover(id); });
    listen(button, 'pointerleave', () => { if (hovered === id) setHover(null); });
    listen(button, 'focus', () => { if (selected === null) setHover(id); });
    listen(button, 'blur', () => { if (hovered === id) setHover(null); });
    listen(button, 'click', (event) => {
      event.stopPropagation();
      if (selected === id && motion.target === 1) close();
      else startFocus(id);
    });
  }
  listen(host, 'pointermove', move, { passive: true });
  listen(host, 'pointerleave', () => { hovered = null; pointerValid = false; pointerNdc.set(10, 10); publish(); wake(); });
  const panel = host.querySelector('[data-parameter-panel]');
  if (panel) listen(panel, 'pointerenter', () => { pointerValid = false; pointerNdc.set(10, 10); hovered = null; publish(); wake(); });
  // React delegates panel events at #root, after this native host listener.
  // Guard here as well so operating controls never triggers background-close.
  listen(host, 'click', event => { if (!event.target.closest?.('[data-parameter-panel]')) close(); });
  listen(focusUi.querySelector('button'), 'click', (event) => { event.stopPropagation(); close({ restoreFocus: event.detail === 0 }); });
  listen(document, 'keydown', (event) => {
    if (event.key === 'Escape' && selected !== null) {
      event.preventDefault();
      close({ restoreFocus: true });
    }
    if (event.key === 'Tab' && selected !== null && motion.target === 1) {
      event.preventDefault();
      const closeButton = focusUi.querySelector('button');
      const panelTargets = panel ? [...panel.querySelectorAll('button:not(:disabled), input:not([type=file]), select, textarea, summary')].filter(node => node.getClientRects().length) : [];
      const targets = [buttons[selected], closeButton, ...panelTargets];
      const index = targets.indexOf(document.activeElement);
      targets[(index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length].focus({ preventScroll: true });
    }
  });
  listen(document, 'visibilitychange', () => {
    lastTime = null;
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else wake();
  });
  listen(media, 'change', () => { reducedMotion = media.matches; lastTime = null; wake(); });
  listen(renderer.domElement, 'webglcontextlost', (event) => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    frame = 0;
    api.dispose();
    onError(new Error('The graphics context was interrupted.'));
  });
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  publish();

  const api = {
    focus: startFocus, close, setSeries,
    configure(values) {
      if (disposed) return;
      settings = normalizeParameters(values, settings);
      background.configure(settings);
      background.configure({ background: settings.backgroundColor, focusColor: settings.focusBackground });
      for (const entry of entries) entry.focus = getFocus(entry.stamp, width, height, settings);
      if (!motion.settled) motion.retarget(motion.target, reducedMotion ? EXHIBITION.reducedDuration : motion.target ? settings.enterDuration : settings.returnDuration);
      wake();
    },
    getDiagnostics: () => ({
      phase: host.dataset.phase, selected, hovered, series: currentSeries, progress: motion.value, reducedMotion,
      lightStates: entries.map((entry) => ({ id: entry.stamp.id, amount: entry.light, blur: entry.blur,
        target: entry.lightTarget.toArray(), uv: entry.material.uniforms.uPointer.value.toArray() })),
      poses: entries.map(entry => ({ id: entry.stamp.id, rotation: entry.mesh.rotation.toArray(), center: entry.mesh.position.toArray(), target: [entry.targetX, entry.targetY], corners: corners.map(([x,y]) => { const p = new THREE.Vector3(x,y,0).applyMatrix4(entry.mesh.matrixWorld).project(camera); return [(p.x + 1) * width / 2, (1 - p.y) * height / 2]; }) })),
      parameters: { ...settings },
      camera: { type: camera.type, distance: camera.position.z, fov: camera.fov },
      renderer: { programs: renderer.info.programs.length, ...renderer.info.memory },
      materials: entries.map((entry) => entry.material.uuid),
      textures: entries.map((entry) => entry.texture.uuid),
      background: background.stats ?? null,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      listeners.forEach((remove) => remove());
      background.dispose();
      for (const entry of entries) {
        entry.texture.dispose();
        entry.shadowSource.texture.dispose();
        entry.material.dispose();
        entry.shadowMaterial.dispose();
      }
      geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      scene.clear();
      if (import.meta.env.DEV && window.__postalGallery === api) delete window.__postalGallery;
    },
  };
  if (import.meta.env.DEV) window.__postalGallery = api;
  return api;
}
