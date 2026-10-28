import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getExhibitionLayout } from '../config.js';
import { createFrameStudio } from './FrameStudio.js';
import { createFrameDisplay } from './FrameDisplay.js';
import { createFrameContactShadow } from './FrameContactShadow.js';
import { FRAME_DEFAULTS, normalizeFrameParameters } from '../frameParameters.js';

export const FRAME_CATEGORIES = Object.freeze([
  { id: 'guangdong', name: 'Category_Guangdong', label: '广东' },
  { id: 'china', name: 'Category_China', label: '中国' },
  { id: 'world', name: 'Category_World', label: '世界' },
]);

/** A second view, using the gallery's renderer and demand-driven animation clock. */
export function createArtFrame({ renderer, wake, onCategory, onStatus, parameters = FRAME_DEFAULTS }) {
  let settings = normalizeFrameParameters(parameters);
  const scene = new THREE.Scene();
  // A .4 m depth interval gives 25× more fixed-depth precision than .1–10 m.
  const camera = new THREE.PerspectiveCamera(16, 2, 1.8, 2.2);
  camera.position.set(0, 0, 2);
  const root = new THREE.Group();
  scene.add(root);
  const studio = createFrameStudio(renderer);
  const display = createFrameDisplay(studio.uniforms);
  const shadow = createFrameContactShadow(studio);
  scene.add(...studio.lights, shadow.mesh);
  // Keep all solid PBR surfaces opaque even while the entire view fades.
  // Resolve one MSAA target, then composite it; never change render lists.
  const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, depthBuffer: true, stencilBuffer: false });
  target.texture.colorSpace = THREE.NoColorSpace;
  target.texture.generateMipmaps = true;
  target.texture.minFilter = THREE.LinearMipmapLinearFilter;
  const compositeScene = new THREE.Scene();
  const compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const composite = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { uView: { value: target.texture }, uOpacity: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: 'uniform sampler2D uView; uniform float uOpacity; varying vec2 vUv; void main(){gl_FragColor=texture2D(uView,vUv)*uOpacity;}',
  }));
  compositeScene.add(composite);
  const previousColor = new THREE.Color();
  let dirty = true, renders = 0, pointerInside = false;
  const tilt = new THREE.Vector2(), tiltTarget = new THREE.Vector2();

  let disposed = false, loaded = false, status = 'loading', selected = 'guangdong', hovered = null;
  let keyboard = false, time = 0, progress = 0, reduced = false, width = 1, height = 1;
  let viewport = getExhibitionLayout(1, 1).frame;
  let renderViewport = { ...viewport };
  const categories = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const point = new THREE.Vector3();
  const baseColor = new THREE.Color('#453e34');
  const accentColor = new THREE.Color('#984f3c');
  const materialSet = new Set();
  const hitTargets = [];
  const roots = [];
  let modelLocalBounds = null;

  function disposeObjects(object) {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    object.traverse(node => {
      if (node.geometry) geometries.add(node.geometry);
      for (const mat of [].concat(node.material || [])) {
        materials.add(mat);
        for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
      }
    });
    geometries.forEach(g => g.dispose());
    textures.forEach(t => { t.dispose(); t.source.data?.close?.(); });
    materials.forEach(m => m.dispose());
  }

  function collect(object) {
    object.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = false;
      node.receiveShadow = false;
      for (const mat of [].concat(node.material || [])) {
        display.apply(mat);
        if (mat.isMeshBasicMaterial && mat.colorWrite && !mat.userData.frameOverlayDisplay) {
          mat.userData.frameOverlayDisplay = true;
          mat.toneMapped = false;
          mat.onBeforeCompile = shader => { shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', 'gl_FragColor = sRGBTransferOETF(gl_FragColor);'); };
          mat.customProgramCacheKey = () => 'frame-unlit-overlay-display-v1';
          mat.needsUpdate = true;
        }
        mat.userData.frameBaseOpacity = mat.opacity;
        mat.userData.frameTransparent = mat.transparent;
        if (mat.normalScale) mat.userData.frameNormalScale = mat.normalScale.clone();
        materialSet.add(mat);
        if (mat.map) mat.map.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
      }
    });
  }

  const loader = new GLTFLoader();
  Promise.allSettled([
    loader.loadAsync('/models/art-frame-original.glb'),
    loader.loadAsync('/models/frame-typography.glb'),
    studio.ready,
    display.ready,
  ]).then(async results => {
    if (disposed || results.some(result => result.status === 'rejected')) {
      for (const result of results) if (result.status === 'fulfilled' && result.value?.scene) disposeObjects(result.value.scene);
      studio.dispose(); display.dispose();
      if (!disposed) { status = 'error'; onStatus({ status, message: '相框暂时未能加载，请重新载入。' }); wake(); }
      return;
    }
    const [frame, typography] = results.slice(0, 2).map(result => result.value.scene);
    scene.environment = results[2].value;
    roots.push(frame, typography);
    frame.traverse(node => { if (node.name.startsWith('Text_')) node.visible = false; });
    const trimMaterials = new Set();
    frame.traverse(node => {
      if (!node.isMesh || !node.name.startsWith('Trim_Photo_')) return;
      trimMaterials.add(node.material);
      node.material = node.material.clone();
      // The two closed mouldings meet at a shared seam. Resolve only that
      // coplanar tie, without changing any vertex, UV or physical clearance.
      node.material.side = THREE.FrontSide;
      node.material.polygonOffset = true;
      node.material.polygonOffsetFactor = 0;
      node.material.polygonOffsetUnits = node.name.includes('Inner') ? -2 : -1;
    });
    trimMaterials.forEach(material => material.dispose());
    frame.updateMatrixWorld(true);
    modelLocalBounds = new THREE.Box3().setFromObject(frame);
    typography.updateMatrixWorld(true);
    const replacedMaterials = new Set();
    for (const [index, spec] of FRAME_CATEGORIES.entries()) {
      const text = typography.getObjectByName(spec.name);
      if (!text?.isMesh) throw new Error(`Missing 3D category: ${spec.name}`);
      const bounds = new THREE.Box3().setFromObject(text);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const pivot = new THREE.Group();
      pivot.position.copy(center);
      pivot.name = spec.name;
      typography.add(pivot);
      pivot.attach(text);
      text.name = `${spec.name}_Geometry`;
      replacedMaterials.add(text.material);
      text.material = text.material.clone();
      text.material.color.copy(baseColor);
      text.material.roughness = .78;
      // Keep the reveal in the transparent list through its final frame.
      // Switching lists at opacity=1 can leave a stale first-paint depth pass.
      text.material.transparent = true;
      text.material.depthWrite = false;
      // Transparent per-category hit volumes enlarge glyph counters for touch.
      // They are raycast meshes in the same local space, never a frame-wide hit.
      const hit = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(.18, size.x + .055), .12),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
      hit.name = `${spec.name}_HitArea`;
      hit.userData.category = spec.id;
      hit.position.z = .003;
      pivot.add(hit);
      hitTargets.push(hit);
      const mark = new THREE.Mesh(new THREE.BoxGeometry(.05, .0012, .0007),
        new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0, depthWrite: false }));
      mark.position.set(0, -.016, .001);
      pivot.add(mark);
      categories.push({ ...spec, index, pivot, text, hit, mark, base: center.clone(), activity: 0, reveal: 0 });
    }
    replacedMaterials.forEach(material => material.dispose());
    root.add(frame, typography);
    collect(root);
    // Compile the actual offscreen variants before the first cached paint.
    // In particular, transparent text must be ready before the RAF can sleep.
    const previousTarget = renderer.getRenderTarget();
    const previousTone = renderer.toneMapping;
    renderer.setRenderTarget(target);
    renderer.toneMapping = THREE.AgXToneMapping;
    let compiled;
    try { compiled = renderer.compileAsync(scene, camera); }
    finally { renderer.setRenderTarget(previousTarget); renderer.toneMapping = previousTone; }
    await compiled;
    if (disposed) return;
    loaded = true; status = 'ready'; time = 0;
    configure(settings);
    onStatus({ status });
    wake();
  }).catch(error => {
    if (disposed) return;
    roots.forEach(disposeObjects);
    roots.length = 0;
      studio.dispose(); display.dispose();
    root.clear();
    status = 'error'; onStatus({ status, message: `相框暂时未能加载：${error.message}` }); wake();
  });

  function hover(id, fromKeyboard = false) {
    if (hovered === id && keyboard === fromKeyboard) return;
    hovered = id; keyboard = fromKeyboard; dirty = true; wake();
  }

  function configure(values) {
    settings = normalizeFrameParameters(values);
    studio.configure(settings);
    scene.environmentIntensity = settings.hdriEnabled ? settings.hdriIntensity : 0;
    scene.environmentRotation.y = THREE.MathUtils.degToRad(settings.hdriRotation);
    for (const material of materialSet) {
      if (!material.userData.frameNormalScale) continue;
      const amount = material.name.includes('Wood') ? settings.woodNormal : material.name.includes('Canvas') ? settings.canvasNormal : 1;
      material.normalScale.copy(material.userData.frameNormalScale).multiplyScalar(amount);
    }
    dirty = true; wake();
  }

  function track(x, y) {
    pointerInside = loaded && progress < .05 && x >= viewport.x && x <= viewport.x + viewport.width && y >= viewport.y && y <= viewport.y + viewport.height;
    if (pointerInside) tiltTarget.set(THREE.MathUtils.clamp((x - viewport.x) / viewport.width * 2 - 1, -1, 1), THREE.MathUtils.clamp((y - viewport.y) / viewport.height * 2 - 1, -1, 1));
    else tiltTarget.set(0, 0);
  }

  function pick(x, y) {
    if (!loaded || progress > .05 || x < viewport.x || x > viewport.x + viewport.width
      || y < viewport.y || y > viewport.y + viewport.height) return null;
    pointer.set((x - renderViewport.x) / renderViewport.width * 2 - 1, 1 - (y - renderViewport.y) / renderViewport.height * 2);
    raycaster.setFromCamera(pointer, camera);
    scene.updateMatrixWorld(true);
    return raycaster.intersectObjects(hitTargets, false)[0]?.object.userData.category ?? null;
  }

  return {
    resize(w, h) {
      width = w; height = h;
      viewport = getExhibitionLayout(w, h).frame;
      // Overscan keeps the soft shadow from ending at the view's rectangle,
      // while the physical frame retains the exact requested screen size.
      const pad = Math.max(24, viewport.width * .16);
      renderViewport = { x: viewport.x - pad, y: viewport.y - pad,
        width: viewport.width + pad * 2, height: viewport.height + pad * 2 };
      const aspect = viewport.width / viewport.height;
      const viewHeight = Math.max(.535, 1.05 / aspect);
      const halfHeight = viewHeight / 2 * renderViewport.height / viewport.height;
      camera.aspect = renderViewport.width / renderViewport.height;
      camera.fov = 2 * Math.atan(halfHeight / camera.position.z) * 180 / Math.PI;
      camera.userData.frameHalfSize = { x: halfHeight * camera.aspect, y: halfHeight };
      camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
      // Subpixel mouldings need supersampling even on a 1× desktop display.
      const dpr = Math.min(Math.max(2, renderer.getPixelRatio()), Math.min(4096,renderer.capabilities.maxTextureSize)/Math.max(renderViewport.width,renderViewport.height));
      target.setSize(Math.ceil(renderViewport.width * dpr), Math.ceil(renderViewport.height * dpr));
      dirty = true;
    },
    configure,
    setSeries(id) { selected = id; dirty = true; wake(); },
    hover,
    pointer(x, y) { track(x, y); const id = pick(x, y); hover(id); return id; },
    leave() { pointerInside = false; tiltTarget.set(0, 0); hover(null); wake(); },
    click(x, y) { const id = pick(x, y); if (id) onCategory(id); return id; },
    update(dt, focusProgress, reducedMotion) {
      progress = focusProgress; reduced = reducedMotion;
      if (!loaded) return false;
      time += dt;
      let moving = false;
      const wantedTilt = settings.tiltEnabled && !reduced && pointerInside && progress < .05 ? tiltTarget : point.set(0, 0, 0);
      const factor = reduced ? 1 : 1 - Math.exp(-dt / settings.tiltResponse);
      for (const axis of ['x', 'y']) {
        tilt[axis] += (wantedTilt[axis] - tilt[axis]) * factor;
        if (Math.abs(wantedTilt[axis] - tilt[axis]) < .00005) tilt[axis] = wantedTilt[axis];
        else moving = true;
      }
      const angle = THREE.MathUtils.degToRad(settings.tiltDegrees);
      const nextX = -tilt.y * angle, nextY = tilt.x * angle;
      if (root.rotation.x !== nextX || root.rotation.y !== nextY) {
        root.rotation.set(nextX, nextY, 0);
        // Pivot with the nearest rear corner at a constant wall clearance.
        root.position.z = .5 * Math.abs(Math.sin(nextY)) + .25 * Math.abs(Math.sin(nextX));
        dirty = true;
      }
      for (const entry of categories) {
        const previousActivity = entry.activity, previousReveal = entry.reveal;
        const active = entry.id === hovered ? 1 : entry.id === selected ? .62 : 0;
        const factor = reduced ? 1 : 1 - Math.exp(-dt / .075);
        entry.activity += (active - entry.activity) * factor;
        if (Math.abs(entry.activity - active) < .0005) entry.activity = active;
        else moving = true;
        const reveal = reduced ? 1 : THREE.MathUtils.smoothstep(time - .12 - entry.index * .11, 0, .4);
        if (reveal < 1) moving = true;
        entry.reveal = reveal;
        entry.pivot.position.z = entry.base.z + entry.activity * .004 - (1 - reveal) * .002;
        entry.pivot.scale.setScalar(1 + entry.activity * .035);
        entry.text.material.color.copy(baseColor).lerp(accentColor, Math.min(1, entry.activity * 1.5));
        entry.text.material.opacity = reveal;
        entry.mark.material.opacity = reveal * (entry.id === selected ? .8 : keyboard && entry.id === hovered ? .55 : 0);
        if (previousActivity !== entry.activity || previousReveal !== reveal) dirty = true;
      }
      composite.material.uniforms.uOpacity.value = 1 - progress;
      if (moving) dirty = true;
      return moving;
    },
    render() {
      if (!loaded || progress > .999) return;
      const previousToneMapping = renderer.toneMapping;
      const previousExposure = renderer.toneMappingExposure;
      const previousTarget = renderer.getRenderTarget();
      const previousAlpha = renderer.getClearAlpha();
      renderer.getClearColor(previousColor);
      // Keep the stamp shader's established display pipeline untouched.
      try {
        renderer.toneMapping = THREE.AgXToneMapping;
        renderer.toneMappingExposure = 2 ** .4;
        if (dirty) {
          shadow.update(root, settings, camera);
          renderer.setRenderTarget(target);
          // setRenderTarget installs its physical-pixel viewport. setViewport
          // would multiply by renderer DPR again on scaled desktop displays.
          renderer.setScissorTest(false);
          renderer.setClearColor(0, 0);
          renderer.clear(true, true, false);
          renderer.render(scene, camera);
          dirty = false; renders++;
        }
        renderer.setRenderTarget(previousTarget);
        renderer.setViewport(renderViewport.x, height - renderViewport.y - renderViewport.height, renderViewport.width, renderViewport.height);
        renderer.setScissor(renderViewport.x, height - renderViewport.y - renderViewport.height, renderViewport.width, renderViewport.height);
        renderer.setScissorTest(true);
        renderer.clearDepth();
        renderer.render(compositeScene, compositeCamera);
      } finally {
        renderer.setRenderTarget(previousTarget);
        renderer.setClearColor(previousColor, previousAlpha);
        renderer.toneMapping = previousToneMapping;
        renderer.toneMappingExposure = previousExposure;
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, width, height);
      }
    },
    getDiagnostics() {
      scene.updateMatrixWorld(true);
      const modelBounds = modelLocalBounds;
      const frameCorners = modelBounds ? [modelBounds.min, modelBounds.max].flatMap(a => [modelBounds.min, modelBounds.max].flatMap(b => [modelBounds.min, modelBounds.max].map(c => {
        const p = new THREE.Vector3(a.x, b.y, c.z).applyMatrix4(root.matrixWorld).project(camera);
        return [renderViewport.x + (p.x + 1) * renderViewport.width / 2, renderViewport.y + (1 - p.y) * renderViewport.height / 2];
      }))) : [];
      return { status, loaded, selected, hovered, keyboard, viewport, renderViewport, reducedMotion: reduced,
        tilt: { rotation: root.rotation.toArray(), position: root.position.toArray(), target: tiltTarget.toArray(), pointerInside, enabled: settings.tiltEnabled },
        modelToClip: new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(root.matrixWorld).toArray(),
        parameters: settings, renderPass: { renders, cached: !dirty, samples: target.samples, size: [target.width,target.height], depthRange: [camera.near, camera.far], solidPass: true },
        modelSizeM: modelBounds?.getSize(new THREE.Vector3()).toArray(), frameCorners,
        categories: categories.map(entry => {
          entry.pivot.getWorldPosition(point).project(camera);
          return { id: entry.id, name: entry.name, activity: entry.activity, reveal: entry.reveal,
            position: entry.pivot.position.toArray(), base: entry.base.toArray(), scale: entry.pivot.scale.x,
            color: `#${entry.text.material.color.getHexString()}`,
            opacity: entry.text.material.opacity, visible: entry.text.visible,
            bounds: new THREE.Box3().setFromObject(entry.text).getSize(new THREE.Vector3()).toArray(),
            depth: new THREE.Box3().setFromObject(entry.text).getCenter(new THREE.Vector3()).z,
            screen: [renderViewport.x + (point.x + 1) * renderViewport.width / 2, renderViewport.y + (1 - point.y) * renderViewport.height / 2],
            vertices: entry.text.geometry.attributes.position.count };
        }),
        roots: roots.map(object => object.uuid),
        studio: { environment: Boolean(scene.environment), environmentIntensity: scene.environmentIntensity,
          sceneLights: scene.children.filter(node=>node.isLight).map(light=>({name:light.name,type:light.type,intensity:light.intensity})),
          hdri: { ...studio.source }, environmentRotation: scene.environmentRotation.toArray(),
          ...studio.getDiagnostics(), toneMapping: 'Source AgX Medium High Contrast LUT', exposure: 2 ** settings.exposure,
          shadow: 'Source-disk deterministic wall projection', softboxes: studio.softboxes,
          invisibleHitAreasCastShadows: hitTargets.some(mesh => mesh.castShadow) },
        materials: [...materialSet].filter(mat => mat.isMeshStandardMaterial).map(mat => ({ name: mat.name, type: mat.type,
          displayTransform: Boolean(mat.userData.frameDisplay),
          transparent: mat.transparent, depthWrite: mat.depthWrite, side: mat.side,
          polygonOffset: mat.polygonOffset, polygonOffsetUnits: mat.polygonOffsetUnits,
          roughness: mat.roughness, metalness: mat.metalness, normalScale: mat.normalScale.toArray(),
          maps: ['map', 'normalMap', 'roughnessMap'].map(key => ({ key, name: mat[key]?.name,
            colorSpace: mat[key]?.colorSpace, channel: mat[key]?.channel, repeat: mat[key]?.repeat.toArray(),
            minFilter: mat[key]?.minFilter, mipmaps: mat[key]?.generateMipmaps })) })),
        hiddenOriginalTexts: roots[0] ? (() => { const list = []; roots[0].traverse(node => { if (node.name.startsWith('Text_')) list.push({ name: node.name, visible: node.visible }); }); return list; })() : [] };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeObjects(scene);
      target.dispose(); composite.geometry.dispose(); composite.material.dispose(); compositeScene.clear();
      studio.dispose();
      display.dispose();
      scene.clear(); roots.length = 0; categories.length = 0; materialSet.clear(); hitTargets.length = 0;
    },
  };
}
